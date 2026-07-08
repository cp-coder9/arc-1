/**
 * Remote Desktop Core — Project Passport Integration Adapter
 *
 * On session completion with a project reference, writes a ProjectRecord
 * to the Project Passport containing session metadata.
 *
 * Retry policy: up to 3 attempts at 30-second intervals on failure.
 * If all retries are exhausted, notifies Platform_Admin via WorkflowEvent.
 *
 * Requirements: 13.1, 13.6
 */

import type {
  ProjectRecord,
  ProjectPhase,
  RecordStatus,
  AuditMetadata,
  ApprovalMetadata,
} from '@/services/lifecycleTypes';
import type { SessionRecord } from './sessionBrokerService';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Payload shape for a remote desktop session ProjectRecord */
export interface RemoteDesktopSessionPayload {
  sessionId: string;
  bookingReference: string;
  consumerUid: string;
  connectedDurationMinutes: number;
  applicationsUsed: string[];
  filesProduced: number;
  disconnectionReason: string;
  [key: string]: unknown;
}

/** Input required to write a session record to the Project Passport */
export interface WriteSessionToPassportInput {
  session: SessionRecord;
  projectId: string;
  tenantId: string;
  phase?: ProjectPhase;
}

/** Result of a passport write operation */
export interface PassportWriteResult {
  success: boolean;
  recordId?: string;
  error?: string;
  attempts: number;
}

/** Stored passport record for retrieval */
export interface StoredPassportRecord {
  recordId: string;
  sessionId: string;
  projectId: string;
  tenantId: string;
  record: ProjectRecord<RemoteDesktopSessionPayload>;
  writtenAt: string;
}

