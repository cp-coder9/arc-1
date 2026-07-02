/**
 * SpecForge Audit Adapter — bridges SpecForge write operations into
 * both the SpecForge-specific audit collection and the platform-wide
 * audit trail service.
 *
 * Key behaviours:
 * - Persists a SpecAuditEvent to the SpecForge collection via the repository
 * - Persists a platform audit record via the auditTrailService
 * - Caps previousValue / newValue at 10,000 characters each
 * - If the platform audit service is unavailable, queues for retry
 *   (exponential backoff, max 3 attempts) — never fails the primary operation
 * - Only called after successful writes — never on failed/rolled-back operations
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

import type { SpecAuditAction, SpecAuditEvent } from '@/types/specforgeTypes';
import { getSpecForgeRepository } from './specforgeRepository';
import { createAuditEntry } from '@/services/auditTrailService';

// ── Constants ───────────────────────────────────────────────────────────────

/** Maximum character length for previousValue / newValue fields. */
const VALUE_CAP = 10_000;

/** Maximum retry attempts for platform audit trail persistence. */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff (doubles each retry). */
const BASE_RETRY_DELAY_MS = 500;

// ── Retry Queue ─────────────────────────────────────────────────────────────

interface RetryEntry {
  event: SpecAuditEvent;
  attempts: number;
}

/** In-memory queue for events that failed to reach the platform audit trail. */
const retryQueue: RetryEntry[] = [];

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

/** Sleep helper for retry delays. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * Process a single retry entry with exponential backoff.
 * Removes the entry from the queue on success or after max retries exhausted.
 */
async function processRetry(entry: RetryEntry): Promise<void> {
  for (let attempt = entry.attempts; attempt < MAX_RETRIES; attempt++) {
    const backoffMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
    await delay(backoffMs);

    const success = persistToPlatformAudit(entry.event);
    if (success) {
      return;
    }
    entry.attempts = attempt + 1;
  }
  // Max retries exhausted — event is already safe in SpecForge collection.
  // In production, this would be logged to a dead-letter queue or monitoring.
}

/**
 * Queue a failed platform audit event for retry with exponential backoff.
 */
function queueForRetry(event: SpecAuditEvent): void {
  const entry: RetryEntry = { event, attempts: 0 };
  retryQueue.push(entry);

  // Fire-and-forget retry processing — don't block the caller
  processRetry(entry).finally(() => {
    const idx = retryQueue.indexOf(entry);
    if (idx !== -1) retryQueue.splice(idx, 1);
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Log a SpecForge action to both the SpecForge-specific audit collection
 * and the platform-wide audit trail.
 *
 * This function should ONLY be called after a successful write operation.
 * It never throws — platform audit failures are queued for retry silently.
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

  // 2. Persist to platform-wide audit trail (best-effort with retry)
  const platformSuccess = persistToPlatformAudit(event);
  if (!platformSuccess) {
    queueForRetry(event);
  }
}

// ── Test Utilities ──────────────────────────────────────────────────────────

/** Get the current retry queue length (for testing). */
export function _getRetryQueueLength(): number {
  return retryQueue.length;
}

/** Clear the retry queue (for testing). */
export function _clearRetryQueue(): void {
  retryQueue.length = 0;
}

/** Exposed for testing: the value cap constant. */
export const VALUE_CAP_LIMIT = VALUE_CAP;
