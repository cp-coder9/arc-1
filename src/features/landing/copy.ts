// ─── Landing Hero Copy + Clamp Helper ───────────────────────────────────────
// Feature: website-ui-redesign
// Primary marketing copy for the Landing_Page Hero_Section plus the clampCopy
// helper that enforces the headline (<=60) and subline (<=160) character
// limits (Req 11.1, 11.4). Copy lives here as Theme-invariant static config so
// the Hero component can feed it through clampCopy at render time.

/** Maximum number of characters allowed for the Hero headline (Req 11.1). */
export const HEADLINE_LIMIT = 60;

/** Maximum number of characters allowed for the Hero subline (Req 11.1). */
export const SUBLINE_LIMIT = 160;

/**
 * The single Hero headline (<=60 chars) and single subline (<=160 chars) that
 * constitute the only primary marketing copy on the Landing_Page (Req 11.1).
 */
export const HERO_COPY = {
  headline: 'The Operating System for the Built Environment',
  subline: 'Simplify complexity. Deliver with confidence.',
} as const;

/**
 * Clamp a copy string to a maximum character limit (Req 11.4).
 *
 * Returns within-limit input unchanged; truncates over-limit copy to exactly
 * `limit` characters. A non-positive limit yields an empty string.
 *
 * @param str   The copy string to clamp.
 * @param limit The maximum number of characters allowed.
 * @returns The original string when within the limit, otherwise the string
 *          truncated to `limit` characters.
 */
export function clampCopy(str: string, limit: number): string {
  if (limit <= 0) return '';
  if (str.length <= limit) return str;
  return str.slice(0, limit);
}
