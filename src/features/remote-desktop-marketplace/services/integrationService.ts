// ─── Remote Desktop Marketplace — Integration Service ────────────────────────
//
// Pure business logic for platform spine integration: workflow events,
// audit trail entries, and retry queue management.
// No Firebase imports — persistence is wired at the API routes layer.

import type {
  MarketplaceAuditEventType,
  MarketplaceAuditEntry,
  RetryQueueItem,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 30_000; // 30 seconds

// ─── Workflow Events ──────────────────────────────────────────────────────────

/**
 * Creates a workflow event record for platform spine integration.
 * Workflow events represent marketplace actions that need to be communicated
 * to the broader platform (Action Centre, notifications, etc.).
 */
export function createWorkflowEvent(
  type: MarketplaceAuditEventType,
  actorUserId: string,
  targetEntityId: string,
  entityType: string,
  tenantId: string
): MarketplaceAuditEntry {
  return {
    eventType: type,
    actorUserId,
    targetEntityId,
    entityType,
    timestamp: new Date().toISOString(),
    tenantId,
  };
}

// ─── Audit Trail ──────────────────────────────────────────────────────────────

/**
 * Creates an audit trail entry for a marketplace action.
 *
 * All 11 supported event types:
 * - booking_requested, booking_confirmed, booking_declined,
 *   booking_cancelled, booking_expired
 * - review_submitted, review_replied
 * - listing_published, listing_paused, listing_activated
 * - favourite_added
 *
 * Each entry contains: event type, actor user ID, target entity ID,
 * entity type, timestamp (ISO 8601), and tenant ID.
 */
export function createAuditEntry(
  type: MarketplaceAuditEventType,
  actorUserId: string,
  targetEntityId: string,
  entityType: string,
  tenantId: string
): MarketplaceAuditEntry {
  return {
    eventType: type,
    actorUserId,
    targetEntityId,
    entityType,
    timestamp: new Date().toISOString(),
    tenantId,
  };
}

// ─── Retry Queue ──────────────────────────────────────────────────────────────

/**
 * Creates a new retry queue item for a failed platform spine write.
 * Initial state: 0 attempts, pending status, nextRetryAt set to 30s from now.
 */
export function createRetryQueueItem(
  type: RetryQueueItem['type'],
  payload: Record<string, unknown>
): RetryQueueItem {
  const now = new Date();
  const nextRetry = new Date(now.getTime() + RETRY_INTERVAL_MS);

  return {
    id: crypto.randomUUID(),
    type,
    payload,
    attempts: 0,
    nextRetryAt: nextRetry.toISOString(),
    status: 'pending',
    createdAt: now.toISOString(),
  };
}

/**
 * Determines whether a retry queue item should be retried.
 * Returns true if attempts < MAX_RETRY_ATTEMPTS (3).
 */
export function shouldRetry(item: RetryQueueItem): boolean {
  return item.attempts < MAX_RETRY_ATTEMPTS;
}

/**
 * Increments the retry attempt count and sets the next retry time (30s from now).
 * Returns a new RetryQueueItem with updated attempts and nextRetryAt.
 */
export function incrementRetryAttempt(item: RetryQueueItem): RetryQueueItem {
  const nextRetry = new Date(Date.now() + RETRY_INTERVAL_MS);

  return {
    ...item,
    attempts: item.attempts + 1,
    nextRetryAt: nextRetry.toISOString(),
  };
}

/**
 * Marks a retry queue item as permanently failed after exhausting all retries.
 * Sets status to 'permanently_failed' and records the last error message.
 */
export function markPermanentlyFailed(
  item: RetryQueueItem,
  error: string
): RetryQueueItem {
  return {
    ...item,
    status: 'permanently_failed',
    lastError: error,
  };
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Filters audit entries for a specific target entity.
 * Returns all audit entries whose targetEntityId matches the given entityId.
 */
export function getAuditEventsForEntity(
  entityId: string,
  auditEntries: MarketplaceAuditEntry[]
): MarketplaceAuditEntry[] {
  return auditEntries.filter((entry) => entry.targetEntityId === entityId);
}
