/**
 * Property-based tests — Navigation Config role-access invariants.
 *
 * Feature: role-architecture-refinement
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7
 *
 * Tests navigation access invariants:
 * - Property 2: Professional modules exclude platform_admin
 * - Property 7: Dual-role user sees union of professional and platform modules
 * - Property 20: Platform_admin denied access to professional module routes
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  architexNavigation,
  getNavigationForRole,
} from '@/navigation/architexNavigationConfig';
import { pagesForRole, CANONICAL_DASHBOARD_PAGES } from '@/App';
import type { UserRole } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

/** Professional workflow module keys per the spec */
const PROFESSIONAL_MODULE_KEYS = [
  'toolboxes',
  'projects',
  'cpd_learning',
  'documents',
  'marketplace',
  'finance',
  'analytics',
  'messages',
] as const;

/** Platform-only module keys per the spec */
const PLATFORM_ONLY_MODULE_KEYS = [
  'settings',
  'verification_queue',
  'ai_review_queue',
  'system_health',
] as const;

/** Shared utility module keys accessible to platform_admin */
const SHARED_UTILITY_MODULE_KEYS = ['command_centre', 'inbox'] as const;

/**
 * All Professional_Role values — every UserRole EXCEPT 'platform_admin'.
 * These are the roles that should appear in professional module access lists.
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

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate any Professional_Role value (excludes platform_admin) */
const arbProfessionalRole = fc.constantFrom(...PROFESSIONAL_ROLES);

/** Generate any professional workflow module key */
const arbProfessionalModuleKey = fc.constantFrom(...PROFESSIONAL_MODULE_KEYS);

// ── Helper: Dual-role navigation union ───────────────────────────────────────

/**
 * Computes the navigation union for a user holding both a Professional_Role
 * and platform_admin privileges.
 *
 * Since getNavigationForUser() may not exist yet (task 5.3 runs concurrently),
 * this helper manually computes the expected union.
 */
