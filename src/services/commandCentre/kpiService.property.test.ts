/**
 * Property 13: KPI Formula Computation
 * Property 14: KPI Trend Derivation
 *
 * - Schedule/cost variance formulas are deterministic
 * - Trend: improving/deteriorating/stable classification is deterministic
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeScheduleVariance,
  computeCostVariance,
  deriveTrend,
} from './kpiService';
import type { CommandCentreMilestone } from './types';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const isoDateArb = fc.integer({ min: 0, max: 2190 }).map(offset => { const d = new Date('2024-01-01'); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0]; });
const timestampArb = fc.integer({ min: 0, max: 2190 }).map(offset => { const d = new Date('2024-01-01'); d.setDate(d.getDate() + offset); return d.toISOString(); });
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);
const statusArb = fc.constantFrom<CommandCentreMilestone['status']>('complete', 'on_track', 'at_risk', 'overdue', 'pending');

const milestoneArb: fc.Arbitrary<CommandCentreMilestone> = fc.record({
  id: fc.uuid(),
  projectId: fc.constant('proj-1'),
  name: nonEmptyStringArb,
  plannedDate: isoDateArb,
  actualDate: fc.option(isoDateArb, { nil: undefined }),
  status: statusArb,
  linkedCertificateId: fc.option(fc.uuid(), { nil: undefined }),
  linkedActivityId: fc.option(fc.uuid(), { nil: undefined }),
  category: fc.option(fc.constantFrom<'general' | 'nhbrc_inspection' | 'municipal_submission'>('general', 'nhbrc_inspection', 'municipal_submission'), { nil: undefined }),
  nhbrcStage: fc.option(fc.integer({ min: 1, max: 7 }), { nil: undefined }),
  documentationChecklist: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  updatedAt: timestampArb,
});

const numberArb = fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true, noDefaultInfinity: true });
const positiveNumberArb = fc.double({ min: 1, max: 1_000_000_000, noNaN: true, noDefaultInfinity: true });

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 13: KPI Formula Computation', () => {
  it('computeScheduleVariance is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(fc.array(milestoneArb, { minLength: 0, maxLength: 20 }), (milestones) => {
        const result1 = computeScheduleVariance(milestones);
        const result2 = computeScheduleVariance(milestones);
        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 },
    );
  });

  it('schedule variance formula: (completedOnTime - delayed) / totalWithDates * 100', () => {
    fc.assert(
      fc.property(fc.array(milestoneArb, { minLength: 1, maxLength: 20 }), (milestones) => {
        const result = computeScheduleVariance(milestones);

        if (result.totalWithDates === 0) {
          expect(result.variancePercent).toBe(0);
        } else {
          const expected = (result.completedOnTime - result.delayed) / result.totalWithDates * 100;
          expect(result.variancePercent).toBeCloseTo(expected, 5);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('computeCostVariance is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(numberArb, positiveNumberArb, (forecast, contractSum) => {
        const result1 = computeCostVariance(forecast, contractSum);
        const result2 = computeCostVariance(forecast, contractSum);
        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 },
    );
  });

  it('cost variance formula: (forecast - contractSum) / contractSum * 100', () => {
    fc.assert(
      fc.property(numberArb, positiveNumberArb, (forecast, contractSum) => {
        const result = computeCostVariance(forecast, contractSum);
        const expected = ((forecast - contractSum) / contractSum) * 100;
        expect(result.variancePercent).toBeCloseTo(expected, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('cost variance returns 0 when contractSum is 0', () => {
    fc.assert(
      fc.property(numberArb, (forecast) => {
        const result = computeCostVariance(forecast, 0);
        expect(result.variancePercent).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('empty milestones produce zero schedule variance', () => {
    const result = computeScheduleVariance([]);
    expect(result.variancePercent).toBe(0);
    expect(result.completedOnTime).toBe(0);
    expect(result.delayed).toBe(0);
    expect(result.totalWithDates).toBe(0);
  });
});

describe('Property 14: KPI Trend Derivation', () => {
  it('deriveTrend is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(numberArb, numberArb, fc.boolean(), (current, previous, higherIsBetter) => {
        const result1 = deriveTrend(current, previous, higherIsBetter);
        const result2 = deriveTrend(current, previous, higherIsBetter);
        expect(result1).toBe(result2);
      }),
      { numRuns: 100 },
    );
  });

  it('trend is "stable" when values are within tolerance', () => {
    fc.assert(
      fc.property(
        numberArb,
        fc.double({ min: -0.5, max: 0.5, noNaN: true, noDefaultInfinity: true }),
        fc.boolean(),
        (baseValue, delta, higherIsBetter) => {
          const result = deriveTrend(baseValue + delta, baseValue, higherIsBetter, 0.5);
          expect(result).toBe('stable');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('trend is "improving" when higher-is-better and current > previous (beyond tolerance)', () => {
    fc.assert(
      fc.property(
        numberArb,
        fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (baseValue, increase) => {
          const result = deriveTrend(baseValue + increase, baseValue, true, 0.5);
          expect(result).toBe('improving');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('trend is "deteriorating" when higher-is-better and current < previous (beyond tolerance)', () => {
    fc.assert(
      fc.property(
        numberArb,
        fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (baseValue, decrease) => {
          const result = deriveTrend(baseValue - decrease, baseValue, true, 0.5);
          expect(result).toBe('deteriorating');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('trend is "improving" when lower-is-better and current < previous (beyond tolerance)', () => {
    fc.assert(
      fc.property(
        numberArb,
        fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (baseValue, decrease) => {
          const result = deriveTrend(baseValue - decrease, baseValue, false, 0.5);
          expect(result).toBe('improving');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('trend is always one of improving/stable/deteriorating', () => {
    fc.assert(
      fc.property(numberArb, numberArb, fc.boolean(), (current, previous, higherIsBetter) => {
        const result = deriveTrend(current, previous, higherIsBetter);
        expect(['improving', 'stable', 'deteriorating']).toContain(result);
      }),
      { numRuns: 100 },
    );
  });
});
