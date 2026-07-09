// @vitest-environment node
/**
 * Property-based tests — Clustering threshold logic.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 4: Clustering threshold logic
 *   Validates: Requirements 3.2, 3.3
 *   For any new submission and any set of existing open clusters with computed
 *   similarity scores, the submission should be merged into the cluster with the
 *   highest similarity score if that score exceeds 0.75 (incrementing occurrence
 *   count by 1), OR a new cluster should be created with occurrence count 1 if
 *   all scores are ≤0.75.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ══════════════════════════════════════════════════════════════════════════════
// Pure decision logic to test
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determines whether a new submission should be merged into an existing cluster
 * or whether a new cluster should be created, based on similarity scores.
 *
 * - If any score exceeds 0.75, merge into the cluster with the highest score.
 * - If all scores are ≤0.75, create a new cluster.
 */
function determineMergeTarget(
  scores: Array<{ clusterId: string; score: number }>,
): { action: 'merge'; clusterId: string } | { action: 'create' } {
  const threshold = 0.75;
  const aboveThreshold = scores.filter((s) => s.score > threshold);
  if (aboveThreshold.length === 0) return { action: 'create' };
  const highest = aboveThreshold.reduce((a, b) => (a.score >= b.score ? a : b));
  return { action: 'merge', clusterId: highest.clusterId };
}

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a unique cluster ID. */
const clusterIdArb = fc.uuid();

/** Generate a similarity score in [0, 1]. */
const scoreArb = fc.double({ min: 0, max: 1, noNaN: true });

/** Generate a score entry with a cluster ID and score. */
const scoreEntryArb = fc.record({
  clusterId: clusterIdArb,
  score: scoreArb,
});

/** Generate a list of score entries (simulating existing open clusters). */
const scoresListArb = fc.array(scoreEntryArb, { minLength: 1, maxLength: 20 });

// ══════════════════════════════════════════════════════════════════════════════
// Property 4: Clustering threshold logic
// Validates: Requirements 3.2, 3.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 4: Clustering threshold logic', () => {
  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * For any set of similarity scores where at least one exceeds 0.75,
   * the decision must be to merge into the cluster with the highest score.
   */
  it('merges into the cluster with the highest similarity score when any score exceeds 0.75', () => {
    fc.assert(
      fc.property(
        scoresListArb,
        (scores) => {
          const aboveThreshold = scores.filter((s) => s.score > 0.75);
          fc.pre(aboveThreshold.length > 0);

          const result = determineMergeTarget(scores);

          // Must choose merge
          expect(result.action).toBe('merge');

          if (result.action === 'merge') {
            // Must pick the cluster with the highest score among those above threshold
            const highest = aboveThreshold.reduce((a, b) => (a.score >= b.score ? a : b));
            expect(result.clusterId).toBe(highest.clusterId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * For any set of similarity scores where ALL are ≤0.75,
   * the decision must be to create a new cluster.
   */
  it('creates a new cluster when all similarity scores are ≤0.75', () => {
    // Generate scores constrained to [0, 0.75]
    const lowScoreEntryArb = fc.record({
      clusterId: clusterIdArb,
      score: fc.double({ min: 0, max: 0.75, noNaN: true }),
    });
    const lowScoresListArb = fc.array(lowScoreEntryArb, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(lowScoresListArb, (scores) => {
        const result = determineMergeTarget(scores);
        expect(result.action).toBe('create');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * When there are no existing clusters (empty scores array),
   * the decision must be to create a new cluster.
   */
  it('creates a new cluster when there are no existing clusters', () => {
    const result = determineMergeTarget([]);
    expect(result.action).toBe('create');
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * Boundary test: scores at exactly 0.75 should NOT trigger a merge.
   * The threshold is strictly greater than 0.75.
   */
  it('does NOT merge when scores are exactly 0.75 (boundary)', () => {
    fc.assert(
      fc.property(
        fc.array(clusterIdArb, { minLength: 1, maxLength: 10 }),
        (clusterIds) => {
          // All scores exactly at 0.75
          const scores = clusterIds.map((id) => ({ clusterId: id, score: 0.75 }));
          const result = determineMergeTarget(scores);
          expect(result.action).toBe('create');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * When multiple clusters exceed 0.75, the one with the highest score wins.
   * Generate at least two clusters above threshold with distinct scores.
   */
  it('selects the cluster with the highest score when multiple exceed 0.75', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            clusterId: clusterIdArb,
            score: fc.double({ min: 0.76, max: 1, noNaN: true }),
          }),
          { minLength: 2, maxLength: 10 },
        ),
        (scores) => {
          const result = determineMergeTarget(scores);

          expect(result.action).toBe('merge');

          if (result.action === 'merge') {
            const maxScore = Math.max(...scores.map((s) => s.score));
            const highestEntry = scores.find((s) => s.score === maxScore);
            expect(result.clusterId).toBe(highestEntry!.clusterId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * For any arbitrary set of scores, the result is always one of:
   * - { action: 'merge', clusterId: string } when some score > 0.75
   * - { action: 'create' } when all scores ≤ 0.75
   */
  it('always returns a valid decision for any set of scores', () => {
    fc.assert(
      fc.property(
        fc.array(scoreEntryArb, { minLength: 0, maxLength: 20 }),
        (scores) => {
          const result = determineMergeTarget(scores);

          const hasAboveThreshold = scores.some((s) => s.score > 0.75);

          if (hasAboveThreshold) {
            expect(result.action).toBe('merge');
            expect((result as { action: 'merge'; clusterId: string }).clusterId).toBeDefined();
          } else {
            expect(result.action).toBe('create');
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * Scores just above the threshold (0.75 + epsilon) should trigger a merge.
   */
  it('merges when a score is just above 0.75 threshold', () => {
    fc.assert(
      fc.property(
        clusterIdArb,
        fc.double({ min: 0.750001, max: 0.76, noNaN: true }),
        (clusterId, score) => {
          const scores = [{ clusterId, score }];
          const result = determineMergeTarget(scores);
          expect(result.action).toBe('merge');
          if (result.action === 'merge') {
            expect(result.clusterId).toBe(clusterId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
