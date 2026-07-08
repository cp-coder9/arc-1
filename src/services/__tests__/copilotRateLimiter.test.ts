/**
 * Unit tests for copilotRateLimiter
 *
 * Validates:
 * - Sliding window rate limiting (60 requests per 60-minute window)
 * - Per-user request tracking with window start timestamps
 * - retryAfterMinutes calculation when limit exceeded
 * - Window reset after expiry
 *
 * Requirements: 12.5, 12.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  recordRequest,
  getRateLimitState,
  resetRateLimit,
} from '@/services/copilotRateLimiter';

describe('copilotRateLimiter', () => {
  const userId = 'user-test-123';

  beforeEach(() => {
    resetRateLimit(userId);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('should allow first request from a new user', () => {
      const result = checkRateLimit(userId);
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMinutes).toBeUndefined();
      expect(result.state.userId).toBe(userId);
      expect(result.state.requestCount).toBe(0);
    });

    it('should allow requests under the limit', () => {
      // Record 59 requests
      for (let i = 0; i < 59; i++) {
        recordRequest(userId);
      }

      const result = checkRateLimit(userId);
      expect(result.allowed).toBe(true);
      expect(result.state.requestCount).toBe(59);
    });

    it('should deny requests when limit is reached (60 requests)', () => {
      for (let i = 0; i < 60; i++) {
        recordRequest(userId);
      }

      const result = checkRateLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMinutes).toBeDefined();
      expect(result.retryAfterMinutes).toBeGreaterThan(0);
      expect(result.retryAfterMinutes).toBeLessThanOrEqual(60);
    });

    it('should return retryAfterMinutes reflecting time until window resets', () => {
      const now = new Date('2024-01-01T12:00:00.000Z');
      vi.setSystemTime(now);

      for (let i = 0; i < 60; i++) {
        recordRequest(userId);
      }

      // Advance 30 minutes into the window
      vi.setSystemTime(new Date('2024-01-01T12:30:00.000Z'));

      const result = checkRateLimit(userId);
      expect(result.allowed).toBe(false);
      // Window started at 12:00, expires at 13:00, so 30 minutes remaining
      expect(result.retryAfterMinutes).toBe(30);
    });

    it('should reset window after 60 minutes have passed', () => {
      const now = new Date('2024-01-01T12:00:00.000Z');
      vi.setSystemTime(now);

      for (let i = 0; i < 60; i++) {
        recordRequest(userId);
      }

      // Advance past 60-minute window
      vi.setSystemTime(new Date('2024-01-01T13:00:01.000Z'));

      const result = checkRateLimit(userId);
      expect(result.allowed).toBe(true);
      expect(result.state.requestCount).toBe(0);
    });

    it('should track separate windows per user', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // Fill user1's limit
      for (let i = 0; i < 60; i++) {
        recordRequest(user1);
      }

      // user2 should still be allowed
      const result1 = checkRateLimit(user1);
      const result2 = checkRateLimit(user2);

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(true);

      // Clean up
      resetRateLimit(user1);
      resetRateLimit(user2);
    });
  });

  describe('recordRequest', () => {
    it('should increment request count', () => {
      recordRequest(userId);
      const state = getRateLimitState(userId);
      expect(state?.requestCount).toBe(1);

      recordRequest(userId);
      const state2 = getRateLimitState(userId);
      expect(state2?.requestCount).toBe(2);
    });

    it('should create a new window if none exists', () => {
      recordRequest(userId);
      const state = getRateLimitState(userId);
      expect(state).not.toBeNull();
      expect(state?.requestCount).toBe(1);
      expect(state?.windowStart).toBeDefined();
    });

    it('should start a new window after the previous has expired', () => {
      const now = new Date('2024-01-01T12:00:00.000Z');
      vi.setSystemTime(now);

      recordRequest(userId);
      const originalWindowStart = getRateLimitState(userId)?.windowStart;

      // Advance past window
      vi.setSystemTime(new Date('2024-01-01T13:01:00.000Z'));

      recordRequest(userId);
      const state = getRateLimitState(userId);
      expect(state?.requestCount).toBe(1);
      expect(state?.windowStart).not.toBe(originalWindowStart);
    });
  });

  describe('getRateLimitState', () => {
    it('should return null for unknown user', () => {
      const state = getRateLimitState('nonexistent-user');
      expect(state).toBeNull();
    });

    it('should return current state after interactions', () => {
      checkRateLimit(userId);
      recordRequest(userId);
      const state = getRateLimitState(userId);
      expect(state).not.toBeNull();
      expect(state?.userId).toBe(userId);
      expect(state?.maxRequests).toBe(60);
      expect(state?.windowDurationMinutes).toBe(60);
    });
  });

  describe('resetRateLimit', () => {
    it('should remove user state', () => {
      recordRequest(userId);
      expect(getRateLimitState(userId)).not.toBeNull();

      resetRateLimit(userId);
      expect(getRateLimitState(userId)).toBeNull();
    });

    it('should allow requests again after reset', () => {
      for (let i = 0; i < 60; i++) {
        recordRequest(userId);
      }
      expect(checkRateLimit(userId).allowed).toBe(false);

      resetRateLimit(userId);
      expect(checkRateLimit(userId).allowed).toBe(true);
    });
  });
});
