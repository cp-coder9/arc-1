// Feature: contract-administration, Properties 13 & 14
//
// Property 13: Retention Calculation — Validates: Requirements 7.4
// For any cumulative certified amount C, retention percentage P, and retention limit L,
// retentionHeld = min(C × P / 100, L) and atLimit = true iff C × P / 100 ≥ L.
//
// Property 14: Payment Schedule Coverage — Validates: Requirements 7.1
// For any commencement date, completion date, and payment interval, the generated schedule
// has first entry within one interval of commencement, last entry on or before completion,
// and consecutive entries spaced exactly one interval apart.
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock firebase-admin before importing the service (needed because paymentSchedulerService
// imports firebase-admin for its Firestore-dependent functions, even though we only test pure functions)
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
      })),
      where: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      })),
      orderBy: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], forEach: vi.fn() }),
      })),
      get: vi.fn().mockResolvedValue({ size: 0, docs: [], forEach: vi.fn() }),
    })),
  },
}));

import { generateSchedule, calculateRetention } from '../paymentSchedulerService';
import { getSouthAfricanHolidays } from '../workingDayCalculator';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a random cumulative certified amount (0.01–100_000_000) */
const cumulativeCertifiedArb: fc.Arbitrary<number> = fc
  .integer({ min: 1, max: 10_000_000_000 })
  .map((n) => n / 100);

/** Generate a random retention percentage (0.01–100) */
const retentionPercentageArb: fc.Arbitrary<number> = fc
  .integer({ min: 1, max: 10_000 })
  .map((n) => n / 100);

/** Generate a random retention limit (1–50_000_000) */
const retentionLimitArb: fc.Arbitrary<number> = fc
  .integer({ min: 100, max: 5_000_000_000 })
  .map((n) => n / 100);

