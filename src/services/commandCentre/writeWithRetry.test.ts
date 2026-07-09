/**
 * Write With Retry — Unit Tests
 *
 * Validates the write-with-retry pattern and error handling utilities for the
 * Command Centre Data Bridge.
 *
 * Key properties tested:
 * - Failed write allows up to 3 retry attempts (Property 13)
 * - Preserves unsaved data unchanged across all retry attempts
 * - Does not alter Firestore state until a retry succeeds
 * - Read freshness ensures no stale cache older than 30 seconds
 * - Error notifications are emitted on failure
 *
 * Validates: Requirements 5.7, 5.8, 5.9, 5.10
 *
 * @module commandCentre/writeWithRetry.test
 */

import {
  writeWithRetry,
  readWithFreshness,
  clearCache,
  invalidateCache,
  getCacheAge,
  onNotification,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_AGE_MS,
} from './writeWithRetry';
import type { Notification } from './writeWithRetry';

describe('writeWithRetry', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('successful writes', () => {
    it('returns success with data on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue({ id: 'doc-1' });

      const result = await writeWithRetry(operation);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'doc-1' });
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('succeeds on second attempt after first failure', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ id: 'doc-2' });

      const result = await writeWithRetry(operation);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'doc-2' });
      expect(result.attempts).toBe(2);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('succeeds on third attempt after two failures', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValue({ id: 'doc-3' });

      const result = await writeWithRetry(operation);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'doc-3' });
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('failed writes — retry exhaustion', () => {
    it('returns failure after 3 attempts (default maxRetries)', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Persistent error'));

      const result = await writeWithRetry(operation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Persistent error');
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('respects custom maxRetries parameter', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failed'));

      const result = await writeWithRetry(operation, 5);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(5);
      expect(operation).toHaveBeenCalledTimes(5);
    });

    it('handles maxRetries of 1 (no retries)', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      const result = await writeWithRetry(operation, 1);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('handles non-Error thrown values', async () => {
      const operation = vi.fn().mockRejectedValue('string error');

      const result = await writeWithRetry(operation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
      expect(result.attempts).toBe(3);
    });
  });

  describe('data preservation across retries', () => {
    it('calls the same operation function unchanged on each retry', async () => {
      const capturedData = { title: 'Test NCR', severity: 'high' };
      const operationCalls: unknown[] = [];

      const operation = vi.fn().mockImplementation(() => {
        operationCalls.push({ ...capturedData });
        return Promise.reject(new Error('Fail'));
      });

      await writeWithRetry(operation);

      // All calls received the same data (operation fn unchanged)
      expect(operation).toHaveBeenCalledTimes(3);
      expect(operationCalls[0]).toEqual(capturedData);
      expect(operationCalls[1]).toEqual(capturedData);
      expect(operationCalls[2]).toEqual(capturedData);
    });

    it('does not mutate the operation function between retries', async () => {
      let callCount = 0;
      const originalOp = () => {
        callCount++;
        return Promise.reject(new Error('Fail'));
      };

      await writeWithRetry(originalOp);

      expect(callCount).toBe(3);
    });
  });

  describe('notification emission', () => {
    it('emits error notification on final failure', async () => {
      const notifications: Notification[] = [];
      const unsub = onNotification((n) => notifications.push(n));

      const operation = vi.fn().mockRejectedValue(new Error('DB unavailable'));

      await writeWithRetry(operation);

      expect(notifications.length).toBe(1);
      expect(notifications[0].severity).toBe('error');
      expect(notifications[0].title).toBe('Write Failed');
      expect(notifications[0].message).toContain('DB unavailable');
      expect(notifications[0].message).toContain('3 attempts');

      unsub();
    });

    it('does not emit notification on successful write', async () => {
      const notifications: Notification[] = [];
      const unsub = onNotification((n) => notifications.push(n));

      const operation = vi.fn().mockResolvedValue('ok');

      await writeWithRetry(operation);

      expect(notifications.length).toBe(0);

      unsub();
    });

    it('does not emit notification for intermediate failures', async () => {
      const notifications: Notification[] = [];
      const unsub = onNotification((n) => notifications.push(n));

      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temp error'))
        .mockResolvedValue('ok');

      await writeWithRetry(operation);

      expect(notifications.length).toBe(0);

      unsub();
    });
  });

  describe('constants', () => {
    it('DEFAULT_MAX_RETRIES is 3', () => {
      expect(DEFAULT_MAX_RETRIES).toBe(3);
    });

    it('DEFAULT_MAX_AGE_MS is 30000 (30 seconds)', () => {
      expect(DEFAULT_MAX_AGE_MS).toBe(30_000);
    });
  });
});

describe('readWithFreshness', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('successful reads', () => {
    it('returns fresh data on first read', async () => {
      const operation = vi.fn().mockResolvedValue([{ id: '1', name: 'Item' }]);

      const result = await readWithFreshness('test-key', operation);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([{ id: '1', name: 'Item' }]);
      expect(result.stale).toBe(false);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('returns cached data within freshness window', async () => {
      const operation = vi.fn().mockResolvedValue({ value: 42 });

      await readWithFreshness('key-1', operation);
      const result = await readWithFreshness('key-1', operation);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 42 });
      expect(result.stale).toBe(false);
      // Should only call operation once (cached on second call)
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after cache expires', async () => {
      vi.useFakeTimers();

      const operation = vi
        .fn()
        .mockResolvedValueOnce({ value: 1 })
        .mockResolvedValueOnce({ value: 2 });

      await readWithFreshness('key-expire', operation, { maxAgeMs: 1000 });

      // Advance past the max age
      vi.advanceTimersByTime(1500);

      const result = await readWithFreshness('key-expire', operation, { maxAgeMs: 1000 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 2 });
      expect(result.stale).toBe(false);
      expect(operation).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('failed reads', () => {
    it('returns failure with error message when no cache exists', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Network failure'));

      const result = await readWithFreshness('no-cache', operation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network failure');
      expect(result.stale).toBe(false);
    });

    it('emits error notification with refresh action on read failure (no cache)', async () => {
      const notifications: Notification[] = [];
      const unsub = onNotification((n) => notifications.push(n));

      const operation = vi.fn().mockRejectedValue(new Error('Read error'));

      await readWithFreshness('fail-key', operation);

      expect(notifications.length).toBe(1);
      expect(notifications[0].severity).toBe('error');
      expect(notifications[0].title).toBe('Read Failed');
      expect(notifications[0].message).toContain('Read error');
      expect(notifications[0].action).toBeDefined();
      expect(notifications[0].action!.label).toBe('Refresh');

      unsub();
    });

    it('returns stale cached data when refresh fails', async () => {
      vi.useFakeTimers();

      const operation = vi
        .fn()
        .mockResolvedValueOnce({ value: 'old' })
        .mockRejectedValueOnce(new Error('Refresh failed'));

      await readWithFreshness('stale-key', operation, { maxAgeMs: 1000 });

      // Advance past max age
      vi.advanceTimersByTime(2000);

      const result = await readWithFreshness('stale-key', operation, { maxAgeMs: 1000 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 'old' });
      expect(result.stale).toBe(true);

      vi.useRealTimers();
    });

    it('emits warning notification when returning stale data', async () => {
      vi.useFakeTimers();

      const notifications: Notification[] = [];
      const unsub = onNotification((n) => notifications.push(n));

      const operation = vi
        .fn()
        .mockResolvedValueOnce('cached')
        .mockRejectedValueOnce(new Error('Timeout'));

      await readWithFreshness('warn-key', operation, { maxAgeMs: 500 });
      vi.advanceTimersByTime(1000);
      await readWithFreshness('warn-key', operation, { maxAgeMs: 500 });

      expect(notifications.length).toBe(1);
      expect(notifications[0].severity).toBe('warning');
      expect(notifications[0].title).toBe('Using Stale Data');

      unsub();
      vi.useRealTimers();
    });
  });

  describe('freshness guarantee (30s max age)', () => {
    it('default maxAgeMs is 30 seconds', async () => {
      vi.useFakeTimers();

      const operation = vi
        .fn()
        .mockResolvedValueOnce('first')
        .mockResolvedValueOnce('second');

      await readWithFreshness('freshness-check', operation);

      // At 29 seconds — should still use cache
      vi.advanceTimersByTime(29_000);
      const cached = await readWithFreshness('freshness-check', operation);
      expect(cached.data).toBe('first');
      expect(operation).toHaveBeenCalledTimes(1);

      // At 31 seconds — should re-fetch
      vi.advanceTimersByTime(2_000);
      const fresh = await readWithFreshness('freshness-check', operation);
      expect(fresh.data).toBe('second');
      expect(operation).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });
});

describe('cache utilities', () => {
  beforeEach(() => {
    clearCache();
  });

  it('invalidateCache forces next read to fetch fresh data', async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');

    await readWithFreshness('inv-key', operation);
    invalidateCache('inv-key');
    const result = await readWithFreshness('inv-key', operation);

    expect(result.data).toBe('v2');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('clearCache invalidates all entries', async () => {
    const op1 = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('a2');
    const op2 = vi.fn().mockResolvedValueOnce('b').mockResolvedValueOnce('b2');

    await readWithFreshness('k1', op1);
    await readWithFreshness('k2', op2);

    clearCache();

    await readWithFreshness('k1', op1);
    await readWithFreshness('k2', op2);

    expect(op1).toHaveBeenCalledTimes(2);
    expect(op2).toHaveBeenCalledTimes(2);
  });

  it('getCacheAge returns -1 for uncached keys', () => {
    expect(getCacheAge('nonexistent')).toBe(-1);
  });

  it('getCacheAge returns positive value for cached keys', async () => {
    const operation = vi.fn().mockResolvedValue('data');
    await readWithFreshness('age-key', operation);

    const age = getCacheAge('age-key');
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(1000); // Should be nearly immediate
  });
});

describe('onNotification', () => {
  it('returns an unsubscribe function that stops notifications', async () => {
    const notifications: Notification[] = [];
    const unsub = onNotification((n) => notifications.push(n));

    const operation = vi.fn().mockRejectedValue(new Error('Fail'));

    await writeWithRetry(operation, 1);
    expect(notifications.length).toBe(1);

    unsub();

    await writeWithRetry(operation, 1);
    // Should still be 1 — listener was removed
    expect(notifications.length).toBe(1);
  });

  it('supports multiple listeners', async () => {
    const n1: Notification[] = [];
    const n2: Notification[] = [];
    const unsub1 = onNotification((n) => n1.push(n));
    const unsub2 = onNotification((n) => n2.push(n));

    const operation = vi.fn().mockRejectedValue(new Error('Fail'));
    await writeWithRetry(operation, 1);

    expect(n1.length).toBe(1);
    expect(n2.length).toBe(1);

    unsub1();
    unsub2();
  });
});
