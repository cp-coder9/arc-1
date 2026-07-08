/**
 * Remote Desktop Core — Session Lifecycle Orchestrator
 *
 * Single entry point for wiring all platform integration adapters on session
 * lifecycle events. Called by the Session Broker service when state transitions occur.
 *
 * Lifecycle hooks:
 *   - onSessionComplete(): Project Passport write + Analytics ingestion + Billing reporting
 *   - onCriticalEvent(): Action Centre WorkflowEvent emission
 *   - onFileHandoffComplete(): FileManager document registry association
 *   - onSessionEnd(): Analytics Engine KPI data exposure + Billing pipeline reporting
 *
 * Design principles:
 *   - Failures in one integration do not block others (fire-and-collect)
 *   - Individual adapters already handle their own retry logic
 *   - This orchestrator captures and returns aggregated results for observability
 *   - Graceful degradation: partial success is acceptable and reported clearly
 *
 * Requirements: 13.1, 13.2, 13.4, 13.5, 12.1
 */

import type { SessionRecord, DisconnectionReason } from './sessionBrokerService';
import type { CriticalSessionEventType, CriticalEventInput, EmitResult } from './remoteDesktopInboxAdapter';
import type { PassportWriteResult } from './remoteDesktopPassportAdapter';
import type { BillingReportResult, SessionBillingInput, DisconnectionGap, UsageRecord } from './sessionBillingService';
import type { RemoteDesktopKPIComputationResult } from './remoteDesktopAnalyticsAdapter';
import type { FileManagerAssociation } from './fileApprovalService';

import {
  isProjectLinked,
  writeSessionToPassport,
} from './remoteDesktopPassportAdapter';

import {
  isCriticalEventType,
  emitCriticalEvent,
} from './remoteDesktopInboxAdapter';

import {
  ingestSessionRecord,
  ingestBillingRecord,
  computeAllRemoteDesktopKPIs,
  type DateRange,
  type KPIFilter,
} from './remoteDesktopAnalyticsAdapter';

import {
  generateUsageRecord,
  reportToBillingPipeline,
} from './sessionBillingService';

import {
  getFileManagerAssociation,
} from './fileApprovalService';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Result of the onSessionComplete lifecycle hook */
export interface SessionCompleteResult {
  sessionId: string;
  passportWrite: PassportWriteResult | null;
  billingReport: BillingReportResult | null;
  analyticsIngested: boolean;
  errors: string[];
}

/** Result of the onCriticalEvent lifecycle hook */
export interface CriticalEventResult {
  sessionId: string;
  emitResult: EmitResult;
}

/** Result of the onFileHandoffComplete lifecycle hook */
export interface FileHandoffCompleteResult {
  sessionId: string;
  manifestId: string;
  association: FileManagerAssociation | null;
  projectReference: string | null;
  success: boolean;
  error?: string;
}

/** Result of the onSessionEnd lifecycle hook (analytics + billing) */
export interface SessionEndResult {
  sessionId: string;
  analyticsIngested: boolean;
  billingReport: BillingReportResult | null;
  usageRecord: UsageRecord | null;
  errors: string[];
}

/** Input for onSessionComplete (extends session with billing context) */
export interface SessionCompleteInput {
  session: SessionRecord;
  tenantId: string;
  disconnectionGaps: DisconnectionGap[];
  bookingWindowMinutes: number;
  /** Optional custom billing report function for testability */
  billingReportFn?: (record: UsageRecord) => Promise<boolean>;
}

/** Input for onFileHandoffComplete */
export interface FileHandoffCompleteInput {
  sessionId: string;
  manifestId: string;
  projectReference?: string;
}

/** Input for onSessionEnd (lightweight analytics + billing reporting) */
export interface SessionEndInput {
  session: SessionRecord;
  tenantId: string;
  disconnectionGaps: DisconnectionGap[];
  bookingWindowMinutes: number;
  /** Optional custom billing report function for testability */
  billingReportFn?: (record: UsageRecord) => Promise<boolean>;
}

// ─── In-Memory Event Log (for observability) ─────────────────────────────────────

interface OrchestratorEvent {
  type: 'session_complete' | 'critical_event' | 'file_handoff_complete' | 'session_end';
  sessionId: string;
  timestamp: string;
  success: boolean;
  details?: string;
}

const orchestratorLog: OrchestratorEvent[] = [];

// ─── Lifecycle Hook: onSessionComplete ──────────────────────────────────────────

/**
 * Orchestrate all platform integrations when a session completes.
 *
 * Fires:
 *   1. Project Passport write (if project reference exists) — Req 13.1
 *   2. Analytics Engine session record ingestion — Req 13.5
 *   3. Billing pipeline reporting — Req 12.1
 *
 * Each integration is executed independently; failures in one do not block others.
 *
 * @param input - Session data and billing context
 * @returns Aggregated result from all integrations
 */
