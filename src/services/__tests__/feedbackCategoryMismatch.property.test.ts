/**
 * Property-based tests — Category mismatch detection.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 7: Category mismatch detection
 *   Validates: Requirements 3.7
 *   For any feedback submission where the AI-assigned category differs from
 *   the submitter-selected category, the `categoryMismatch` flag must be `true`.
 *   Where they are equal, the flag must be `false`.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { FeedbackCategory } from '@/services/feedbackTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Pure function under test
// ══════════════════════════════════════════════════════════════════════════════

/** All valid feedback categories. */
const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  'bug',
  'feature_request',
  'usability',
  'praise',
] as const;

/**
 * Determines if the AI-assigned category mismatches the user-selected category.
 */
function detectCategoryMismatch(
  userCategory: FeedbackCategory,
  aiCategory: FeedbackCategory,
): boolean {
  return userCategory !== aiCategory;
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 7: Category mismatch detection
// Validates: Requirements 3.7
// ══════════════════════════════════════════════════════════════════════════════

/** Arbitrary for valid FeedbackCategory values. */
const arbCategory = fc.constantFrom<FeedbackCategory>(...FEEDBACK_CATEGORIES);

describe('Feature: intelligent-feedback-loop, Property 7: Category mismatch detection', () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * For any pair of (userCategory, aiCategory) where both are valid
   * FeedbackCategory values, the categoryMismatch flag must be `true`
   * if and only if userCategory !== aiCategory.
   */

  it('categoryMismatch is true iff userCategory !== aiCategory for any valid category pair', () => {
    fc.assert(
      fc.property(arbCategory, arbCategory, (userCategory, aiCategory) => {
        const result = detectCategoryMismatch(userCategory, aiCategory);
        const expected = userCategory !== aiCategory;
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('categoryMismatch is false when categories are equal', () => {
    fc.assert(
      fc.property(arbCategory, (category) => {
        const result = detectCategoryMismatch(category, category);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('categoryMismatch is true when categories differ', () => {
    fc.assert(
      fc.property(
        arbCategory,
        arbCategory,
        (userCategory, aiCategory) => {
          fc.pre(userCategory !== aiCategory);
          const result = detectCategoryMismatch(userCategory, aiCategory);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('covers all 16 category pairs exhaustively (4×4 grid)', () => {
    for (const userCategory of FEEDBACK_CATEGORIES) {
      for (const aiCategory of FEEDBACK_CATEGORIES) {
        const result = detectCategoryMismatch(userCategory, aiCategory);
        const expected = userCategory !== aiCategory;
        expect(result).toBe(expected);
      }
    }
  });

  it('the biconditional holds: mismatch === true ↔ categories differ', () => {
    fc.assert(
      fc.property(arbCategory, arbCategory, (userCategory, aiCategory) => {
        const mismatch = detectCategoryMismatch(userCategory, aiCategory);
        // Biconditional: mismatch ↔ (userCategory !== aiCategory)
        // This means: (mismatch → differ) AND (differ → mismatch)
        const categoriesDiffer = userCategory !== aiCategory;
        expect(mismatch).toBe(categoriesDiffer);
        // Also verify the inverse
        if (mismatch) {
          expect(userCategory).not.toBe(aiCategory);
        } else {
          expect(userCategory).toBe(aiCategory);
        }
      }),
      { numRuns: 100 },
    );
  });
});
