import { describe, it, expect } from 'vitest';
import { formatZAR, formatClauseRef, formatTariffRef } from './zaFormatting';

describe('zaFormatting', () => {
  describe('formatZAR', () => {
    it('formats a large amount with thousands separators and 2 decimals', () => {
      const result = formatZAR(1250000);
      // en-ZA locale uses narrow no-break space (U+202F) or non-breaking space (U+00A0)
      // Normalize whitespace for assertion
      const normalized = result.replace(/\s/g, ' ');
      expect(normalized).toBe('R 1 250 000,00');
    });

    it('formats a small amount with 2 decimal places', () => {
      const result = formatZAR(420.5);
      const normalized = result.replace(/\s/g, ' ');
      expect(normalized).toBe('R 420,50');
    });

    it('formats zero', () => {
      const result = formatZAR(0);
      const normalized = result.replace(/\s/g, ' ');
      expect(normalized).toBe('R 0,00');
    });

    it('formats a value with exact cents', () => {
      const result = formatZAR(99.99);
      const normalized = result.replace(/\s/g, ' ');
      expect(normalized).toBe('R 99,99');
    });

    it('rounds to 2 decimal places', () => {
      const result = formatZAR(100.999);
      const normalized = result.replace(/\s/g, ' ');
      expect(normalized).toBe('R 101,00');
    });
  });

  describe('formatClauseRef', () => {
    it('formats a SANS 10400-XA clause reference', () => {
      expect(formatClauseRef('10400', 'XA', '4.3.2')).toBe('SANS 10400-XA 4.3.2');
    });

    it('formats a SANS 10400-N clause reference', () => {
      expect(formatClauseRef('10400', 'N', '3.1')).toBe('SANS 10400-N 3.1');
    });

    it('formats a SANS 10400-T clause reference', () => {
      expect(formatClauseRef('10400', 'T', '5.2.1')).toBe('SANS 10400-T 5.2.1');
    });
  });

  describe('formatTariffRef', () => {
    it('formats a SACAP tariff reference', () => {
      expect(formatTariffRef('SACAP', 2024, '12345')).toBe('SACAP 2024 GG No. 12345');
    });

    it('formats an ECSA tariff reference', () => {
      expect(formatTariffRef('ECSA', 2024, '12346')).toBe('ECSA 2024 GG No. 12346');
    });

    it('formats a SACQSP tariff reference', () => {
      expect(formatTariffRef('SACQSP', 2023, '11000')).toBe('SACQSP 2023 GG No. 11000');
    });
  });
});
