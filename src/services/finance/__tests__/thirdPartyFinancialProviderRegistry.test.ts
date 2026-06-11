/**
 * Tests for Third-Party Financial Provider Registry
 */
import { describe, it, expect } from 'vitest';
import {
  selectProvider,
  assessProviderReadiness,
  isProviderLiveReady,
  registerProvider,
  updateProviderConfiguration,
  findProvidersByType,
} from '../thirdPartyFinancialProviderRegistry';
import type { FinancialProvider } from '../types';

const registeredEscrowProvider: FinancialProvider = {
  providerId: 'escrow-1',
  name: 'Registered Escrow Co',
  providerType: 'escrow_provider',
  registered: true,
  capabilities: ['collect', 'escrow_hold', 'release', 'webhook_status'],
  liveConfigured: true,
};

const unconfiguredProvider: FinancialProvider = {
  providerId: 'escrow-placeholder',
  name: 'Placeholder Escrow',
  providerType: 'escrow_provider',
  registered: true,
  capabilities: ['collect', 'escrow_hold', 'release'],
  liveConfigured: false,
};

const unregisteredProvider: FinancialProvider = {
  providerId: 'shady-co',
  name: 'Unregistered Provider',
  providerType: 'payment_gateway',
  registered: false,
  capabilities: ['collect'],
  liveConfigured: false,
};

const providers = [registeredEscrowProvider, unconfiguredProvider, unregisteredProvider];

describe('thirdPartyFinancialProviderRegistry', () => {
  describe('selectProvider', () => {
    it('selects a registered provider with required capability', () => {
      const p = selectProvider(providers, 'escrow_hold');
      expect(p.providerId).toBe('escrow-1');
    });

    it('throws if no provider has the capability', () => {
      expect(() => selectProvider(providers, 'payout')).toThrow(
        /No registered financial provider supports capability/,
      );
    });

    it('ignores unregistered providers', () => {
      // Only escrow-1 and escrow-placeholder are registered
      const p = selectProvider(providers, 'release');
      expect(p.registered).toBe(true);
    });
  });

  describe('assessProviderReadiness', () => {
    it('provides notes for configured provider', () => {
      const notes = assessProviderReadiness(registeredEscrowProvider);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0]).toContain('registered');
    });

    it('warns about unconfigured providers', () => {
      const notes = assessProviderReadiness(unconfiguredProvider);
      expect(notes.some((n) => n.includes('not live-configured'))).toBe(true);
    });

    it('warns about unregistered providers', () => {
      const notes = assessProviderReadiness(unregisteredProvider);
      expect(
        notes.some((n) => n.includes('NOT REGISTERED')),
      ).toBe(true);
    });
  });

  describe('isProviderLiveReady', () => {
    it('returns true for registered, configured provider with capability', () => {
      expect(isProviderLiveReady(registeredEscrowProvider, 'escrow_hold')).toBe(
        true,
      );
    });

    it('returns false for unconfigured provider', () => {
      expect(isProviderLiveReady(unconfiguredProvider, 'escrow_hold')).toBe(
        false,
      );
    });

    it('returns false for unregistered provider', () => {
      expect(isProviderLiveReady(unregisteredProvider, 'collect')).toBe(false);
    });

    it('returns false if capability missing', () => {
      expect(isProviderLiveReady(registeredEscrowProvider, 'payout')).toBe(
        false,
      );
    });
  });

  describe('registerProvider', () => {
    it('adds a new provider to the registry', () => {
      const updated = registerProvider(providers, {
        providerId: 'new-provider',
        name: 'New Payment Co',
        providerType: 'payment_gateway',
        capabilities: ['collect', 'payout'],
      });
      expect(updated).toHaveLength(4);
      expect(updated[3].providerId).toBe('new-provider');
      expect(updated[3].registered).toBe(true);
      expect(updated[3].liveConfigured).toBe(false); // default
    });

    it('throws for duplicate provider ID', () => {
      expect(() =>
        registerProvider(providers, {
          providerId: 'escrow-1',
          name: 'Duplicate',
          providerType: 'escrow_provider',
          capabilities: ['escrow_hold'],
        }),
      ).toThrow(/already exists/);
    });

    it('does not mutate original array', () => {
      const originalLength = providers.length;
      registerProvider(providers, {
        providerId: 'another-new',
        name: 'Another Provider',
        providerType: 'bank_eft_orchestrator',
        capabilities: ['collect', 'payout'],
      });
      expect(providers).toHaveLength(originalLength);
    });
  });

  describe('updateProviderConfiguration', () => {
    it('updates provider configuration', () => {
      const updated = updateProviderConfiguration(providers, 'escrow-placeholder', {
        liveConfigured: true,
        name: 'Now Live Escrow',
      });
      const p = updated.find((x) => x.providerId === 'escrow-placeholder')!;
      expect(p.liveConfigured).toBe(true);
      expect(p.name).toBe('Now Live Escrow');
    });
  });

  describe('findProvidersByType', () => {
    it('filters providers by type', () => {
      const escrow = findProvidersByType(providers, 'escrow_provider');
      expect(escrow).toHaveLength(2);
      expect(escrow.every((p) => p.providerType === 'escrow_provider')).toBe(true);
    });

    it('excludes unregistered providers', () => {
      const gateways = findProvidersByType(providers, 'payment_gateway');
      expect(gateways).toHaveLength(0); // unregistered one filtered out
    });
  });
});
