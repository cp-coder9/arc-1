/**
 * South African locale formatting utilities.
 *
 * Provides helpers for ZAR currency display, SANS clause references,
 * and professional body tariff citations used throughout the
 * Toolbox Engine export and reporting pipeline.
 *
 * @module zaFormatting
 * @requirements 9.3, 9.4, 9.6
 */

/**
 * Formats a numeric amount as South African Rand (ZAR).
 *
 * Uses the `en-ZA` locale with:
 * - Symbol: R
 * - Thousands separator: narrow no-break space
 * - Decimal separator: comma
 * - Always 2 decimal places
 *
 * @example
 * formatZAR(1250000)   // "R 1 250 000,00"
 * formatZAR(420.5)     // "R 420,50"
 * formatZAR(0)         // "R 0,00"
 *
 * @param amount - The numeric value to format
 * @returns Formatted ZAR currency string (e.g. "R 1 250 000,00")
 */
export function formatZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formats a SANS/NBR clause reference in the standard citation format.
 *
 * Produces references like "SANS 10400-XA 4.3.2" used in clause
 * outcomes throughout compliance calculator results.
 *
 * @example
 * formatClauseRef('10400', 'XA', '4.3.2')  // "SANS 10400-XA 4.3.2"
 * formatClauseRef('10400', 'N', '3.1')     // "SANS 10400-N 3.1"
 * formatClauseRef('10400', 'T', '5.2.1')   // "SANS 10400-T 5.2.1"
 *
 * @param sans - The SANS standard number (e.g. "10400")
 * @param part - The standard part identifier (e.g. "XA", "N", "T")
 * @param clause - The clause number (e.g. "4.3.2")
 * @returns Formatted clause reference string
 */
export function formatClauseRef(sans: string, part: string, clause: string): string {
  return `SANS ${sans}-${part} ${clause}`;
}

/**
 * Formats a professional body tariff reference with gazette citation.
 *
 * South African professional bodies (SACAP, ECSA, SACQSP, SACPLAN,
 * SACPCMP, SACLAP, SAGC) publish gazetted fee tariffs annually.
 * This formats the standard citation used in source version arrays.
 *
 * @example
 * formatTariffRef('SACAP', 2024, '12345')   // "SACAP 2024 GG No. 12345"
 * formatTariffRef('ECSA', 2024, '12346')    // "ECSA 2024 GG No. 12346"
 * formatTariffRef('SACQSP', 2023, '11000')  // "SACQSP 2023 GG No. 11000"
 *
 * @param body - The professional body abbreviation (e.g. "SACAP", "ECSA")
 * @param year - The gazetted year of the tariff
 * @param gazetteNo - The Government Gazette number
 * @returns Formatted tariff reference string (e.g. "SACAP 2024 GG No. 12345")
 */
export function formatTariffRef(body: string, year: number, gazetteNo: string): string {
  return `${body} ${year} GG No. ${gazetteNo}`;
}
