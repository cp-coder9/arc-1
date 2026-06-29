/**
 * Sync Engine Service — Offline queue + reconciliation
 *
 * Pure functions for managing the offline capture queue:
 * - serializeQueue / deserializeQueue: round-trip serialization to localStorage
 * - orderForTransmission: sort by createdAt ascending
 * - enqueue: add captures respecting capacity
 * - reconcile: idempotent sync decision
 *
 * I/O wrappers (flush, enqueueIO) handle localStorage and Firestore persistence.
 */

import type { QueuedCapture } from '@/types';

export const QUEUE_CAPACITY = 500;

/**
 * Serialize a QueuedCapture array to a JSON string for localStorage persistence.
 *
 * Pure function — no side effects.
 * Validates: Requirements 4.7, 4.12
 */
export function serializeQueue(q: QueuedCapture[]): string {
  return JSON.stringify(q);
}

/**
 * Deserialize a JSON string back into a QueuedCapture array.
 *
 * Pure function — round-trip with serializeQueue.
 * Validates: Requirements 4.7, 4.12
 */
export function deserializeQueue(raw: string): QueuedCapture[] {
  return JSON.parse(raw) as QueuedCapture[];
}

/**
 * Order queued captures by createdAt ascending for transmission.
 *
 * Pure function — does not mutate the input array.
 * Returns a sorted copy so captures are transmitted in creation order.
 * Validates: Requirements 4.2, 4.13
 */
