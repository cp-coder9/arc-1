/**
 * South African Working Day Calculator
 *
 * Calculates working days excluding weekends and SA public holidays.
 * Based on the Public Holidays Act 36 of 1994 (as amended).
 */

/**
 * Calculate Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 */
export function calculateEasterSunday(year: number): Date {
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

/**
 * Get all South African public holidays for a given year.
 * Returns dates as Date objects (midnight, local time).
 */
export function getPublicHolidays(year: number): Date[] {
  const holidays: Date[] = [];

  // Fixed holidays
  holidays.push(new Date(year, 0, 1));   // New Year's Day
  holidays.push(new Date(year, 2, 21));  // Human Rights Day
  holidays.push(new Date(year, 3, 27));  // Freedom Day
  holidays.push(new Date(year, 4, 1));   // Workers' Day
  holidays.push(new Date(year, 5, 16));  // Youth Day
  holidays.push(new Date(year, 7, 9));   // National Women's Day
  holidays.push(new Date(year, 8, 24));  // Heritage Day
  holidays.push(new Date(year, 11, 16)); // Day of Reconciliation
  holidays.push(new Date(year, 11, 25)); // Christmas Day
  holidays.push(new Date(year, 11, 26)); // Day of Goodwill

  // Moveable holidays based on Easter
  const easter = calculateEasterSunday(year);

  // Good Friday: Easter - 2 days
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  holidays.push(goodFriday);

  // Family Day (Easter Monday): Easter + 1 day
  const familyDay = new Date(easter);
  familyDay.setDate(easter.getDate() + 1);
  holidays.push(familyDay);

  // If a public holiday falls on a Sunday, the following Monday is a holiday
  const substituteHolidays: Date[] = [];
  for (const holiday of holidays) {
    if (holiday.getDay() === 0) { // Sunday
      const monday = new Date(holiday);
      monday.setDate(holiday.getDate() + 1);
      substituteHolidays.push(monday);
    }
  }
  holidays.push(...substituteHolidays);

  return holidays;
}

/**
 * Normalize a date to midnight for comparison.
 */
function normalizeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Check if two dates represent the same calendar day.
 */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Check if a given date is a SA public holiday.
 */
function isPublicHoliday(date: Date): boolean {
  const holidays = getPublicHolidays(date.getFullYear());
  return holidays.some((h) => isSameDay(h, date));
}

/**
 * Check if a given date is a working day (not weekend, not public holiday).
 */
export function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  // Saturday = 6, Sunday = 0
  if (day === 0 || day === 6) return false;
  return !isPublicHoliday(date);
}

/**
 * Add a specified number of working days to a start date.
 * The start date itself is NOT counted; counting begins from the next day.
 */
export function addWorkingDays(startDate: Date, days: number): Date {
  if (days < 0) throw new Error('days must be non-negative');
  if (days === 0) return normalizeDate(startDate);

  let current = normalizeDate(startDate);
  let remaining = days;

  while (remaining > 0) {
    current = new Date(current);
    current.setDate(current.getDate() + 1);
    if (isWorkingDay(current)) {
      remaining--;
    }
  }

  return current;
}

/**
 * Add a specified number of calendar days to a start date.
 */
export function addCalendarDays(startDate: Date, days: number): Date {
  const result = normalizeDate(startDate);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get the number of remaining working days between two dates (exclusive of both endpoints).
 * If `to` is before or equal to `from`, returns 0.
 */
export function getRemainingWorkingDays(from: Date, to: Date): number {
  const fromNorm = normalizeDate(from);
  const toNorm = normalizeDate(to);

  if (toNorm <= fromNorm) return 0;

  let count = 0;
  const current = new Date(fromNorm);
  current.setDate(current.getDate() + 1);

  while (current < toNorm) {
    if (isWorkingDay(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}
