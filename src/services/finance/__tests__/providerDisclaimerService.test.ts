import { describe, it, expect } from 'vitest';
import {
  getProviderDisclaimerText,
  isValidProviderName,
  DEFAULT_PROVIDER_NAME,
} from '../providerDisclaimerService';

describe('providerDisclaimerService', () => {
  describe('getProviderDisclaimerText', () => {
    it('includes the provider name in the disclaimer text', () => {
      const text = getProviderDisclaimerText('PayFast');
      expect(text).toContain('PayFast');
      expect(text).toContain('All funds are held and processed by PayFast');
    });

    it('includes the statement that Architex does not hold funds', () => {
      const text = getProviderDisclaimerText('PayFast');
      expect(text).toContain('Architex does not hold, store, or have custody of any funds');
    });

    it('includes orchestration statement', () => {
      const text = getProviderDisclaimerText('PayFast');
      expect(text).toContain('Architex orchestrates payment approvals, certifications, and audit trails');
      expect(text).toContain('registered third-party financial service providers');
    });

    it('uses default provider name when no name is provided', () => {
      const text = getProviderDisclaimerText();
      expect(text).toContain(DEFAULT_PROVIDER_NAME);
    });

    it('uses default provider name when empty string is provided', () => {
      const text = getProviderDisclaimerText('');
      expect(text).toContain(DEFAULT_PROVIDER_NAME);
    });

    it('uses default provider name when whitespace-only string is provided', () => {
      const text = getProviderDisclaimerText('   ');
      expect(text).toContain(DEFAULT_PROVIDER_NAME);
    });

    it('trims whitespace from provider name', () => {
      const text = getProviderDisclaimerText('  PayFast  ');
      expect(text).toContain('All funds are held and processed by PayFast.');
    });
  });

  describe('isValidProviderName', () => {
    it('returns true for a non-empty string', () => {
      expect(isValidProviderName('PayFast')).toBe(true);
    });

    it('returns true for a string with content and surrounding whitespace', () => {
      expect(isValidProviderName('  Yoco Payments  ')).toBe(true);
    });

    it('returns false for an empty string', () => {
      expect(isValidProviderName('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(isValidProviderName('   ')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isValidProviderName(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isValidProviderName(undefined)).toBe(false);
    });

    it('returns false for a number', () => {
      expect(isValidProviderName(123)).toBe(false);
    });
  });

  describe('DEFAULT_PROVIDER_NAME', () => {
    it('is a non-empty string', () => {
      expect(DEFAULT_PROVIDER_NAME.length).toBeGreaterThan(0);
    });

    it('is a generic descriptor for unknown providers', () => {
      expect(DEFAULT_PROVIDER_NAME).toBe('the registered third-party financial service provider');
    });
  });
});
