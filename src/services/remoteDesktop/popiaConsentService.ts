/**
 * POPIA Consent Service — Consent Management for Recording & Screenshots
 *
 * Manages POPIA-compliant consent for session recording and screenshot capture.
 * South African Protection of Personal Information Act requires explicit,
 * informed consent before any personal data processing (including recording).
 *
 * Responsibilities:
 * - Consent prompt content generation (purpose, retention, access, rights)
 * - Consent record creation with SHA-256 IP hash (never stores raw IP)
 * - Consent validation before media stream establishment
 * - Screenshot consent flag management (separate from recording consent)
 * - Policy immutability during active sessions
 * - 60-second consent timeout handling → consent_declined event
 * - Integration with audit event service for consent events
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { createHash } from 'node:crypto';
import { createAuditEvent } from './auditEventService';
import {
  SESSION_EVENT_TYPES,
  type ConsentType,
  type PopiaConsentRecord,
  type HostConfig,
  type ActorRole,
  type SessionEvent,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Consent timeout duration in milliseconds (60 seconds) */
export const CONSENT_TIMEOUT_MS = 60_000;

/** Recording retention period as defined by POPIA policy */
export const RETENTION_PERIOD_DAYS = 90;

/** Access list for recorded content */
export const RECORDING_ACCESS_LIST: readonly string[] = [
  'Resource Owner',
  'Resource Consumer',
  'Platform Admin',
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateConsentInput {
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  hostId: string;
  consentType: ConsentType;
  consentTextVersion: string;
  ipAddress: string;
}

export interface ConsentValidation {
  hasConsent: boolean;
  consentType?: ConsentType;
  grantedAt?: string;
}

export interface ConsentDeclinedResult {
  declined: boolean;
  sessionId: string;
  reason: 'user_declined' | 'timeout';
}

export interface ConsentPromptContent {
  purpose: string;
  retentionPeriod: string;
  accessList: string[];
  rightToDecline: string;
}

// ─── Internal State ─────────────────────────────────────────────────────────────

/** Maps sessionId → consent records (recording + screenshot stored separately) */
const sessionConsentRecords = new Map<string, PopiaConsentRecord[]>();

/** Maps sessionId → whether the session is currently active (for policy immutability) */
const activeSessions = new Map<string, boolean>();

/** Maps sessionId → snapshot of host config at session start (policy immutability) */
const sessionPolicySnapshots = new Map<string, HostConfig>();

// ─── IP Hashing ─────────────────────────────────────────────────────────────────

/**
 * Hash an IP address using SHA-256. Never stores or returns the raw IP.
 * Returns a 64-character lowercase hex string.
 */
export function hashIpAddress(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

// ─── Consent Record Creation ────────────────────────────────────────────────────

/**
 * Create a POPIA consent record and emit a popia_consent_granted audit event.
 *
 * The consent record stores:
 * - Consent type (recording or screenshot)
 * - Consent text version identifier
 * - Consumer UID
 * - Timestamp (ISO 8601)
 * - IP address hash (SHA-256, never raw IP)
 *
 * @returns The created PopiaConsentRecord
 */
export function createConsentRecord(input: CreateConsentInput): PopiaConsentRecord {
  const ipHash = hashIpAddress(input.ipAddress);
  const timestamp = new Date().toISOString();

  const record: PopiaConsentRecord = {
    consentType: input.consentType,
    consentTextVersion: input.consentTextVersion,
    consumerUid: input.consumerUid,
    timestamp,
    ipAddressHash: ipHash,
  };

  // Store the consent record for the session
  const existing = sessionConsentRecords.get(input.sessionId) ?? [];
  existing.push(record);
  sessionConsentRecords.set(input.sessionId, existing);

  // Emit popia_consent_granted audit event
  createAuditEvent({
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    eventType: SESSION_EVENT_TYPES.POPIA_CONSENT_GRANTED,
    actorUid: input.consumerUid,
    actorRole: 'consumer' as ActorRole,
    hostId: input.hostId,
    metadata: {
      consentType: input.consentType,
      consentTextVersion: input.consentTextVersion,
      ipAddressHash: ipHash,
    },
  });

  return record;
}

// ─── Consent Validation ─────────────────────────────────────────────────────────

/**
 * Validate that consent exists for a session before media stream proceeds.
 *
 * Property 9 — POPIA Consent Gate:
 * mediaStreamEstablished(session) ⟺ ∃ event where eventType === 'popia_consent_granted'
 *
 * @returns ConsentValidation indicating whether consent has been granted
 */
export function validateConsentForStream(sessionId: string): ConsentValidation {
  const records = sessionConsentRecords.get(sessionId);

  if (!records || records.length === 0) {
    return { hasConsent: false };
  }

  // Look for a recording consent record (required for media stream)
  const recordingConsent = records.find((r) => r.consentType === 'recording');
  if (recordingConsent) {
    return {
      hasConsent: true,
      consentType: recordingConsent.consentType,
      grantedAt: recordingConsent.timestamp,
    };
  }

  return { hasConsent: false };
}

// ─── Recording Enabled Check ────────────────────────────────────────────────────

/**
 * Check if a host has recording enabled in its configuration.
 * Used to determine whether POPIA consent prompt is needed.
 */
export function isRecordingEnabled(hostConfig: HostConfig): boolean {
  return hostConfig.recordingEnabled === true;
}

// ─── Policy Immutability ────────────────────────────────────────────────────────

/**
 * Register a session as active with a snapshot of the host policy.
 * Once registered, policy changes will not be applied to this session.
 */
export function registerActiveSession(sessionId: string, hostConfig: HostConfig): void {
  activeSessions.set(sessionId, true);
  sessionPolicySnapshots.set(sessionId, { ...hostConfig });
}

/**
 * Deregister a session (mark as ended).
 */
export function deregisterSession(sessionId: string): void {
  activeSessions.set(sessionId, false);
}

/**
 * Check whether a policy change can be applied.
 * Returns false if the session is active (policy immutability during active sessions).
 *
 * Requirement 2.5: Policy changes during active session NOT applied.
 * New policy takes effect only for sessions initiated after the change.
 */
export function canApplyPolicyChange(sessionId: string): boolean {
  const isActive = activeSessions.get(sessionId);
  return isActive !== true;
}

/**
 * Get the policy snapshot for a session (the policy that was active when session started).
 */
export function getSessionPolicySnapshot(sessionId: string): HostConfig | undefined {
  return sessionPolicySnapshots.get(sessionId);
}

// ─── Consent Timeout ────────────────────────────────────────────────────────────

/**
 * Handle the 60-second consent timeout scenario.
 * When a consumer does not respond within 60 seconds, the session is cancelled
 * and a consent_declined event is written to the audit log.
 *
 * Requirement 2.2: Decline or 60s timeout → cancel session, write consent_declined event.
 */
export function handleConsentTimeout(
  sessionId: string,
  bookingId: string,
  consumerUid: string,
  hostId: string,
): ConsentDeclinedResult {
  // Emit consent_declined audit event with timeout reason
  createAuditEvent({
    sessionId,
    bookingId,
    eventType: SESSION_EVENT_TYPES.CONSENT_DECLINED,
    actorUid: consumerUid,
    actorRole: 'system' as ActorRole,
    hostId,
    metadata: {
      reason: 'timeout',
      timeoutMs: CONSENT_TIMEOUT_MS,
    },
  });

  return {
    declined: true,
    sessionId,
    reason: 'timeout',
  };
}

// ─── Consent Decline ────────────────────────────────────────────────────────────

/**
 * Handle explicit consent decline by the consumer.
 * Writes a consent_declined event and cancels the session.
 *
 * Requirement 2.2: Decline → cancel session, write consent_declined event.
 */
export function declineConsent(
  sessionId: string,
  bookingId: string,
  consumerUid: string,
  hostId: string,
): ConsentDeclinedResult {
  // Emit consent_declined audit event
  createAuditEvent({
    sessionId,
    bookingId,
    eventType: SESSION_EVENT_TYPES.CONSENT_DECLINED,
    actorUid: consumerUid,
    actorRole: 'consumer' as ActorRole,
    hostId,
    metadata: {
      reason: 'user_declined',
    },
  });

  return {
    declined: true,
    sessionId,
    reason: 'user_declined',
  };
}

// ─── Screenshot Consent ─────────────────────────────────────────────────────────

/**
 * Grant screenshot consent for a session.
 * Screenshot consent is separate from recording consent (Requirement 2.4).
 *
 * @returns The created PopiaConsentRecord for screenshot consent
 */
export function grantScreenshotConsent(
  sessionId: string,
  bookingId: string,
  consumerUid: string,
  hostId: string,
  consentTextVersion: string,
  ipAddress: string,
): PopiaConsentRecord {
  return createConsentRecord({
    sessionId,
    bookingId,
    consumerUid,
    hostId,
    consentType: 'screenshot',
    consentTextVersion,
    ipAddress,
  });
}

/**
 * Check whether screenshot consent has been granted for a session.
 * Requirement 2.4: No screenshots without separate screenshot_consent flag.
 */
export function hasScreenshotConsent(sessionId: string): boolean {
  const records = sessionConsentRecords.get(sessionId);
  if (!records) return false;
  return records.some((r) => r.consentType === 'screenshot');
}

// ─── Consent Prompt Content ─────────────────────────────────────────────────────

/**
 * Generate the POPIA consent prompt content for display in Browser_Viewer.
 *
 * Requirement 2.1: Prompt must state purpose, retention period, access list,
 * and the consumer's right to decline.
 */
export function getConsentPromptContent(hostConfig: HostConfig): ConsentPromptContent {
  return {
    purpose:
      'This session will be recorded for quality assurance, dispute resolution, and compliance purposes.',
    retentionPeriod: `${RETENTION_PERIOD_DAYS} days or until dispute resolution, whichever is longer.`,
    accessList: [...RECORDING_ACCESS_LIST],
    rightToDecline:
      'You have the right to decline recording. If you decline or do not respond within 60 seconds, the session will not proceed.',
  };
}

// ─── State Management (for testing) ────────────────────────────────────────────

/**
 * Clear all internal state. Used for test isolation.
 */
export function _clearAllState(): void {
  sessionConsentRecords.clear();
  activeSessions.clear();
  sessionPolicySnapshots.clear();
}

/**
 * Get all consent records for a session (for testing).
 */
export function _getSessionConsentRecords(sessionId: string): PopiaConsentRecord[] {
  return [...(sessionConsentRecords.get(sessionId) ?? [])];
}

/**
 * Get the count of sessions with consent records.
 */
export function _getTrackedSessionCount(): number {
  return sessionConsentRecords.size;
}
