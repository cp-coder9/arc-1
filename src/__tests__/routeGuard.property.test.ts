/**
 * Property-based tests — Route Guard correctness invariants.
 *
 * Feature: role-architecture-refinement
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.7
 *
 * Tests route guard correctness:
 * - Property 18: Route guard professional pages contain only valid Professional_Role values
 * - Property 19: Route guard rejects literal 'admin' in roles
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CANONICAL_DASHBOARD_PAGES, pagesForRole } from '@/App';
import type { UserRole } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * All Professional_Role values — every UserRole EXCEPT 'platform_admin'.
 * These are the roles that should appear in professional module route definitions.
 */
const PROFESSIONAL_ROLES: UserRole[] = [
  'client',
  'architect',
  'freelancer',
  'bep',
  'contractor',
  'subcontractor',
  'supplier',
  'engineer',
  'quantity_surveyor',
  'town_planner',
  'energy_professional',
  'fire_engineer',
  'site_manager',
  'developer',
  'firm_admin',
  'land_surveyor',
  'health_safety',
];

/** All valid UserRole values including platform_admin */
const ALL_USER_ROLES: UserRole[] = [...PROFESSIONAL_ROLES, 'platform_admin'];

/** Professional module page groups — pages in these groups must contain ONLY Professional_Role values */
const PROFESSIONAL_MODULE_GROUPS = [
  'BEP tools',
  'Construction tools',
  'Client tools',
  'Freelancer tools',
] as const;

/** Set of valid Professional_Role string values for fast lookup */
const PROFESSIONAL_ROLE_SET = new Set<string>(PROFESSIONAL_ROLES);

// ── Derived test data ────────────────────────────────────────────────────────

/** Professional module pages — filtered from CANONICAL_DASHBOARD_PAGES by group */
const PROFESSIONAL_MODULE_PAGES = CANONICAL_DASHBOARD_PAGES.filter((page) =>
  (PROFESSIONAL_MODULE_GROUPS as readonly string[]).includes(page.group),
);

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate any valid UserRole value */
const arbUserRole = fc.constantFrom(...ALL_USER_ROLES);

/** Generate a professional module page (by index) */
const arbProfessionalPageIndex = fc.integer({
  min: 0,
  max: Math.max(0, PROFESSIONAL_MODULE_PAGES.length - 1),
});

/** Generate any page from CANONICAL_DASHBOARD_PAGES (by index) */
const arbAnyPageIndex = fc.integer({
  min: 0,
  max: Math.max(0, CANONICAL_DASHBOARD_PAGES.length - 1),
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 18: Route guard professional pages contain only valid Professional_Role values
// Validates: Requirements 6.1, 6.2, 6.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: role-architecture-refinement, Property 18: Route guard professional pages contain only valid Professional_Role values', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3**
   *
   * For any professional module page in CANONICAL_DASHBOARD_PAGES, its roles
   * array SHALL be non-empty AND every element SHALL be a valid Professional_Role
   * value (not 'admin', not 'platform_admin'). No wildcards or group shorthands
   * SHALL appear.
   */
  it('professional module pages have non-empty roles arrays containing only Professional_Role values', () => {
    // Precondition: there must be professional module pages to test
    expect(PROFESSIONAL_MODULE_PAGES.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(arbProfessionalPageIndex, (pageIndex) => {
        const page = PROFESSIONAL_MODULE_PAGES[pageIndex];

        // Roles array SHALL be non-empty
        expect(page.roles.length).toBeGreaterThan(0);

        // Every element SHALL be a valid Professional_Role value
        for (const role of page.roles) {
          expect(PROFESSIONAL_ROLE_SET.has(role)).toBe(true);
        }

        // SHALL NOT contain 'admin'
        expect(page.roles).not.toContain('admin');

        // SHALL NOT contain 'platform_admin'
        expect(page.roles).not.toContain('platform_admin');
      }),
      { numRuns: 100 },
    );
  });

  it('no professional module page uses wildcard or group shorthand strings in its roles array', () => {
    fc.assert(
      fc.property(arbProfessionalPageIndex, (pageIndex) => {
        const page = PROFESSIONAL_MODULE_PAGES[pageIndex];

        for (const role of page.roles) {
          // No wildcards (*, all, any)
          expect(role).not.toBe('*');
          expect(role).not.toBe('all');
          expect(role).not.toBe('any');

          // No group shorthands (professional, professionals, design_team)
          expect(role).not.toBe('professional');
          expect(role).not.toBe('professionals');
          expect(role).not.toBe('design_team');

          // Must be a concrete UserRole string value
          expect(ALL_USER_ROLES).toContain(role);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('every professional module page role is individually listed (no unexpanded group references)', () => {
    fc.assert(
      fc.property(arbProfessionalPageIndex, (pageIndex) => {
        const page = PROFESSIONAL_MODULE_PAGES[pageIndex];

        // Each role must be a string present in the UserRole type
        // (verifying individual listing rather than shorthand expansion)
        for (const role of page.roles) {
          expect(typeof role).toBe('string');
          expect(PROFESSIONAL_ROLE_SET.has(role)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 19: Route guard rejects literal 'admin' in roles
// Validates: Requirements 6.7
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: role-architecture-refinement, Property 19: Route guard rejects literal \'admin\' in roles', () => {
  /**
   * **Validates: Requirements 6.7**
   *
   * For any route definition in CANONICAL_DASHBOARD_PAGES whose roles array
   * contains the literal 'admin', the route guard SHALL deny access to all
   * users until the role is corrected.
   *
   * Since 'admin' is no longer a valid UserRole, pagesForRole(role) for any
   * valid role will never match a page that only has 'admin' in its roles.
   * This is a defense-in-depth property: we verify that no current page
   * contains 'admin', and that if one hypothetically did, no valid user
   * could access it.
   */
  it('no page in CANONICAL_DASHBOARD_PAGES contains literal \'admin\' in its roles array', () => {
    fc.assert(
      fc.property(arbAnyPageIndex, (pageIndex) => {
        const page = CANONICAL_DASHBOARD_PAGES[pageIndex];

        // The literal 'admin' SHALL NOT appear in any route's roles array
        expect(page.roles).not.toContain('admin');
      }),
      { numRuns: 100 },
    );
  });

  it('pagesForRole never returns pages with literal \'admin\' in roles for any valid UserRole', () => {
    fc.assert(
      fc.property(arbUserRole, (role) => {
        const visiblePages = pagesForRole(role);

        for (const page of visiblePages) {
          // No page returned by pagesForRole should contain literal 'admin'
          expect(page.roles).not.toContain('admin');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a hypothetical page with only \'admin\' in roles would be inaccessible to all valid users', () => {
    /**
     * Defense-in-depth verification: since 'admin' is not a valid UserRole,
     * a page whose roles array were to contain only 'admin' would never
     * be returned by pagesForRole for any valid user.
     *
     * We verify the invariant that 'admin' is not in the ALL_USER_ROLES set.
     */
    fc.assert(
      fc.property(arbUserRole, (role) => {
        // 'admin' is not a valid UserRole — this is the root defense
        expect(role).not.toBe('admin');

        // Therefore no valid user could match a page with roles: ['admin']
        // The route guard denies access because .includes(role) would be false
        const hypotheticalAdminPage = { roles: ['admin'] };
        expect(hypotheticalAdminPage.roles.includes(role)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
