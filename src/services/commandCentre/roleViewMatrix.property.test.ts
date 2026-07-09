/**
 * Property 10: Role-Based View Access Control
 * Property 11: Complexity Mode View Gating
 *
 * - For any UserRole, returned views match exactly the role-view matrix
 * - Simple mode shows only subset; Full shows all; toggling preserves data
 * - Default mode derived from contract value (< R5M = simple, >= R5M = full)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getViewsForRole,
  isViewAccessible,
  getDefaultComplexityMode,
  SIMPLE_MODE_VIEWS,
  ALL_VIEWS,
} from './roleViewMatrix';
import type { UserRole } from '@/types';
import type { CommandCentreView, ComplexityMode } from './types';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const ALL_ROLES: UserRole[] = [
  'client', 'architect', 'admin', 'freelancer', 'bep', 'contractor',
  'subcontractor', 'supplier', 'engineer', 'quantity_surveyor',
  'town_planner', 'energy_professional', 'fire_engineer', 'site_manager',
  'developer', 'firm_admin', 'platform_admin', 'land_surveyor', 'health_safety', 'cpm',
];

const userRoleArb = fc.constantFrom(...ALL_ROLES);
const complexityModeArb = fc.constantFrom<ComplexityMode>('simple', 'full');
const viewArb = fc.constantFrom<CommandCentreView>(...ALL_VIEWS);
const contractValueArb = fc.double({ min: 0, max: 100_000_000, noNaN: true, noDefaultInfinity: true });

// ── Expected role-view mapping ───────────────────────────────────────────────

const EXPECTED_ROLE_VIEWS: Record<UserRole, CommandCentreView[]> = {
  client: ['dashboard', 'milestones', 'budget', 'documents', 'notifications'],
  architect: [...ALL_VIEWS],
  bep: [...ALL_VIEWS],
  site_manager: ['dashboard', 'programme', 'tasks', 'site-diary', 'rfis', 'quality', 'team'],
  quantity_surveyor: ['dashboard', 'budget', 'valuations', 'procurement', 'contracts', 'milestones', 'analytics'],
  contractor: ['dashboard', 'tasks', 'programme', 'site-diary', 'rfis', 'quality', 'procurement'],
  subcontractor: ['dashboard', 'tasks', 'programme', 'site-diary', 'rfis', 'quality', 'procurement'],
  supplier: ['procurement', 'documents'],
  engineer: ['dashboard', 'programme', 'tasks', 'rfis', 'quality', 'documents'],
  admin: [...ALL_VIEWS],
  platform_admin: [...ALL_VIEWS],
  firm_admin: [...ALL_VIEWS],
  developer: ['dashboard', 'programme', 'tasks', 'milestones', 'budget', 'valuations', 'procurement', 'contracts', 'analytics', 'documents', 'notifications'],
  town_planner: ['dashboard', 'programme', 'tasks', 'milestones', 'documents', 'quality'],
  energy_professional: ['dashboard', 'programme', 'tasks', 'quality', 'documents'],
  fire_engineer: ['dashboard', 'programme', 'tasks', 'quality', 'documents'],
  freelancer: ['dashboard', 'tasks', 'documents', 'notifications'],
  land_surveyor: ['dashboard', 'programme', 'tasks', 'documents', 'quality'],
  health_safety: ['dashboard', 'programme', 'tasks', 'site-diary', 'quality', 'documents', 'notifications'],
  cpm: ['dashboard', 'programme', 'tasks', 'site-diary', 'rfis', 'quality', 'procurement', 'documents'],
};

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 10: Role-Based View Access Control', () => {
  it('for any role in full mode, returned views match the role-view matrix', () => {
    fc.assert(
      fc.property(userRoleArb, (role) => {
        const views = getViewsForRole(role, 'full');
        const expected = EXPECTED_ROLE_VIEWS[role];
        expect(new Set(views)).toEqual(new Set(expected));
      }),
      { numRuns: 100 },
    );
  });

  it('isViewAccessible is consistent with getViewsForRole for any role/view/mode', () => {
    fc.assert(
      fc.property(userRoleArb, viewArb, complexityModeArb, (role, view, mode) => {
        const views = getViewsForRole(role, mode);
        const accessible = isViewAccessible(role, view, mode);
        expect(accessible).toBe(views.includes(view));
      }),
      { numRuns: 200 },
    );
  });

  it('no view outside the role scope is ever returned', () => {
    fc.assert(
      fc.property(userRoleArb, complexityModeArb, (role, mode) => {
        const views = getViewsForRole(role, mode);
        const fullRoleViews = EXPECTED_ROLE_VIEWS[role];
        for (const view of views) {
          expect(fullRoleViews).toContain(view);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 11: Complexity Mode View Gating', () => {
  it('simple mode views are always a subset of SIMPLE_MODE_VIEWS', () => {
    fc.assert(
      fc.property(userRoleArb, (role) => {
        const views = getViewsForRole(role, 'simple');
        for (const view of views) {
          expect(SIMPLE_MODE_VIEWS).toContain(view);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('full mode views are a superset of simple mode views for any role', () => {
    fc.assert(
      fc.property(userRoleArb, (role) => {
        const simpleViews = getViewsForRole(role, 'simple');
        const fullViews = getViewsForRole(role, 'full');
        for (const view of simpleViews) {
          expect(fullViews).toContain(view);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('default mode is simple when contract value < R5M, full when >= R5M', () => {
    fc.assert(
      fc.property(contractValueArb, (value) => {
        const mode = getDefaultComplexityMode(value);
        if (value >= 5_000_000) {
          expect(mode).toBe('full');
        } else {
          expect(mode).toBe('simple');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('toggling mode does not affect underlying role permissions (data preservation)', () => {
    fc.assert(
      fc.property(userRoleArb, (role) => {
        const fullViews = getViewsForRole(role, 'full');
        // Toggle to simple
        const simpleViews = getViewsForRole(role, 'simple');
        // Toggle back to full
        const fullViewsAgain = getViewsForRole(role, 'full');
        expect(new Set(fullViewsAgain)).toEqual(new Set(fullViews));
        // Simple is always intersection of role views and SIMPLE_MODE_VIEWS
        const expectedSimple = fullViews.filter((v) => SIMPLE_MODE_VIEWS.includes(v));
        expect(new Set(simpleViews)).toEqual(new Set(expectedSimple));
      }),
      { numRuns: 100 },
    );
  });
});
