/**
 * Unit Tests — SA Working Day Calculator
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEasterSunday,
  getPublicHolidays,
  isWorkingDay,
  addWorkingDays,
  addCalendarDays,
  getRemainingWorkingDays,
} from '../services/dateUtils';

describe('calculateEasterSunday', () => {
  it('returns correct Easter dates for known years', () => {
    // Known Easter Sunday dates
    const cases: [number, { month: number; day: number }][] = [
      [2020, { month: 3, day: 12 }], // April 12, 2020
      [2021, { month: 3, day: 4 }],  // April 4, 2021
      [2022, { month: 3, day: 17 }], // April 17, 2022
      [2023, { month: 3, day: 9 }],  // April 9, 2023
      [2024, { month: 2, day: 31 }], // March 31, 2024
      [2025, { month: 3, day: 20 }], // April 20, 2025
      [2026, { month: 3, day: 5 }],  // April 5, 2026
    ];

    for (const [year, expected] of cases) {
      const result = calculateEasterSunday(year);
      expect(result.getMonth()).toBe(expected.month);
      expect(result.getDate()).toBe(expected.day);
    }
  });
});

describe('getPublicHolidays', () => {
  it('returns at least 12 holidays for any year', () => {
    const holidays2025 = getPublicHolidays(2025);
    expect(holidays2025.length).toBeGreaterThanOrEqual(12);
  });

  it('includes New Year\'s Day', () => {
    const holidays = getPublicHolidays(2025);
    const newYear = holidays.find(
      (d) => d.getMonth() === 0 && d.getDate() === 1,
    );
    expect(newYear).toBeDefined();
  });

  it('includes Freedom Day (April 27)', () => {
    const holidays = getPublicHolidays(2025);
    const freedom = holidays.find(
      (d) => d.getMonth() === 3 && d.getDate() === 27,
    );
    expect(freedom).toBeDefined();
  });

  it('includes Good Friday based on Easter', () => {
    // 2025: Easter Sunday is April 20, so Good Friday is April 18
    const holidays = getPublicHolidays(2025);
    const goodFriday = holidays.find(
      (d) => d.getMonth() === 3 && d.getDate() === 18,
    );
    expect(goodFriday).toBeDefined();
  });

  it('includes substitute Monday when holiday falls on Sunday', () => {
    // 2025: Freedom Day (April 27) falls on Sunday → Monday April 28 is a holiday
    const holidays = getPublicHolidays(2025);
    const substitute = holidays.find(
      (d) => d.getMonth() === 3 && d.getDate() === 28,
    );
    expect(substitute).toBeDefined();
  });
});

describe('isWorkingDay', () => {
  it('returns false for Saturday', () => {
    // 2025-01-04 is a Saturday
    expect(isWorkingDay(new Date(2025, 0, 4))).toBe(false);
  });

  it('returns false for Sunday', () => {
    // 2025-01-05 is a Sunday
    expect(isWorkingDay(new Date(2025, 0, 5))).toBe(false);
  });

  it('returns false for New Year\'s Day', () => {
    expect(isWorkingDay(new Date(2025, 0, 1))).toBe(false);
  });

  it('returns true for a regular weekday', () => {
    // 2025-01-06 is Monday (not a holiday)
    expect(isWorkingDay(new Date(2025, 0, 6))).toBe(true);
  });

  it('returns false for Good Friday', () => {
    // 2025: Good Friday is April 18
    expect(isWorkingDay(new Date(2025, 3, 18))).toBe(false);
  });

  it('returns false for substitute holiday (Monday after Sunday holiday)', () => {
    // 2025: Freedom Day April 27 is Sunday → April 28 Monday is substitute
    expect(isWorkingDay(new Date(2025, 3, 28))).toBe(false);
  });
});

describe('addWorkingDays', () => {
  it('adds working days skipping weekends', () => {
    // Monday 2025-01-06 + 5 working days = Monday 2025-01-13
    const result = addWorkingDays(new Date(2025, 0, 6), 5);
    expect(result.getDate()).toBe(13);
    expect(result.getMonth()).toBe(0);
  });

  it('adds working days skipping holidays', () => {
    // Start Dec 24, 2025 (Wednesday) + 3 working days
    // Dec 25 = Christmas (skip), Dec 26 = Day of Goodwill (skip)
    // Dec 27 = Saturday (skip), Dec 28 = Sunday (skip)
    // Dec 29 = Monday (day 1), Dec 30 = Tuesday (day 2), Dec 31 = Wednesday (day 3)
    const result = addWorkingDays(new Date(2025, 11, 24), 3);
    expect(result.getDate()).toBe(31);
    expect(result.getMonth()).toBe(11);
  });

  it('returns the start date for 0 days', () => {
    const start = new Date(2025, 0, 6);
    const result = addWorkingDays(start, 0);
    expect(result.getDate()).toBe(6);
  });

  it('throws for negative days', () => {
    expect(() => addWorkingDays(new Date(), -1)).toThrow('days must be non-negative');
  });

  it('handles 30 working days (typical comment period)', () => {
    // Start: 2025-03-03 (Monday)
    // 30 working days from March 3 should land around mid-April
    const result = addWorkingDays(new Date(2025, 2, 3), 30);
    // Should be approximately 6 weeks later (30 working days ≈ 42 calendar days)
    expect(result.getMonth()).toBeGreaterThanOrEqual(3); // April or later
  });
});

describe('addCalendarDays', () => {
  it('adds calendar days without skipping anything', () => {
    const result = addCalendarDays(new Date(2025, 0, 1), 10);
    expect(result.getDate()).toBe(11);
    expect(result.getMonth()).toBe(0);
  });

  it('handles month boundaries', () => {
    // Jan 28 + 5 = Feb 2
    const result = addCalendarDays(new Date(2025, 0, 28), 5);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(2);
  });
});

describe('getRemainingWorkingDays', () => {
  it('counts working days between two dates', () => {
    // Mon Jan 6 to Fri Jan 10 = 3 working days (Tue, Wed, Thu — excludes endpoints)
    const from = new Date(2025, 0, 6);
    const to = new Date(2025, 0, 10);
    expect(getRemainingWorkingDays(from, to)).toBe(3);
  });

  it('returns 0 when to is before from', () => {
    const from = new Date(2025, 0, 10);
    const to = new Date(2025, 0, 6);
    expect(getRemainingWorkingDays(from, to)).toBe(0);
  });

  it('returns 0 when dates are the same', () => {
    const date = new Date(2025, 0, 6);
    expect(getRemainingWorkingDays(date, date)).toBe(0);
  });

  it('excludes holidays from count', () => {
    // Dec 23 to Dec 30, 2025
    // Dec 24 (Wed) = work, Dec 25 (Thu) = holiday, Dec 26 (Fri) = holiday
    // Dec 27 (Sat) = skip, Dec 28 (Sun) = skip, Dec 29 (Mon) = work
    // That's 2 working days between 23 and 30
    const from = new Date(2025, 11, 23);
    const to = new Date(2025, 11, 30);
    expect(getRemainingWorkingDays(from, to)).toBe(2);
  });
});
