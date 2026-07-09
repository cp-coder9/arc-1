/**
 * Municipal Refuse Area Calculator — Formatting Utilities
 *
 * Requirements: 7.4
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats an ISO 8601 date string as "DD MMM YYYY" (e.g., "30 Apr 2026").
 * Uses UTC methods to avoid timezone issues.
 *
 * Returns empty string for invalid date inputs.
 */
export function formatDateDDMMMYYYY(isoDate: string): string {
  const date = new Date(isoDate);

  if (isNaN(date.getTime())) {
    return '';
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();

  return `${day} ${month} ${year}`;
}
