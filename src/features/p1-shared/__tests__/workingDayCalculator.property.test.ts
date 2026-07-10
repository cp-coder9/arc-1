// @vitest-environment node
/**
 * Property-Based Tests: Working Day Calculator
 *
 * Feature: p1-platform-extensions, Property 1: Working Day Calculator Correctness
 *
 * Validates: Requirements 6.1, 6.2, 6.4, 9.3, 17.6
 *
 * For any start date and positive integer N, adding N working days and then
 * counting working days back to the start should yield N. Working days must
 * exclude Saturdays, Sundays, and all SA public holidays as defined in the
 * Public Holidays Act 36 of 1994.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createWorkingDayCalculator } from '../services/workingDayCalculator';

const calculator = createWorkingDayCalculator();

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate an ISO date string within the range 2020-01-01 to 2030-12-31 */
const dateInRange = fc.date({
  min: new Date(Date.UTC(2020, 0, 1)),
  max: new Date(Date.UTC(2030, 11, 31)),
}).map((d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
});

/** Generate a positive integer N in range 1..100 */
const workingDayCount = fc.integer({ min: 1, max: 100 });

/** Generate a year in range 2020..2030 */
const yearInRange = fc.integer({ min: 2020, max: 2030 });

// ─── Mandatory SA Holiday Names ───────────────────────────────────────────────

const MANDATORY_HOLIDAY_NAMES = [
  "New Year's Day",
  'Human Rights Day',
  'Good Friday',
  'Family Day',
  'Freedom Day',
  "Workers' Day",
  'Youth Day',
  "National Women's Day",
  'Heritage Day',
  'Day of Reconciliation',
  'Christmas Day',
  'Day of Goodwill',
] as const;

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: p1-platform-extensions, Property 1: Working Day Calculator Correctness', () => {

  it('Round-trip: addWorkingDays(start, N) then countWorkingDays(start, result) equals N', () => {
    /**
     * **Validates: Requirements 6.1, 6.2**
     *
     * For any date in 2020–2030 and N in 1..100, adding N working days from start
     * and counting working days from start to the result should yield exactly N.
     */
    fc.assert(
      fc.property(dateInRange, workingDayCount, (start, n) => {
        const result = calculator.addWorkingDays(start, n);
        const counted = calculator.countWorkingDays(start, result);
        expect(counted).toBe(n);
      }),
      { numRuns: 200 }
    );
  });

  it('Non-working-day exclusion: isWorkingDay returns false for all Saturdays, Sundays, and public holidays', () => {
    /**
     * **Validates: Requirements 6.1, 6.4**
     *
     * For any date, if it falls on Saturday/Sunday or is a public holiday,
     * isWorkingDay must return false.
     */
    fc.assert(
      fc.property(dateInRange, (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00Z');
        const dayOfWeek = d.getUTCDay(); // 0=Sun, 6=Sat

        if (dayOfWeek === 0 || dayOfWeek === 6) {
          expect(calculator.isWorkingDay(dateStr)).toBe(false);
        }

        // Check if the date is a public holiday
        const year = d.getUTCFullYear();
        const holidays = calculator.getPublicHolidays(year);
        const holidayDates = holidays.map((h) => h.date);
        if (holidayDates.includes(dateStr)) {
          expect(calculator.isWorkingDay(dateStr)).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('Monotonicity: addWorkingDays(start, N+1) always returns a date later than addWorkingDays(start, N)', () => {
    /**
     * **Validates: Requirements 6.1, 6.2**
     *
     * Adding more working days must always produce a strictly later date.
     */
    fc.assert(
      fc.property(dateInRange, fc.integer({ min: 1, max: 99 }), (start, n) => {
        const dateN = calculator.addWorkingDays(start, n);
        const dateN1 = calculator.addWorkingDays(start, n + 1);
        expect(dateN1 > dateN).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('Symmetry: subtractWorkingDays(addWorkingDays(start, N), N) returns start', () => {
    /**
     * **Validates: Requirements 6.1, 6.2, 9.3**
     *
     * Adding N working days and then subtracting N working days should return
     * the original start date.
     */
    fc.assert(
      fc.property(dateInRange, workingDayCount, (start, n) => {
        const advanced = calculator.addWorkingDays(start, n);
        const backtracked = calculator.subtractWorkingDays(advanced, n);
        expect(backtracked).toBe(start);
      }),
      { numRuns: 200 }
    );
  });

  it('Public holiday correctness: all generated holidays for any year are valid dates and include the mandatory 12 holiday names', () => {
    /**
     * **Validates: Requirements 6.1, 6.4, 17.6**
     *
     * For any year in 2020–2030, getPublicHolidays must return valid ISO dates
     * and the base set of 12 mandatory SA public holiday names must all appear.
     */
    fc.assert(
      fc.property(yearInRange, (year) => {
        const holidays = calculator.getPublicHolidays(year);

        // All entries must have valid ISO date strings
        for (const h of holidays) {
          const parsed = new Date(h.date + 'T00:00:00Z');
          expect(parsed.getTime()).not.toBeNaN();
          expect(parsed.getUTCFullYear()).toBe(year);
        }

        // Extract base names (strip " (Observed)" suffix for matching)
        const baseNames = holidays.map((h) => h.name.replace(' (Observed)', ''));

        // All 12 mandatory holidays must appear
        for (const name of MANDATORY_HOLIDAY_NAMES) {
          expect(baseNames).toContain(name);
        }
      }),
      { numRuns: 100 }
    );
  });
});
