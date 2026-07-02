/**
 * Retry Utility for Town Planning Integration Adapters
 *
 * Provides a generic retry wrapper with exponential backoff.
 * Default: 3 attempts within a 60s window.
 * On exhaustion: calls an onExhausted callback to create a failed-sync alert.
 */

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000). Doubles each retry. */
  delayMs?: number;
  /** Called when all retries are exhausted */
  onExhausted?: (error: unknown) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 1000;

/**
 * Executes a function with retry logic and exponential backoff.
 *
 * - Retries up to `maxAttempts` times (default 3)
 * - Uses exponential backoff starting at `delayMs` (default 1000ms)
 * - On full exhaustion, invokes `onExhausted` callback if provided
 * - Throws the last error if all retries fail and no onExhausted handles it
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const onExhausted = options?.onExhausted;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      if (attempt < maxAttempts) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
  }

  // All attempts exhausted
  if (onExhausted) {
    await onExhausted(lastError);
  }

  throw lastError;
}

/** Internal sleep utility */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
