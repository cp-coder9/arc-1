/**
 * Preservation Property Tests — Budget Clear-Cases
 *
 * These tests verify that `isOverBudgetThreshold` correctly handles
 * values that are clearly above or below the 5% threshold.
 * They run BEFORE the epsilon fix is applied to confirm baseline behavior
 * is preserved for non-boundary cases.
 *
 * **Validates: Requirements 3.2, 3.3, 3.5**
 *
 * @module commandCentre/__tests__/preservationTests
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { isOverBudgetThreshold } from '@/services/commandCentre/budgetService';

// ═══════════════════════════════════════════════════════════════════════════════
// Preservation Test 1 — Clearly Over Budget
// ═══════════════════════════════════════════════════════════════════════════════

describe('Preservation: Clearly Over Budget (ratio > 0.06)', () => {
  it('returns true for all (spent, budget) pairs where (spent - budget) / budget > 0.06', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * Generate (spent, budget) pairs where the over-budget ratio is clearly
     * above 0.06 (well above the 5% threshold). These should always return true
     * regardless of whether the epsilon fix is applied.
     */
    fc.assert(
      fc.property(
        fc.double({ min: 1000, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.061, max: 5, noNaN: true, noDefaultInfinity: true }),
        (budget, overFactor) => {
          const spent = budget * (1 + overFactor);
          // Ratio is clearly > 0.06, well above 5% threshold
          const ratio = (spent - budget) / budget;
          // Precondition: ensure ratio is genuinely > 0.06
          fc.pre(ratio > 0.06);
          expect(isOverBudgetThreshold(spent, budget)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Preservation Test 2 — Clearly Under Budget
// ═══════════════════════════════════════════════════════════════════════════════

describe('Preservation: Clearly Under Budget (ratio < 0.04)', () => {
  it('returns false for all (spent, budget) pairs where (spent - budget) / budget < 0.04', () => {
    /**
     * **Validates: Requirements 3.2, 3.5**
     *
     * Generate (spent, budget) pairs where the over-budget ratio is clearly
     * below 0.04 (well below the 5% threshold). These should always return false
     * regardless of whether the epsilon fix is applied.
     */
    fc.assert(
      fc.property(
        fc.double({ min: 1000, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 0.039, noNaN: true, noDefaultInfinity: true }),
        (budget, underFactor) => {
          const spent = budget * (1 + underFactor);
          // Ratio is clearly < 0.04, well below 5% threshold
          const ratio = (spent - budget) / budget;
          // Precondition: ensure ratio is genuinely < 0.04
          fc.pre(ratio < 0.04);
          expect(isOverBudgetThreshold(spent, budget)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
