// @vitest-environment node
// Feature: p1-platform-extensions, Property 23: Retry Queue Exponential Backoff
//
// For any failed integration write after K attempts (K ≤ 3), the next retry delay shall equal
// baseDelay × 2^(K-1) milliseconds (capped at maxDelay). After 3 failed attempts, no further
// retries shall be scheduled and a failed-sync alert shall be created.
//
// **Validates: Requirements 4.8, 10.8, 23.6**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateBackoffDelay, createRetryQueueService } from '../services/retryQueue';
import type { RetryQueueConfig, OnFailedSyncAlert, FailedSyncAlert } from '../services/retryQueue';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate attempt numbers 1–3 (valid retry attempts) */
const attemptArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 3 });

/** Generate valid retry queue configs with reasonable ranges */
const configArb: fc.Arbitrary<RetryQueueConfig> = fc
  .tuple(
    fc.integer({ min: 100, max: 10000 }),   // baseDelayMs
    fc.integer({ min: 10000, max: 120000 }), // maxDelayMs
  )
  .map(([baseDelayMs, maxDelayMs]) => ({
    maxRetries: 3,
    baseDelayMs,
    maxDelayMs: Math.max(maxDelayMs, baseDelayMs), // ensure max >= base
    backoffMultiplier: 2,
  }));

/** Generate a pair of consecutive attempt numbers for monotonic testing */
const consecutiveAttemptsArb: fc.Arbitrary<[number, number]> = fc
  .integer({ min: 1, max: 2 })
  .map((k) => [k, k + 1] as [number, number]);

/** Arbitrary attempt numbers beyond valid range (for max-cap testing) */
const anyAttemptArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 20 });

