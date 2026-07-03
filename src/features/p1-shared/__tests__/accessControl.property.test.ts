/**
 * Property-Based Tests for P1 RBAC Access Control Service
 *
 * **Feature: p1-platform-extensions, Property 22: RBAC Permission Matrix Enforcement**
 *
 * For any user with role R, project assignment status, module M, and action A:
 * - Access shall be granted if R is "admin" or "platform_admin" (regardless of project assignment)
 * - Or if R appears in the permission matrix for module M with action A included and
 *   the user is assigned to the project
 * - For all other combinations, access shall be denied
 * - When a user holds multiple roles, the union of all role permissions shall apply
 *
 * **Validates: Requirements 21.1–21.14**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createP1AccessControlService, MODULE_PERMISSIONS } from '../services/accessControl';
import type { P1Module, P1Action, P1AccessContext } from '../services/accessControl';
import type { UserRole } from '@/types';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const ALL_MODULES: P1Module[] = ['insurance_register', 'dispute_resolution', 'nhbrc', 'survey_geomatics'];
const ALL_ACTIONS: P1Action[] = ['read', 'write', 'create', 'manage', 'admin'];

const ALL_ROLES: UserRole[] = [
  'client',
  'architect',
  'engineer',
  'quantity_surveyor',
  'town_planner',
  'energy_professional',
  'fire_engineer',
  'site_manager',
  'bep',
  'contractor',
  'subcontractor',
  'supplier',
  'freelancer',
  'developer',
  'firm_admin',
  'platform_admin',
  'admin',
  'cpm',
  'land_surveyor',
];

const ADMIN_ROLES: UserRole[] = ['admin', 'platform_admin'];
const NON_ADMIN_ROLES: UserRole[] = ALL_ROLES.filter((r) => !ADMIN_ROLES.includes(r));

// ══════════════════════════════════════════════════════════════════════════════
// Arbitraries (Generators)
// ══════════════════════════════════════════════════════════════════════════════

const moduleArb = fc.constantFrom(...ALL_MODULES);
const actionArb = fc.constantFrom(...ALL_ACTIONS);
const roleArb = fc.constantFrom(...ALL_ROLES);
const adminRoleArb = fc.constantFrom(...ADMIN_ROLES);
const nonAdminRoleArb = fc.constantFrom(...NON_ADMIN_ROLES);

const accessContextArb = (role: UserRole, isProjectMember: boolean): fc.Arbitrary<P1AccessContext> =>
  fc.record({
    userId: fc.uuid(),
    role: fc.constant(role),
    projectId: fc.uuid(),
    isProjectMember: fc.constant(isProjectMember),
  });

// ══════════════════════════════════════════════════════════════════════════════
// Service Instance
// ══════════════════════════════════════════════════════════════════════════════

const service = createP1AccessControlService();

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: p1-platform-extensions, Property 22: RBAC Permission Matrix Enforcement', () => {
  it('admin/platform_admin always granted access regardless of project membership', () => {
    fc.assert(
      fc.property(adminRoleArb, moduleArb, actionArb, fc.boolean(), (role, module, action, isProjectMember) => {
        const ctx: P1AccessContext = {
          userId: 'user-admin',
          role,
          projectId: 'proj-1',
          isProjectMember,
        };

        const result = service.checkAccess(ctx, module, action);
        expect(result.granted).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('non-admin role with isProjectMember=false is always denied', () => {
    fc.assert(
      fc.property(nonAdminRoleArb, moduleArb, actionArb, (role, module, action) => {
        const ctx: P1AccessContext = {
          userId: 'user-non-member',
          role,
          projectId: 'proj-1',
          isProjectMember: false,
        };

        const result = service.checkAccess(ctx, module, action);
        expect(result.granted).toBe(false);
        expect(result.deniedAt).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('matrix consistency: role in matrix with permitted action and isProjectMember=true grants access', () => {
    // Generate role+module+action combinations that exist in the permission matrix
    const matrixEntryArb = fc.constantFrom(
      ...ALL_MODULES.flatMap((module) => {
        const matrix = MODULE_PERMISSIONS[module];
        return Object.entries(matrix).flatMap(([role, actions]) =>
          // Exclude admin roles from this test since they're tested separately
          ADMIN_ROLES.includes(role as UserRole)
            ? []
            : (actions as P1Action[]).map((action) => ({ module, role: role as UserRole, action })),
        );
      }),
    );

    fc.assert(
      fc.property(matrixEntryArb, fc.uuid(), fc.uuid(), ({ module, role, action }, userId, projectId) => {
        const ctx: P1AccessContext = {
          userId,
          role,
          projectId,
          isProjectMember: true,
        };

        const result = service.checkAccess(ctx, module as P1Module, action);
        expect(result.granted).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('default-deny: role NOT in a module matrix is denied for all actions', () => {
    // Generate role+module combinations where the role is NOT in the matrix
    const nonMatrixEntryArb = fc.constantFrom(
      ...ALL_MODULES.flatMap((module) => {
        const matrix = MODULE_PERMISSIONS[module];
        const rolesInMatrix = Object.keys(matrix) as UserRole[];
        const rolesNotInMatrix = NON_ADMIN_ROLES.filter((r) => !rolesInMatrix.includes(r));
        return rolesNotInMatrix.map((role) => ({ module, role }));
      }),
    );

    fc.assert(
      fc.property(nonMatrixEntryArb, actionArb, ({ module, role }, action) => {
        const ctx: P1AccessContext = {
          userId: 'user-default-deny',
          role,
          projectId: 'proj-1',
          isProjectMember: true,
        };

        const result = service.checkAccess(ctx, module as P1Module, action);
        expect(result.granted).toBe(false);
        expect(result.deniedAt).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('getPermittedActions returns exactly the actions listed in the matrix for given role and module', () => {
    // Test for all non-admin roles that appear in at least one module's matrix
    const matrixRoleModuleArb = fc.constantFrom(
      ...ALL_MODULES.flatMap((module) => {
        const matrix = MODULE_PERMISSIONS[module];
        return Object.entries(matrix)
          .filter(([role]) => !ADMIN_ROLES.includes(role as UserRole))
          .map(([role, actions]) => ({ module, role: role as UserRole, expectedActions: actions as P1Action[] }));
      }),
    );

    fc.assert(
      fc.property(matrixRoleModuleArb, fc.uuid(), ({ module, role, expectedActions }, userId) => {
        const ctx: P1AccessContext = {
          userId,
          role,
          projectId: 'proj-1',
          isProjectMember: true,
        };

        const permittedActions = service.getPermittedActions(ctx, module as P1Module);
        const sortedPermitted = [...permittedActions].sort();
        const sortedExpected = [...expectedActions].sort();

        expect(sortedPermitted).toEqual(sortedExpected);
      }),
      { numRuns: 100 },
    );
  });

  it('getPermittedActions for admin returns all actions for any module', () => {
    fc.assert(
      fc.property(adminRoleArb, moduleArb, fc.boolean(), (role, module, isProjectMember) => {
        const ctx: P1AccessContext = {
          userId: 'user-admin',
          role,
          projectId: 'proj-1',
          isProjectMember,
        };

        const permittedActions = service.getPermittedActions(ctx, module);
        const sortedPermitted = [...permittedActions].sort();
        const sortedAll = [...ALL_ACTIONS].sort();

        expect(sortedPermitted).toEqual(sortedAll);
      }),
      { numRuns: 100 },
    );
  });

  it('getPermittedActions for non-member non-admin returns empty array', () => {
    fc.assert(
      fc.property(nonAdminRoleArb, moduleArb, (role, module) => {
        const ctx: P1AccessContext = {
          userId: 'user-non-member',
          role,
          projectId: 'proj-1',
          isProjectMember: false,
        };

        const permittedActions = service.getPermittedActions(ctx, module);
        expect(permittedActions).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
