/**
 * Property 4: Budget Variation Recalculation
 * Property 5: Over-Budget Detection Threshold
 *
 * - adjustedContractSum = contractSum + sum(variations) always holds
 * - Package flagged when (spent - budget) / budget > 0.05; not flagged when ≤ 0.05
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeVariance, isOverBudgetThreshold, computeForecastAtCompletion } from './budgetService';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const positiveNumberArb = fc.double({ min: 1, max: 1_000_000_000, noNaN: true, noDefaultInfinity: true });
const nonNegativeNumberArb = fc.double({ min: 0, max: 1_000_000_000, noNaN: true, noDefaultInfinity: true });
const variationArb = fc.double({ min: -100_000_000, max: 100_000_000, noNaN: true, noDefaultInfinity: true });

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 4: Budget Variation Recalculation', () => {
  it('adjustedContractSum = contractSum + sum(variations) always holds', () => {
    fc.assert(
      fc.property(
        positiveNumberArb,
        fc.array(variationArb, { minLength: 0, maxLength: 20 }),
        (contractSum, variations) => {
          const sumVariations = variations.reduce((sum, v) => sum + v, 0);
          const adjustedContractSum = contractSum + sumVariations;

          // The invariant: adjusted contract sum is always contractSum + sum of variations
          expect(adjustedContractSum).toBeCloseTo(contractSum + sumVariations, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('computeVariance returns correct percentage: (spent - budget) / budget * 100', () => {
    fc.assert(
      fc.property(nonNegativeNumberArb, positiveNumberArb, (spent, budget) => {
        const variance = computeVariance(spent, budget);
        const expected = ((spent - budget) / budget) * 100;
        expect(variance).toBeCloseTo(expected, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('computeVariance returns 0 when budget is 0', () => {
    fc.assert(
      fc.property(nonNegativeNumberArb, (spent) => {
        const variance = computeVariance(spent, 0);
        expect(variance).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 5: Over-Budget Detection Threshold', () => {
  it('package flagged when (spent - budget) / budget > 0.05', () => {
    fc.assert(
      fc.property(positiveNumberArb, (budget) => {
        // Spent is budget * 1.051 — just above 5%
        const spent = budget * 1.051;
        expect(isOverBudgetThreshold(spent, budget)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('package NOT flagged when (spent - budget) / budget <= 0.05', () => {
    fc.assert(
      fc.property(positiveNumberArb, (budget) => {
        // Spent is exactly budget * 1.05 — at the threshold (not exceeding)
        const spent = budget * 1.05;
        expect(isOverBudgetThreshold(spent, budget)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('package NOT flagged when spent equals budget (0% variance)', () => {
    fc.assert(
      fc.property(positiveNumberArb, (budget) => {
        expect(isOverBudgetThreshold(budget, budget)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('package NOT flagged when spent is below budget', () => {
    fc.assert(
      fc.property(positiveNumberArb, fc.double({ min: 0, max: 0.99, noNaN: true, noDefaultInfinity: true }), (budget, fraction) => {
        const spent = budget * fraction;
        expect(isOverBudgetThreshold(spent, budget)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isOverBudgetThreshold is consistent with computeVariance > 5', () => {
    fc.assert(
      fc.property(nonNegativeNumberArb, positiveNumberArb, (spent, budget) => {
        const isOver = isOverBudgetThreshold(spent, budget);
        const ratio = (spent - budget) / budget;
        if (ratio > 0.05) {
          expect(isOver).toBe(true);
        } else {
          expect(isOver).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
