/**
 * Property 6: Retention Calculation
 *
 * - retentionAmount = grossValue * retentionPercent / 100
 * - netCertified + retention = grossValue always holds
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateRetention } from './valuationService';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const grossValueArb = fc.double({ min: 0, max: 1_000_000_000, noNaN: true, noDefaultInfinity: true });
const retentionPercentArb = fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true });

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 6: Retention Calculation', () => {
  it('retentionAmount = grossValue * retentionPercent / 100', () => {
    fc.assert(
      fc.property(grossValueArb, retentionPercentArb, (grossValue, retentionPercent) => {
        const { retentionAmount } = calculateRetention(grossValue, retentionPercent);
        const expected = grossValue * retentionPercent / 100;
        expect(retentionAmount).toBeCloseTo(expected, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('netCertified + retention = grossValue invariant always holds', () => {
    fc.assert(
      fc.property(grossValueArb, retentionPercentArb, (grossValue, retentionPercent) => {
        const { retentionAmount, netCertifiedAmount } = calculateRetention(grossValue, retentionPercent);
        expect(netCertifiedAmount + retentionAmount).toBeCloseTo(grossValue, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('netCertifiedAmount = grossValue - retentionAmount', () => {
    fc.assert(
      fc.property(grossValueArb, retentionPercentArb, (grossValue, retentionPercent) => {
        const { retentionAmount, netCertifiedAmount } = calculateRetention(grossValue, retentionPercent);
        expect(netCertifiedAmount).toBeCloseTo(grossValue - retentionAmount, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('retention is 0 when retentionPercent is 0', () => {
    fc.assert(
      fc.property(grossValueArb, (grossValue) => {
        const { retentionAmount, netCertifiedAmount } = calculateRetention(grossValue, 0);
        expect(retentionAmount).toBe(0);
        expect(netCertifiedAmount).toBeCloseTo(grossValue, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('netCertified is 0 when retentionPercent is 100', () => {
    fc.assert(
      fc.property(grossValueArb, (grossValue) => {
        const { retentionAmount, netCertifiedAmount } = calculateRetention(grossValue, 100);
        expect(retentionAmount).toBeCloseTo(grossValue, 5);
        expect(netCertifiedAmount).toBeCloseTo(0, 5);
      }),
      { numRuns: 100 },
    );
  });
});