export function orderForTransmission(q: QueuedCapture[]): QueuedCapture[] {
  return [...q].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/**
 * Add a capture to the queue if the queue has not reached capacity.
 *
 * Pure function — does not mutate the input array.
 * Returns a new queue with the capture appended, or the original queue
 * with a 'queue_full' error if the queue is at capacity (500).
 * Validates: Requirements 4.1, 4.6, 4.14
 */
export function enqueue(
  q: QueuedCapture[],
  capture: QueuedCapture,
): { queue: QueuedCapture[]; error?: 'queue_full' } {
  if (q.length >= QUEUE_CAPACITY) {
    return { queue: q, error: 'queue_full' };
  }
  return { queue: [...q, capture] };
}

/**
 * Determine whether a queued capture should be persisted or skipped.
 *
 * Pure function — idempotent sync decision.
 * If the capture's clientId is already in the persisted set, returns 'skip'
 * (the record already exists — idempotent). Otherwise returns 'persist'.
 *
 * The I/O wrapper (flush) handles the actual Firestore write and
 * adds the clientId to the persisted set after successful persistence.
 *
 * Validates: Requirements 4.8, 4.15
 */
export function reconcile(persistedClientIds: Set<string>, capture: QueuedCapture): 'persist' | 'skip' {
  if (persistedClientIds.has(capture.clientId)) {
    return 'skip';
  }
  return 'persist';
}

/**
 * I/O wrapper for enqueue — reads the current queue from localStorage,
 * calls the pure enqueue function, and serializes the result back to localStorage on success.
 *
 * Returns { success: true } when the capture is queued and persisted to localStorage.
 * Returns { success: false, error: 'queue_full' } when the queue is at capacity.
 *
 * localStorage key format: `architex:syncQueue:{projectId}`
 *
 * Validates: Requirements 4.1
 */
export function enqueueIO(
  projectId: string,
  capture: QueuedCapture,
): { success: boolean; error?: 'queue_full' } {
  const storageKey = `architex:syncQueue:${projectId}`;
  const raw = localStorage.getItem(storageKey);
  const currentQueue: QueuedCapture[] = raw ? deserializeQueue(raw) : [];

  const result = enqueue(currentQueue, capture);

  if (result.error === 'queue_full') {
    return { success: false, error: 'queue_full' };
  }

  localStorage.setItem(storageKey, serializeQueue(result.queue));
  return { success: true };
}

/**
 * Maximum number of persistence attempts before a capture is marked as failed.
 */
export const MAX_FLUSH_ATTEMPTS = 5;

/**
 * I/O wrapper for flush — drains the offline queue against Firestore via the injected
 * persistFn, transmitting captures in creation order, removing each on success,
 * retrying on failure up to 5 attempts, and surfacing the failed count.
 *
 * The `persistFn` is injected to allow testing without Firestore.
 *
 * Implementation:
 * 1. Read the queue from localStorage key `architex:syncQueue:{projectId}`
 * 2. If empty, return { flushed: 0, failed: 0 }
 * 3. Order by createdAt ascending using `orderForTransmission`
 * 4. Track persistedClientIds (Set) for idempotent reconciliation
 * 5. For each capture in order:
 *    - Call `reconcile(persistedClientIds, capture)` — if 'skip', skip it
 *    - If 'persist', call `persistFn(capture)`
 *    - On success: add clientId to persistedClientIds, remove from queue
 *    - On failure: increment capture.attempts, if attempts >= 5 mark status as 'failed'
 * 6. Write the remaining queue back to localStorage
 * 7. Count failed = captures with status 'failed'
 * 8. Count flushed = captures successfully persisted during this flush
 * 9. Return { flushed, failed }
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5
 */
export async function flush(
  projectId: string,
  persistFn: (capture: QueuedCapture) => Promise<void>,
): Promise<{ flushed: number; failed: number }> {
  const storageKey = `architex:syncQueue:${projectId}`;
  const raw = localStorage.getItem(storageKey);
  const currentQueue: QueuedCapture[] = raw ? deserializeQueue(raw) : [];

  if (currentQueue.length === 0) {
    return { flushed: 0, failed: 0 };
  }

  // Order by createdAt ascending for transmission
  const ordered = orderForTransmission(currentQueue);

  // Track successfully persisted client IDs for idempotent reconciliation
  const persistedClientIds = new Set<string>();

  // Track which clientIds were successfully flushed this run
  const flushedClientIds = new Set<string>();

  // Process each capture in creation order
  for (const capture of ordered) {
    const decision = reconcile(persistedClientIds, capture);

    if (decision === 'skip') {
      // Already persisted — remove from queue
      flushedClientIds.add(capture.clientId);
      continue;
    }

    // decision === 'persist'
    try {
      await persistFn(capture);
      // Success: track as persisted and mark for removal
      persistedClientIds.add(capture.clientId);
      flushedClientIds.add(capture.clientId);
    } catch {
      // Failure: increment attempts, mark as failed if exhausted
      capture.attempts += 1;
      if (capture.attempts >= MAX_FLUSH_ATTEMPTS) {
        capture.status = 'failed';
      }
    }
  }

  // Build the remaining queue: captures that were NOT successfully flushed
  const remainingQueue = ordered.filter(
    (c) => !flushedClientIds.has(c.clientId),
  );

  // Write remaining queue back to localStorage
  localStorage.setItem(storageKey, serializeQueue(remainingQueue));

  // Count results
  const flushed = flushedClientIds.size;
  const failed = remainingQueue.filter((c) => c.status === 'failed').length;

  return { flushed, failed };
}

/**
 * I/O helper — remove a capture from the offline queue by its clientId.
 *
 * Used when a previously-failed capture is successfully re-uploaded so it no
 * longer needs to be retained in the Sync_Engine queue.
 *
 * No-op when the queue is empty or the clientId is not present.
 *
 * Validates: Requirements 2.5, 4.3
 */
export function removeFromQueueIO(projectId: string, clientId: string): void {
  const storageKey = `architex:syncQueue:${projectId}`;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  const queue = deserializeQueue(raw).filter((c) => c.clientId !== clientId);
  localStorage.setItem(storageKey, serializeQueue(queue));
}

/**
 * I/O helper — mark a queued capture as failed once its retry attempts are
 * exhausted. The capture is retained in the queue (with status 'failed' and
 * attempts pinned at the maximum) so the failure can be surfaced to the user
 * while the underlying FieldEvidence record is preserved.
 *
 * No-op when the queue is empty or the clientId is not present.
 *
 * Validates: Requirements 2.5, 4.4, 4.5
 */
export function markCaptureFailedIO(projectId: string, clientId: string): void {
  const storageKey = `architex:syncQueue:${projectId}`;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  const queue = deserializeQueue(raw).map((c) =>
    c.clientId === clientId
      ? { ...c, status: 'failed' as const, attempts: MAX_FLUSH_ATTEMPTS }
      : c,
  );
  localStorage.setItem(storageKey, serializeQueue(queue));
}