// ══════════════════════════════════════════════════════════════════════════════
// Property 23.1: Backoff Formula
// **Validates: Requirements 4.8, 10.8, 23.6**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 23: Retry Queue Exponential Backoff', () => {
  describe('23.1 Backoff formula correctness', () => {
    it('calculateBackoffDelay(K, config) === min(baseDelayMs * 2^(K-1), maxDelayMs) for K in 1..3', () => {
      fc.assert(
        fc.property(attemptArb, configArb, (attempt, config) => {
          const result = calculateBackoffDelay(attempt, config);
          const expected = Math.min(
            config.baseDelayMs * Math.pow(2, attempt - 1),
            config.maxDelayMs,
          );

          expect(result).toBe(expected);
        }),
        { numRuns: 200 },
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Property 23.2: Monotonic Increase
  // **Validates: Requirements 4.8, 10.8, 23.6**
  // ══════════════════════════════════════════════════════════════════════════════

  describe('23.2 Monotonic increase', () => {
    it('delay for attempt K+1 >= delay for attempt K (within max cap)', () => {
      fc.assert(
        fc.property(consecutiveAttemptsArb, configArb, ([k, kNext], config) => {
          const delayK = calculateBackoffDelay(k, config);
          const delayKNext = calculateBackoffDelay(kNext, config);

          expect(delayKNext).toBeGreaterThanOrEqual(delayK);
        }),
        { numRuns: 200 },
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Property 23.3: Max Cap
  // **Validates: Requirements 4.8, 10.8, 23.6**
  // ══════════════════════════════════════════════════════════════════════════════

  describe('23.3 Max cap enforcement', () => {
    it('delay never exceeds maxDelayMs for any attempt number', () => {
      fc.assert(
        fc.property(anyAttemptArb, configArb, (attempt, config) => {
          const delay = calculateBackoffDelay(attempt, config);

          expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
        }),
        { numRuns: 200 },
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Property 23.4: Exhaustion Alert
  // **Validates: Requirements 4.8, 10.8, 23.6**
  // ══════════════════════════════════════════════════════════════════════════════

  describe('23.4 Exhaustion alert after 3 failures', () => {
    it('after exactly 3 failed processQueue cycles, onFailedSyncAlert is called exactly once', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            targetModule: fc.constantFrom(
              'project_passport' as const,
              'action_centre' as const,
              'audit_trail' as const,
              'risk_engine' as const,
              'documents' as const,
            ),
            sourceModule: fc.string({ minLength: 1, maxLength: 20 }),
            sourceEvent: fc.string({ minLength: 1, maxLength: 20 }),
            payload: fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.string(), { maxKeys: 3 }),
          }),
          async (operationData) => {
            const alerts: FailedSyncAlert[] = [];
            const onFailedSyncAlert: OnFailedSyncAlert = (alert) => {
              alerts.push(alert);
            };

            // Fixed clock that always allows processing
            let clockCounter = 0;
            const now = () => new Date(2025, 0, 1, 0, 0, clockCounter++).toISOString();

            const service = createRetryQueueService({
              config: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2 },
              onFailedSyncAlert,
              executor: () => Promise.resolve(false), // Always fails
              now,
            });

            // Enqueue the operation
            await service.enqueue({
              targetModule: operationData.targetModule,
              sourceModule: operationData.sourceModule,
              sourceEvent: operationData.sourceEvent,
              payload: operationData.payload,
            });

            // Process 3 times — all fail
            await service.processQueue();
            await service.processQueue();
            await service.processQueue();

            // After exactly 3 failures, alert should fire exactly once
            expect(alerts).toHaveLength(1);
            expect(alerts[0].targetModule).toBe(operationData.targetModule);
            expect(alerts[0].sourceModule).toBe(operationData.sourceModule);
            expect(alerts[0].sourceEvent).toBe(operationData.sourceEvent);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Property 23.5: No Retry After Exhaustion
  // **Validates: Requirements 4.8, 10.8, 23.6**
  // ══════════════════════════════════════════════════════════════════════════════

  describe('23.5 No retry after exhaustion', () => {
    it('after 3 failures, processQueue returns { success: false, retryQueued: false, failedSyncAlertId: string }', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            targetModule: fc.constantFrom(
              'project_passport' as const,
              'action_centre' as const,
              'audit_trail' as const,
              'risk_engine' as const,
              'documents' as const,
            ),
            sourceModule: fc.string({ minLength: 1, maxLength: 20 }),
            sourceEvent: fc.string({ minLength: 1, maxLength: 20 }),
            payload: fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.string(), { maxKeys: 3 }),
          }),
          async (operationData) => {
            let alertId: string | undefined;
            const onFailedSyncAlert: OnFailedSyncAlert = (alert) => {
              alertId = alert.id;
            };

            let clockCounter = 0;
            const now = () => new Date(2025, 0, 1, 0, 0, clockCounter++).toISOString();

            const service = createRetryQueueService({
              config: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2 },
              onFailedSyncAlert,
              executor: () => Promise.resolve(false), // Always fails
              now,
            });

            await service.enqueue({
              targetModule: operationData.targetModule,
              sourceModule: operationData.sourceModule,
              sourceEvent: operationData.sourceEvent,
              payload: operationData.payload,
            });

            // Process until exhaustion
            await service.processQueue(); // attempt 1
            await service.processQueue(); // attempt 2
            const results = await service.processQueue(); // attempt 3 — exhaustion

            // The final result must indicate no retry queued and include alert id
            const exhaustionResult = results[0];
            expect(exhaustionResult.success).toBe(false);
            expect(exhaustionResult.retryQueued).toBe(false);
            expect(exhaustionResult.failedSyncAlertId).toBeDefined();
            expect(exhaustionResult.failedSyncAlertId).toBe(alertId);
            expect(typeof exhaustionResult.failedSyncAlertId).toBe('string');
            expect(exhaustionResult.failedSyncAlertId!.length).toBeGreaterThan(0);

            // No further retries: processQueue should return empty results
            const afterExhaustion = await service.processQueue();
            expect(afterExhaustion).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
