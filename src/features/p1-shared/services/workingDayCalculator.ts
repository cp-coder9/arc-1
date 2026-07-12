/**
 * Working Day Calculator Service
 *
 * Calculates working days according to South African Public Holidays Act 36 of 1994.
 * Used by Dispute Resolution, NHBRC, and Survey modules for contractual deadline calculations.
 *
 * Holidays implemented:
 *   New Year's Day (1 Jan), Human Rights Day (21 Mar), Good Friday (variable),
 *   Family Day (Easter Monday, variable), Freedom Day (27 Apr), Workers' Day (1 May),
 *   Youth Day (16 Jun), National Women's Day (9 Aug), Heritage Day (24 Sep),
 *   Day of Reconciliation (16 Dec), Christmas Day (25 Dec), Day of Goodwill (26 Dec).
 *
 * Observed-Monday logic: when a public holiday falls on Sunday, the following Monday
 * is observed as a public holiday.
 */

import type { SAPublicHoliday } from '../types';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface WorkingDayCalculator {
  /** Count working days between two dates (exclusive of start, inclusive of end). */
  countWorkingDays(startDate: string, endDate: string): number;
  /** Add N working days to a start date, returning the resulting ISO date string. */
  addWorkingDays(startDate: string, days: number): string;
  /** Subtract N working days from an end date, returning the resulting ISO date string. */
  subtractWorkingDays(endDate: string, days: number): string;
  /** Check if a specific date is a working day. */
  isWorkingDay(date: string): boolean;
  /** Get all SA public holidays (including observed Mondays) for a given year. */
  getPublicHolidays(year: number): SAPublicHoliday[];
}

// ─── Easter Calculation (Anonymous Gregorian Algorithm) ───────────────────────

/**
 * Calculate Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 * Returns a Date object set to Easter Sunday at midnight UTC.
 */
function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function toISODateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getDayOfWeek(date: Date): number {
  return date.getUTCDay(); // 0 = Sunday, 6 = Saturday
}

// ─── Public Holiday Generation ────────────────────────────────────────────────

function generatePublicHolidays(year: number): SAPublicHoliday[] {
  const holidays: SAPublicHoliday[] = [];

  // Fixed holidays
  const fixedHolidays: Array<{ month: number; day: number; name: string }> = [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 3, day: 21, name: 'Human Rights Day' },
    { month: 4, day: 27, name: 'Freedom Day' },
    { month: 5, day: 1, name: "Workers' Day" },
    { month: 6, day: 16, name: 'Youth Day' },
    { month: 8, day: 9, name: "National Women's Day" },
    { month: 9, day: 24, name: 'Heritage Day' },
    { month: 12, day: 16, name: 'Day of Reconciliation' },
    { month: 12, day: 25, name: 'Christmas Day' },
    { month: 12, day: 26, name: 'Day of Goodwill' },
  ];

  for (const h of fixedHolidays) {
    const date = new Date(Date.UTC(year, h.month - 1, h.day));
    const dateStr = toISODateString(date);
    const dayOfWeek = getDayOfWeek(date);

    holidays.push({
      date: dateStr,
      name: h.name,
      isObserved: false,
    });

    // Observed-Monday logic: if holiday falls on Sunday, Monday is also observed
    if (dayOfWeek === 0) {
      const monday = addDays(date, 1);
      holidays.push({
        date: toISODateString(monday),
        name: `${h.name} (Observed)`,
        isObserved: true,
      });
    }
  }

  // Variable holidays based on Easter
  const easter = calculateEasterSunday(year);

  // Good Friday: Easter Sunday - 2 days
  const goodFriday = addDays(easter, -2);
  holidays.push({
    date: toISODateString(goodFriday),
    name: 'Good Friday',
    isObserved: false,
  });

  // Family Day: Easter Monday (Easter Sunday + 1 day)
  const familyDay = addDays(easter, 1);
  holidays.push({
    date: toISODateString(familyDay),
    name: 'Family Day',
    isObserved: false,
  });

  // Sort by date
  holidays.sort((a, b) => a.date.localeCompare(b.date));

  return holidays;
}

// ─── Holiday Lookup Cache ─────────────────────────────────────────────────────

function buildHolidaySet(year: number): Set<string> {
  const holidays = generatePublicHolidays(year);
  return new Set(holidays.map((h) => h.date));
}

// ─── Implementation ───────────────────────────────────────────────────────────

class WorkingDayCalculatorImpl implements WorkingDayCalculator {
  private holidayCache: Map<number, Set<string>> = new Map();

  private getHolidaySet(year: number): Set<string> {
    if (!this.holidayCache.has(year)) {
      this.holidayCache.set(year, buildHolidaySet(year));
    }
    return this.holidayCache.get(year)!;
  }

  private isHoliday(dateStr: string): boolean {
    const year = parseInt(dateStr.substring(0, 4), 10);
    return this.getHolidaySet(year).has(dateStr);
  }

  isWorkingDay(date: string): boolean {
    const d = parseDate(date);
    const dayOfWeek = getDayOfWeek(d);

    // Saturday or Sunday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    // Public holiday
    if (this.isHoliday(date)) {
      return false;
    }

    return true;
  }

  countWorkingDays(startDate: string, endDate: string): number {
    const start = parseDate(startDate);
    const end = parseDate(endDate);

    // If end is before or equal to start, return 0
    if (end.getTime() <= start.getTime()) {
      return 0;
    }

    let count = 0;
    let current = addDays(start, 1); // exclusive of start date

    while (current.getTime() <= end.getTime()) {
      const dateStr = toISODateString(current);
      if (this.isWorkingDay(dateStr)) {
        count++;
      }
      current = addDays(current, 1);
    }

    return count;
  }

  addWorkingDays(startDate: string, days: number): string {
    if (days <= 0) {
      return startDate;
    }

    let current = parseDate(startDate);
    let remaining = days;

    while (remaining > 0) {
      current = addDays(current, 1);
      const dateStr = toISODateString(current);
      if (this.isWorkingDay(dateStr)) {
        remaining--;
      }
    }

    return toISODateString(current);
  }

  subtractWorkingDays(endDate: string, days: number): string {
    if (days <= 0) {
      return endDate;
    }

    let current = parseDate(endDate);
    let remaining = days;

    while (remaining > 0) {
      current = addDays(current, -1);
      const dateStr = toISODateString(current);
      if (this.isWorkingDay(dateStr)) {
        remaining--;
      }
    }

    return toISODateString(current);
  }

  getPublicHolidays(year: number): SAPublicHoliday[] {
    return generatePublicHolidays(year);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new WorkingDayCalculator instance.
 * Internally caches holiday sets per year for performance.
 */
export function createWorkingDayCalculator(): WorkingDayCalculator {
  return new WorkingDayCalculatorImpl();
}
