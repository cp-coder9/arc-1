/**
 * Property-based tests — Cluster display ordering.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 10: Cluster display ordering
 *   Validates: Requirements 4.2
 *   For any list of feedback clusters, the displayed list must be sorted
 *   by severity score in strictly non-increasing (descending) order.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ══════════════════════════════════════════════════════════════════════════════
// Pure sort function under test
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sorts clusters by severity score in descending order.
 */
function sortClustersBySeverity(clusters: Array<{ severityScore: number }>): Array<{ severityScore: number }> {
  return [...clusters].sort((a, b) => b.severityScore - a.severityScore);
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 10: Cluster display ordering
// Validates: Requirements 4.2
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 10: Cluster display ordering', () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * For any list of feedback clusters, the displayed list must be sorted
   * by severity score in strictly non-increasing (descending) order.
   */

  const clusterArb = fc.record({
    severityScore: fc.integer({ min: 1, max: 10 }),
  });

  it('output is sorted in non-increasing (descending) severity order', () => {
    fc.assert(
      fc.property(
        fc.array(clusterArb, { minLength: 0, maxLength: 100 }),
        (clusters) => {
          const sorted = sortClustersBySeverity(clusters);
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i - 1].severityScore).toBeGreaterThanOrEqual(sorted[i].severityScore);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('output length equals input length', () => {
    fc.assert(
      fc.property(
        fc.array(clusterArb, { minLength: 0, maxLength: 100 }),
        (clusters) => {
          const sorted = sortClustersBySeverity(clusters);
          expect(sorted.length).toBe(clusters.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every element in the output exists in the input (no data loss)', () => {
    fc.assert(
      fc.property(
        fc.array(clusterArb, { minLength: 0, maxLength: 100 }),
        (clusters) => {
          const sorted = sortClustersBySeverity(clusters);

          // Build a frequency map of severity scores in input
          const inputFreq = new Map<number, number>();
          for (const c of clusters) {
            inputFreq.set(c.severityScore, (inputFreq.get(c.severityScore) ?? 0) + 1);
          }

          // Build a frequency map of severity scores in output
          const outputFreq = new Map<number, number>();
          for (const c of sorted) {
            outputFreq.set(c.severityScore, (outputFreq.get(c.severityScore) ?? 0) + 1);
          }

          // Both frequency maps must be identical
          expect(outputFreq).toEqual(inputFreq);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Additional edge case properties ──────────────────────────────────────

  it('sorting an already-sorted list produces the same list', () => {
    fc.assert(
      fc.property(
        fc.array(clusterArb, { minLength: 0, maxLength: 50 }),
        (clusters) => {
          const sorted = sortClustersBySeverity(clusters);
          const doubleSorted = sortClustersBySeverity(sorted);
          expect(doubleSorted).toEqual(sorted);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does not mutate the input array', () => {
    fc.assert(
      fc.property(
        fc.array(clusterArb, { minLength: 1, maxLength: 50 }),
        (clusters) => {
          const original = clusters.map((c) => ({ ...c }));
          sortClustersBySeverity(clusters);
          expect(clusters).toEqual(original);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('single-element list is always trivially sorted', () => {
    fc.assert(
      fc.property(clusterArb, (cluster) => {
        const sorted = sortClustersBySeverity([cluster]);
        expect(sorted).toEqual([cluster]);
      }),
      { numRuns: 100 },
    );
  });

  it('empty list returns empty list', () => {
    const sorted = sortClustersBySeverity([]);
    expect(sorted).toEqual([]);
    expect(sorted.length).toBe(0);
  });
});
