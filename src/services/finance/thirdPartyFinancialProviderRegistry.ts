/**
 * Third-Party Financial Provider Registry
 *
 * Manages the registry of trusted, registered third-party financial service
 * providers. Architex does NOT hold client funds — all money movement, escrow
 * custody, card/EFT collection, and payouts are executed by registered
 * providers through approved connectors.
 *
 * When no provider is live-configured, the workflow stays in
 * `provider_configuration_required` state.
 */
import type { FinancialProvider, ProviderType } from './types';

/**
 * Select a suitable registered provider for a given capability.
 * Throws if no registered provider with the capability is found.
 */
export function selectProvider(
  providers: FinancialProvider[],
  capability: 'collect' | 'escrow_hold' | 'release' | 'payout',
): FinancialProvider {
  const provider = providers.find(
    (p) => p.registered && p.capabilities.includes(capability),
  );
  if (!provider) {
    throw new Error(
      `No registered financial provider supports capability: ${capability}`,
    );
  }
  return provider;
}

/**
 * Assess provider readiness and return human-readable notes.
 * If the provider is not live-configured, the notes will recommend
 * keeping release requests in `provider_configuration_required` state.
 */
export function assessProviderReadiness(
  provider: FinancialProvider,
): string[] {
  const notes: string[] = [
    `${provider.name} is ${provider.registered ? 'registered' : 'NOT REGISTERED — do not use for live releases'}.`,
  ];

  if (!provider.liveConfigured) {
    notes.push(
      'Provider connector is not live-configured. Keep release requests as provider_configuration_required until credentials and agreements are in place.',
    );
  }

  if (provider.configurationNotes && provider.configurationNotes.length > 0) {
    notes.push(...provider.configurationNotes);
  }

  return notes;
}

/**
 * Check whether a provider is ready for live payment operations.
 * Returns false if the provider is not registered, not live-configured,
 * or lacks required capabilities.
 */
export function isProviderLiveReady(
  provider: FinancialProvider,
  requiredCapability?: 'collect' | 'escrow_hold' | 'release' | 'payout',
): boolean {
  if (!provider.registered || !provider.liveConfigured) return false;
  if (requiredCapability && !provider.capabilities.includes(requiredCapability)) {
    return false;
  }
  return true;
}

/**
 * Add a new provider to the registry.
 */
export function registerProvider(
  providers: FinancialProvider[],
  input: {
    providerId: string;
    name: string;
    providerType: ProviderType;
    capabilities: FinancialProvider['capabilities'];
    liveConfigured?: boolean;
    configurationNotes?: string[];
  },
): FinancialProvider[] {
  const exists = providers.some((p) => p.providerId === input.providerId);
  if (exists) {
    throw new Error(
      `Provider with ID '${input.providerId}' already exists in the registry.`,
    );
  }

  const newProvider: FinancialProvider = {
    providerId: input.providerId,
    name: input.name,
    providerType: input.providerType,
    registered: true,
    capabilities: input.capabilities,
    liveConfigured: input.liveConfigured ?? false,
    configurationNotes: input.configurationNotes,
  };

  return [...providers, newProvider];
}

/**
 * Update an existing provider's configuration.
 */
export function updateProviderConfiguration(
  providers: FinancialProvider[],
  providerId: string,
  updates: Partial<
    Pick<FinancialProvider, 'liveConfigured' | 'capabilities' | 'configurationNotes' | 'name'>
  >,
): FinancialProvider[] {
  return providers.map((p) =>
    p.providerId === providerId ? { ...p, ...updates } : p,
  );
}

/**
 * Find providers by type (e.g., all escrow providers).
 */
export function findProvidersByType(
  providers: FinancialProvider[],
  providerType: ProviderType,
): FinancialProvider[] {
  return providers.filter((p) => p.providerType === providerType && p.registered);
}
