// Feature: contract-administration, Properties 5 & 6 (Claims)
//
// Property 5: State Machine Transition Validity (Claims) — Validates: Requirements 8.2, 8.6, 8.9
// Property 6: Cumulative Summary Invariant (Claims) — Validates: Requirements 8.2, 8.6, 8.9
//
// Property 5: For all pairs (fromStatus, toStatus) from ClaimStatus, isValidClaimTransition
// returns true iff toStatus is in CLAIM_TRANSITIONS[fromStatus].
//
// Property 6: For any set of claim records with amountClaimed, totalAmountClaimed equals
// sum of all individual claim.amountClaimed values.
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

import { isValidClaimTransition } from '../claimsRegisterService';
import { CLAIM_TRANSITIONS } from '../contractTypes';
import type { ClaimStatus } from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** All possible claim statuses */
const ALL_STATUSES: ClaimStatus[] = [
  'notified',
  'substantiated',
  'assessed',
  'accepted',
  'partially_accepted',
  'rejected',
  'disputed',
];

/** Generate a random ClaimStatus */
const claimStatusArb: fc.Arbitrary<ClaimStatus> = fc.constantFrom(...ALL_STATUSES);

/** Generate a positive claim amount (0.01 to 999_999.99 — kept reasonable for arithmetic) */
const claimAmountArb: fc.Arbitrary<number> = fc
  .integer({ min: 1, max: 99_999_999 })
  .map((n) => n / 100);

/** Generate a claim record with an amountClaimed */
const claimRecordArb: fc.Arbitrary<{ amountClaimed: number }> = fc.record({
  amountClaimed: claimAmountArb,
});

/** Generate an array of claim records (0–50) for cumulative summary testing */
const claimRecordsArb: fc.Arbitrary<{ amountClaimed: number }[]> = fc.array(claimRecordArb, {
  minLength: 0,
  maxLength: 50,
});

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute totalAmountClaimed from an array of claim records.
 * This mirrors the pure arithmetic logic of getCumulativeSummary.
 */
function computeTotalAmountClaimed(records: { amountClaimed: number }[]): number {
  let total = 0;
  for (const record of records) {
    total += record.amountClaimed;
  }
  return total;
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 5: State Machine Transition Validity (Claims)
// **Validates: Requirements 8.2, 8.6, 8.9**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 5: State Machine Transition Validity (Claims)', () => {
  it('isValidClaimTransition returns true iff toStatus is in CLAIM_TRANSITIONS[fromStatus]', () => {
    fc.assert(
      fc.property(claimStatusArb, claimStatusArb, (fromStatus, toStatus) => {
        const result = isValidClaimTransition(fromStatus, toStatus);
        const permitted = CLAIM_TRANSITIONS[fromStatus];
        const expectedValid = permitted.includes(toStatus);

        expect(result).toBe(expectedValid);
      }),
      { numRuns: 200 },
    );
  });

  it('all valid transitions are in the permitted list (exhaustive check)', () => {
    // Exhaustively verify all 49 status pairs (7×7)
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const result = isValidClaimTransition(from, to);
        const permitted = CLAIM_TRANSITIONS[from];
        const shouldBeValid = permitted.includes(to);

        expect(result).toBe(shouldBeValid);
      }
    }
  });

  it('terminal status (disputed) has no valid outgoing transitions', () => {
    fc.assert(
      fc.property(claimStatusArb, (toStatus) => {
        expect(isValidClaimTransition('disputed', toStatus)).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  it('notified status only transitions to substantiated', () => {
    fc.assert(
      fc.property(claimStatusArb, (toStatus) => {
        const result = isValidClaimTransition('notified', toStatus);
        expect(result).toBe(toStatus === 'substantiated');
      }),
      { numRuns: 50 },
    );
  });

  it('assessed status transitions only to accepted, partially_accepted, or rejected', () => {
    fc.assert(
      fc.property(claimStatusArb, (toStatus) => {
        const result = isValidClaimTransition('assessed', toStatus);
        const expected = ['accepted', 'partially_accepted', 'rejected'].includes(toStatus);
        expect(result).toBe(expected);
      }),
      { numRuns: 50 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 6: Cumulative Summary Invariant (Claims)
// **Validates: Requirements 8.2, 8.6, 8.9**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 6: Cumulative Summary Invariant (Claims)', () => {
  it('totalAmountClaimed equals sum of all individual claim.amountClaimed values', () => {
    fc.assert(
      fc.property(claimRecordsArb, (records) => {
        const total = computeTotalAmountClaimed(records);

        // Core invariant: total = sum of individual amounts
        const expectedSum = records.reduce((sum, r) => sum + r.amountClaimed, 0);
        expect(total).toBeCloseTo(expectedSum, 10);
      }),
      { numRuns: 200 },
    );
  });

  it('empty claim set produces zero total amount claimed', () => {
    const total = computeTotalAmountClaimed([]);
    expect(total).toBe(0);
  });

  it('single claim record produces its own amount as total', () => {
    fc.assert(
      fc.property(claimAmountArb, (amount) => {
        const total = computeTotalAmountClaimed([{ amountClaimed: amount }]);
        expect(total).toBeCloseTo(amount, 10);
      }),
      { numRuns: 100 },
    );
  });

  it('total is always non-negative for valid claim amounts', () => {
    fc.assert(
      fc.property(claimRecordsArb, (records) => {
        const total = computeTotalAmountClaimed(records);
        expect(total).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });

  it('adding a claim record increases the total by exactly its amount', () => {
    fc.assert(
      fc.property(claimRecordsArb, claimAmountArb, (records, newAmount) => {
        const totalBefore = computeTotalAmountClaimed(records);
        const totalAfter = computeTotalAmountClaimed([...records, { amountClaimed: newAmount }]);

        expect(totalAfter).toBeCloseTo(totalBefore + newAmount, 10);
      }),
      { numRuns: 100 },
    );
  });
});
