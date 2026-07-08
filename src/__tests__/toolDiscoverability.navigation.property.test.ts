import { describe, it, expect } from 'vitest';
import { architexNavigation } from '@/navigation/architexNavigationConfig';

/**
 * Feature: tool-discoverability-routing, Property 12: Navigation config consistency with page registry
 *
 * Validates: Requirements 7.6
 *
 * Since CANONICAL_DASHBOARD_PAGES is a local constant in App.tsx (not exported),
 * we define the expected page registry entries here for the 6 new navigation items
 * added as part of this feature, then exhaustively verify that navigation config
 * items are consistent with them.
 */

// Expected CANONICAL_DASHBOARD_PAGES entries for the 6 new navigation items
// (mirrors what was added in App.tsx by task 1.1)
const EXPECTED_PAGE_ENTRIES = [
  {
    id: 'council-navigator',
    label: 'Council Drawing Navigator',
    roles: ['architect', 'bep', 'engineer', 'energy_professional', 'fire_engineer', 'town_planner', 'admin'],
  },
  {
    id: 'ncr-manager',
    label: 'NCR Manager',
    roles: ['architect', 'bep', 'contractor', 'subcontractor', 'site_manager', 'engineer', 'admin'],
  },
  {
    id: 'site-instructions',
    label: 'Site Instructions',
    roles: ['architect', 'bep', 'contractor', 'subcontractor', 'site_manager', 'engineer', 'admin'],
  },
  {
    id: 'contract-admin',
    label: 'Contract Administration',
    roles: ['architect', 'bep', 'quantity_surveyor', 'contractor', 'subcontractor', 'site_manager', 'engineer', 'admin'],
  },
  {
    id: 'contractor-compliance',
    label: 'Contractor Compliance',
    roles: ['architect', 'bep', 'contractor', 'subcontractor', 'supplier', 'site_manager', 'quantity_surveyor', 'admin'],
  },
  {
    id: 'disputes',
    label: 'Dispute Resolution',
    roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'],
  },
] as const;

describe('Feature: tool-discoverability-routing, Property 12: Navigation config consistency with page registry', () => {
  // Get the toolboxes module from the navigation config
  const toolboxesModule = architexNavigation.find((item) => item.key === 'toolboxes');

  it('toolboxes module exists in navigation config', () => {
    expect(toolboxesModule).toBeDefined();
  });

  // For each expected page entry, find its corresponding navigation item and verify consistency
  for (const pageEntry of EXPECTED_PAGE_ENTRIES) {
    describe(`Navigation item "${pageEntry.id}" consistency with page registry`, () => {
      const navItem = toolboxesModule?.sections.find(
        (section) => section.key === pageEntry.id
      );

      it(`navigation item with key "${pageEntry.id}" exists in the toolboxes module`, () => {
        expect(navItem).toBeDefined();
      });

      it(`navigation item label matches page entry label ("${pageEntry.label}")`, () => {
        expect(navItem).toBeDefined();
        // The nav item label should match the page entry label
        // Per Requirement 7.6: nav label must match the CANONICAL_DASHBOARD_PAGES label
        expect(navItem!.label).toBe(pageEntry.label);
      });

      it(`navigation item roles (if specified) are a subset of or equal to page entry roles`, () => {
        expect(navItem).toBeDefined();
        // If the nav item has roles specified at the section level, they must be
        // a subset of or equal to the page entry's roles array
        if (navItem!.roles && navItem!.roles.length > 0) {
          for (const role of navItem!.roles) {
            expect(
              pageEntry.roles.includes(role as typeof pageEntry.roles[number]),
              `Nav item role "${role}" for "${pageEntry.id}" is not in the page entry roles [${pageEntry.roles.join(', ')}]`
            ).toBe(true);
          }
        }
        // If no roles are specified on the nav item, it inherits from the parent
        // module, which is acceptable (the parent module controls visibility)
      });

      it(`navigation item has a non-empty description`, () => {
        expect(navItem).toBeDefined();
        expect(navItem!.description).toBeTruthy();
        expect(navItem!.description.length).toBeGreaterThan(0);
      });
    });
  }

  // Exhaustive check: all navigation items in toolboxes that correspond to
  // any EXPECTED_PAGE_ENTRIES key must pass the label consistency check
  it('all matching navigation items have labels consistent with their page registry entries', () => {
    const pageEntryMap = new Map(
      EXPECTED_PAGE_ENTRIES.map((entry) => [entry.id, entry])
    );

    const toolboxesSections = toolboxesModule?.sections ?? [];
    const matchingItems = toolboxesSections.filter((section) =>
      pageEntryMap.has(section.key)
    );

    // We expect all 6 items to be found
    expect(matchingItems.length).toBe(EXPECTED_PAGE_ENTRIES.length);

    for (const navItem of matchingItems) {
      const pageEntry = pageEntryMap.get(navItem.key)!;
      expect(navItem.label).toBe(pageEntry.label);
    }
  });

  it('all matching navigation items have roles that are subsets of their page registry roles', () => {
    const pageEntryMap = new Map(
      EXPECTED_PAGE_ENTRIES.map((entry) => [entry.id, entry])
    );

    const toolboxesSections = toolboxesModule?.sections ?? [];
    const matchingItems = toolboxesSections.filter((section) =>
      pageEntryMap.has(section.key)
    );

    for (const navItem of matchingItems) {
      const pageEntry = pageEntryMap.get(navItem.key)!;
      if (navItem.roles && navItem.roles.length > 0) {
        for (const role of navItem.roles) {
          expect(
            (pageEntry.roles as readonly string[]).includes(role),
            `Nav "${navItem.key}" has role "${role}" not in page roles`
          ).toBe(true);
        }
      }
    }
  });
});
