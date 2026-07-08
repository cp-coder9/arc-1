// @vitest-environment node
/**
 * Property-based tests — ITP Threshold Evaluation.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 14: Lab result threshold evaluation
 *   Validates: Requirements 6.2, 6.3
 *   For any lab result with value V against a testing schedule with threshold T
 *   and direction D: if D = 'gte' then pass iff V ≥ T; if D = 'lte' then pass
 *   iff V ≤ T. Pass marks the test as 'passed'; fail marks as 'failed' and
 *   triggers NCR creation.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateThreshold } from '@/services/itpService';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for result values in the valid range (0–999999999.99). */
const arbResultValue = fc.double({ min: 0, max: 999_999_999.99, noNaN: true });

/** Arbitrary for threshold values in the valid range (0–999999999.99). */
const arbThreshold = fc.double({ min: 0, max: 999_999_999.99, noNaN: true });

/** Arbitrary for threshold direction. */
const arbDirection = fc.constantFrom<'gte' | 'lte'>('gte', 'lte');

// ══════════════════════════════════════════════════════════════════════════════
// Property 14: Lab result threshold evaluation
// Validates: Requirements 6.2, 6.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 14: Lab result threshold evaluation', () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For 'gte' direction: pass when V >= T (meets or exceeds minimum threshold).
   */
  it('gte direction: returns "pass" when resultValue >= threshold', async () => {
    await fc.assert(
      fc.asyncProperty(arbThreshold, async (T) => {
        // Generate V >= T
        const V = fc.sample(fc.double({ min: T, max: 999_999_999.99, noNaN: true }), 1)[0];
        const result = evaluateThreshold(V, T, 'gte');
        expect(result).toBe('pass');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.3**
   *
   * For 'gte' direction: fail when V < T (falls below minimum threshold).
   */
  it('gte direction: returns "fail" when resultValue < threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.01, max: 999_999_999.99, noNaN: true }),
        async (T) => {
          // Generate V < T (strictly less)
          const V = fc.sample(fc.double({ min: 0, max: T - Number.EPSILON, noNaN: true }), 1)[0];
          // Only test if V is actually < T (avoid floating point edge at boundary)
          if (V < T) {
            const result = evaluateThreshold(V, T, 'gte');
            expect(result).toBe('fail');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2**
   *
   * For 'lte' direction: pass when V <= T (meets or falls below maximum threshold).
   */
  it('lte direction: returns "pass" when resultValue <= threshold', async () => {
    await fc.assert(
      fc.asyncProperty(arbThreshold, async (T) => {
        // Generate V <= T
        const V = fc.sample(fc.double({ min: 0, max: T, noNaN: true }), 1)[0];
        const result = evaluateThreshold(V, T, 'lte');
        expect(result).toBe('pass');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.3**
   *
   * For 'lte' direction: fail when V > T (exceeds maximum threshold).
   */
  it('lte direction: returns "fail" when resultValue > threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0, max: 999_999_999.98, noNaN: true }),
        async (T) => {
          // Generate V > T (strictly greater)
          const V = fc.sample(fc.double({ min: T + Number.EPSILON, max: 999_999_999.99, noNaN: true }), 1)[0];
          // Only test if V is actually > T (avoid floating point edge at boundary)
          if (V > T) {
            const result = evaluateThreshold(V, T, 'lte');
            expect(result).toBe('fail');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2**
   *
   * Edge case: V exactly equals T should always pass regardless of direction.
   */
  it('V exactly equals T: always returns "pass" for both directions', async () => {
    await fc.assert(
      fc.asyncProperty(arbResultValue, arbDirection, async (V, D) => {
        const result = evaluateThreshold(V, V, D);
        expect(result).toBe('pass');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * Comprehensive property: evaluateThreshold deterministically returns 'pass'
   * or 'fail' based on the comparison — never returns anything else.
   */
  it('always returns exactly "pass" or "fail"', async () => {
    await fc.assert(
      fc.asyncProperty(arbResultValue, arbThreshold, arbDirection, async (V, T, D) => {
        const result = evaluateThreshold(V, T, D);
        expect(['pass', 'fail']).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * The gte and lte evaluations are complementary for non-equal values:
   * If V != T, then evaluateThreshold(V, T, 'gte') !== evaluateThreshold(V, T, 'lte')
   */
  it('gte and lte are complementary for V != T', async () => {
    await fc.assert(
      fc.asyncProperty(arbResultValue, arbThreshold, async (V, T) => {
        if (V !== T) {
          const gteResult = evaluateThreshold(V, T, 'gte');
          const lteResult = evaluateThreshold(V, T, 'lte');
          expect(gteResult).not.toBe(lteResult);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * For gte direction: the function correctly implements V >= T semantics.
   * Direct property: result === 'pass' iff V >= T.
   */
  it('gte direction: result is "pass" iff V >= T', async () => {
    await fc.assert(
      fc.asyncProperty(arbResultValue, arbThreshold, async (V, T) => {
        const result = evaluateThreshold(V, T, 'gte');
        if (V >= T) {
          expect(result).toBe('pass');
        } else {
          expect(result).toBe('fail');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * For lte direction: the function correctly implements V <= T semantics.
   * Direct property: result === 'pass' iff V <= T.
   */
  it('lte direction: result is "pass" iff V <= T', async () => {
    await fc.assert(
      fc.asyncProperty(arbResultValue, arbThreshold, async (V, T) => {
        const result = evaluateThreshold(V, T, 'lte');
        if (V <= T) {
          expect(result).toBe('pass');
        } else {
          expect(result).toBe('fail');
        }
      }),
      { numRuns: 100 },
    );
  });
});