/** Notification sent to Platform_Admin on retry exhaustion */
export interface AdminNotification {
  type: 'passport_write_failed';
  sessionId: string;
  projectId: string;
  reason: string;
  timestamp: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum number of write retry attempts */
const MAX_RETRY_ATTEMPTS = 3;

/** Interval between retries in milliseconds */
const RETRY_INTERVAL_MS = 30_000;

// ─── In-Memory Stores (to be backed by Firestore in production) ─────────────────

const passportRecords: Map<string, StoredPassportRecord> = new Map();
const adminNotifications: AdminNotification[] = [];

// ─── Internal Helpers ───────────────────────────────────────────────────────────

let recordSeq = 1;

/**
 * Calculate connected duration in whole minutes (rounded up).
 * Uses totalConnectedSeconds from the session record.
 */
function calculateWholeMinutes(totalConnectedSeconds: number): number {
  if (totalConnectedSeconds <= 0) return 0;
  return Math.ceil(totalConnectedSeconds / 60);
}

/**
 * Build a ProjectRecord envelope for the Project Passport from session data.
 */
function buildProjectRecord(
  input: WriteSessionToPassportInput,
): ProjectRecord<RemoteDesktopSessionPayload> {
  const { session, projectId, tenantId, phase } = input;

  const payload: RemoteDesktopSessionPayload = {
    sessionId: session.sessionId,
    bookingReference: session.bookingId,
    consumerUid: session.consumerUid,
    connectedDurationMinutes: calculateWholeMinutes(session.totalConnectedSeconds),
    applicationsUsed: [...session.applicationsUsed],
    filesProduced: session.filesProducedCount,
    disconnectionReason: session.disconnectionReason,
  };

  const audit: AuditMetadata = {
    createdBy: 'system:remote-desktop',
    createdAt: new Date().toISOString(),
  };

  const approvals: ApprovalMetadata = {
    required: false,
  };

  return {
    id: `rd-passport-${recordSeq++}`,
    tenantId,
    projectId,
    phase: phase ?? 'concept_design',
    moduleKey: 'project',
    recordType: 'project_brief', // Remote desktop sessions recorded as project records
    title: `Remote Desktop Session — ${session.sessionId.slice(0, 8)}`,
    status: 'approved' as RecordStatus,
    payload,
    approvals,
    audit,
    linkedRecordIds: [],
  };
}

/**
 * Simulate persisting a ProjectRecord to Firestore.
 * In production this would call the Firestore Admin SDK.
 * Throws on failure to trigger retry logic.
 */
async function defaultPersistRecord(
  record: ProjectRecord<RemoteDesktopSessionPayload>,
  _projectId: string,
): Promise<string> {
  // In-memory persistence — production would write to Firestore
  return record.id;
}

/**
 * Notify Platform_Admin that a passport write has failed after all retries.
 */
function notifyPlatformAdmin(sessionId: string, projectId: string, reason: string): void {
  adminNotifications.push({
    type: 'passport_write_failed',
    sessionId,
    projectId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Wait for a specified duration (used between retries).
 * In tests this can be mocked or the delay can be set to 0.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Persist Override (for testing) ──────────────────────────────────────────────

let _persistOverride: ((record: ProjectRecord<RemoteDesktopSessionPayload>, projectId: string) => Promise<string>) | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Check if a session has a project reference (i.e., is linked to a project).
 * A session is project-linked when its `projectReference` field is a non-empty string.
 */
export function isProjectLinked(session: SessionRecord): boolean {
  return typeof session.projectReference === 'string' && session.projectReference.trim().length > 0;
}

/**
 * Write a session record to the Project Passport.
 *
 * Creates a ProjectRecord envelope containing session metadata and persists it.
 * Retries up to 3 times at 30-second intervals on failure.
 * Notifies Platform_Admin if all retries are exhausted.
 *
 * @param input - Session data and project context
 * @param retryDelayMs - Override retry interval (useful for tests, default 30000ms)
 * @returns Result indicating success/failure and number of attempts
 */
export async function writeSessionToPassport(
  input: WriteSessionToPassportInput,
  retryDelayMs: number = RETRY_INTERVAL_MS,
): Promise<PassportWriteResult> {
  const { session, projectId, tenantId } = input;

  // Validate session has a project reference
  if (!isProjectLinked(session)) {
    return {
      success: false,
      error: 'Session has no project reference',
      attempts: 0,
    };
  }

  // Validate required fields
  if (!projectId || !tenantId) {
    return {
      success: false,
      error: 'Missing projectId or tenantId',
      attempts: 0,
    };
  }

  const record = buildProjectRecord(input);
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const persist = _persistOverride ?? defaultPersistRecord;
      const recordId = await persist(record, projectId);

      // Store for later retrieval
      passportRecords.set(session.sessionId, {
        recordId,
        sessionId: session.sessionId,
        projectId,
        tenantId,
        record,
        writtenAt: new Date().toISOString(),
      });

      return {
        success: true,
        recordId,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      // Wait before next retry (unless it's the last attempt)
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await delay(retryDelayMs);
      }
    }
  }

  // All retries exhausted — notify Platform_Admin
  notifyPlatformAdmin(
    session.sessionId,
    projectId,
    `Failed to write session record to Project Passport after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError}`,
  );

  return {
    success: false,
    error: lastError,
    attempts: MAX_RETRY_ATTEMPTS,
  };
}

/**
 * Retrieve the written passport record for a given session ID.
 *
 * @param sessionId - The session ID to look up
 * @returns The stored record or undefined if not found
 */
export function getPassportRecord(sessionId: string): StoredPassportRecord | undefined {
  return passportRecords.get(sessionId);
}

/**
 * Get all admin notifications (for testing/observability).
 */
export function getAdminNotifications(): readonly AdminNotification[] {
  return [...adminNotifications];
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Reset all in-memory state. Used in tests only.
 */
export function _resetPassportAdapterState(): void {
  passportRecords.clear();
  adminNotifications.length = 0;
  recordSeq = 1;
  _persistOverride = null;
}

/**
 * Inject a custom persist function for testing failure scenarios.
 * Set to null to restore default behaviour.
 */
export function _setPersistOverride(
  fn: ((record: ProjectRecord<RemoteDesktopSessionPayload>, projectId: string) => Promise<string>) | null,
): void {
  _persistOverride = fn;
}
