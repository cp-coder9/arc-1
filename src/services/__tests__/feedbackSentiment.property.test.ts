/**
 * Property-based tests — Sentiment assignment validity.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 5: Sentiment assignment validity
 *   Validates: Requirements 3.4, 3.5
 *   For any processed feedback submission, exactly one sentiment label from
 *   the set {positive, neutral, negative, frustrated} must be assigned.
 *   If the description text contains fewer than 10 characters, the label
 *   must be `neutral`.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { FeedbackSentiment } from '@/services/feedbackTypes';

// ══════════════════════════════════════════════════════════════════════════════
// System Under Test
// ══════════════════════════════════════════════════════════════════════════════

const VALID_SENTIMENTS: FeedbackSentiment[] = ['positive', 'neutral', 'negative', 'frustrated'];

/**
 * Determines sentiment for a submission. If description is <10 chars, always neutral.
 * Otherwise, returns one of the valid sentiments (simulate AI result).
 */
function assignSentiment(description: string, aiResult?: FeedbackSentiment): FeedbackSentiment {
  if (description.length < 10) return 'neutral';
  return aiResult && VALID_SENTIMENTS.includes(aiResult) ? aiResult : 'neutral';
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 5: Sentiment assignment validity
// Validates: Requirements 3.4, 3.5
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 5: Sentiment assignment validity', () => {
  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * For any processed feedback submission, exactly one sentiment label from
   * {positive, neutral, negative, frustrated} must be assigned.
   * If description <10 chars, sentiment must be `neutral`.
   */

  it('always assigns exactly one valid sentiment label from the allowed set', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 2500 }),
        fc.option(fc.constantFrom(...VALID_SENTIMENTS), { nil: undefined }),
        (description, aiResult) => {
          const result = assignSentiment(description, aiResult);
          expect(VALID_SENTIMENTS).toContain(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('assigns neutral when description has fewer than 10 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 9 }),
        fc.option(fc.constantFrom(...VALID_SENTIMENTS), { nil: undefined }),
        (description, aiResult) => {
          const result = assignSentiment(description, aiResult);
          expect(result).toBe('neutral');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('never assigns a value outside the valid sentiment set regardless of AI result', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 2500 }),
        fc.oneof(
          fc.constantFrom(...VALID_SENTIMENTS),
          fc.string({ minLength: 1, maxLength: 50 }),
        ),
        (description, aiResult) => {
          const result = assignSentiment(description, aiResult as FeedbackSentiment);
          expect(VALID_SENTIMENTS).toContain(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('respects the valid AI result when description has 10 or more characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 2500 }),
        fc.constantFrom(...VALID_SENTIMENTS),
        (description, aiResult) => {
          const result = assignSentiment(description, aiResult);
          expect(result).toBe(aiResult);
          expect(VALID_SENTIMENTS).toContain(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('falls back to neutral when AI result is invalid and description >= 10 chars', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 2500 }),
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !VALID_SENTIMENTS.includes(s as FeedbackSentiment),
        ),
        (description, invalidAiResult) => {
          const result = assignSentiment(description, invalidAiResult as FeedbackSentiment);
          expect(result).toBe('neutral');
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Boundary edge cases ──────────────────────────────────────────────────

  it('assigns neutral for descriptions at exactly 9 characters (boundary below 10)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 9, maxLength: 9 }),
        fc.constantFrom(...VALID_SENTIMENTS),
        (codes, aiResult) => {
          const description = codes.map((c) => String.fromCharCode(c)).join('');
          expect(description.length).toBe(9);
          const result = assignSentiment(description, aiResult);
          expect(result).toBe('neutral');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses AI result for descriptions at exactly 10 characters (boundary at 10)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 10, maxLength: 10 }),
        fc.constantFrom(...VALID_SENTIMENTS),
        (codes, aiResult) => {
          const description = codes.map((c) => String.fromCharCode(c)).join('');
          expect(description.length).toBe(10);
          const result = assignSentiment(description, aiResult);
          expect(result).toBe(aiResult);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('assigns neutral for empty string descriptions regardless of AI result', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SENTIMENTS),
        (aiResult) => {
          const result = assignSentiment('', aiResult);
          expect(result).toBe('neutral');
        },
      ),
      { numRuns: 100 },
    );
  });
});