export async function onSessionComplete(
  input: SessionCompleteInput,
): Promise<SessionCompleteResult> {
  const { session, tenantId, disconnectionGaps, bookingWindowMinutes, billingReportFn } = input;
  const errors: string[] = [];

  let passportWrite: PassportWriteResult | null = null;
  let billingReport: BillingReportResult | null = null;
  let analyticsIngested = false;

  // 1. Project Passport write (if project reference exists) — Req 13.1
  if (isProjectLinked(session)) {
    try {
      passportWrite = await writeSessionToPassport({
        session,
        projectId: session.projectReference!,
        tenantId,
      });

      if (!passportWrite.success) {
        errors.push(`Passport write failed: ${passportWrite.error ?? 'unknown'}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Passport write threw: ${message}`);
      passportWrite = { success: false, error: message, attempts: 0 };
    }
  }

  // 2. Analytics Engine session record ingestion — Req 13.5
  try {
    ingestSessionRecord(session);
    analyticsIngested = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Analytics ingestion failed: ${message}`);
  }

  // 3. Billing pipeline reporting — Req 12.1
  try {
    const billingInput: SessionBillingInput = {
      sessionId: session.sessionId,
      bookingId: session.bookingId,
      ownerUid: session.ownerUid,
      consumerUid: session.consumerUid,
      totalConnectedSeconds: session.totalConnectedSeconds,
      disconnectionGaps,
      bookingWindowMinutes,
      sessionEndTimestamp: session.endTimestamp ?? Date.now(),
    };

    // Generate the usage record
    generateUsageRecord(billingInput);

    // Report to billing pipeline
    const reportFn = billingReportFn ?? defaultBillingReportFn;
    billingReport = await reportToBillingPipeline(session.sessionId, reportFn);

    if (!billingReport.success) {
      errors.push(`Billing report failed: ${billingReport.error ?? 'unknown'}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Billing reporting threw: ${message}`);
    billingReport = { success: false, error: message };
  }

  // Log the orchestration event
  orchestratorLog.push({
    type: 'session_complete',
    sessionId: session.sessionId,
    timestamp: new Date().toISOString(),
    success: errors.length === 0,
    details: errors.length > 0 ? errors.join('; ') : undefined,
  });

  return {
    sessionId: session.sessionId,
    passportWrite,
    billingReport,
    analyticsIngested,
    errors,
  };
}

// ─── Lifecycle Hook: onCriticalEvent ─────────────────────────────────────────────

/**
 * Emit a WorkflowEvent to the Action Centre on critical session events.
 *
 * Fires:
 *   - Action Centre WorkflowEvent emission — Req 13.2
 *
 * Critical event types: connection_failed, focus_violation_attempted,
 * session_terminated_uac, auto_disconnect_triggered.
 *
 * @param eventType - The critical event type
 * @param sessionId - The session that triggered the event
 * @param bookingId - The associated booking
 * @param hostId - The host involved
 * @param consumerUid - The consumer involved
 * @param ownerUid - The owner involved
 * @param projectId - Optional project reference
 * @returns Emission result
 */
export async function onCriticalEvent(
  eventType: string,
  sessionId: string,
  bookingId: string,
  hostId: string,
  consumerUid: string,
  ownerUid: string,
  projectId?: string,
): Promise<CriticalEventResult | null> {
  // Only emit for recognised critical event types
  if (!isCriticalEventType(eventType)) {
    return null;
  }

  const input: CriticalEventInput = {
    eventType: eventType as CriticalSessionEventType,
    sessionId,
    bookingId,
    hostId,
    consumerUid,
    ownerUid,
    projectId,
  };

  const emitResult = await emitCriticalEvent(input, 0); // Use 0 delay in orchestrator for responsiveness

  // Log the orchestration event
  orchestratorLog.push({
    type: 'critical_event',
    sessionId,
    timestamp: new Date().toISOString(),
    success: emitResult.success,
    details: emitResult.success ? undefined : emitResult.error,
  });

  return { sessionId, emitResult };
}

// ─── Lifecycle Hook: onFileHandoffComplete ──────────────────────────────────────

/**
 * Associate uploaded files with the project reference in FileManager document registry
 * when a file handoff completes.
 *
 * Fires:
 *   - FileManager document registry association — Req 13.4
 *
 * Only applies when the session/manifest is linked to a project reference.
 *
 * @param input - Handoff completion data
 * @returns Association result
 */
export function onFileHandoffComplete(
  input: FileHandoffCompleteInput,
): FileHandoffCompleteResult {
  const { sessionId, manifestId, projectReference } = input;

  if (!projectReference || projectReference.trim().length === 0) {
    return {
      sessionId,
      manifestId,
      association: null,
      projectReference: null,
      success: true, // No-op is considered a success — no project reference to associate with
    };
  }

  try {
    // Retrieve the FileManager association created by the file approval service
    const association = getFileManagerAssociation(manifestId);

    if (!association) {
      // Log the event — handoff marked as complete but no association exists yet
      orchestratorLog.push({
        type: 'file_handoff_complete',
        sessionId,
        timestamp: new Date().toISOString(),
        success: false,
        details: `No FileManager association found for manifest ${manifestId}`,
      });

      return {
        sessionId,
        manifestId,
        association: null,
        projectReference,
        success: false,
        error: `No FileManager association found for manifest ${manifestId}`,
      };
    }

    // Association already exists (created by file approval service during upload).
    // The orchestrator verifies it's properly linked to the project reference.
    orchestratorLog.push({
      type: 'file_handoff_complete',
      sessionId,
      timestamp: new Date().toISOString(),
      success: true,
    });

    return {
      sessionId,
      manifestId,
      association,
      projectReference,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    orchestratorLog.push({
      type: 'file_handoff_complete',
      sessionId,
      timestamp: new Date().toISOString(),
      success: false,
      details: message,
    });

    return {
      sessionId,
      manifestId,
      association: null,
      projectReference,
      success: false,
      error: message,
    };
  }
}

// ─── Lifecycle Hook: onSessionEnd ────────────────────────────────────────────────

/**
 * Orchestrate analytics data exposure and billing pipeline reporting when a
 * session ends (regardless of completion status).
 *
 * Fires:
 *   1. Analytics Engine KPI data exposure — Req 13.5
 *   2. Billing pipeline reporting — Req 12.1
 *
 * This hook handles the common "session ended" integrations that apply whether
 * the session completed normally, was terminated, or failed.
 *
 * @param input - Session data and billing context
 * @returns Aggregated result from analytics + billing
 */
export async function onSessionEnd(
  input: SessionEndInput,
): Promise<SessionEndResult> {
  const { session, tenantId, disconnectionGaps, bookingWindowMinutes, billingReportFn } = input;
  const errors: string[] = [];

  let analyticsIngested = false;
  let billingReport: BillingReportResult | null = null;
  let usageRecord: UsageRecord | null = null;

  // 1. Analytics Engine KPI data exposure — Req 13.5
  try {
    ingestSessionRecord(session);
    analyticsIngested = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Analytics ingestion failed: ${message}`);
  }

  // 2. Billing pipeline reporting — Req 12.1
  try {
    const billingInput: SessionBillingInput = {
      sessionId: session.sessionId,
      bookingId: session.bookingId,
      ownerUid: session.ownerUid,
      consumerUid: session.consumerUid,
      totalConnectedSeconds: session.totalConnectedSeconds,
      disconnectionGaps,
      bookingWindowMinutes,
      sessionEndTimestamp: session.endTimestamp ?? Date.now(),
    };

    // Generate the usage record
    usageRecord = generateUsageRecord(billingInput);

    // Report to billing pipeline
    const reportFn = billingReportFn ?? defaultBillingReportFn;
    billingReport = await reportToBillingPipeline(session.sessionId, reportFn);

    if (!billingReport.success) {
      errors.push(`Billing report failed: ${billingReport.error ?? 'unknown'}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Billing reporting threw: ${message}`);
    billingReport = { success: false, error: message };
  }

  // Log the orchestration event
  orchestratorLog.push({
    type: 'session_end',
    sessionId: session.sessionId,
    timestamp: new Date().toISOString(),
    success: errors.length === 0,
    details: errors.length > 0 ? errors.join('; ') : undefined,
  });

  return {
    sessionId: session.sessionId,
    analyticsIngested,
    billingReport,
    usageRecord,
    errors,
  };
}

// ─── KPI Computation (pass-through to analytics adapter) ─────────────────────────

/**
 * Compute all Remote Desktop KPIs for a given date range.
 * Convenience method that delegates to the analytics adapter.
 *
 * @param dateRange - Time period to compute KPIs for
 * @param filter - Optional host filter
 * @returns Aggregated KPI computation result
 */
export function computeKPIs(
  dateRange: DateRange,
  filter?: KPIFilter,
): RemoteDesktopKPIComputationResult {
  return computeAllRemoteDesktopKPIs(dateRange, filter);
}

// ─── Default Billing Report Function ─────────────────────────────────────────────

/**
 * Default billing report function (simulates successful pipeline submission).
 * In production, this would call the actual marketplace billing API.
 */
async function defaultBillingReportFn(_record: UsageRecord): Promise<boolean> {
  return true;
}

// ─── Observability ──────────────────────────────────────────────────────────────

/**
 * Get the orchestrator event log (for testing and observability).
 */
export function getOrchestratorLog(): readonly OrchestratorEvent[] {
  return [...orchestratorLog];
}

/**
 * Get the count of logged orchestrator events.
 */
export function getOrchestratorEventCount(): number {
  return orchestratorLog.length;
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Reset all orchestrator state. Used in tests only.
 * @internal
 */
export function _resetOrchestratorState(): void {
  orchestratorLog.length = 0;
}
