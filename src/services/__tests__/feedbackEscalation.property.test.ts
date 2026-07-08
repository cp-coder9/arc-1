/**
 * Property-based tests — High-severity Action Centre escalation.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 18: High-severity Action Centre escalation
 *   Validates: Requirements 7.3, 7.8
 *   For any feedback cluster with a computed severity score S, an Action Centre
 *   inbox item for all `platform_admin` users must be created if and only if S ≥ 8.
 *   Additionally, any cluster with status `received` and last modified more than
 *   7 calendar days ago must trigger a "pending review" inbox item.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  shouldEscalateHighSeverity,
  shouldTriggerPendingReview,
} from '@/services/feedbackEscalation';

// ══════════════════════════════════════════════════════════════════════════════
// Property 18: High-severity Action Centre escalation
// Validates: Requirements 7.3, 7.8
// ══════════════════════════════════════════════════════════════════════════════

/** Valid feedback statuses per the spec. */
const ALL_STATUSES = ['received', 'reviewing', 'planned', 'shipped', 'declined'] as const;

/** Generate a valid ISO-8601 UTC date string offset from `now` by the given number of days. */
function dateStringDaysAgo(now: Date, daysAgo: number): string {
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

describe('Feature: intelligent-feedback-loop, Property 18: High-severity Action Centre escalation', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Sub-property 1: High-severity escalation iff severity ≥ 8
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * **Validates: Requirements 7.3**
   *
   * For any severity score in [1, 10], shouldEscalateHighSeverity returns true
   * if and only if the severity score is ≥ 8.
   */
  it('escalates if and only if severity score is ≥ 8 (integer scores 1–10)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (severityScore) => {
          const result = shouldEscalateHighSeverity(severityScore);
          const expected = severityScore >= 8;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT escalate for severity scores below 8 (boundary: 7 vs 8)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        (severityScore) => {
          expect(shouldEscalateHighSeverity(severityScore)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('DOES escalate for severity scores ≥ 8', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 10 }),
        (severityScore) => {
          expect(shouldEscalateHighSeverity(severityScore)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles edge case boundary: severity 7 does not escalate, severity 8 does', () => {
    expect(shouldEscalateHighSeverity(7)).toBe(false);
    expect(shouldEscalateHighSeverity(8)).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Sub-property 2: Pending review iff status is 'received' AND updated >7 days ago
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * **Validates: Requirements 7.8**
   *
   * For any cluster with status 'received' and updatedAt more than 7 days ago,
   * shouldTriggerPendingReview returns true.
   */
  it('triggers pending review when status is "received" and updated ≥7 days ago', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 7, max: 365, noNaN: true }),
        (daysAgo) => {
          const now = new Date('2025-06-15T12:00:00Z');
          const updatedAt = dateStringDaysAgo(now, daysAgo);
          const result = shouldTriggerPendingReview('received', updatedAt, now);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT trigger pending review when status is "received" but updated <7 days ago', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 6.99, noNaN: true }),
        (daysAgo) => {
          const now = new Date('2025-06-15T12:00:00Z');
          const updatedAt = dateStringDaysAgo(now, daysAgo);
          const result = shouldTriggerPendingReview('received', updatedAt, now);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Sub-property 3: Pending review never triggers for non-received statuses
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * **Validates: Requirements 7.8**
   *
   * For any cluster with a status other than 'received', shouldTriggerPendingReview
   * returns false regardless of how old the updatedAt timestamp is.
   */
  it('never triggers pending review for non-received statuses regardless of age', () => {
    const nonReceivedStatuses = ['reviewing', 'planned', 'shipped', 'declined'] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...nonReceivedStatuses),
        fc.double({ min: 0, max: 365, noNaN: true }),
        (status, daysAgo) => {
          const now = new Date('2025-06-15T12:00:00Z');
          const updatedAt = dateStringDaysAgo(now, daysAgo);
          const result = shouldTriggerPendingReview(status, updatedAt, now);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('correctly classifies all status + age combinations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATUSES),
        fc.double({ min: 0, max: 365, noNaN: true }),
        (status, daysAgo) => {
          const now = new Date('2025-06-15T12:00:00Z');
          const updatedAt = dateStringDaysAgo(now, daysAgo);
          const result = shouldTriggerPendingReview(status, updatedAt, now);
          const expected = status === 'received' && daysAgo >= 7;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('handles the 7-day boundary: 6.999 days does not trigger, 7.0 days does (status=received)', () => {
    const now = new Date('2025-06-15T12:00:00Z');

    // Just under 7 days — should NOT trigger
    const justUnder = dateStringDaysAgo(now, 6.999);
    expect(shouldTriggerPendingReview('received', justUnder, now)).toBe(false);

    // Exactly 7 days — should trigger
    const exactly7 = dateStringDaysAgo(now, 7);
    expect(shouldTriggerPendingReview('received', exactly7, now)).toBe(true);

    // Over 7 days — should trigger
    const over7 = dateStringDaysAgo(now, 7.001);
    expect(shouldTriggerPendingReview('received', over7, now)).toBe(true);
  });
});
