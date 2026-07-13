/**
 * Bug Condition Exploration — PR #156 Hermes Blockers
 *
 * These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bugs exist (floating-point boundary error & date generator RangeError).
 *
 * Validates: Requirements 1.4, 1.5, 2.4, 2.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { isOverBudgetThreshold } from '@/services/commandCentre/budgetService';

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1 — Budget Boundary (specific counterexample)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug Condition: Budget Floating-Point Boundary', () => {
  /**
   * The mathematical ratio (103062.50000000006 - 98154.76) / 98154.76 ≈ 0.05
   * Due to IEEE 754 imprecision, the actual computed value is 0.05000000000000007
   * which exceeds the strict > 0.05 check, causing a false positive.
   *
   * This test asserts the CORRECT behavior (returns false) — it will FAIL on
   * unfixed code because the buggy implementation returns true.
   *
   * Validates: Requirements 1.4, 2.4
   */
  it('should return false for values at the mathematical 5% boundary (IEEE 754 edge case)', () => {
    const spent = 103062.50000000006;
    const budget = 98154.76;

    // Mathematical ratio: (103062.50000000006 - 98154.76) / 98154.76
    // ≈ 0.05 (exactly at threshold, NOT over)
    const result = isOverBudgetThreshold(spent, budget);

    expect(result).toBe(false);
  });

  /**
   * Property-based test: generate (spent, budget) pairs where the mathematical
   * ratio (spent - budget) / budget is within epsilon of 0.05 from below.
   * These boundary values should NOT be flagged as over-budget.
   *
   * Validates: Requirements 1.4, 2.4
   */
  it('should return false for all boundary values within epsilon of 0.05 from below (PBT)', () => {
    fc.assert(
      fc.property(
        // Generate a budget value and a ratio just at or barely below 0.05
        fc.double({ min: 1000, max: 10_000_000, noNaN: true }),
        fc.double({ min: 0.0499999999, max: 0.05, noNaN: true }),
        (budget, ratio) => {
          const spent = budget * (1 + ratio);

          // The mathematical ratio is <= 0.05, so it should NOT be over-budget
          const mathematicalRatio = (spent - budget) / budget;

          // Only assert when the mathematical intent is <= 0.05
          if (mathematicalRatio <= 0.05 + 1e-15) {
            expect(isOverBudgetThreshold(spent, budget)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3 — Date Generator RangeError
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug Condition: Date Generator RangeError', () => {
  /**
   * The isoDateArb generator in property tests uses fc.date() and converts
   * to ISO string via .toISOString().split('T')[0]. When these strings are
   * subsequently reparsed with new Date(str), edge-case dates can throw
   * RangeError: Invalid time value.
   *
   * This test generates 1000 dates using the SAME pattern as the existing
   * isoDateArb (but WITHOUT the safe range constraint) and verifies they
   * all parse successfully.
   *
   * Validates: Requirements 1.5, 2.5
   */
  it('should generate 1000 dates from fc.date() that all parse without RangeError', () => {
    // Use the same pattern as the existing isoDateArb but without min/max constraints
    // to expose the RangeError bug with edge-case dates
    const unboundedDateArb = fc.date().map((d) => d.toISOString().split('T')[0]);

    fc.assert(
      fc.property(unboundedDateArb, (dateStr) => {
        // This should NOT throw RangeError
        const parsed = new Date(dateStr);
        const isValid = !isNaN(parsed.getTime());

        expect(isValid).toBe(true);
        expect(parsed.toString()).not.toBe('Invalid Date');
      }),
      { numRuns: 1000 },
    );
  });
});
