/**
 * Property-Based Tests for Access Control (Property 10)
 *
 * Feature: town-planning-workflow, Property 10: Role-based access enforcement
 *
 * **Validates: Requirements 10**
 *
 * Property 10:
 * For any user with a given role set and project assignment status, and any town planning action,
 * the access control check SHALL return "allowed" if and only if the user's effective permission set
 * (union of all assigned role permissions) includes that action AND the user is an assigned project
 * team member (or holds admin/platform_admin role). Otherwise access SHALL be denied.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  PERMISSION_MATRIX,
  checkPermission,
  getEffectivePermissions,
  isAdminRole,
} from '../services/accessControl';
import type { TownPlanningAction } from '../types';
import type { UserRole } from '@/types';

// ─── Generators ──────────────────────────────────────────────────────────────

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
  'cpm',
];

const ADMIN_ROLES: UserRole[] = ['admin', 'platform_admin'];

const NON_ADMIN_ROLES: UserRole[] = ALL_USER_ROLES.filter(
  (r) => !ADMIN_ROLES.includes(r)
);

const ALL_ACTIONS: TownPlanningAction[] = [
  'create_application',
  'manage_workflow',
  'manage_comments',
  'manage_conditions',
  'configure_municipality',
  'manage_sdp',
  'view_application',
  'view_property',
  'update_property',
  'manage_subdivision',
  'manage_surveyor',
  'link_drawings',
  'view_conditions',
  'approve_costs',
  'view_documents',
];

const arbUserRole = fc.oneof(...ALL_USER_ROLES.map((r) => fc.constant(r)));
const arbAdminRole = fc.oneof(...ADMIN_ROLES.map((r) => fc.constant(r)));
const arbNonAdminRole = fc.oneof(...NON_ADMIN_ROLES.map((r) => fc.constant(r)));
const arbAction = fc.oneof(...ALL_ACTIONS.map((a) => fc.constant(a)));
const arbMembership = fc.boolean();

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Access Control — Property-Based Tests (Property 10)', () => {
  it('Admin roles always granted regardless of action and membership', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbAdminRole,
        arbAction,
        arbMembership,
        async (adminRole, action, isMember) => {
          const result = await checkPermission({
            userId: 'test-admin',
            projectId: 'test-project',
            action,
            roles: [adminRole],
            isProjectMember: isMember,
          });
          expect(result.allowed).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('No roles → always denied', async () => {
    await fc.assert(
      fc.asyncProperty(arbAction, async (action) => {
        const result = await checkPermission({
          userId: 'test-user',
          projectId: 'test-project',
          action,
          roles: [],
          isProjectMember: true,
        });
        expect(result.allowed).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('Multi-role union is superset of each individual role', () => {
    fc.assert(
      fc.property(arbUserRole, arbUserRole, (roleA, roleB) => {
        const combined = getEffectivePermissions([roleA, roleB]);
        const permA = getEffectivePermissions([roleA]);
        const permB = getEffectivePermissions([roleB]);

        // Union must contain all actions from roleA
        for (const action of permA.allowedActions) {
          expect(combined.allowedActions).toContain(action);
        }

        // Union must contain all actions from roleB
        for (const action of permB.allowedActions) {
          expect(combined.allowedActions).toContain(action);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Non-admin without membership → always denied', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbNonAdminRole, { minLength: 1, maxLength: 5 }),
        arbAction,
        async (roles, action) => {
          const result = await checkPermission({
            userId: 'test-user',
            projectId: 'test-project',
            action,
            roles,
            isProjectMember: false,
          });
          expect(result.allowed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Permission matrix consistency — checkPermission returns allowed=true iff action is in PERMISSION_MATRIX[role] AND membership is satisfied', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserRole,
        arbAction,
        arbMembership,
        async (role, action, isMember) => {
          const rolePermissions = PERMISSION_MATRIX[role] ?? [];
          const actionInMatrix = rolePermissions.includes(action);
          const isAdmin = isAdminRole(role);

          const result = await checkPermission({
            userId: 'test-user',
            projectId: 'test-project',
            action,
            roles: [role],
            isProjectMember: isMember,
          });

          if (isAdmin && actionInMatrix) {
            // Admin with a permitted action: always allowed (membership bypassed)
            expect(result.allowed).toBe(true);
          } else if (!isAdmin && actionInMatrix && isMember) {
            // Non-admin with permitted action AND membership: allowed
            expect(result.allowed).toBe(true);
          } else {
            // All other cases: denied
            expect(result.allowed).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
