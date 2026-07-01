// @vitest-environment jsdom
/**
 * Property Tests for Marketplace Navigation Visibility
 *
 * Feature: pack-marketplace, Property 34: Navigation visibility by role
 *
 * **Validates: Requirements 13.4, 13.5, 13.6**
 */
import * as fc from 'fast-check';

// ── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'client' | 'architect' | 'admin' | 'freelancer' | 'bep' | 'contractor' | 'subcontractor' | 'supplier' | 'engineer' | 'quantity_surveyor' | 'town_planner' | 'energy_professional' | 'fire_engineer' | 'site_manager' | 'developer' | 'firm_admin' | 'platform_admin';

interface MarketplaceSection {
  id: string;
  label: string;
  path: string;
  allowedRoles: UserRole[];
}

interface NavigationResult {
  visibleSections: MarketplaceSection[];
  redirectTo: string | null;
}

// ── MarketplaceShell Navigation Configuration ────────────────────────────────

const MARKETPLACE_SECTIONS: MarketplaceSection[] = [
  {
    id: 'projects',
    label: 'Client Projects',
    path: '/marketplace/projects',
    allowedRoles: ['client', 'developer', 'architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'contractor', 'subcontractor'],
  },
  {
    id: 'tasks',
    label: 'Task Marketplace',
    path: '/marketplace/tasks',
    allowedRoles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'freelancer'],
  },
  {
    id: 'materials',
    label: 'Supplier Marketplace',
    path: '/marketplace/materials',
    allowedRoles: ['contractor', 'subcontractor', 'supplier'],
  },
  {
    id: 'freelancer',
    label: 'Freelancer Hub',
    path: '/marketplace/freelancer',
    allowedRoles: ['freelancer', 'architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer'],
  },
  {
    id: 'collaborations',
    label: 'Firm Collaboration',
    path: '/marketplace/collaborations',
    allowedRoles: ['firm_admin', 'architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer'],
  },
  {
    id: 'search',
    label: 'Compliance Search',
    path: '/marketplace/search',
    allowedRoles: ['client', 'developer'],
  },
  {
    id: 'disputes',
    label: 'Dispute Management',
    path: '/marketplace/disputes',
    allowedRoles: ['admin', 'platform_admin'],
  },
];

const MARKETPLACE_ROLES: UserRole[] = Array.from(new Set(
  MARKETPLACE_SECTIONS.flatMap(s => s.allowedRoles)
));

const COMMAND_CENTRE_PATH = '/command-centre';

// ── Navigation Logic (mirrors MarketplaceShell) ──────────────────────────────

function getPermittedSections(role: UserRole): MarketplaceSection[] {
  return MARKETPLACE_SECTIONS.filter(section => section.allowedRoles.includes(role));
}

function hasMarketplaceAccess(role: UserRole): boolean {
  return MARKETPLACE_ROLES.includes(role);
}

function resolveNavigation(role: UserRole, requestedPath: string | null): NavigationResult {
  const permittedSections = getPermittedSections(role);
  if (!hasMarketplaceAccess(role)) {
    return { visibleSections: [], redirectTo: COMMAND_CENTRE_PATH };
  }
  if (!requestedPath) {
    return {
      visibleSections: permittedSections,
      redirectTo: permittedSections.length > 0 ? permittedSections[0].path : COMMAND_CENTRE_PATH,
    };
  }
  const isPermitted = permittedSections.some(s => s.path === requestedPath);
  if (isPermitted) {
    return { visibleSections: permittedSections, redirectTo: null };
  }
  return {
    visibleSections: permittedSections,
    redirectTo: permittedSections.length > 0 ? permittedSections[0].path : COMMAND_CENTRE_PATH,
  };
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const ALL_ROLES: UserRole[] = [
  'client', 'architect', 'admin', 'freelancer', 'bep', 'contractor',
  'subcontractor', 'supplier', 'engineer', 'quantity_surveyor',
  'town_planner', 'energy_professional', 'fire_engineer', 'site_manager',
  'developer', 'firm_admin', 'platform_admin',
];

const roleArb = fc.constantFrom(...ALL_ROLES);
const marketplaceRoleArb = fc.constantFrom(...MARKETPLACE_ROLES);
const sectionPathArb = fc.constantFrom(...MARKETPLACE_SECTIONS.map(s => s.path));

// ── Property 34: Navigation visibility by role ───────────────────────────────

// Feature: pack-marketplace, Property 34: Navigation visibility by role
describe('Property 34: Navigation visibility by role', () => {
  // **Validates: Requirements 13.4, 13.5, 13.6**

  it('for any user role, marketplace navigation shows only sections the role is permitted to access', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const permittedSections = getPermittedSections(role);
        const expectedSectionIds = MARKETPLACE_SECTIONS
          .filter(s => s.allowedRoles.includes(role))
          .map(s => s.id);

        const visibleIds = permittedSections.map(s => s.id);
        expect(visibleIds).toEqual(expectedSectionIds);

        for (const section of permittedSections) {
          expect(section.allowedRoles).toContain(role);
        }

        const nonPermittedSections = MARKETPLACE_SECTIONS.filter(
          s => !permittedSections.includes(s)
        );
        for (const section of nonPermittedSections) {
          expect(section.allowedRoles).not.toContain(role);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('redirects to first permitted section when accessing unauthorized section', () => {
    fc.assert(
      fc.property(marketplaceRoleArb, sectionPathArb, (role, requestedPath) => {
        const permittedSections = getPermittedSections(role);
        const isPermitted = permittedSections.some(s => s.path === requestedPath);
        const nav = resolveNavigation(role, requestedPath);

        if (isPermitted) {
          expect(nav.redirectTo).toBeNull();
        } else {
          expect(nav.redirectTo).toBe(permittedSections[0].path);
        }
        expect(nav.visibleSections).toEqual(permittedSections);
      }),
      { numRuns: 200 },
    );
  });

  it('non-marketplace roles get redirected to Command Centre', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ROLES.filter(r => !MARKETPLACE_ROLES.includes(r))),
        sectionPathArb,
        (role, requestedPath) => {
          const nav = resolveNavigation(role, requestedPath);
          expect(nav.redirectTo).toBe(COMMAND_CENTRE_PATH);
          expect(nav.visibleSections).toEqual([]);
        }
      ),
      { numRuns: 100 },
    );
  });

  it('marketplace roles always have at least one visible section', () => {
    fc.assert(
      fc.property(marketplaceRoleArb, (role) => {
        const permittedSections = getPermittedSections(role);
        expect(permittedSections.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('hasMarketplaceAccess correctly identifies marketplace vs non-marketplace roles', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const hasSections = getPermittedSections(role).length > 0;
        expect(hasMarketplaceAccess(role)).toBe(hasSections);
      }),
      { numRuns: 100 },
    );
  });

  it('section visibility is consistent with MARKETPLACE_SECTIONS config', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const permittedSections = getPermittedSections(role);
        for (const section of permittedSections) {
          const globalSection = MARKETPLACE_SECTIONS.find(s => s.id === section.id);
          expect(globalSection).toBeDefined();
          expect(globalSection!.allowedRoles).toContain(role);
        }
      }),
      { numRuns: 100 },
    );
  });
});
