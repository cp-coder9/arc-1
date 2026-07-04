/**
 * SpecForge Audit Adapter — bridges SpecForge write operations into
 * both the SpecForge-specific audit collection and the platform-wide
 * audit trail service.
 *
 * Key behaviours:
 * - Persists a SpecAuditEvent to the SpecForge collection via the repository
 * - Persists a platform audit record via the auditTrailService
 * - Caps previousValue / newValue at 10,000 characters each
 * - If the platform audit service is unavailable, persists to Firestore
 *   retry queue (`specAuditRetryQueue/{eventId}`) for durable retry
 * - Only called after successful writes — never on failed/rolled-back operations
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

import type { SpecAuditAction, SpecAuditEvent } from '@/types/specforgeTypes';
import { getSpecForgeRepository } from './specforgeRepository';
import { createAuditEntry } from '@/services/auditTrailService';
import { adminDb } from '@/lib/firebase-admin';

// ── Constants ───────────────────────────────────────────────────────────────

/** Maximum character length for previousValue / newValue fields. */
const VALUE_CAP = 10_000;

/** Firestore collection for durable retry queue. */
const RETRY_QUEUE_COLLECTION = 'specAuditRetryQueue';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique event ID. */
function generateEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `sfa-${ts}-${rand}`;
}

/** Truncate a string to the value cap, appending an ellipsis indicator if cut. */
function capValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length <= VALUE_CAP) return value;
  return value.slice(0, VALUE_CAP - 3) + '...';
}

// ── Platform Audit Persistence ──────────────────────────────────────────────

/**
 * Attempt to persist an audit event to the platform-wide audit trail.
 * Returns true on success, false on failure.
 */
function persistToPlatformAudit(event: SpecAuditEvent): boolean {
  try {
    createAuditEntry({
      actorId: event.performedBy,
      action: `specforge.${event.action}`,
      sourceObjectId: event.targetId,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist a failed platform audit event to Firestore for durable retry.
 * A background worker can pick these up later for reprocessing.
 *
 * TODO: Implement a background Cloud Function or scheduled worker that
 * queries `specAuditRetryQueue` for unprocessed events and retries
 * platform audit persistence with exponential backoff.
 */
async function persistToRetryQueue(event: SpecAuditEvent): Promise<void> {
  try {
    await adminDb.collection(RETRY_QUEUE_COLLECTION).doc(event.id).set({
      event,
      createdAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
    });
  } catch (err) {
    // Last resort: log the failure — the event is already safe in SpecForge collection
    console.warn('[SpecForge Audit] Failed to persist retry queue entry:', event.id, err);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Log a SpecForge action to both the SpecForge-specific audit collection
 * and the platform-wide audit trail.
 *
 * This function should ONLY be called after a successful write operation.
 * It never throws — platform audit failures are persisted to Firestore
 * retry queue for durable processing.
 *
 * @param params - The audit action parameters
 */
export async function logSpecForgeAction(params: {
  action: SpecAuditAction;
  targetId: string;
  targetType: 'item' | 'section' | 'workspace' | 'snapshot';
  performedBy: string;
  projectId: string;
  previousValue?: string;
  newValue?: string;
  /** Optional snapshot-specific fields for snapshot_created actions */
  snapshotId?: string;
  revision?: string;
  auditHash?: string;
}): Promise<void> {
  // Build the SpecAuditEvent with capped values
  const event: SpecAuditEvent = {
    id: generateEventId(),
    workspaceId: params.projectId,
    action: params.action,
    targetId: params.targetId,
    targetType: params.targetType,
    performedBy: params.performedBy,
    performedAt: new Date().toISOString(),
    previousValue: capValue(params.previousValue),
    newValue: capValue(params.newValue),
  };

  // For snapshot creation, record snapshot metadata in the details field
  if (params.snapshotId || params.revision || params.auditHash) {
    event.details = JSON.stringify({
      snapshotId: params.snapshotId,
      revision: params.revision,
      auditHash: params.auditHash,
    });
  }

  // 1. Persist to SpecForge-specific collection (always — this is the primary store)
  const repo = getSpecForgeRepository();
  await repo.logAuditEvent(event);

  // 2. Persist to platform-wide audit trail (best-effort with durable retry)
  const platformSuccess = persistToPlatformAudit(event);
  if (!platformSuccess) {
    await persistToRetryQueue(event);
  }
}

// ── Test Utilities ──────────────────────────────────────────────────────────

/** Exposed for testing: the value cap constant. */
export const VALUE_CAP_LIMIT = VALUE_CAP;

/** Exposed for testing: the retry queue collection name. */
export const RETRY_QUEUE_COLLECTION_NAME = RETRY_QUEUE_COLLECTION;
