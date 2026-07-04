/**
 * Unit tests for Working Day Calculator
 *
 * Tests: SA holidays, weekend skipping, year boundary, start-on-holiday edge case, overflow guard.
 * Requirements: 12.1, 12.2, 12.4
 */

import { describe, expect, it } from 'vitest';
import {
  getSouthAfricanHolidays,
  isWorkingDay,
  addWorkingDays,
  countWorkingDaysBetween,
  getNextWorkingDay,
  getRemainingWorkingDays,
} from '../contractAdmin/workingDayCalculator';

describe('workingDayCalculator', () => {
  describe('getSouthAfricanHolidays', () => {
    it('returns all gazetted SA holidays for 2025', () => {
      const holidays = getSouthAfricanHolidays(2025);
      const dates = holidays.map((h) => h.date);

      // Fixed holidays
      expect(dates).toContain('2025-01-01'); // New Year's Day
      expect(dates).toContain('2025-03-21'); // Human Rights Day
      expect(dates).toContain('2025-04-27'); // Freedom Day
      expect(dates).toContain('2025-05-01'); // Workers' Day
      expect(dates).toContain('2025-06-16'); // Youth Day
      expect(dates).toContain('2025-08-09'); // National Women's Day
      expect(dates).toContain('2025-09-24'); // Heritage Day
      expect(dates).toContain('2025-12-16'); // Day of Reconciliation
      expect(dates).toContain('2025-12-25'); // Christmas Day
      expect(dates).toContain('2025-12-26'); // Day of Goodwill
    });

    it('returns Good Friday and Family Day for 2025', () => {
      const holidays = getSouthAfricanHolidays(2025);
      const dates = holidays.map((h) => h.date);

      // Easter 2025: April 20 → Good Friday = April 18, Family Day = April 21
      expect(dates).toContain('2025-04-18'); // Good Friday
      expect(dates).toContain('2025-04-21'); // Family Day (Easter Monday)
    });

    it('applies Sunday→Monday observation rule', () => {
      // 2022-01-01 is a Saturday (no shift), but let's check a known Sunday case
      // 2023-01-01 is a Sunday → observed Monday 2023-01-02
      const holidays2023 = getSouthAfricanHolidays(2023);
      const dates = holidays2023.map((h) => h.date);

      expect(dates).toContain('2023-01-01'); // New Year's Day base date
      expect(dates).toContain('2023-01-02'); // Observed Monday
    });

    it('all holidays have the correct year field', () => {
      const holidays = getSouthAfricanHolidays(2025);
      for (const h of holidays) {
        expect(h.year).toBe(2025);
      }
    });
  });

  describe('isWorkingDay', () => {
    const holidays2025 = getSouthAfricanHolidays(2025);

    it('returns false for Saturdays', () => {
      // 2025-01-04 is Saturday
      expect(isWorkingDay('2025-01-04', holidays2025)).toBe(false);
    });

    it('returns false for Sundays', () => {
      // 2025-01-05 is Sunday
      expect(isWorkingDay('2025-01-05', holidays2025)).toBe(false);
    });

    it('returns false for public holidays', () => {
      // 2025-03-21 is Human Rights Day (Friday)
      expect(isWorkingDay('2025-03-21', holidays2025)).toBe(false);
    });

    it('returns true for a normal working day', () => {
      // 2025-01-06 is a Monday, not a holiday
      expect(isWorkingDay('2025-01-06', holidays2025)).toBe(true);
    });

    it('returns false for Good Friday 2025', () => {
      expect(isWorkingDay('2025-04-18', holidays2025)).toBe(false);
    });
  });

  describe('addWorkingDays', () => {
    const holidays2025 = getSouthAfricanHolidays(2025);

    it('adds working days skipping weekends', () => {
      // 2025-01-06 is Monday. Add 5 working days → next Monday 2025-01-13
      const result = addWorkingDays('2025-01-06', 5, holidays2025);
      expect(result).toBe('2025-01-13');
    });

    it('adds working days skipping holidays', () => {
      // 2025-03-20 is Thursday. Add 1 working day → skip 2025-03-21 (Human Rights Day) → Monday 2025-03-24
      const result = addWorkingDays('2025-03-20', 1, holidays2025);
      expect(result).toBe('2025-03-24');
    });

    it('starts counting from the next day after startDate', () => {
      // 2025-01-06 is Monday. Add 1 working day → Tuesday 2025-01-07
      const result = addWorkingDays('2025-01-06', 1, holidays2025);
      expect(result).toBe('2025-01-07');
    });

    it('handles start date on a weekend', () => {
      // 2025-01-04 is Saturday. Add 1 working day → Monday 2025-01-06
      const result = addWorkingDays('2025-01-04', 1, holidays2025);
      expect(result).toBe('2025-01-06');
    });

    it('handles start date on a holiday', () => {
      // 2025-01-01 is New Year's Day (Wednesday). Add 1 → Thursday 2025-01-02
      const result = addWorkingDays('2025-01-01', 1, holidays2025);
      expect(result).toBe('2025-01-02');
    });

    it('throws overflow error for unreasonable periods', () => {
      expect(() =>
        addWorkingDays('2025-01-01', 999999, holidays2025)
      ).toThrow(/Overflow/);
    });

    it('result never falls on a weekend', () => {
      for (let days = 1; days <= 20; days++) {
        const result = addWorkingDays('2025-01-01', days, holidays2025);
        const date = new Date(result + 'T00:00:00');
        expect(date.getDay()).not.toBe(0); // Not Sunday
        expect(date.getDay()).not.toBe(6); // Not Saturday
      }
    });

    it('result never falls on a holiday', () => {
      const holidayDates = new Set(holidays2025.map((h) => h.date));
      for (let days = 1; days <= 20; days++) {
        const result = addWorkingDays('2025-01-01', days, holidays2025);
        expect(holidayDates.has(result)).toBe(false);
      }
    });
  });

  describe('countWorkingDaysBetween', () => {
    const holidays2025 = getSouthAfricanHolidays(2025);

    it('counts working days exclusive of start, inclusive of end', () => {
      // Mon 2025-01-06 to Fri 2025-01-10: Tue, Wed, Thu, Fri = 4 days
      const count = countWorkingDaysBetween('2025-01-06', '2025-01-10', holidays2025);
      expect(count).toBe(4);
    });

    it('returns 0 when endDate is before startDate', () => {
      const count = countWorkingDaysBetween('2025-01-10', '2025-01-06', holidays2025);
      expect(count).toBe(0);
    });

    it('returns 0 when endDate equals startDate', () => {
      const count = countWorkingDaysBetween('2025-01-06', '2025-01-06', holidays2025);
      expect(count).toBe(0);
    });

    it('excludes holidays from count', () => {
      // 2025-03-20 (Thu) to 2025-03-24 (Mon)
      // Fri 21 = holiday, Sat 22 = weekend, Sun 23 = weekend, Mon 24 = working
      const count = countWorkingDaysBetween('2025-03-20', '2025-03-24', holidays2025);
      expect(count).toBe(1);
    });

    it('is consistent with addWorkingDays (roundtrip)', () => {
      const days = 10;
      const result = addWorkingDays('2025-01-06', days, holidays2025);
      const count = countWorkingDaysBetween('2025-01-06', result, holidays2025);
      expect(count).toBe(days);
    });
  });

  describe('getNextWorkingDay', () => {
    const holidays2025 = getSouthAfricanHolidays(2025);

    it('returns the same date if already a working day', () => {
      expect(getNextWorkingDay('2025-01-06', holidays2025)).toBe('2025-01-06');
    });

    it('advances from Saturday to Monday', () => {
      expect(getNextWorkingDay('2025-01-04', holidays2025)).toBe('2025-01-06');
    });

    it('advances from Sunday to Monday', () => {
      expect(getNextWorkingDay('2025-01-05', holidays2025)).toBe('2025-01-06');
    });

    it('advances past a holiday', () => {
      // 2025-01-01 is New Year's Day (Wednesday) → Thursday 2025-01-02
      expect(getNextWorkingDay('2025-01-01', holidays2025)).toBe('2025-01-02');
    });

    it('advances past a holiday weekend combination', () => {
      // Good Friday 2025-04-18, Sat 19, Sun 20, Family Day Mon 21 → Tue 2025-04-22
      expect(getNextWorkingDay('2025-04-18', holidays2025)).toBe('2025-04-22');
    });
  });

  describe('getRemainingWorkingDays', () => {
    const holidays2025 = getSouthAfricanHolidays(2025);

    it('returns working days remaining to a deadline', () => {
      // Same as countWorkingDaysBetween
      const remaining = getRemainingWorkingDays('2025-01-06', '2025-01-10', holidays2025);
      expect(remaining).toBe(4);
    });

    it('returns 0 when deadline has passed', () => {
      const remaining = getRemainingWorkingDays('2025-01-10', '2025-01-06', holidays2025);
      expect(remaining).toBe(0);
    });

    it('returns 0 when deadline is today', () => {
      const remaining = getRemainingWorkingDays('2025-01-06', '2025-01-06', holidays2025);
      expect(remaining).toBe(0);
    });
  });

  describe('year boundary', () => {
    it('handles crossing from one year to the next', () => {
      const holidays2025 = getSouthAfricanHolidays(2025);
      const holidays2026 = getSouthAfricanHolidays(2026);
      const allHolidays = [...holidays2025, ...holidays2026];

      // 2025-12-30 is Tuesday, add 5 working days
      // Dec 31 (Wed), Jan 1 (Thu — holiday), Jan 2 (Fri), Jan 5 (Mon), Jan 6 (Tue)
      // So: Dec 31, Jan 2, Jan 5, Jan 6, Jan 7 → result is Jan 7
      const result = addWorkingDays('2025-12-30', 5, allHolidays);
      expect(result).toBe('2026-01-07');
    });
  });
});
