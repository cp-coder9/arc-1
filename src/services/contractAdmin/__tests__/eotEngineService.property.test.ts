// Feature: contract-administration, Property 10: EoT Date Advancement
//
// **Validates: Requirements 6.8, 6.9**
//
// For any EoT claim that is granted with period P, or partially granted with
// approved days A (where 1 ≤ A < periodClaimed), the revised practical completion
// date SHALL equal `addWorkingDays(currentCompletionDate, grantedDays, holidays)`
// where `grantedDays` is P for full grants or A for partial grants.
//
// Tests the pure date advancement logic directly (no Firestore required).
import fc from 'fast-check';
import {
  addWorkingDays,
  countWorkingDaysBetween,
  getSouthAfricanHolidays,
  isWorkingDay,
} from '../workingDayCalculator';
import type { PublicHoliday } from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a random completion date between 2024-01-01 and 2028-12-28 as an ISO string */
const completionDateArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 2024, max: 2028 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }), // Use 28 to avoid invalid month-end dates
  )
  .map(([y, m, d]) => {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });

/** Generate period claimed (1–365 working days) */
const periodClaimedArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 365 });

/** Generate a partial grant scenario: periodClaimed (2–365) and approvedDays (1 ≤ A < periodClaimed) */
const partialGrantArb: fc.Arbitrary<{ periodClaimed: number; approvedDays: number }> = fc
  .integer({ min: 2, max: 365 })
  .chain((periodClaimed) =>
    fc.integer({ min: 1, max: periodClaimed - 1 }).map((approvedDays) => ({
      periodClaimed,
      approvedDays,
    })),
  );

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Build a comprehensive holiday list for years 2023–2034 (covers all generated date ranges) */
function getAllHolidays(): PublicHoliday[] {
  const holidays: PublicHoliday[] = [];
  for (let year = 2023; year <= 2034; year++) {
    holidays.push(...getSouthAfricanHolidays(year));
  }
  return holidays;
}

/** Parse ISO date string to Date object */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Pre-compute holidays once for all tests
const ALL_HOLIDAYS = getAllHolidays();
const HOLIDAY_DATE_SET = new Set(ALL_HOLIDAYS.map((h) => h.date));

// ══════════════════════════════════════════════════════════════════════════════
// Property 10: EoT Date Advancement
// **Validates: Requirements 6.8, 6.9**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 10: EoT Date Advancement', () => {
  describe('Full grant — advances completion date by full period via addWorkingDays', () => {
    it('addWorkingDays(completionDate, periodClaimed, holidays) produces a date exactly periodClaimed working days ahead', () => {
      fc.assert(
        fc.property(completionDateArb, periodClaimedArb, (completionDate, periodClaimed) => {
          const revisedDate = addWorkingDays(completionDate, periodClaimed, ALL_HOLIDAYS);

          // The revised date must be exactly periodClaimed working days from the completion date
          const countedDays = countWorkingDaysBetween(completionDate, revisedDate, ALL_HOLIDAYS);
          expect(countedDays).toBe(periodClaimed);
        }),
        { numRuns: 200 },
      );
    });

    it('revised date never falls on a weekend or holiday', () => {
      fc.assert(
        fc.property(completionDateArb, periodClaimedArb, (completionDate, periodClaimed) => {
          const revisedDate = addWorkingDays(completionDate, periodClaimed, ALL_HOLIDAYS);
          const resultDate = parseDate(revisedDate);
          const dayOfWeek = resultDate.getDay();

          // Must not be Saturday (6) or Sunday (0)
          expect(dayOfWeek).not.toBe(0);
          expect(dayOfWeek).not.toBe(6);

          // Must not be a holiday
          expect(HOLIDAY_DATE_SET.has(revisedDate)).toBe(false);

          // Confirm via isWorkingDay
          expect(isWorkingDay(revisedDate, ALL_HOLIDAYS)).toBe(true);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Partial grant — advances completion date by approved days (1 ≤ A < periodClaimed)', () => {
    it('addWorkingDays(completionDate, approvedDays, holidays) produces a date exactly approvedDays working days ahead', () => {
      fc.assert(
        fc.property(completionDateArb, partialGrantArb, (completionDate, { approvedDays }) => {
          const revisedDate = addWorkingDays(completionDate, approvedDays, ALL_HOLIDAYS);

          // The revised date must be exactly approvedDays working days from the completion date
          const countedDays = countWorkingDaysBetween(completionDate, revisedDate, ALL_HOLIDAYS);
          expect(countedDays).toBe(approvedDays);
        }),
        { numRuns: 200 },
      );
    });

    it('revised date never falls on a weekend or holiday', () => {
      fc.assert(
        fc.property(completionDateArb, partialGrantArb, (completionDate, { approvedDays }) => {
          const revisedDate = addWorkingDays(completionDate, approvedDays, ALL_HOLIDAYS);
          const resultDate = parseDate(revisedDate);
          const dayOfWeek = resultDate.getDay();

          // Must not be Saturday (6) or Sunday (0)
          expect(dayOfWeek).not.toBe(0);
          expect(dayOfWeek).not.toBe(6);

          // Must not be a holiday
          expect(HOLIDAY_DATE_SET.has(revisedDate)).toBe(false);

          // Confirm via isWorkingDay
          expect(isWorkingDay(revisedDate, ALL_HOLIDAYS)).toBe(true);
        }),
        { numRuns: 200 },
      );
    });

    it('partial grant advances by fewer days than full period would', () => {
      fc.assert(
        fc.property(
          completionDateArb,
          partialGrantArb,
          (completionDate, { periodClaimed, approvedDays }) => {
            const partialRevisedDate = addWorkingDays(completionDate, approvedDays, ALL_HOLIDAYS);
            const fullRevisedDate = addWorkingDays(completionDate, periodClaimed, ALL_HOLIDAYS);

            // Partial grant date must be strictly before the full grant date
            const partialDate = parseDate(partialRevisedDate);
            const fullDate = parseDate(fullRevisedDate);
            expect(partialDate.getTime()).toBeLessThan(fullDate.getTime());
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Round-trip: countWorkingDaysBetween(completionDate, revisedDate) === grantedDays', () => {
    it('full grant round-trip: count equals periodClaimed', () => {
      fc.assert(
        fc.property(completionDateArb, periodClaimedArb, (completionDate, periodClaimed) => {
          const revisedDate = addWorkingDays(completionDate, periodClaimed, ALL_HOLIDAYS);
          const counted = countWorkingDaysBetween(completionDate, revisedDate, ALL_HOLIDAYS);
          expect(counted).toBe(periodClaimed);
        }),
        { numRuns: 200 },
      );
    });

    it('partial grant round-trip: count equals approvedDays', () => {
      fc.assert(
        fc.property(
          completionDateArb,
          partialGrantArb,
          (completionDate, { approvedDays }) => {
            const revisedDate = addWorkingDays(completionDate, approvedDays, ALL_HOLIDAYS);
            const counted = countWorkingDaysBetween(completionDate, revisedDate, ALL_HOLIDAYS);
            expect(counted).toBe(approvedDays);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
