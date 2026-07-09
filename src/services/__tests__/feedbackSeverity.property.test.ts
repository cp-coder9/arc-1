/**
 * Property-based tests — Severity score bounds.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 6: Severity score bounds
 *   Validates: Requirements 3.6
 *   For any feedback cluster with any combination of occurrence count (≥1),
 *   sentiment distribution (positive/neutral/negative/frustrated ≥0, summing
 *   to occurrenceCount), and distinct user count (≥1 and ≤ occurrenceCount),
 *   the computed severity score must be an integer between 1 and 10 inclusive.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeSeverityScore } from '@/services/feedbackSeverity';
import type { SentimentBreakdown } from '@/services/feedbackTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Property 6: Severity score bounds
// Validates: Requirements 3.6
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a valid SentimentBreakdown that sums to the given occurrenceCount.
 * Each bucket is ≥0 and all four sum to occurrenceCount.
 */
function sentimentBreakdownArb(occurrenceCount: number): fc.Arbitrary<SentimentBreakdown> {
  // Generate 3 split points to divide occurrenceCount into 4 non-negative buckets
  return fc
    .tuple(
      fc.integer({ min: 0, max: occurrenceCount }),
      fc.integer({ min: 0, max: occurrenceCount }),
      fc.integer({ min: 0, max: occurrenceCount })
    )
    .map(([a, b, c]) => {
      // Use sorted split points to create 4 non-negative partitions
      const sorted = [a, b, c].sort((x, y) => x - y);
      const positive = sorted[0];
      const neutral = sorted[1] - sorted[0];
      const negative = sorted[2] - sorted[1];
      const frustrated = occurrenceCount - sorted[2];
      return { positive, neutral, negative, frustrated };
    });
}

describe('Feature: intelligent-feedback-loop, Property 6: Severity score bounds', () => {
  /**
   * **Validates: Requirements 3.6**
   *
   * For any cluster with valid occurrence count, sentiment breakdown, and
   * distinct user count, the severity score must be an integer between 1 and 10.
   */

  it('severity score is always an integer between 1 and 10 for any valid cluster inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }).chain((occurrenceCount) =>
          fc.tuple(
            fc.constant(occurrenceCount),
            sentimentBreakdownArb(occurrenceCount),
            fc.integer({ min: 1, max: occurrenceCount })
          )
        ),
        ([occurrenceCount, sentimentBreakdown, distinctUserCount]) => {
          const score = computeSeverityScore(occurrenceCount, sentimentBreakdown, distinctUserCount);

          // Must be an integer
          expect(Number.isInteger(score)).toBe(true);
          // Must be between 1 and 10 inclusive
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('severity score is an integer 1–10 with extreme occurrence counts (1 to 10000)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(1),
          fc.constant(2),
          fc.constant(10),
          fc.constant(100),
          fc.constant(1000),
          fc.constant(10000)
        ),
        (occurrenceCount) => {
          // All-negative sentiment
          const sentimentBreakdown: SentimentBreakdown = {
            positive: 0,
            neutral: 0,
            negative: occurrenceCount,
            frustrated: 0,
          };
          const distinctUserCount = occurrenceCount;
          const score = computeSeverityScore(occurrenceCount, sentimentBreakdown, distinctUserCount);

          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity score is an integer 1–10 when sentiment is entirely positive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (occurrenceCount, distinctUserCount) => {
          fc.pre(distinctUserCount <= occurrenceCount);
          const sentimentBreakdown: SentimentBreakdown = {
            positive: occurrenceCount,
            neutral: 0,
            negative: 0,
            frustrated: 0,
          };
          const score = computeSeverityScore(occurrenceCount, sentimentBreakdown, distinctUserCount);

          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity score is an integer 1–10 when all sentiment is frustrated', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (occurrenceCount, distinctUserCount) => {
          fc.pre(distinctUserCount <= occurrenceCount);
          const sentimentBreakdown: SentimentBreakdown = {
            positive: 0,
            neutral: 0,
            negative: 0,
            frustrated: occurrenceCount,
          };
          const score = computeSeverityScore(occurrenceCount, sentimentBreakdown, distinctUserCount);

          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity score is an integer 1–10 with minimum inputs (occurrenceCount=1, distinctUserCount=1)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('positive', 'neutral', 'negative', 'frustrated') as fc.Arbitrary<
          keyof SentimentBreakdown
        >,
        (sentimentKey) => {
          const sentimentBreakdown: SentimentBreakdown = {
            positive: 0,
            neutral: 0,
            negative: 0,
            frustrated: 0,
          };
          sentimentBreakdown[sentimentKey] = 1;
          const score = computeSeverityScore(1, sentimentBreakdown, 1);

          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('severity score is an integer 1–10 with independent arbitrary sentiment (not summing to occurrenceCount)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.record({
          positive: fc.integer({ min: 0, max: 5000 }),
          neutral: fc.integer({ min: 0, max: 5000 }),
          negative: fc.integer({ min: 0, max: 5000 }),
          frustrated: fc.integer({ min: 0, max: 5000 }),
        }),
        fc.integer({ min: 1, max: 10000 }),
        (occurrenceCount, sentimentBreakdown, distinctUserCount) => {
          // Ensure at least one sentiment > 0 so total > 0
          fc.pre(
            sentimentBreakdown.positive +
              sentimentBreakdown.neutral +
              sentimentBreakdown.negative +
              sentimentBreakdown.frustrated >
              0
          );
          const score = computeSeverityScore(occurrenceCount, sentimentBreakdown, distinctUserCount);

          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('severity score is an integer 1–10 when all sentiment counts are zero (total=0 edge case)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (occurrenceCount, distinctUserCount) => {
          const sentimentBreakdown: SentimentBreakdown = {
            positive: 0,
            neutral: 0,
            negative: 0,
            frustrated: 0,
          };
          const score = computeSeverityScore(occurrenceCount, sentimentBreakdown, distinctUserCount);

          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });
});
