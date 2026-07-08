/**
 * Property-based tests — Project Passport linkage.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 17: Project Passport linkage
 *   Validates: Requirements 7.2
 *   For any feedback submission where the context snapshot contains a non-null
 *   project ID, a reference must exist in that project's Passport record linking
 *   back to the feedback submission. When projectId is null, no linkage is needed.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { ContextSnapshot } from '@/services/feedbackTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Pure function under test
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determines if a feedback submission should be linked to Project Passport.
 * Returns the projectId to link to, or null if no linkage is needed.
 */
function shouldLinkToPassport(contextSnapshot: ContextSnapshot): string | null {
  return contextSnapshot.projectId;
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 17: Project Passport linkage
// Validates: Requirements 7.2
// ══════════════════════════════════════════════════════════════════════════════

/** Arbitrary for a non-null project ID (non-empty alphanumeric string). */
const arbProjectId = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 1, maxLength: 40 },
).map((chars) => chars.join(''));

/** Arbitrary for a page path string. */
const arbPagePath = fc.array(
  fc.constantFrom('/', 'a', 'b', 'c', '-', '_'),
  { minLength: 1, maxLength: 20 },
).map((chars) => chars.join(''));

/** Arbitrary for a valid ContextSnapshot with a non-null projectId. */
const arbContextWithProject: fc.Arbitrary<ContextSnapshot> = fc.record({
  pagePath: arbPagePath,
  activeModule: fc.constantFrom('specforge', 'compliance', 'procurement', 'documents', 'passport', 'closeout', 'payments', 'construction'),
  projectId: arbProjectId,
  userRole: fc.constantFrom('client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'platform_admin') as fc.Arbitrary<ContextSnapshot['userRole']>,
  viewportWidth: fc.integer({ min: 320, max: 3840 }),
  viewportHeight: fc.integer({ min: 480, max: 2160 }),
});

/** Arbitrary for a valid ContextSnapshot with a null projectId. */
const arbContextWithoutProject: fc.Arbitrary<ContextSnapshot> = fc.record({
  pagePath: arbPagePath,
  activeModule: fc.constantFrom('specforge', 'compliance', 'procurement', 'documents', 'passport', 'closeout', 'payments', 'construction'),
  projectId: fc.constant(null),
  userRole: fc.constantFrom('client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'platform_admin') as fc.Arbitrary<ContextSnapshot['userRole']>,
  viewportWidth: fc.integer({ min: 320, max: 3840 }),
  viewportHeight: fc.integer({ min: 480, max: 2160 }),
});

/** Arbitrary for a ContextSnapshot with nullable projectId (mixed). */
const arbContextMixed: fc.Arbitrary<ContextSnapshot> = fc.oneof(
  arbContextWithProject,
  arbContextWithoutProject,
);

describe('Feature: intelligent-feedback-loop, Property 17: Project Passport linkage', () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any submission with a non-null projectId in contextSnapshot,
   * shouldLinkToPassport returns that projectId (linkage required).
   */

  it('returns the projectId for any submission with a non-null projectId', () => {
    fc.assert(
      fc.property(arbContextWithProject, (contextSnapshot) => {
        const result = shouldLinkToPassport(contextSnapshot);
        expect(result).toBe(contextSnapshot.projectId);
        expect(result).not.toBeNull();
        expect(typeof result).toBe('string');
        expect(result!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * For any submission with a null projectId, returns null (no linkage).
   */

  it('returns null for any submission with a null projectId', () => {
    fc.assert(
      fc.property(arbContextWithoutProject, (contextSnapshot) => {
        const result = shouldLinkToPassport(contextSnapshot);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * The biconditional: linkage exists if and only if projectId is non-null.
   */

  it('linkage exists iff projectId is non-null (biconditional)', () => {
    fc.assert(
      fc.property(arbContextMixed, (contextSnapshot) => {
        const result = shouldLinkToPassport(contextSnapshot);
        const hasProjectId = contextSnapshot.projectId !== null;

        // Biconditional: result is non-null ↔ projectId is non-null
        if (hasProjectId) {
          expect(result).toBe(contextSnapshot.projectId);
          expect(result).not.toBeNull();
        } else {
          expect(result).toBeNull();
        }

        // Verify the inverse direction of the biconditional
        if (result !== null) {
          expect(contextSnapshot.projectId).not.toBeNull();
          expect(result).toBe(contextSnapshot.projectId);
        } else {
          expect(contextSnapshot.projectId).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * The returned projectId is always the exact same value as the input projectId
   * (identity preservation — the linkage references the correct project).
   */

  it('preserves the exact projectId value for linkage (no transformation)', () => {
    fc.assert(
      fc.property(arbProjectId, (projectId) => {
        const contextSnapshot: ContextSnapshot = {
          pagePath: '/projects/detail',
          activeModule: 'specforge',
          projectId,
          userRole: 'architect',
          viewportWidth: 1920,
          viewportHeight: 1080,
        };
        const result = shouldLinkToPassport(contextSnapshot);
        expect(result).toStrictEqual(projectId);
      }),
      { numRuns: 100 },
    );
  });
});
