/**
 * Property-Based Tests for Clause Reference Format Integrity
 *
 * **Property 1: Clause Reference Format Integrity**
 * Verify all outputs reference clauses by number and title only, no body text exceeding 100 chars.
 * No clause reference contains paragraph-like body text (no sentences with multiple periods,
 * no text exceeding 100 characters).
 *
 * **Validates: Requirements 1.9, 11.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  CONTRACT_FORM_CONFIGS,
  type ContractFormConfig,
  type ContractNoticeType,
  type ClauseResponsePeriod,
  type EoTNotificationRule,
  type PaymentIntervalConfig,
} from '../contractFormConfigs';
import type { ContractForm } from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const CONTRACT_FORMS: ContractForm[] = ['jbcc_pba', 'nec_ecc', 'gcc_2025', 'fidic'];

/** Max allowed length for a clauseTitle (no paragraph-like body text) */
const MAX_CLAUSE_TITLE_LENGTH = 100;

/**
 * Pattern for valid clause numbers:
 * - digits and dots (e.g., "23.1", "20.2.1", "10.0")
 * - optional leading letter prefix (e.g., "W1.3", "W1.1")
 */
const CLAUSE_NUMBER_PATTERN = /^[A-Z]?\d+(\.\d+)*$/;

/**
 * Paragraph-like body text indicators:
 * - Multiple sentence-ending periods followed by a space and uppercase letter
 * - Text that reads like a contractual paragraph rather than a short title
 */
const PARAGRAPH_PATTERN = /\.\s+[A-Z][a-z]/;

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Extract all clause references from a ContractFormConfig */
function extractAllClauseReferences(config: ContractFormConfig): Array<{
  source: string;
  clauseNumber: string;
  clauseTitle: string;
}> {
  const refs: Array<{ source: string; clauseNumber: string; clauseTitle: string }> = [];

  // From notice types
  for (const nt of config.noticeTypes) {
    refs.push({
      source: `noticeTypes[${nt.id}]`,
      clauseNumber: nt.clauseNumber,
      clauseTitle: nt.clauseTitle,
    });
  }

  // From clause response periods
  for (const crp of config.clauseResponsePeriods) {
    refs.push({
      source: `clauseResponsePeriods[${crp.clauseNumber}]`,
      clauseNumber: crp.clauseNumber,
      clauseTitle: crp.clauseTitle,
    });
  }

  // From payment interval
  refs.push({
    source: 'paymentInterval',
    clauseNumber: config.paymentInterval.clauseNumber,
    clauseTitle: config.paymentInterval.clauseTitle,
  });

  // From EoT notification rule
  refs.push({
    source: 'eotNotificationRule',
    clauseNumber: config.eotNotificationRule.clauseNumber,
    clauseTitle: config.eotNotificationRule.clauseTitle,
  });

  return refs;
}

// ══════════════════════════════════════════════════════════════════════════════
// Arbitraries (Generators)
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a random contract form selection */
const contractFormArb: fc.Arbitrary<ContractForm> = fc.constantFrom(...CONTRACT_FORMS);

/**
 * Generate a random index into an array.
 * Used to randomly select items from config arrays for deeper inspection.
 */
