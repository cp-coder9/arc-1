/**
 * Working Day Calculator — Pure Function Module
 *
 * Provides date arithmetic for South African contractual deadlines.
 * All functions are pure (no side effects), operate on ISO date strings (YYYY-MM-DD),
 * and exclude Saturdays, Sundays, and gazetted SA public holidays from working day counts.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import type { PublicHoliday } from './contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Maximum years into the future for overflow guard */
const MAX_YEARS_AHEAD = 10;

// ══════════════════════════════════════════════════════════════════════════════
// Easter Calculation (Anonymous Gregorian algorithm)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Computes Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 * Required for calculating Good Friday and Family Day (Easter Monday).
 */
function getEasterSunday(year: number): Date {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper Utilities
// ══════════════════════════════════════════════════════════════════════════════

/** Parse an ISO date string to a Date object (UTC-safe, no timezone shift) */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date object to ISO date string YYYY-MM-DD */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add one calendar day to a Date */
function addOneDay(date: Date): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * When a public holiday falls on a Sunday, the following Monday is observed.
 * Returns the observed date for a holiday.
 */
function observedDate(date: Date): Date {
  if (date.getDay() === 0) {
    // Sunday → observe on Monday
    return addOneDay(date);
  }
  return date;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Returns all gazetted South African public holidays for a given year.
 *
 * Includes:
 * - New Year's Day (1 January)
 * - Human Rights Day (21 March)
 * - Good Friday (moveable — Friday before Easter)
 * - Family Day (moveable — Monday after Easter)
 * - Freedom Day (27 April)
 * - Workers' Day (1 May)
 * - Youth Day (16 June)
 * - National Women's Day (9 August)
 * - Heritage Day (24 September)
 * - Day of Reconciliation (16 December)
 * - Christmas Day (25 December)
 * - Day of Goodwill (26 December)
 *
 * When a fixed holiday falls on a Sunday, the following Monday is also observed
 * as a public holiday (Public Holidays Act, 1994).
 */
export function getSouthAfricanHolidays(year: number): PublicHoliday[] {
  const holidays: PublicHoliday[] = [];

  // Fixed holidays with their base dates
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

  // Add fixed holidays with Sunday→Monday observation rule
  for (const h of fixedHolidays) {
    const baseDate = new Date(year, h.month - 1, h.day);
    const observed = observedDate(baseDate);
    const observedIso = formatDate(observed);

    // Always add the base holiday date
    holidays.push({ date: formatDate(baseDate), name: h.name, year });

    // If the observed date differs (Sunday rule), add the observed Monday as well
    if (observedIso !== formatDate(baseDate)) {
      holidays.push({
        date: observedIso,
        name: `${h.name} (observed)`,
        year,
      });
    }
  }

  // Moveable holidays: Good Friday and Family Day (Easter Monday)
  const easter = getEasterSunday(year);

  const goodFriday = new Date(easter.getTime());
  goodFriday.setDate(easter.getDate() - 2);
  holidays.push({ date: formatDate(goodFriday), name: 'Good Friday', year });

  const familyDay = new Date(easter.getTime());
  familyDay.setDate(easter.getDate() + 1);
  holidays.push({ date: formatDate(familyDay), name: 'Family Day', year });

  return holidays;
}

/**
 * Determines whether a given date is a working day.
 * A working day excludes Saturdays, Sundays, and listed public holidays.
 *
 * @param date - ISO date string (YYYY-MM-DD)
 * @param holidays - Array of PublicHoliday entries to check against
 * @returns true if the date is a working day
 */
export function isWorkingDay(date: string, holidays: PublicHoliday[]): boolean {
  const d = parseDate(date);
  const dayOfWeek = d.getDay();

  // Saturday = 6, Sunday = 0
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Check if date matches any holiday
  const holidayDates = new Set(holidays.map((h) => h.date));
  return !holidayDates.has(date);
}

/**
 * Adds a specified number of working days to a start date.
 *
 * Counting starts from the FIRST working day AFTER startDate (exclusive of start).
 * The result will always be a working day.
 *
 * Throws an error if the result would exceed 10 years from startDate (overflow guard).
 *
 * @param startDate - ISO date string (YYYY-MM-DD)
 * @param days - Number of working days to add (must be >= 0)
 * @param holidays - Array of PublicHoliday entries
 * @returns ISO date string of the resulting working day
 */
export function addWorkingDays(startDate: string, days: number, holidays: PublicHoliday[]): string {
  if (days < 0) {
    throw new Error('days must be non-negative');
  }

  if (days === 0) {
    // Return the next working day if start is non-working, otherwise the day after start that's working
    const start = parseDate(startDate);
    const nextDay = addOneDay(start);
    return getNextWorkingDay(formatDate(nextDay), holidays);
  }

  const start = parseDate(startDate);
  const maxDate = new Date(start.getTime());
  maxDate.setFullYear(maxDate.getFullYear() + MAX_YEARS_AHEAD);

  // Build a set of holiday dates for efficient lookup — cover range of years
  const startYear = start.getFullYear();
  const endYear = startYear + MAX_YEARS_AHEAD + 1;
  const allHolidays = new Set<string>();
  for (const h of holidays) {
    allHolidays.add(h.date);
  }
  // Also generate holidays for years not already covered
  for (let y = startYear; y <= endYear; y++) {
    const yearHolidays = getSouthAfricanHolidays(y);
    for (const h of yearHolidays) {
      allHolidays.add(h.date);
    }
  }

  let current = start;
  let counted = 0;

  while (counted < days) {
    current = addOneDay(current);

    // Overflow guard
    if (current > maxDate) {
      throw new Error(
        `Overflow: result exceeds ${MAX_YEARS_AHEAD} years from start date ${startDate}`
      );
    }

    const iso = formatDate(current);
    const dayOfWeek = current.getDay();

    // Skip weekends and holidays
    if (dayOfWeek === 0 || dayOfWeek === 6 || allHolidays.has(iso)) {
      continue;
    }

    counted++;
  }

  return formatDate(current);
}

/**
 * Counts the number of working days between two dates.
 * Exclusive of startDate, inclusive of endDate.
 *
 * If endDate is before or equal to startDate, returns 0.
 *
 * @param startDate - ISO date string (YYYY-MM-DD), exclusive
 * @param endDate - ISO date string (YYYY-MM-DD), inclusive
 * @param holidays - Array of PublicHoliday entries
 * @returns Number of working days between the two dates
 */
export function countWorkingDaysBetween(
  startDate: string,
  endDate: string,
  holidays: PublicHoliday[]
): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (end <= start) {
    return 0;
  }

  // Build holiday set for efficient lookup
  const holidayDates = new Set(holidays.map((h) => h.date));

  let count = 0;
  let current = addOneDay(start); // exclusive of start

  while (current <= end) {
    const iso = formatDate(current);
    const dayOfWeek = current.getDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(iso)) {
      count++;
    }

    current = addOneDay(current);
  }

  return count;
}

