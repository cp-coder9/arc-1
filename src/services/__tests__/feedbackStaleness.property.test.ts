/**
 * Property-based tests — Cluster staleness rule.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 8: Cluster staleness rule
 *   Validates: Requirements 3.10
 *   For any feedback cluster, the cluster should be marked `open: true` if and
 *   only if its `lastSubmissionAt` timestamp is within the preceding 30 days of
 *   the current evaluation time. Otherwise it must be marked `open: false`.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ─── Pure function under test ───────────────────────────────────────────────────

/**
 * Determines if a cluster should be considered open based on its last submission timestamp.
 * A cluster is open iff it received a submission within the last 30 days.
 */
function isClusterOpen(lastSubmissionAt: string, now: Date): boolean {
  const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
  const lastSubmission = new Date(lastSubmissionAt).getTime();
  const elapsed = now.getTime() - lastSubmission;
  return elapsed <= STALE_THRESHOLD_MS;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ══════════════════════════════════════════════════════════════════════════════
// Property 8: Cluster staleness rule
// Validates: Requirements 3.10
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 8: Cluster staleness rule', () => {
  /**
   * **Validates: Requirements 3.10**
   *
   * For any cluster, it should be `open: true` if and only if its
   * `lastSubmissionAt` timestamp is within 30 days of the current evaluation time.
   */

  it('returns open: true for any lastSubmissionAt within 30 days of now', () => {
    fc.assert(
      fc.property(
        // Generate a "now" date (any reasonable date)
        fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts)),
        // Generate an offset from 0 to 30 days (in ms) — within threshold
        fc.integer({ min: 0, max: THIRTY_DAYS_MS }),
        (now, offsetMs) => {
          const lastSubmissionAt = new Date(now.getTime() - offsetMs).toISOString();
          const result = isClusterOpen(lastSubmissionAt, now);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns open: false for any lastSubmissionAt more than 30 days ago', () => {
    fc.assert(
      fc.property(
        // Generate a "now" date
        fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts)),
        // Generate an offset strictly greater than 30 days (30 days + 1ms to 90 days)
        fc.integer({ min: THIRTY_DAYS_MS + 1, max: 90 * 24 * 60 * 60 * 1000 }),
        (now, offsetMs) => {
          const lastSubmissionAt = new Date(now.getTime() - offsetMs).toISOString();
          const result = isClusterOpen(lastSubmissionAt, now);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('open is true iff lastSubmissionAt is within 30 days — biconditional', () => {
    fc.assert(
      fc.property(
        // Generate a "now" date
        fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts)),
        // Generate an offset from 0 to 90 days in ms
        fc.integer({ min: 0, max: 90 * 24 * 60 * 60 * 1000 }),
        (now, offsetMs) => {
          const lastSubmissionAt = new Date(now.getTime() - offsetMs).toISOString();
          const result = isClusterOpen(lastSubmissionAt, now);
          const expectedOpen = offsetMs <= THIRTY_DAYS_MS;
          expect(result).toBe(expectedOpen);
        },
      ),
      { numRuns: 200 },
    );
  });

  // ── Boundary edge cases ──────────────────────────────────────────────────

  it('exactly 30 days is still open (boundary inclusive)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts)),
        (now) => {
          const exactlyThirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
          const result = isClusterOpen(exactlyThirtyDaysAgo, now);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('30 days + 1ms is stale (boundary exclusive)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts)),
        (now) => {
          const justPastThreshold = new Date(now.getTime() - THIRTY_DAYS_MS - 1).toISOString();
          const result = isClusterOpen(justPastThreshold, now);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