function indexArb(maxExclusive: number): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: Math.max(0, maxExclusive - 1) });
}

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 1: Clause Reference Format Integrity', () => {
  it('all clauseNumbers in CONTRACT_FORM_CONFIGS match the valid clause number pattern', () => {
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];
        const refs = extractAllClauseReferences(config);

        for (const ref of refs) {
          expect(
            CLAUSE_NUMBER_PATTERN.test(ref.clauseNumber),
            `Invalid clauseNumber "${ref.clauseNumber}" in ${form}/${ref.source} — ` +
              `must match pattern: digits and dots, optionally prefixed with a letter (e.g., "23.1", "W1.3", "20.2.1")`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('no clauseTitle in CONTRACT_FORM_CONFIGS exceeds 100 characters', () => {
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];
        const refs = extractAllClauseReferences(config);

        for (const ref of refs) {
          expect(
            ref.clauseTitle.length,
            `clauseTitle too long (${ref.clauseTitle.length} chars) in ${form}/${ref.source}: ` +
              `"${ref.clauseTitle}" — must not exceed ${MAX_CLAUSE_TITLE_LENGTH} chars`
          ).toBeLessThanOrEqual(MAX_CLAUSE_TITLE_LENGTH);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('no clauseTitle contains paragraph-like body text (multiple sentences)', () => {
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];
        const refs = extractAllClauseReferences(config);

        for (const ref of refs) {
          expect(
            PARAGRAPH_PATTERN.test(ref.clauseTitle),
            `clauseTitle in ${form}/${ref.source} appears to contain paragraph body text: ` +
              `"${ref.clauseTitle}" — clause references must be descriptive titles only, not reproduced clause text`
          ).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('randomly selected notice types have valid clause reference format', () => {
    fc.assert(
      fc.property(
        contractFormArb.chain((form) => {
          const config = CONTRACT_FORM_CONFIGS[form];
          const maxIdx = config.noticeTypes.length;
          return fc.tuple(fc.constant(form), indexArb(maxIdx));
        }),
        ([form, idx]) => {
          const config = CONTRACT_FORM_CONFIGS[form];
          const noticeType: ContractNoticeType = config.noticeTypes[idx];

          // Clause number matches pattern
          expect(CLAUSE_NUMBER_PATTERN.test(noticeType.clauseNumber)).toBe(true);

          // Clause title is within length limit
          expect(noticeType.clauseTitle.length).toBeLessThanOrEqual(MAX_CLAUSE_TITLE_LENGTH);

          // Clause title has no paragraph-like body text
          expect(PARAGRAPH_PATTERN.test(noticeType.clauseTitle)).toBe(false);

          // Clause title is non-empty and descriptive (at least 3 chars)
          expect(noticeType.clauseTitle.length).toBeGreaterThanOrEqual(3);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('randomly selected clause response periods have valid clause reference format', () => {
    fc.assert(
      fc.property(
        contractFormArb.chain((form) => {
          const config = CONTRACT_FORM_CONFIGS[form];
          const maxIdx = config.clauseResponsePeriods.length;
          return fc.tuple(fc.constant(form), indexArb(maxIdx));
        }),
        ([form, idx]) => {
          const config = CONTRACT_FORM_CONFIGS[form];
          const crp: ClauseResponsePeriod = config.clauseResponsePeriods[idx];

          // Clause number matches pattern
          expect(CLAUSE_NUMBER_PATTERN.test(crp.clauseNumber)).toBe(true);

          // Clause title is within length limit
          expect(crp.clauseTitle.length).toBeLessThanOrEqual(MAX_CLAUSE_TITLE_LENGTH);

          // Clause title has no paragraph-like body text
          expect(PARAGRAPH_PATTERN.test(crp.clauseTitle)).toBe(false);

          // Clause title is non-empty and descriptive
          expect(crp.clauseTitle.length).toBeGreaterThanOrEqual(3);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('EoT notification rules across all forms have valid clause reference format', () => {
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];
        const rule: EoTNotificationRule = config.eotNotificationRule;

        // Clause number matches pattern
        expect(CLAUSE_NUMBER_PATTERN.test(rule.clauseNumber)).toBe(true);

        // Clause title is within length limit
        expect(rule.clauseTitle.length).toBeLessThanOrEqual(MAX_CLAUSE_TITLE_LENGTH);

        // Clause title has no paragraph-like body text
        expect(PARAGRAPH_PATTERN.test(rule.clauseTitle)).toBe(false);

        // Clause title is non-empty and descriptive
        expect(rule.clauseTitle.length).toBeGreaterThanOrEqual(3);
      }),
      { numRuns: 100 }
    );
  });

  it('payment interval configs across all forms have valid clause reference format', () => {
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];
        const payment: PaymentIntervalConfig = config.paymentInterval;

        // Clause number matches pattern
        expect(CLAUSE_NUMBER_PATTERN.test(payment.clauseNumber)).toBe(true);

        // Clause title is within length limit
        expect(payment.clauseTitle.length).toBeLessThanOrEqual(MAX_CLAUSE_TITLE_LENGTH);

        // Clause title has no paragraph-like body text
        expect(PARAGRAPH_PATTERN.test(payment.clauseTitle)).toBe(false);

        // Clause title is non-empty and descriptive
        expect(payment.clauseTitle.length).toBeGreaterThanOrEqual(3);
      }),
      { numRuns: 100 }
    );
  });

  it('exhaustive check: every single clause reference across all 4 forms passes integrity constraints', () => {
    // This is a deterministic exhaustive test over all config data, wrapped in fc.assert
    // to confirm the property universally holds across the entire configuration set
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];
        const allRefs = extractAllClauseReferences(config);

        for (const ref of allRefs) {
          // 1. Clause number format
          expect(
            CLAUSE_NUMBER_PATTERN.test(ref.clauseNumber),
            `[${form}] ${ref.source}: clauseNumber "${ref.clauseNumber}" invalid format`
          ).toBe(true);

          // 2. Title length constraint (no body text)
          expect(
            ref.clauseTitle.length,
            `[${form}] ${ref.source}: clauseTitle "${ref.clauseTitle}" exceeds ${MAX_CLAUSE_TITLE_LENGTH} chars`
          ).toBeLessThanOrEqual(MAX_CLAUSE_TITLE_LENGTH);

          // 3. No paragraph-like body text
          expect(
            PARAGRAPH_PATTERN.test(ref.clauseTitle),
            `[${form}] ${ref.source}: clauseTitle contains paragraph text`
          ).toBe(false);

          // 4. Title is descriptive (not just whitespace or single char)
          expect(
            ref.clauseTitle.trim().length,
            `[${form}] ${ref.source}: clauseTitle is empty or whitespace-only`
          ).toBeGreaterThanOrEqual(3);

          // 5. No copyrighted clause body reproduction indicator:
          //    Clause titles should not end with punctuation typical of legal clauses (period, semicolon)
          //    which would indicate reproduced text rather than a descriptive title
          const endsWithLegalPunctuation = /[;:]$/.test(ref.clauseTitle.trim());
          expect(
            endsWithLegalPunctuation,
            `[${form}] ${ref.source}: clauseTitle "${ref.clauseTitle}" ends with legal punctuation, suggesting reproduced clause text`
          ).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});
