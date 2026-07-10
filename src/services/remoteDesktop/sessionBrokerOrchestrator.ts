/**
 * Remote Desktop Core — Session Broker Orchestrator
 *
 * Top-level orchestrator coordinating the full session lifecycle:
 *   - startSession(): gate check → governance → POPIA consent → token mint → session create → audit
 *   - endSession(): graceful session end → audit → usage reporting
 *   - handlePolicyViolation(): full_desktop → immediate termination within 5s
 *   - enforceAutoDisconnect(): fires when booking window + grace expires
 *   - handleSecurityPause(): pauses input on security incident, terminates after 15min
 *
 * Requirements: Req 1 (App-Level Isolation), Req 4 (Session Start Gate),
 *              Req 10 (Viewer Awareness), Req 12 (Governance)
 */

import { evaluateSessionGate } from './sessionGateService';
import { validateBookingGovernance, checkBookingConflicts, createUsageRecord } from './governanceBridgeService';
import type { GovernanceBridgeInput, SessionUsageInput } from './governanceBridgeService';
import { validateConsentForStream, createConsentRecord, handleConsentTimeout } from './popiaConsentService';
import type { CreateConsentInput } from './popiaConsentService';
import { generateSessionToken } from './tokenService';
import type { GenerateTokenInput } from './tokenService';
import { createAuditEvent } from './auditEventService';
import type { CreateAuditEventInput } from './auditEventService';
import {
  createSession,
  activateSession,
  endSession as endSessionCrud,
  getSession,
} from './sessionBrokerService';
import type { CreateSessionInput, EndSessionInput, SessionRecord } from './sessionBrokerService';
import { createIncident } from './incidentService';
import type { CreateIncidentInput } from './incidentService';
import {
  SESSION_EVENT_TYPES,
  SESSION_STATUS,
  REMOTE_DESKTOP_DEFAULTS,
  type SessionGateInput,
  type SessionToken,
  type SessionEventType,
  type ActorRole,
  type ResourceBookingStatus,
  type HostStatus,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum time allowed to terminate on policy violation (ms) */
const POLICY_VIOLATION_TERMINATION_DEADLINE_MS = 5_000;

/** Security incident auto-termination timeout (ms) — 15 minutes */
const SECURITY_TIMEOUT_MS = REMOTE_DESKTOP_DEFAULTS.SECURITY_REVIEW_TIMEOUT_MINUTES * 60 * 1000;

/** Grace period default (seconds) */
const DEFAULT_GRACE_PERIOD_SECONDS = REMOTE_DESKTOP_DEFAULTS.GRACE_PERIOD_SECONDS;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface StartSessionInput {
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  hostId: string;
  currentTime: string;
  booking: {
    status: ResourceBookingStatus;
    approvedBy?: string;
    startsAt: string;
    endsAt: string;
    resourceId: string;
  };
  host: {
    status: HostStatus;
    lastHeartbeat: string;
    resourceListingId: string;
    agentVersion: string;
    recordingEnabled: boolean;
    gracePeriodSeconds?: number;
  };
  appCount: number;
  /** POPIA consent context (required when host has recording enabled) */
  consent?: {
    consentTextVersion: string;
    ipAddress: string;
    granted: boolean;
  };
  /** Project reference for tracking */
  projectReference?: string;
}

export interface StartSessionResult {
  success: boolean;
  sessionId?: string;
  token?: SessionToken;
  error?: string;
  errorCode?: string;
  gateResult?: ReturnType<typeof evaluateSessionGate>;
}

export interface EndSessionResult {
  success: boolean;
  sessionId: string;
  reason: string;
  usageReported: boolean;
  error?: string;
}

export type PolicyViolationType = 'full_desktop';

export interface PolicyViolationResult {
  terminated: boolean;
  sessionId: string;
  violationType: PolicyViolationType;
  terminatedWithinDeadline: boolean;
  auditEventId?: string;
  error?: string;
}

export interface AutoDisconnectResult {
  disconnected: boolean;
  sessionId: string;
  reason: 'booking_window_expired';
  auditEventId?: string;
  error?: string;
}

export interface SecurityPauseResult {
  paused: boolean;
  sessionId: string;
  incidentId: string;
  inputBlocked: boolean;
  terminationScheduled: boolean;
  terminationTimeoutMs: number;
  error?: string;
}

// ─── Internal State ─────────────────────────────────────────────────────────────

/** Tracks sessions with scheduled auto-disconnect */
interface AutoDisconnectTimer {
  sessionId: string;
  scheduledAt: number; // Unix ms when disconnect fires
  fired: boolean;
}

/** Tracks sessions with security pause and pending termination */
interface SecurityPauseRecord {
  sessionId: string;
  incidentId: string;
  pausedAt: string;
  terminationDeadline: string;
  terminated: boolean;
  inputBlocked: boolean;
}

const autoDisconnectTimers = new Map<string, AutoDisconnectTimer>();
const securityPauseRecords = new Map<string, SecurityPauseRecord>();
const auditLog: Array<{ sessionId: string; eventType: string; timestamp: string }> = [];

// ─── startSession ────────────────────────────────────────────────────────────────

/**
 * Orchestrates the full session start flow:
 * 1. Evaluate session gate (booking confirmed, owner approved, time window, host online)
 * 2. Enforce app-level isolation (reject if appCount === 0)
 * 3. Validate POPIA consent (if recording enabled)
 * 4. Mint session token
 * 5. Create session record
 * 6. Write audit event
 * 7. Schedule auto-disconnect at booking window end + grace
 *
 * Requirements: Req 1.1, 1.2, 4.1, 4.2, 12.1
 */
export function startSession(input: StartSessionInput): StartSessionResult {
  // 1. Evaluate session gate
  const gateInput: SessionGateInput = {
    bookingId: input.bookingId,
    consumerUid: input.consumerUid,
    hostId: input.hostId,
    currentTime: input.currentTime,
    booking: input.booking,
    host: {
      status: input.host.status,
      lastHeartbeat: input.host.lastHeartbeat,
      resourceListingId: input.host.resourceListingId,
      agentVersion: input.host.agentVersion,
    },
    appCount: input.appCount,
  };

  const gateResult = evaluateSessionGate(gateInput);

  // Write gate check audit event regardless of outcome (Req 4.5)
  const gateAuditEvent = createAuditEvent({
    sessionId: input.bookingId, // Use bookingId as session doesn't exist yet
    bookingId: input.bookingId,
    eventType: SESSION_EVENT_TYPES.SESSION_GATE_CHECK,
    actorUid: input.consumerUid,
    actorRole: 'consumer',
    hostId: input.hostId,
    metadata: {
      conditions: gateResult.conditions,
      canStart: gateResult.canStart,
      errors: gateResult.errors.map(e => e.code),
    },
  });

  auditLog.push({
    sessionId: input.bookingId,
    eventType: SESSION_EVENT_TYPES.SESSION_GATE_CHECK,
    timestamp: gateAuditEvent.timestamp,
  });

  if (!gateResult.canStart) {
    return {
      success: false,
      error: `Session gate check failed: ${gateResult.errors.map(e => e.message).join('; ')}`,
      errorCode: gateResult.errors[0]?.code,
      gateResult,
    };
  }

  // 2. Enforce app-level isolation (Req 1.1, 1.2)
  if (input.appCount === 0) {
    const rejectionEvent = createAuditEvent({
      sessionId: input.bookingId,
      bookingId: input.bookingId,
      eventType: SESSION_EVENT_TYPES.SESSION_REJECTED_NO_APPS,
      actorUid: 'system',
      actorRole: 'system',
      hostId: input.hostId,
      metadata: { reason: 'no_apps_configured' },
    });
    auditLog.push({
      sessionId: input.bookingId,
      eventType: SESSION_EVENT_TYPES.SESSION_REJECTED_NO_APPS,
      timestamp: rejectionEvent.timestamp,
    });
    return {
      success: false,
      error: 'App-level isolation: no applications configured for this host',
      errorCode: 'no_apps_configured',
      gateResult,
    };
  }

  // 3. Validate POPIA consent if recording is enabled (Req 2.1, 2.2)
  if (input.host.recordingEnabled) {
    if (!input.consent || !input.consent.granted) {
      // Consent not granted — session cannot proceed
      const declinedEvent = createAuditEvent({
        sessionId: input.bookingId,
        bookingId: input.bookingId,
        eventType: SESSION_EVENT_TYPES.CONSENT_DECLINED,
        actorUid: input.consumerUid,
        actorRole: 'consumer',
        hostId: input.hostId,
        metadata: {
          reason: input.consent ? 'user_declined' : 'consent_not_provided',
        },
      });
      auditLog.push({
        sessionId: input.bookingId,
        eventType: SESSION_EVENT_TYPES.CONSENT_DECLINED,
        timestamp: declinedEvent.timestamp,
      });
      return {
        success: false,
        error: 'POPIA consent required: recording is enabled on this host but consent was not granted',
        errorCode: 'consent_declined',
        gateResult,
      };
    }

    // Record consent
    createConsentRecord({
      sessionId: input.bookingId,
      bookingId: input.bookingId,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      consentType: 'recording',
      consentTextVersion: input.consent.consentTextVersion,
      ipAddress: input.consent.ipAddress,
    });
  }

  // 4. Mint session token (Req 7.1, 7.6)
  const gracePeriodSeconds = input.host.gracePeriodSeconds ?? DEFAULT_GRACE_PERIOD_SECONDS;
  const windowStart = new Date(input.booking.startsAt).getTime();
  const windowEnd = new Date(input.booking.endsAt).getTime();

  const tokenInput: GenerateTokenInput = {
    bookingId: input.bookingId,
    consumerUid: input.consumerUid,
    hostId: input.hostId,
    windowStart,
    windowEnd,
    gracePeriodSeconds,
    recordingRequired: input.host.recordingEnabled,
  };

  let token: SessionToken;
  try {
    token = generateSessionToken(tokenInput);
  } catch (err) {
    return {
      success: false,
      error: `Token generation failed: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: 'token_generation_failed',
      gateResult,
    };
  }

  // 5. Create session record
  const sessionInput: CreateSessionInput = {
    bookingId: input.bookingId,
    hostId: input.hostId,
    consumerUid: input.consumerUid,
    ownerUid: input.ownerUid,
    tokenId: token.tokenId,
    windowStart,
    windowEnd,
    gracePeriodSeconds,
    projectReference: input.projectReference,
  };

  const session = createSession(sessionInput);

  // 6. Write session_started audit event
  const startedEvent = createAuditEvent({
    sessionId: session.sessionId,
    bookingId: input.bookingId,
    eventType: SESSION_EVENT_TYPES.SESSION_STARTED,
    actorUid: input.consumerUid,
    actorRole: 'consumer',
    hostId: input.hostId,
    metadata: {
      tokenId: token.tokenId,
      windowStart: input.booking.startsAt,
      windowEnd: input.booking.endsAt,
      gracePeriodSeconds,
      recordingRequired: input.host.recordingEnabled,
      appCount: input.appCount,
    },
  });

  auditLog.push({
    sessionId: session.sessionId,
    eventType: SESSION_EVENT_TYPES.SESSION_STARTED,
    timestamp: startedEvent.timestamp,
  });

  // 7. Schedule auto-disconnect at booking window end + grace (Req 10.3, 10.4)
  const disconnectAt = windowEnd + (gracePeriodSeconds * 1000);
  autoDisconnectTimers.set(session.sessionId, {
    sessionId: session.sessionId,
    scheduledAt: disconnectAt,
    fired: false,
  });

  return {
    success: true,
    sessionId: session.sessionId,
    token,
    gateResult,
  };
}

// ─── endSession (orchestrated) ───────────────────────────────────────────────────

/**
 * Gracefully end a session and report usage.
 *
 * 1. End the session via CRUD service
 * 2. Write session_ended audit event
 * 3. Report usage to governance bridge
 *
 * Requirements: Req 10.4, 12.3
 */
export function orchestratedEndSession(
  sessionId: string,
  reason: 'user_initiated' | 'booking_window_expired',
): EndSessionResult {
  const session = getSession(sessionId);
  if (!session) {
    return {
      success: false,
      sessionId,
      reason,
      usageReported: false,
      error: `Session not found: ${sessionId}`,
    };
  }

  // End the session via CRUD
  try {
    const endInput: EndSessionInput = {
      sessionId,
      reason,
      terminatedBy: reason === 'user_initiated' ? 'consumer' : 'system',
    };
    endSessionCrud(endInput);
  } catch (err) {
    return {
      success: false,
      sessionId,
      reason,
      usageReported: false,
      error: `Failed to end session: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Write audit event
  const endedEvent = createAuditEvent({
    sessionId,
    bookingId: session.bookingId,
    eventType: SESSION_EVENT_TYPES.SESSION_ENDED,
    actorUid: reason === 'user_initiated' ? session.consumerUid : 'system',
    actorRole: reason === 'user_initiated' ? 'consumer' : 'system',
    hostId: session.hostId,
    metadata: { reason, totalConnectedSeconds: session.totalConnectedSeconds },
  });

  auditLog.push({
    sessionId,
    eventType: SESSION_EVENT_TYPES.SESSION_ENDED,
    timestamp: endedEvent.timestamp,
  });

  // Report usage to governance bridge (Req 12.3)
  let usageReported = false;
  try {
    const updatedSession = getSession(sessionId);
    if (updatedSession) {
      createUsageRecord({
        session: {
          sessionId: updatedSession.sessionId,
          bookingId: updatedSession.bookingId,
          hostId: updatedSession.hostId,
          consumerUid: updatedSession.consumerUid,
          ownerUid: updatedSession.ownerUid,
          projectRef: updatedSession.projectReference ?? null,
          status: updatedSession.status as any,
          connectionType: (updatedSession.connectionType || 'peer_to_peer') as any,
          startedAt: updatedSession.startTimestamp
            ? new Date(updatedSession.startTimestamp).toISOString()
            : new Date().toISOString(),
          endedAt: updatedSession.endTimestamp
            ? new Date(updatedSession.endTimestamp).toISOString()
            : new Date().toISOString(),
          totalConnectedSeconds: updatedSession.totalConnectedSeconds,
          totalDisconnectionGapSeconds: updatedSession.totalDisconnectionGapSeconds,
          applicationsUsed: updatedSession.applicationsUsed,
          filesProducedCount: updatedSession.filesProducedCount,
          disconnectionReason: updatedSession.disconnectionReason,
          billedDurationMinutes: Math.ceil(updatedSession.totalConnectedSeconds / 60),
          ownerApproved: updatedSession.ownerApproved,
          recordingConsentGranted: false,
        },
        usageLogId: `usage-${sessionId}-${Date.now()}`,
        billingPolicy: {
          billingMode: 'hourly',
          platformFeeBps: 1000,
          currency: 'ZAR',
          minimumBillableMinutes: 15,
        },
        occurredAt: new Date().toISOString(),
      });
      usageReported = true;
    }
  } catch {
    // Usage reporting failure should not block session end
    usageReported = false;
  }

  return { success: true, sessionId, reason, usageReported };
}

// ─── handlePolicyViolation ───────────────────────────────────────────────────────

/**
 * Handle policy violation: full_desktop stream type → immediate termination.
 *
 * Requirement 1.4: If a Host_Agent reports a stream type of "full_desktop",
 * the Session_Broker SHALL immediately terminate the session within 5 seconds,
 * write a "policy_violation_full_desktop" event, and notify Platform_Admin.
 *
 * Requirements: Req 1.4
 */
export function handlePolicyViolation(
  sessionId: string,
  violationType: PolicyViolationType,
): PolicyViolationResult {
  const startTime = Date.now();

  // Reject anything other than full_desktop (only supported violation type)
  if (violationType !== 'full_desktop') {
    return {
      terminated: false,
      sessionId,
      violationType,
      terminatedWithinDeadline: false,
      error: `Unknown policy violation type: ${violationType}`,
    };
  }

  const session = getSession(sessionId);
  if (!session) {
    return {
      terminated: false,
      sessionId,
      violationType,
      terminatedWithinDeadline: false,
      error: `Session not found: ${sessionId}`,
    };
  }

  // Terminate the session immediately
  try {
    const endInput: EndSessionInput = {
      sessionId,
      reason: 'uac_terminated',
      terminatedBy: 'system',
    };
    endSessionCrud(endInput);
  } catch (err) {
    return {
      terminated: false,
      sessionId,
      violationType,
      terminatedWithinDeadline: false,
      error: `Failed to terminate: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Write policy violation audit event
  const violationEvent = createAuditEvent({
    sessionId,
    bookingId: session.bookingId,
    eventType: SESSION_EVENT_TYPES.POLICY_VIOLATION_FULL_DESKTOP,
    actorUid: 'system',
    actorRole: 'system',
    hostId: session.hostId,
    metadata: {
      violationType,
      terminatedAt: new Date().toISOString(),
      reportedStreamType: 'full_desktop',
    },
  });

  auditLog.push({
    sessionId,
    eventType: SESSION_EVENT_TYPES.POLICY_VIOLATION_FULL_DESKTOP,
    timestamp: violationEvent.timestamp,
  });

  const elapsed = Date.now() - startTime;
  const terminatedWithinDeadline = elapsed <= POLICY_VIOLATION_TERMINATION_DEADLINE_MS;

  return {
    terminated: true,
    sessionId,
    violationType,
    terminatedWithinDeadline,
    auditEventId: violationEvent.eventId,
  };
}

// ─── enforceAutoDisconnect ───────────────────────────────────────────────────────

/**
 * Auto-disconnect enforcement: fires when booking window + grace period expires.
 *
 * Checks if the session has exceeded its booking window + grace period,
 * and if so, terminates it with reason 'booking_window_expired'.
 *
 * Requirements: Req 10.3, 10.4
 */
export function enforceAutoDisconnect(
  sessionId: string,
  currentTime?: number,
): AutoDisconnectResult {
  const now = currentTime ?? Date.now();

  const session = getSession(sessionId);
  if (!session) {
    return {
      disconnected: false,
      sessionId,
      reason: 'booking_window_expired',
      error: `Session not found: ${sessionId}`,
    };
  }

  // Check if session is still active
  if (session.status !== 'active') {
    return {
      disconnected: false,
      sessionId,
      reason: 'booking_window_expired',
      error: `Session is not active (current status: ${session.status})`,
    };
  }

  // Check if we've passed the disconnect deadline
  const disconnectDeadline = session.windowEnd + (session.gracePeriodSeconds * 1000);
  if (now < disconnectDeadline) {
    return {
      disconnected: false,
      sessionId,
      reason: 'booking_window_expired',
      error: `Auto-disconnect not yet due (deadline: ${new Date(disconnectDeadline).toISOString()})`,
    };
  }

  // Terminate the session
  try {
    endSessionCrud({
      sessionId,
      reason: 'booking_window_expired',
      terminatedBy: 'system',
    });
  } catch (err) {
    return {
      disconnected: false,
      sessionId,
      reason: 'booking_window_expired',
      error: `Failed to auto-disconnect: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Write auto-disconnect audit event
  const disconnectEvent = createAuditEvent({
    sessionId,
    bookingId: session.bookingId,
    eventType: SESSION_EVENT_TYPES.AUTO_DISCONNECT_TRIGGERED,
    actorUid: 'system',
    actorRole: 'system',
    hostId: session.hostId,
    metadata: {
      windowEnd: new Date(session.windowEnd).toISOString(),
      gracePeriodSeconds: session.gracePeriodSeconds,
      disconnectDeadline: new Date(disconnectDeadline).toISOString(),
      actualDisconnectTime: new Date(now).toISOString(),
    },
  });

  auditLog.push({
    sessionId,
    eventType: SESSION_EVENT_TYPES.AUTO_DISCONNECT_TRIGGERED,
    timestamp: disconnectEvent.timestamp,
  });

  // Mark the timer as fired
  const timer = autoDisconnectTimers.get(sessionId);
  if (timer) {
    timer.fired = true;
  }

  return {
    disconnected: true,
    sessionId,
    reason: 'booking_window_expired',
    auditEventId: disconnectEvent.eventId,
  };
}

// ─── handleSecurityPause ─────────────────────────────────────────────────────────

/**
 * Handle security incident: pause input and schedule session termination.
 *
 * When an incident with category "security_concern" is raised:
 * 1. Input forwarding is paused within 5 seconds (Req 3.4)
 * 2. If not reviewed within 15 minutes, session is terminated (Req 3.6)
 *
 * Requirements: Req 3.4, 3.6
 */
export function handleSecurityPause(
  sessionId: string,
  incidentId: string,
): SecurityPauseResult {
  const session = getSession(sessionId);
  if (!session) {
    return {
      paused: false,
      sessionId,
      incidentId,
      inputBlocked: false,
      terminationScheduled: false,
      terminationTimeoutMs: 0,
      error: `Session not found: ${sessionId}`,
    };
  }

  if (session.status !== 'active') {
    return {
      paused: false,
      sessionId,
      incidentId,
      inputBlocked: false,
      terminationScheduled: false,
      terminationTimeoutMs: 0,
      error: `Session is not active (current status: ${session.status})`,
    };
  }

  const now = new Date().toISOString();
  const terminationDeadline = new Date(
    new Date(now).getTime() + SECURITY_TIMEOUT_MS,
  ).toISOString();

  // Record the security pause
  securityPauseRecords.set(sessionId, {
    sessionId,
    incidentId,
    pausedAt: now,
    terminationDeadline,
    terminated: false,
    inputBlocked: true,
  });

  // Write input_blocked audit event
  const blockedEvent = createAuditEvent({
    sessionId,
    bookingId: session.bookingId,
    eventType: SESSION_EVENT_TYPES.INPUT_BLOCKED,
    actorUid: 'system',
    actorRole: 'system',
    hostId: session.hostId,
    metadata: {
      reason: 'security_concern',
      incidentId,
      terminationDeadline,
    },
  });

  auditLog.push({
    sessionId,
    eventType: SESSION_EVENT_TYPES.INPUT_BLOCKED,
    timestamp: blockedEvent.timestamp,
  });

  return {
    paused: true,
    sessionId,
    incidentId,
    inputBlocked: true,
    terminationScheduled: true,
    terminationTimeoutMs: SECURITY_TIMEOUT_MS,
  };
}

// ─── enforceSecurityTimeout ──────────────────────────────────────────────────────

/**
 * Check and enforce security timeout: if 15min has passed without review,
 * terminate the session.
 *
 * Called periodically or on-demand to check if security paused sessions
 * have exceeded their 15-minute review window.
 *
 * Requirements: Req 3.6
 */
export function enforceSecurityTimeout(
  sessionId: string,
  currentTime?: number,
): boolean {
  const now = currentTime ?? Date.now();
  const record = securityPauseRecords.get(sessionId);

  if (!record || record.terminated) {
    return false;
  }

  const deadline = new Date(record.terminationDeadline).getTime();
  if (now < deadline) {
    return false;
  }

  // 15 minutes have passed — terminate the session
  const session = getSession(sessionId);
  if (!session || session.status !== 'active') {
    record.terminated = true;
    return false;
  }

  try {
    endSessionCrud({
      sessionId,
      reason: 'uac_terminated',
      terminatedBy: 'system',
    });
  } catch {
    return false;
  }

  record.terminated = true;

  // Write termination audit event
  const terminationEvent = createAuditEvent({
    sessionId,
    bookingId: session.bookingId,
    eventType: SESSION_EVENT_TYPES.SESSION_TERMINATED_SECURITY_TIMEOUT,
    actorUid: 'system',
    actorRole: 'system',
    hostId: session.hostId,
    metadata: {
      incidentId: record.incidentId,
      pausedAt: record.pausedAt,
      terminationDeadline: record.terminationDeadline,
    },
  });

  auditLog.push({
    sessionId,
    eventType: SESSION_EVENT_TYPES.SESSION_TERMINATED_SECURITY_TIMEOUT,
    timestamp: terminationEvent.timestamp,
  });

  return true;
}

// ─── Query Helpers ───────────────────────────────────────────────────────────────

/**
 * Get the auto-disconnect timer for a session.
 */
export function getAutoDisconnectTimer(sessionId: string): AutoDisconnectTimer | undefined {
  return autoDisconnectTimers.get(sessionId);
}

/**
 * Get the security pause record for a session.
 */
export function getSecurityPauseRecord(sessionId: string): SecurityPauseRecord | undefined {
  return securityPauseRecords.get(sessionId);
}

/**
 * Get audit log entries for a session.
 */
export function getAuditLog(sessionId?: string): Array<{ sessionId: string; eventType: string; timestamp: string }> {
  if (sessionId) {
    return auditLog.filter(e => e.sessionId === sessionId);
  }
  return [...auditLog];
}

/**
 * Get the policy violation termination deadline in ms.
 */
export function getPolicyViolationDeadlineMs(): number {
  return POLICY_VIOLATION_TERMINATION_DEADLINE_MS;
}

/**
 * Get the security timeout in ms.
 */
export function getSecurityTimeoutMs(): number {
  return SECURITY_TIMEOUT_MS;
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Clear all orchestrator state. For testing only.
 * @internal
 */
export function _clearOrchestratorState(): void {
  autoDisconnectTimers.clear();
  securityPauseRecords.clear();
  auditLog.length = 0;
}

/**
 * Get count of auto-disconnect timers. For testing only.
 * @internal
 */
export function _getAutoDisconnectTimerCount(): number {
  return autoDisconnectTimers.size;
}

/**
 * Get count of security pause records. For testing only.
 * @internal
 */
export function _getSecurityPauseCount(): number {
  return securityPauseRecords.size;
}