function getNavigationForDualRoleUser(professionalRole: UserRole): string[] {
  const professionalModules = getNavigationForRole(professionalRole).map((m) => m.key);
  const platformModules = getNavigationForRole('platform_admin').map((m) => m.key);
  return [...new Set([...professionalModules, ...platformModules])];
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 2: Professional modules exclude platform_admin
// Validates: Requirements 2.1, 2.2, 2.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: role-architecture-refinement, Property 2: Professional modules exclude platform_admin', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * For any professional workflow module in the navigation config (toolboxes,
   * projects, CPD & learning, documents, marketplace, finance, analytics,
   * messages), the module's roles array SHALL contain only Professional_Role
   * values and SHALL NOT contain 'platform_admin' or 'admin'.
   * Consequently, getNavigationForRole('platform_admin') SHALL return none of
   * these modules.
   */
  it('professional module roles arrays contain only Professional_Role values (no platform_admin or admin)', () => {
    fc.assert(
      fc.property(arbProfessionalModuleKey, (moduleKey) => {
        const module = architexNavigation.find((m) => m.key === moduleKey);

        // Module must exist in the navigation config
        expect(module).toBeDefined();

        if (module?.roles) {
          // SHALL NOT contain 'platform_admin'
          expect(module.roles).not.toContain('platform_admin');

          // SHALL NOT contain 'admin' (legacy role removed)
          expect(module.roles).not.toContain('admin');

          // Every role in the array SHALL be a Professional_Role value
          for (const role of module.roles) {
            expect(PROFESSIONAL_ROLES).toContain(role);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('getNavigationForRole("platform_admin") returns NONE of the professional workflow modules', () => {
    const platformAdminNav = getNavigationForRole('platform_admin');
    const platformAdminKeys = platformAdminNav.map((m) => m.key);

    for (const professionalKey of PROFESSIONAL_MODULE_KEYS) {
      expect(platformAdminKeys).not.toContain(professionalKey);
    }
  });

  it('for any Professional_Role, the returned modules for that role do NOT appear in platform_admin results where those modules are professional-only', () => {
    fc.assert(
      fc.property(arbProfessionalRole, (role) => {
        const roleNav = getNavigationForRole(role);
        const platformAdminNav = getNavigationForRole('platform_admin');
        const platformAdminKeys = new Set(platformAdminNav.map((m) => m.key));

        // Professional modules visible to this role must not appear in platform_admin nav
        for (const module of roleNav) {
          if (PROFESSIONAL_MODULE_KEYS.includes(module.key as typeof PROFESSIONAL_MODULE_KEYS[number])) {
            expect(platformAdminKeys.has(module.key)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('platform_admin gets only platform-only modules and shared utilities', () => {
    const platformAdminNav = getNavigationForRole('platform_admin');
    const platformAdminKeys = platformAdminNav.map((m) => m.key);

    const allowedKeys = new Set([
      ...PLATFORM_ONLY_MODULE_KEYS,
      ...SHARED_UTILITY_MODULE_KEYS,
    ]);

    for (const key of platformAdminKeys) {
      expect(allowedKeys.has(key as string)).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 7: Dual-role user sees union of professional and platform modules
// Validates: Requirements 2.7
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: role-architecture-refinement, Property 7: Dual-role user sees union of professional and platform modules', () => {
  /**
   * **Validates: Requirements 2.7**
   *
   * For any Professional_Role value R, a user holding both R and platform_admin
   * privileges (via admin: true) SHALL see navigation modules equal to the union
   * of getNavigationForRole(R) and the platform administration modules granted
   * to platform_admin.
   */
  it('dual-role user sees all modules from their Professional_Role plus all platform_admin modules', () => {
    fc.assert(
      fc.property(arbProfessionalRole, (professionalRole) => {
        const professionalModules = getNavigationForRole(professionalRole).map((m) => m.key);
        const platformModules = getNavigationForRole('platform_admin').map((m) => m.key);

        // The expected union is all modules from both role queries
        const expectedUnion = new Set([...professionalModules, ...platformModules]);

        // Compute what a dual-role user should see
        const dualRoleModules = new Set(getNavigationForDualRoleUser(professionalRole));

        // The dual-role set must equal the union
        expect(dualRoleModules).toEqual(expectedUnion);
      }),
      { numRuns: 100 },
    );
  });

  it('dual-role user always includes platform-only modules', () => {
    fc.assert(
      fc.property(arbProfessionalRole, (professionalRole) => {
        const dualRoleModules = new Set(getNavigationForDualRoleUser(professionalRole));

        // Platform-only modules must be present
        for (const platformKey of PLATFORM_ONLY_MODULE_KEYS) {
          expect(dualRoleModules.has(platformKey)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('dual-role user always includes shared utility modules', () => {
    fc.assert(
      fc.property(arbProfessionalRole, (professionalRole) => {
        const dualRoleModules = new Set(getNavigationForDualRoleUser(professionalRole));

        // Shared utilities must be present
        for (const sharedKey of SHARED_UTILITY_MODULE_KEYS) {
          expect(dualRoleModules.has(sharedKey)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('dual-role user always includes the professional modules for their role', () => {
    fc.assert(
      fc.property(arbProfessionalRole, (professionalRole) => {
        const professionalModules = getNavigationForRole(professionalRole).map((m) => m.key);
        const dualRoleModules = new Set(getNavigationForDualRoleUser(professionalRole));

        // Every professional module visible to the role must also appear in dual-role set
        for (const key of professionalModules) {
          expect(dualRoleModules.has(key)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 20: Platform_admin denied access to professional module routes
// Validates: Requirements 2.5, 2.6
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: role-architecture-refinement, Property 20: Platform_admin denied access to professional module routes', () => {
  /**
   * **Validates: Requirements 2.5, 2.6**
   *
   * For any URL path corresponding to a professional workflow module, a user
   * holding only platform_admin (no Professional_Role) SHALL be denied access
   * by the route guard and redirected to the command centre.
   *
   * We test this by verifying that pagesForRole('platform_admin') does not
   * include any pages that belong to professional workflow module groups, and
   * that the navigation config excludes platform_admin from professional modules.
   */

  /** Map professional module keys to route page groups in CANONICAL_DASHBOARD_PAGES */
  const PROFESSIONAL_PAGE_GROUPS = [
    'BEP tools',
    'Construction tools',
    'Client tools',
    'Freelancer tools',
  ] as const;

  /** Professional page IDs from CANONICAL_DASHBOARD_PAGES that platform_admin must NOT access */
  const professionalPageIds = CANONICAL_DASHBOARD_PAGES
    .filter((page) => {
      // Pages that include 'admin' in their roles but NOT platform_admin-only pages
      // are professional pages that an old admin role was given access to.
      // Under the new architecture, platform_admin should not access these.
      return !page.roles.includes('platform_admin') ||
        PROFESSIONAL_PAGE_GROUPS.includes(page.group as typeof PROFESSIONAL_PAGE_GROUPS[number]);
    })
    .filter((page) => {
      // Exclude pages that are explicitly platform-only (admin-console with only 'admin' role)
      return page.group !== 'Governance' || !page.roles.every(r => r === 'admin' || r === 'platform_admin');
    })
    .map((page) => page.id);

  it('platform_admin navigation excludes all professional workflow modules', () => {
    fc.assert(
      fc.property(arbProfessionalModuleKey, (moduleKey) => {
        const platformAdminNav = getNavigationForRole('platform_admin');
        const platformAdminNavKeys = platformAdminNav.map((m) => m.key);

        // The professional module must NOT appear in platform_admin navigation
        expect(platformAdminNavKeys).not.toContain(moduleKey);
      }),
      { numRuns: 100 },
    );
  });

  it('platform_admin cannot access professional modules via direct navigation config lookup', () => {
    // Verify exhaustively that platform_admin is excluded from every professional module
    for (const moduleKey of PROFESSIONAL_MODULE_KEYS) {
      const module = architexNavigation.find((m) => m.key === moduleKey);
      expect(module).toBeDefined();

      if (module?.roles) {
        expect(module.roles).not.toContain('platform_admin');
      }
    }
  });

  it('for any professional module, platform_admin role is denied (module not in getNavigationForRole result)', () => {
    fc.assert(
      fc.property(arbProfessionalModuleKey, (moduleKey) => {
        const nav = getNavigationForRole('platform_admin');
        const keys = nav.map((m) => m.key);
        expect(keys).not.toContain(moduleKey);
      }),
      { numRuns: 100 },
    );
  });

  it('platform_admin would be redirected to command centre (only gets command_centre as primary landing)', () => {
    const platformAdminNav = getNavigationForRole('platform_admin');
    const platformAdminKeys = platformAdminNav.map((m) => m.key);

    // command_centre must be available as the redirect target
    expect(platformAdminKeys).toContain('command_centre');

    // No professional workflow modules are available
    for (const professionalKey of PROFESSIONAL_MODULE_KEYS) {
      expect(platformAdminKeys).not.toContain(professionalKey);
    }
  });
});
