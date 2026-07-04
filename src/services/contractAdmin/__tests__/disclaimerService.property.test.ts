/**
 * Property 16: Disclaimer Presence on Generated Outputs
 *
 * For any generated output document (payment schedule PDF, deadline calculation
 * report, claim summary, or notice document), the output SHALL contain a
 * disclaimer footer string that includes the phrases "advisory",
 * "does not constitute legal advice", and "professional review".
 *
 * **Validates: Requirements 11.2, 11.4**
 *
 * Feature: contract-administration, Property 16: Disclaimer Presence on Generated Outputs
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getDocumentDisclaimerFooter,
  getDisclaimerBannerText,
  isDeemedOutcomeDisclaimer,
  validateDisclaimerPresence,
} from '../disclaimerService';

const REQUIRED_PHRASES = [
  'advisory',
  'does not constitute legal advice',
  'professional review',
] as const;

describe('Feature: contract-administration, Property 16: Disclaimer Presence on Generated Outputs', () => {
  describe('getDocumentDisclaimerFooter() contains all required phrases', () => {
    it('should always contain "advisory", "does not constitute legal advice", and "professional review"', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const footer = getDocumentDisclaimerFooter();
          const lowerFooter = footer.toLowerCase();

          for (const phrase of REQUIRED_PHRASES) {
            expect(lowerFooter).toContain(phrase);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('getDisclaimerBannerText() contains all required phrases', () => {
    it('should always contain "advisory", "does not constitute legal advice", and "professional review"', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const banner = getDisclaimerBannerText();
          const lowerBanner = banner.toLowerCase();

          for (const phrase of REQUIRED_PHRASES) {
            expect(lowerBanner).toContain(phrase);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('isDeemedOutcomeDisclaimer() contains all required phrases', () => {
    it('should always contain "advisory", "does not constitute legal advice", and "professional review"', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const disclaimer = isDeemedOutcomeDisclaimer();
          const lowerDisclaimer = disclaimer.toLowerCase();

          for (const phrase of REQUIRED_PHRASES) {
            expect(lowerDisclaimer).toContain(phrase);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('validateDisclaimerPresence returns true for strings containing all required phrases', () => {
    it('should return true for any string containing all three required phrases', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.string({ minLength: 0, maxLength: 200 }),
          (prefix, between1, between2, suffix) => {
            const output =
              prefix +
              'advisory' +
              between1 +
              'does not constitute legal advice' +
              between2 +
              'professional review' +
              suffix;

            expect(validateDisclaimerPresence(output)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('validateDisclaimerPresence returns false when at least one phrase is missing', () => {
    it('should return false for any string missing at least one required phrase', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }).filter((s) => {
            const lower = s.toLowerCase();
            // At least one required phrase must be absent
            return !REQUIRED_PHRASES.every((phrase) => lower.includes(phrase));
          }),
          (output) => {
            expect(validateDisclaimerPresence(output)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Appending disclaimer footer to any string always passes validation', () => {
    it('should pass validation for any random content with the disclaimer footer appended', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 1000 }),
          (randomContent) => {
            const footer = getDocumentDisclaimerFooter();
            const documentWithFooter = randomContent + '\n\n' + footer;

            expect(validateDisclaimerPresence(documentWithFooter)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
