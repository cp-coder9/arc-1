/**
 * Provider Disclaimer Service — Financial Platform Integrity
 *
 * Provides persistent disclaimer text for payment UI panels communicating
 * that Architex does not hold, store, or custody any funds. All money
 * movement is orchestrated through registered third-party financial
 * service providers.
 *
 * @module finance/providerDisclaimerService
 * @see Requirement 11.3
 */

/** Default provider name when no registered provider is resolved */
export const DEFAULT_PROVIDER_NAME = 'the registered third-party financial service provider';

/**
 * Returns the persistent payment disclaimer text with the named provider.
 *
 * Requirement 11.3: WHEN a payment UI is rendered, display a persistent
 * disclaimer within the payment panel stating that funds are held and
 * processed by the named registered provider (including the provider name)
 * and that Architex does not hold, store, or custody any funds.
 *
 * @param providerName - The name of the registered provider (dynamic)
 * @returns Disclaimer text string
 */
export function getProviderDisclaimerText(providerName?: string): string {
  const name = providerName?.trim() || DEFAULT_PROVIDER_NAME;
  return (
    `All funds are held and processed by ${name}. ` +
    'Architex does not hold, store, or have custody of any funds. ' +
    'Architex orchestrates payment approvals, certifications, and audit trails ' +
    'through registered third-party financial service providers.'
  );
}

/**
 * Validates that a provider name is suitable for display in the disclaimer.
 * Provider names must be non-empty after trimming.
 *
 * @param providerName - The provider name to validate
 * @returns true if the name is valid for display
 */
export function isValidProviderName(providerName: unknown): providerName is string {
  return typeof providerName === 'string' && providerName.trim().length > 0;
}