/** Generate a commencement date between 2024-01-01 and 2027-12-31 */
const commencementDateArb: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: 1460 }) // ~4 years of days
  .map((dayOffset) => {
    const base = new Date(2024, 0, 1);
    base.setDate(base.getDate() + dayOffset);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const d = String(base.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

/** Generate a duration in days between commencement and completion (30–730 days) */
const durationDaysArb: fc.Arbitrary<number> = fc.integer({ min: 30, max: 730 });

/** Generate a payment interval in days (14–90) */
const paymentIntervalArb: fc.Arbitrary<number> = fc.integer({ min: 14, max: 90 });

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Parse ISO date string to Date */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Count calendar days between two ISO dates */
function calendarDaysBetween(startIso: string, endIso: string): number {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/** Add calendar days to ISO date */
function addCalendarDays(iso: string, days: number): string {
  const date = parseDate(iso);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get holidays covering a range of years */
function getHolidaysForRange(startYear: number, endYear: number) {
  const holidays = [];
  for (let y = startYear; y <= endYear + 1; y++) {
    holidays.push(...getSouthAfricanHolidays(y));
  }
  return holidays;
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 13: Retention Calculation
// **Validates: Requirements 7.1, 7.4**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 13: Retention Calculation', () => {
  it('retentionHeld equals min(C × P / 100, L) for all valid inputs', () => {
    fc.assert(
      fc.property(
        cumulativeCertifiedArb,
        retentionPercentageArb,
        retentionLimitArb,
        (cumulativeCertified, retentionPercentage, retentionLimit) => {
          const result = calculateRetention(cumulativeCertified, retentionPercentage, retentionLimit);
          const expected = Math.min((cumulativeCertified * retentionPercentage) / 100, retentionLimit);

          expect(result.retentionHeld).toBeCloseTo(expected, 8);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('atLimit is true iff (C × P / 100) >= L', () => {
    fc.assert(
      fc.property(
        cumulativeCertifiedArb,
        retentionPercentageArb,
        retentionLimitArb,
        (cumulativeCertified, retentionPercentage, retentionLimit) => {
          const result = calculateRetention(cumulativeCertified, retentionPercentage, retentionLimit);
          const calculatedRetention = (cumulativeCertified * retentionPercentage) / 100;
          const expectedAtLimit = calculatedRetention >= retentionLimit;

          expect(result.atLimit).toBe(expectedAtLimit);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('retentionHeld is never negative', () => {
    fc.assert(
      fc.property(
        cumulativeCertifiedArb,
        retentionPercentageArb,
        retentionLimitArb,
        (cumulativeCertified, retentionPercentage, retentionLimit) => {
          const result = calculateRetention(cumulativeCertified, retentionPercentage, retentionLimit);

          expect(result.retentionHeld).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('retentionHeld never exceeds retentionLimit', () => {
    fc.assert(
      fc.property(
        cumulativeCertifiedArb,
        retentionPercentageArb,
        retentionLimitArb,
        (cumulativeCertified, retentionPercentage, retentionLimit) => {
          const result = calculateRetention(cumulativeCertified, retentionPercentage, retentionLimit);

          expect(result.retentionHeld).toBeLessThanOrEqual(retentionLimit + 0.000001); // floating point tolerance
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 14: Payment Schedule Coverage
// **Validates: Requirements 7.1, 7.4**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 14: Payment Schedule Coverage', () => {
  it('first entry valuation date is within one interval of commencement', () => {
    fc.assert(
      fc.property(
        commencementDateArb,
        durationDaysArb,
        paymentIntervalArb,
        (commencementDate, durationDays, paymentInterval) => {
          const completionDate = addCalendarDays(commencementDate, durationDays);
          const startYear = parseDate(commencementDate).getFullYear();
          const endYear = parseDate(completionDate).getFullYear();
          const holidays = getHolidaysForRange(startYear, endYear);

          const schedule = generateSchedule(
            commencementDate,
            completionDate,
            paymentInterval,
            holidays,
          );

          // Only check if schedule is non-empty (it's empty if interval > duration)
          if (schedule.length > 0) {
            const firstValuation = schedule[0].valuationDate;
            const daysSinceCommencement = calendarDaysBetween(commencementDate, firstValuation);

            // First entry should be exactly one interval from commencement
            expect(daysSinceCommencement).toBeLessThanOrEqual(paymentInterval);
            expect(daysSinceCommencement).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('last entry valuation date is on or before completion', () => {
    fc.assert(
      fc.property(
        commencementDateArb,
        durationDaysArb,
        paymentIntervalArb,
        (commencementDate, durationDays, paymentInterval) => {
          const completionDate = addCalendarDays(commencementDate, durationDays);
          const startYear = parseDate(commencementDate).getFullYear();
          const endYear = parseDate(completionDate).getFullYear();
          const holidays = getHolidaysForRange(startYear, endYear);

          const schedule = generateSchedule(
            commencementDate,
            completionDate,
            paymentInterval,
            holidays,
          );

          if (schedule.length > 0) {
            const lastValuation = schedule[schedule.length - 1].valuationDate;
            const lastDate = parseDate(lastValuation);
            const completionDateParsed = parseDate(completionDate);

            expect(lastDate.getTime()).toBeLessThanOrEqual(completionDateParsed.getTime());
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('consecutive entries are spaced exactly one interval apart (calendar days)', () => {
    fc.assert(
      fc.property(
        commencementDateArb,
        durationDaysArb,
        paymentIntervalArb,
        (commencementDate, durationDays, paymentInterval) => {
          const completionDate = addCalendarDays(commencementDate, durationDays);
          const startYear = parseDate(commencementDate).getFullYear();
          const endYear = parseDate(completionDate).getFullYear();
          const holidays = getHolidaysForRange(startYear, endYear);

          const schedule = generateSchedule(
            commencementDate,
            completionDate,
            paymentInterval,
            holidays,
          );

          // Check consecutive entries are spaced exactly paymentInterval days apart
          for (let i = 1; i < schedule.length; i++) {
            const prevValuation = schedule[i - 1].valuationDate;
            const currValuation = schedule[i].valuationDate;
            const spacing = calendarDaysBetween(prevValuation, currValuation);

            expect(spacing).toBe(paymentInterval);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('schedule is non-empty when completion > commencement + interval', () => {
    fc.assert(
      fc.property(
        commencementDateArb,
        paymentIntervalArb,
        (commencementDate, paymentInterval) => {
          // Ensure duration is strictly greater than one interval
          const durationDays = paymentInterval + 1;
          const completionDate = addCalendarDays(commencementDate, durationDays);
          const startYear = parseDate(commencementDate).getFullYear();
          const endYear = parseDate(completionDate).getFullYear();
          const holidays = getHolidaysForRange(startYear, endYear);

          const schedule = generateSchedule(
            commencementDate,
            completionDate,
            paymentInterval,
            holidays,
          );

          expect(schedule.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 300 },
    );
  });
});
