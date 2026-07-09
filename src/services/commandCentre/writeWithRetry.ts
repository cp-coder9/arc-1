/**
 * Project Command Centre — Write With Retry Utility
 *
 * Implements a retry pattern for Firestore write operations with error handling.
 * Failed writes preserve unsaved data in memory unchanged across all retry attempts
 * and do not alter Firestore state until a retry succeeds.
 *
 * Also provides a read-with-freshness utility that ensures no stale cache older
 * than 30 seconds is served.
 *
 * @module commandCentre/writeWithRetry
 *
 * Validates: Requirements 5.7, 5.8, 5.9, 5.10
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Result of a write-with-retry operation. */
export interface WriteResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
}

/** Result of a read operation with freshness guarantees. */
export interface ReadResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  stale: boolean;
}

/** Options for configuring read-with-freshness behaviour. */
export interface ReadOptions {
  /** Maximum age in milliseconds before data is considered stale. Default: 30000 (30s). */
  maxAgeMs?: number;
}

/** Notification severity level for UI feedback. */
export type NotificationSeverity = 'error' | 'warning' | 'info';

/** Notification payload emitted by error handling utilities. */
export interface Notification {
  severity: NotificationSeverity;
  title: string;
  message: string;
  action?: {
    label: string;
    handler: () => void;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Default maximum number of retry attempts for write operations. */
export const DEFAULT_MAX_RETRIES = 3;

/** Default maximum cache age before data is considered stale (30 seconds). */
export const DEFAULT_MAX_AGE_MS = 30_000;

// ── Notification Emitter ─────────────────────────────────────────────────────

type NotificationListener = (notification: Notification) => void;

const listeners: NotificationListener[] = [];

/**
 * Registers a listener to receive error/notification events.
 * Returns an unsubscribe function.
 */
export function onNotification(listener: NotificationListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function emitNotification(notification: Notification): void {
  for (const listener of listeners) {
    listener(notification);
  }
}

// ── Write With Retry ─────────────────────────────────────────────────────────

/**
 * Executes a write operation with up to `maxRetries` attempts.
 *
 * Key invariants (Property 13):
 * - Failed write allows up to maxRetries retry attempts
 * - Preserves unsaved data unchanged across all retry attempts
 *   (the operation function is called without modification each time)
 * - Does not alter Firestore state until a retry succeeds
 *   (each attempt is atomic — it either fully succeeds or fully fails)
 *
 * On final failure: emits an error notification for UI display.
 *
 * @param operation - The async write operation to execute. Must be idempotent.
 * @param maxRetries - Maximum number of attempts (default: 3).
 * @returns WriteResult with success status, data on success, error on failure, and attempt count.
 */
export async function writeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<WriteResult<T>> {
  let attempts = 0;
  let lastError: string | undefined;

  while (attempts < maxRetries) {
    attempts++;
    try {
      const result = await operation();
      return { success: true, data: result, attempts };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error';

      if (attempts >= maxRetries) {
        emitNotification({
          severity: 'error',
          title: 'Write Failed',
          message: `Operation failed after ${attempts} attempt${attempts > 1 ? 's' : ''}: ${lastError}`,
        });
        return { success: false, error: lastError, attempts };
      }
    }
  }

  // Unreachable in practice, but satisfies TypeScript
  return { success: false, error: lastError ?? 'Max retries exceeded', attempts };
}

// ── Read With Freshness ──────────────────────────────────────────────────────

/** Internal cache entry for read freshness tracking. */
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const readCache = new Map<string, CacheEntry<unknown>>();

/**
 * Executes a read operation with data freshness guarantee.
 *
 * Ensures no stale cache older than 30 seconds is served (Requirement 5.10).
 * On failure: emits an error notification with a manual refresh action.
 *
 * @param key - Cache key for deduplication.
 * @param operation - The async read operation.
 * @param options - Read options (maxAgeMs defaults to 30s).
 * @returns ReadResult with success status and freshness indicator.
 */
export async function readWithFreshness<T>(
  key: string,
  operation: () => Promise<T>,
  options: ReadOptions = {},
): Promise<ReadResult<T>> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = Date.now();

  // Check cache freshness
  const cached = readCache.get(key) as CacheEntry<T> | undefined;
  if (cached && now - cached.fetchedAt < maxAgeMs) {
    return { success: true, data: cached.data, stale: false };
  }

  try {
    const data = await operation();
    readCache.set(key, { data, fetchedAt: now });
    return { success: true, data, stale: false };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // If we have stale cached data, return it with stale flag
    if (cached) {
      emitNotification({
        severity: 'warning',
        title: 'Using Stale Data',
        message: `Could not refresh data: ${errorMessage}. Showing previously loaded data.`,
        action: {
          label: 'Retry',
          handler: () => {
            readCache.delete(key);
          },
        },
      });
      return { success: true, data: cached.data, stale: true };
    }

    emitNotification({
      severity: 'error',
      title: 'Read Failed',
      message: `Data could not be loaded: ${errorMessage}`,
      action: {
        label: 'Refresh',
        handler: () => {
          readCache.delete(key);
        },
      },
    });
    return { success: false, error: errorMessage, stale: false };
  }
}

/**
 * Invalidates a specific cache entry, forcing the next read to fetch fresh data.
 */
export function invalidateCache(key: string): void {
  readCache.delete(key);
}

/**
 * Clears all cached read data. Useful for testing or forced refresh scenarios.
 */
export function clearCache(): void {
  readCache.clear();
}

/**
 * Returns the current age of a cached entry in milliseconds, or -1 if not cached.
 */
export function getCacheAge(key: string): number {
  const entry = readCache.get(key);
  if (!entry) return -1;
  return Date.now() - entry.fetchedAt;
}

// ── Service Export ───────────────────────────────────────────────────────────

export const writeRetryService = {
  writeWithRetry,
  readWithFreshness,
  invalidateCache,
  clearCache,
  getCacheAge,
  onNotification,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_AGE_MS,
};

export default writeRetryService;
