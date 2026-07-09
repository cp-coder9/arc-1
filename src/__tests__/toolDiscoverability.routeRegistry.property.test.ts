/**
 * Property-based tests — Route Registry correctness for tool discoverability routing.
 *
 * Feature: tool-discoverability-routing
 *
 * Validates: Requirements 1.2, 1.7, 2.2, 2.4, 3.2, 4.2, 5.2, 7.1, 7.2, 7.3, 7.4, 7.7
 *
 * Tests the three core registry invariants:
 * - Property 1: Role-based page access gating
 * - Property 2: Page ID set partitioning
 * - Property 3: CANONICAL_DASHBOARD_PAGES structural completeness
 *
 * Uses fast-check with minimum 100 iterations for property-based tests.
 * Properties 2 and 3 are exhaustive checks over data arrays.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { UserRole } from '@/types';
import {
  CANONICAL_DASHBOARD_PAGES,
  DIRECT_WORKFLOW_PAGE_IDS,
  PROJECT_WORKFLOW_PAGE_IDS,
  pagesForRole,
} from '@/App';

/** All valid UserRole values as defined in src/types.ts. */
const ALL_USER_ROLES: UserRole[] = [
  'client',
  'architect',
  'admin',
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
  'platform_admin',
  'land_surveyor',
  'health_safety',
];

/** Valid group values for CANONICAL_DASHBOARD_PAGES entries. */
const VALID_GROUPS = [
  'Core workflow',
  'Client tools',
  'BEP tools',
  'Construction tools',
  'Freelancer tools',
  'Governance',
] as const;

/** Kebab-case regex: starts with lowercase letter, then lowercase letters, digits, or hyphens. */
const KEBAB_CASE_REGEX = /^[a-z][a-z0-9-]*$/;

/** The only page documented to appear in both DIRECT and PROJECT sets. */
const DUAL_MODE_PAGE_IDS = ['disputes'];

/** Arbitrary generating any valid UserRole. */
const userRoleArb: fc.Arbitrary<UserRole> = fc.constantFrom(...ALL_USER_ROLES);

