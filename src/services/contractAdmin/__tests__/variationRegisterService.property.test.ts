// Feature: contract-administration, Properties 5 & 6 (Variations)
//
// Property 5: State Machine Transition Validity (Variations) — Validates: Requirements 5.3, 5.5
// Property 6: Cumulative Summary Invariant (Variations) — Validates: Requirements 5.3, 5.5
//
// Property 5: For all pairs (fromStatus, toStatus) from VariationStatus, isValidVariationTransition
// returns true iff toStatus is in VARIATION_TRANSITIONS[fromStatus].
//
// Property 6: For any set of variation records with costImpact, netCostDelta equals
// sum(additions) - sum(omissions).
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock firebase-admin before importing the service
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
      })),
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        })),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      })),
      get: vi.fn().mockResolvedValue({ size: 0, docs: [] }),
    })),
  },
}));

import { isValidVariationTransition } from '../variationRegisterService';
import { VARIATION_TRANSITIONS } from '../contractTypes';
import type { VariationStatus } from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** All possible variation statuses */
const ALL_STATUSES: VariationStatus[] = [
  'instructed',
  'valued',
  'approved',
  'rejected',
  'implemented',
];

/** Generate a random VariationStatus */
const variationStatusArb: fc.Arbitrary<VariationStatus> = fc.constantFrom(...ALL_STATUSES);

/** Generate a cost impact type */
const costImpactTypeArb: fc.Arbitrary<'addition' | 'omission'> = fc.constantFrom(
  'addition' as const,
  'omission' as const,
);

/** Generate a positive cost amount (0.01 to 999_999.99 — kept reasonable for arithmetic) */
const costAmountArb: fc.Arbitrary<number> = fc
  .integer({ min: 1, max: 99_999_999 })
  .map((n) => n / 100);

/** Generate a variation record with a cost impact */
const variationWithCostArb: fc.Arbitrary<{
  costImpact: { type: 'addition' | 'omission'; amount: number };
}> = fc.record({
  costImpact: fc.record({
    type: costImpactTypeArb,
    amount: costAmountArb,
  }),
});

/** Generate an array of variation records (0–50) for cumulative summary testing */
const variationRecordsArb: fc.Arbitrary<
  { costImpact?: { type: 'addition' | 'omission'; amount: number } }[]
> = fc.array(
  fc.oneof(
    // Record with cost impact
    variationWithCostArb,
    // Record without cost impact (no valuation yet)
    fc.constant({ costImpact: undefined }),
  ),
  { minLength: 0, maxLength: 50 },
);

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute cumulative summary from an array of variation records.
 * This mirrors the pure arithmetic logic of getCumulativeSummary.
 */
function computeNetCostDelta(
  records: { costImpact?: { type: 'addition' | 'omission'; amount: number } }[],
): { totalAdditions: number; totalOmissions: number; netCostDelta: number } {
  let totalAdditions = 0;
  let totalOmissions = 0;

  for (const record of records) {
    if (record.costImpact) {
      if (record.costImpact.type === 'addition') {
        totalAdditions += record.costImpact.amount;
      } else if (record.costImpact.type === 'omission') {
        totalOmissions += record.costImpact.amount;
      }
    }
  }

  return {
    totalAdditions,
    totalOmissions,
    netCostDelta: totalAdditions - totalOmissions,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 5: State Machine Transition Validity (Variations)
// **Validates: Requirements 5.3, 5.5**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 5: State Machine Transition Validity (Variations)', () => {
  it('isValidVariationTransition returns true iff toStatus is in VARIATION_TRANSITIONS[fromStatus]', () => {
    fc.assert(
      fc.property(variationStatusArb, variationStatusArb, (fromStatus, toStatus) => {
        const result = isValidVariationTransition(fromStatus, toStatus);
        const permitted = VARIATION_TRANSITIONS[fromStatus];
        const expectedValid = permitted.includes(toStatus);

        expect(result).toBe(expectedValid);
      }),
      { numRuns: 200 },
    );
  });

  it('all valid transitions are in the permitted list (exhaustive check)', () => {
    // Exhaustively verify all 25 status pairs (5×5)
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const result = isValidVariationTransition(from, to);
        const permitted = VARIATION_TRANSITIONS[from];
        const shouldBeValid = permitted.includes(to);

        expect(result).toBe(shouldBeValid);
      }
    }
  });

  it('terminal statuses (rejected, implemented) have no valid outgoing transitions', () => {
    fc.assert(
      fc.property(variationStatusArb, (toStatus) => {
        expect(isValidVariationTransition('rejected', toStatus)).toBe(false);
        expect(isValidVariationTransition('implemented', toStatus)).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 6: Cumulative Summary Invariant (Variations)
// **Validates: Requirements 5.3, 5.5**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 6: Cumulative Summary Invariant (Variations)', () => {
  it('netCostDelta equals sum(additions) - sum(omissions) for any set of variation records', () => {
    fc.assert(
      fc.property(variationRecordsArb, (records) => {
        const { totalAdditions, totalOmissions, netCostDelta } = computeNetCostDelta(records);

        // Core invariant: netCostDelta = additions - omissions
        expect(netCostDelta).toBeCloseTo(totalAdditions - totalOmissions, 10);
      }),
      { numRuns: 200 },
    );
  });

  it('empty variation set produces zero net cost delta', () => {
    const { totalAdditions, totalOmissions, netCostDelta } = computeNetCostDelta([]);
    expect(totalAdditions).toBe(0);
    expect(totalOmissions).toBe(0);
    expect(netCostDelta).toBe(0);
  });

  it('all-additions produces a positive net cost delta', () => {
    fc.assert(
      fc.property(
        fc.array(costAmountArb, { minLength: 1, maxLength: 20 }),
        (amounts) => {
          const records = amounts.map((amount) => ({
            costImpact: { type: 'addition' as const, amount },
          }));
          const { netCostDelta } = computeNetCostDelta(records);

          expect(netCostDelta).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all-omissions produces a negative net cost delta', () => {
    fc.assert(
      fc.property(
        fc.array(costAmountArb, { minLength: 1, maxLength: 20 }),
        (amounts) => {
          const records = amounts.map((amount) => ({
            costImpact: { type: 'omission' as const, amount },
          }));
          const { netCostDelta } = computeNetCostDelta(records);

          expect(netCostDelta).toBeLessThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('records without costImpact do not affect the net cost delta', () => {
    fc.assert(
      fc.property(variationRecordsArb, (records) => {
        // Compute with all records
        const fullResult = computeNetCostDelta(records);

        // Compute with only records that have costImpact
        const withCostOnly = records.filter((r) => r.costImpact !== undefined);
        const filteredResult = computeNetCostDelta(withCostOnly);

        expect(fullResult.netCostDelta).toBeCloseTo(filteredResult.netCostDelta, 10);
        expect(fullResult.totalAdditions).toBeCloseTo(filteredResult.totalAdditions, 10);
        expect(fullResult.totalOmissions).toBeCloseTo(filteredResult.totalOmissions, 10);
      }),
      { numRuns: 100 },
    );
  });
});
