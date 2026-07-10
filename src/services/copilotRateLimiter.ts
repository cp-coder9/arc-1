/**
 * AI Copilot Rate Limiter — In-Memory Sliding Window
 *
 * Enforces 60 requests per user per 60-minute sliding window.
 * Purely in-memory — resets on server restart (acceptable for this use case).
 *
 * @module copilotRateLimiter
 */

import type { RateLimitState } from '@/services/copilotTypes';

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_REQUESTS = 60;
const WINDOW_DURATION_MINUTES = 60;
const WINDOW_DURATION_MS = WINDOW_DURATION_MINUTES * 60 * 1000;

// ─── In-Memory Store ───────────────────────────────────────────────────────

const rateLimitStore = new Map<string, RateLimitState>();

// ─── Public API ────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMinutes?: number;
  state: RateLimitState;
}

/**
 * Check whether a user is allowed to make a request under the rate limit.
 * Does NOT increment the counter — call `recordRequest()` after a successful request.
 */
export function checkRateLimit(userId: string): RateLimitResult {
  const now = new Date();
  const existing = rateLimitStore.get(userId);

  // No record — first request from this user
  if (!existing) {
    const state: RateLimitState = {
      userId,
      windowStart: now.toISOString(),
      requestCount: 0,
      maxRequests: 60,
      windowDurationMinutes: 60,
    };
    rateLimitStore.set(userId, state);
    return { allowed: true, state };
  }

  const windowStartTime = new Date(existing.windowStart).getTime();
  const windowEndTime = windowStartTime + WINDOW_DURATION_MS;

  // Window has expired — reset
  if (now.getTime() > windowEndTime) {
    const state: RateLimitState = {
      userId,
      windowStart: now.toISOString(),
      requestCount: 0,
      maxRequests: 60,
      windowDurationMinutes: 60,
    };
    rateLimitStore.set(userId, state);
    return { allowed: true, state };
  }

  // Within window and under limit
  if (existing.requestCount < MAX_REQUESTS) {
    return { allowed: true, state: existing };
  }

  // Limit exceeded — calculate retry time
  const msUntilReset = windowEndTime - now.getTime();
  const retryAfterMinutes = Math.ceil(msUntilReset / (60 * 1000));

  return {
    allowed: false,
    retryAfterMinutes,
    state: existing,
  };
}

/**
 * Record a successful request for a user, incrementing their counter.
 * Call this after the request has been processed successfully.
 */
export function recordRequest(userId: string): void {
  const now = new Date();
  const existing = rateLimitStore.get(userId);

  if (!existing) {
    // Create a fresh state with count of 1
    const state: RateLimitState = {
      userId,
      windowStart: now.toISOString(),
      requestCount: 1,
      maxRequests: 60,
      windowDurationMinutes: 60,
    };
    rateLimitStore.set(userId, state);
    return;
  }

  const windowStartTime = new Date(existing.windowStart).getTime();
  const windowEndTime = windowStartTime + WINDOW_DURATION_MS;

  // Window expired — start a new window with count of 1
  if (now.getTime() > windowEndTime) {
    const state: RateLimitState = {
      userId,
      windowStart: now.toISOString(),
      requestCount: 1,
      maxRequests: 60,
      windowDurationMinutes: 60,
    };
    rateLimitStore.set(userId, state);
    return;
  }

  // Within window — increment
  existing.requestCount += 1;
}

/**
 * Get the current rate limit state for a user. Returns null if no record exists.
 * Useful for testing and debugging.
 */
export function getRateLimitState(userId: string): RateLimitState | null {
  return rateLimitStore.get(userId) ?? null;
}

/**
 * Reset the rate limit state for a user. Removes their record entirely.
 * Useful for testing.
 */
export function resetRateLimit(userId: string): void {
  rateLimitStore.delete(userId);
}
