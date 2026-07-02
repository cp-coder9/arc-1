// Feature: contract-administration, Properties 11 & 12
//
// Property 11: Working Day Calculation Correctness — Validates: Requirements 12.1, 12.3, 12.4, 3.2
// Property 12: Calendar Day Calculation — Validates: Requirements 12.1, 12.3, 12.4, 3.2
//
// For any start date, period in working days, and holiday calendar:
// - addWorkingDays result never falls on Saturday, Sunday, or holiday
// - countWorkingDaysBetween(start, result) === period for all period values
// - Calendar-day deadlines equal start + period calendar days, adjusted to next working day if non-working
import fc from 'fast-check';
import {
  addWorkingDays,
  countWorkingDaysBetween,
  getSouthAfricanHolidays,
  getNextWorkingDay,
  isWorkingDay,
} from '../workingDayCalculator';
import type { PublicHoliday } from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a random date between 2020-01-01 and 2029-12-31 as an ISO string */
const dateArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 2020, max: 2029 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }), // Use 28 to avoid invalid dates
  )
  .map(([y, m, d]) => {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });

/** Generate working day counts from 1 to 250 (kept reasonable so results stay within 2030) */
const workingDayCountArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 250 });

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Build a comprehensive holiday list for years 2019–2032 (wide enough to cover addWorkingDays internal generation) */
function getAllHolidays(): PublicHoliday[] {
  const holidays: PublicHoliday[] = [];
  for (let year = 2019; year <= 2032; year++) {
    holidays.push(...getSouthAfricanHolidays(year));
  }
  return holidays;
}

/** Parse ISO date string to Date object */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format Date to ISO string */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add N calendar days to an ISO date string */
function addCalendarDays(isoDate: string, days: number): string {
  const d = parseDate(isoDate);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// Pre-compute holidays once for all tests
const ALL_HOLIDAYS = getAllHolidays();
const HOLIDAY_DATE_SET = new Set(ALL_HOLIDAYS.map((h) => h.date));

// ══════════════════════════════════════════════════════════════════════════════
// Property 11: Working Day Calculation Correctness
// **Validates: Requirements 12.1, 12.3, 12.4, 3.2**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 11: Working Day Calculation Correctness', () => {
  it('addWorkingDays result never falls on a Saturday, Sunday, or holiday', () => {
    fc.assert(
      fc.property(dateArb, workingDayCountArb, (startDate, period) => {
        const result = addWorkingDays(startDate, period, ALL_HOLIDAYS);
        const resultDate = parseDate(result);
        const dayOfWeek = resultDate.getDay();

        // Result must not be Saturday (6) or Sunday (0)
        expect(dayOfWeek).not.toBe(0);
        expect(dayOfWeek).not.toBe(6);

        // Result must not be a holiday
        expect(HOLIDAY_DATE_SET.has(result)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('countWorkingDaysBetween(start, addWorkingDays(start, N)) === N for all N', () => {
    fc.assert(
      fc.property(dateArb, workingDayCountArb, (startDate, period) => {
        const resultDate = addWorkingDays(startDate, period, ALL_HOLIDAYS);
        const counted = countWorkingDaysBetween(startDate, resultDate, ALL_HOLIDAYS);

        // The count of working days between start and result must equal exactly the period
        expect(counted).toBe(period);
      }),
      { numRuns: 200 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 12: Calendar Day Calculation
// **Validates: Requirements 12.1, 12.3, 12.4, 3.2**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 12: Calendar Day Calculation', () => {
  /** Generate calendar day periods (1–365) */
  const calendarDayCountArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 365 });

  it('calendar-day deadline equals start + period days, adjusted to next working day only if landing on non-working day', () => {
    fc.assert(
      fc.property(dateArb, calendarDayCountArb, (startDate, period) => {
        // For calendar-day deadlines: add exactly `period` calendar days
        const rawDeadline = addCalendarDays(startDate, period);

        // If it lands on a non-working day, advance to the next working day
        const expectedDeadline = getNextWorkingDay(rawDeadline, ALL_HOLIDAYS);

        // Verify: if raw deadline is a working day, it should stay unchanged
        if (isWorkingDay(rawDeadline, ALL_HOLIDAYS)) {
          expect(expectedDeadline).toBe(rawDeadline);
        } else {
          // If non-working day, the result should be strictly after the raw deadline
          const rawDate = parseDate(rawDeadline);
          const adjustedDate = parseDate(expectedDeadline);
          expect(adjustedDate.getTime()).toBeGreaterThan(rawDate.getTime());
        }

        // The adjusted deadline must always be a working day
        expect(isWorkingDay(expectedDeadline, ALL_HOLIDAYS)).toBe(true);

        // The adjusted deadline must never be before the raw deadline
        const rawDate = parseDate(rawDeadline);
        const adjustedDate = parseDate(expectedDeadline);
        expect(adjustedDate.getTime()).toBeGreaterThanOrEqual(rawDate.getTime());
      }),
      { numRuns: 200 },
    );
  });
});
