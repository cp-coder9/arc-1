/**
 * Disclaimer Service — Contract Administration
 *
 * Pure function module providing advisory disclaimer text and validation
 * for all contract administration outputs.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

/**
 * Returns the persistent non-dismissible banner text displayed on every
 * contract administration view.
 *
 * Requirement 11.1: Persistent non-dismissible banner stating system is
 * advisory, does not constitute legal advice, outputs require professional
 * and legal review.
 */
export function getDisclaimerBannerText(): string {
  return (
    'This system is advisory only and does not constitute legal advice. ' +
    'All outputs require professional review and independent legal review ' +
    'before any contractual decisions are made or actions are taken.'
  );
}

/**
 * Returns the disclaimer footer text appended to every generated output
 * document (payment schedules, deadline calculations, claim summaries, notices).
 *
 * Requirement 11.2: Disclaimer footer on every generated output document
 * stating output is for reference purposes only and does not replace
 * professional advice.
 */
export function getDocumentDisclaimerFooter(): string {
  return (
    'DISCLAIMER: This output is for reference purposes only and does not ' +
    'replace professional advice. The information presented is advisory and ' +
    'does not constitute legal advice. All content requires independent ' +
    'professional review before reliance.'
  );
}

/**
 * Validates that a generated output contains the required disclaimer phrases.
 * Used to enforce Requirement 11.5 — if disclaimer is not present, generation
 * must be blocked.
 *
 * Required phrases:
 * - "advisory"
 * - "does not constitute legal advice"
 * - "professional review"
 *
 * @param output - The generated output text to validate
 * @returns true if all required phrases are present, false otherwise
 */
export function validateDisclaimerPresence(output: string): boolean {
  if (!output) return false;

  const lowerOutput = output.toLowerCase();

  const requiredPhrases = [
    'advisory',
    'does not constitute legal advice',
    'professional review',
  ];

  return requiredPhrases.every((phrase) => lowerOutput.includes(phrase));
}

/**
 * Returns the verification notice text for deemed acceptance/rejection outcomes.
 *
 * Requirement 11.4: Deemed acceptance/rejection outcomes include notice that
 * calculated outcome is based on configured parameters and must be verified
 * against the actual contract by a suitably qualified built environment
 * professional.
 */
export function isDeemedOutcomeDisclaimer(): string {
  return (
    'This calculated outcome is based on configured parameters and must be ' +
    'verified against the actual contract by a suitably qualified built ' +
    'environment professional. This advisory does not constitute legal advice ' +
    'and requires independent professional review.'
  );
}