/**
 * Returns the next working day on or after the given date.
 * If the date is already a working day, returns it unchanged.
 * If the date falls on a weekend or holiday, advances to the next available working day.
 *
 * @param date - ISO date string (YYYY-MM-DD)
 * @param holidays - Array of PublicHoliday entries
 * @returns ISO date string of the next working day (may be the input itself)
 */
export function getNextWorkingDay(date: string, holidays: PublicHoliday[]): string {
  const holidayDates = new Set(holidays.map((h) => h.date));
  let current = parseDate(date);

  // Advance until we find a working day (max 30 iterations for safety)
  let iterations = 0;
  while (iterations < 30) {
    const iso = formatDate(current);
    const dayOfWeek = current.getDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(iso)) {
      return iso;
    }

    current = addOneDay(current);
    iterations++;
  }

  // Fallback (should never reach here under normal circumstances)
  return formatDate(current);
}

/**
 * Returns the number of remaining working days from a given date to a deadline.
 * Exclusive of fromDate, inclusive of deadline.
 *
 * If deadline has passed (is before or equal to fromDate), returns 0.
 * Used for countdown display in the UI.
 *
 * @param fromDate - ISO date string (YYYY-MM-DD), the current/reference date
 * @param deadline - ISO date string (YYYY-MM-DD), the target deadline
 * @param holidays - Array of PublicHoliday entries
 * @returns Number of remaining working days (0 if deadline has passed)
 */
export function getRemainingWorkingDays(
  fromDate: string,
  deadline: string,
  holidays: PublicHoliday[]
): number {
  return countWorkingDaysBetween(fromDate, deadline, holidays);
}