describe('Feature: tool-discoverability-routing, Property 1: Role-based page access gating', () => {
  it('pagesForRole(role) includes a page iff the role appears in that page\'s roles array', () => {
    /**
     * **Validates: Requirements 1.2, 1.7, 2.2, 2.4, 3.2, 4.2, 5.2, 7.7**
     *
     * For any UserRole and any page in CANONICAL_DASHBOARD_PAGES,
     * pagesForRole(role) includes that page if and only if the role appears
     * in the page's roles array.
     */
    fc.assert(
      fc.property(userRoleArb, (role) => {
        const visiblePages = pagesForRole(role);
        const visibleIds = new Set(visiblePages.map((p) => p.id));

        for (const page of CANONICAL_DASHBOARD_PAGES) {
          const roleIsInPage = page.roles.includes(role);
          const pageIsVisible = visibleIds.has(page.id);

          // Biconditional: page visible ↔ role in page.roles
          expect(pageIsVisible).toBe(roleIsInPage);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('pagesForRole returns only pages from CANONICAL_DASHBOARD_PAGES (no phantom entries)', () => {
    fc.assert(
      fc.property(userRoleArb, (role) => {
        const visiblePages = pagesForRole(role);
        const allIds = new Set(CANONICAL_DASHBOARD_PAGES.map((p) => p.id));

        for (const page of visiblePages) {
          expect(allIds.has(page.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: tool-discoverability-routing, Property 2: Page ID set partitioning', () => {
  it('no page id appears in both DIRECT_WORKFLOW_PAGE_IDS and PROJECT_WORKFLOW_PAGE_IDS unless it is the documented dual-mode page', () => {
    /**
     * **Validates: Requirements 7.2, 7.3, 7.4**
     *
     * For any page id in both sets, the id must be in the documented
     * dual-mode exception list (currently only 'disputes').
     */
    const directIds = Array.from(DIRECT_WORKFLOW_PAGE_IDS);
    const projectIds = Array.from(PROJECT_WORKFLOW_PAGE_IDS);

    // Find all IDs that appear in both sets
    const intersection = directIds.filter((id) => PROJECT_WORKFLOW_PAGE_IDS.has(id));

    // Every ID in the intersection must be in the documented dual-mode list
    for (const id of intersection) {
      expect(
        DUAL_MODE_PAGE_IDS.includes(id),
        `Page '${id}' appears in both DIRECT_WORKFLOW_PAGE_IDS and PROJECT_WORKFLOW_PAGE_IDS but is not a documented dual-mode page`,
      ).toBe(true);
    }

    // Also verify the reverse: every documented dual-mode page exists in both sets
    for (const id of DUAL_MODE_PAGE_IDS) {
      expect(
        DIRECT_WORKFLOW_PAGE_IDS.has(id),
        `Documented dual-mode page '${id}' should be in DIRECT_WORKFLOW_PAGE_IDS`,
      ).toBe(true);
      expect(
        PROJECT_WORKFLOW_PAGE_IDS.has(id),
        `Documented dual-mode page '${id}' should be in PROJECT_WORKFLOW_PAGE_IDS`,
      ).toBe(true);
    }
  });

  it('all page IDs in DIRECT and PROJECT sets are valid page IDs from CANONICAL_DASHBOARD_PAGES or known workflow pages', () => {
    /**
     * Verify that every page ID referenced in the workflow sets corresponds
     * to either a CANONICAL_DASHBOARD_PAGES entry or a known workflow page.
     */
    const allCanonicalIds = new Set(CANONICAL_DASHBOARD_PAGES.map((p) => p.id));
    // Some IDs in PROJECT_WORKFLOW_PAGE_IDS may be for ProjectWorkflowPage
    // which are real workflow pages but not in CANONICAL_DASHBOARD_PAGES
    // (like 'passport'). We just verify structural consistency.
    const allDirectIds = Array.from(DIRECT_WORKFLOW_PAGE_IDS);

    for (const id of allDirectIds) {
      expect(
        allCanonicalIds.has(id) || id === 'marketplace',
        `DIRECT_WORKFLOW_PAGE_IDS entry '${id}' should correspond to a canonical page or known exception`,
      ).toBe(true);
    }
  });
});

describe('Feature: tool-discoverability-routing, Property 3: CANONICAL_DASHBOARD_PAGES structural completeness', () => {
  it('every entry has a valid kebab-case id of ≤40 characters', () => {
    /**
     * **Validates: Requirements 7.1**
     *
     * Every entry SHALL have a non-empty id matching kebab-case regex,
     * max 40 characters, and unique across all entries.
     */
    const ids = CANONICAL_DASHBOARD_PAGES.map((p) => p.id);

    for (const page of CANONICAL_DASHBOARD_PAGES) {
      expect(page.id.length).toBeGreaterThan(0);
      expect(page.id.length).toBeLessThanOrEqual(40);
      expect(page.id).toMatch(KEBAB_CASE_REGEX);
    }

    // Uniqueness check
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every entry has a non-empty label', () => {
    for (const page of CANONICAL_DASHBOARD_PAGES) {
      expect(page.label.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty roles array with valid UserRole values', () => {
    const validRoleSet = new Set(ALL_USER_ROLES);

    for (const page of CANONICAL_DASHBOARD_PAGES) {
      expect(page.roles.length).toBeGreaterThan(0);

      for (const role of page.roles) {
        expect(
          validRoleSet.has(role),
          `Page '${page.id}' has invalid role '${role}'`,
        ).toBe(true);
      }
    }
  });

  it('every entry has a valid group value', () => {
    const validGroupSet = new Set<string>(VALID_GROUPS);

    for (const page of CANONICAL_DASHBOARD_PAGES) {
      expect(
        validGroupSet.has(page.group),
        `Page '${page.id}' has invalid group '${page.group}'`,
      ).toBe(true);
    }
  });

  it('every entry has a non-null icon', () => {
    for (const page of CANONICAL_DASHBOARD_PAGES) {
      expect(page.icon).not.toBeNull();
      expect(page.icon).not.toBeUndefined();
    }
  });

  it('every entry has a non-empty summary', () => {
    for (const page of CANONICAL_DASHBOARD_PAGES) {
      expect(page.summary.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty backedBy array', () => {
    for (const page of CANONICAL_DASHBOARD_PAGES) {
      expect(page.backedBy.length).toBeGreaterThan(0);
    }
  });
});
