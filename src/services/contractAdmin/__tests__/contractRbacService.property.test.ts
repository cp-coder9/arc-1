/**
 * Property-Based Tests for ContractRbacService — RBAC Union Resolution
 *
 * **Property 15: RBAC Union Resolution**
 * Verifies that multi-role permissions equal the set union (least restrictive combination).
 *
 * **Validates: Requirements 9.1–9.8**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getPermissions,
  resolveMultiRolePermissions,
} from '../contractRbacService';
import type { ContractFeature, ContractPermission, ContractProjectAssignment } from '../contractTypes';
import type { UserRole } from '@/types';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Roles that have entries in the permission matrix */
const VALID_ROLES: UserRole[] = [
  'architect',
  'bep',
  'quantity_surveyor',
  'contractor',
  'subcontractor',
  'client',
  'developer',
  'site_manager',
  'admin',
  'platform_admin',
];

/** All contract features */
const VALID_FEATURES: ContractFeature[] = [
  'contract_setup',
  'notices',
  'variations',
  'payment_schedule',
  'claims',
  'eot',
  'data_sheet_view',
  'data_sheet_edit',
];

// ══════════════════════════════════════════════════════════════════════════════
// Arbitraries (Generators)
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a random non-empty subset of roles */
const rolesArb = fc.uniqueArray(fc.constantFrom(...VALID_ROLES), { minLength: 1, maxLength: VALID_ROLES.length });

/** Generate a random contract feature */
const featureArb = fc.constantFrom(...VALID_FEATURES);

/**
 * Generate a project assignment that grants all possible assignment predicates.
 * This ensures roles are not blocked by missing assignments, so we can test
 * the union logic purely.
 */
const fullAssignmentArb: fc.Arbitrary<ContractProjectAssignment> = fc.record({
  projectId: fc.constant('proj-test'),
  userId: fc.constant('user-test'),
  roles: fc.constant([] as UserRole[]),
  isAssignedTeamMember: fc.boolean(),
  isAssignedContractor: fc.boolean(),
  isAssignedSubcontractor: fc.boolean(),
  isProjectOwner: fc.boolean(),
  isAssignedSiteManager: fc.boolean(),
});

/**
 * Generate an assignment where all predicates are true — ensures every role
 * gets its maximum permissions, isolating the union logic test.
 */
const maxAssignment: ContractProjectAssignment = {
  projectId: 'proj-test',
  userId: 'user-test',
  roles: [],
  isAssignedTeamMember: true,
  isAssignedContractor: true,
  isAssignedSubcontractor: true,
  isProjectOwner: true,
  isAssignedSiteManager: true,
};

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 15: RBAC Union Resolution', () => {
  it('multi-role permissions equal the set union of individual role permissions', () => {
    fc.assert(
      fc.property(rolesArb, featureArb, fullAssignmentArb, (roles, feature, assignment) => {
        // Compute individual permissions per role
        const individualPerms = new Set<ContractPermission>();
        for (const role of roles) {
          const perms = getPermissions(role, feature, assignment);
          for (const p of perms) {
            individualPerms.add(p);
          }
        }

        // Compute multi-role resolution
        const resolvedPerms = resolveMultiRolePermissions(roles, feature, assignment);
        const resolvedSet = new Set(resolvedPerms);

        // The resolved set must equal the union of individual permissions
        expect(resolvedSet).toEqual(individualPerms);
      }),
      { numRuns: 200 }
    );
  });

  it('if any role grants "write", multi-role resolution includes "write"', () => {
    fc.assert(
      fc.property(rolesArb, featureArb, (roles, feature) => {
        // Use max assignment so no role is blocked by assignment checks
        const individualPerms: ContractPermission[][] = roles.map((role) =>
          getPermissions(role, feature, maxAssignment)
        );

        const anyRoleGrantsWrite = individualPerms.some((perms) => perms.includes('write'));
        const resolved = resolveMultiRolePermissions(roles, feature, maxAssignment);

        if (anyRoleGrantsWrite) {
          expect(resolved).toContain('write');
        }
      }),
      { numRuns: 200 }
    );
  });

  it('if any role grants "approve", multi-role resolution includes "approve"', () => {
    fc.assert(
      fc.property(rolesArb, featureArb, (roles, feature) => {
        const individualPerms: ContractPermission[][] = roles.map((role) =>
          getPermissions(role, feature, maxAssignment)
        );

        const anyRoleGrantsApprove = individualPerms.some((perms) => perms.includes('approve'));
        const resolved = resolveMultiRolePermissions(roles, feature, maxAssignment);

        if (anyRoleGrantsApprove) {
          expect(resolved).toContain('approve');
        }
      }),
      { numRuns: 200 }
    );
  });

  it('permissions are deduplicated (no duplicates in result)', () => {
    fc.assert(
      fc.property(rolesArb, featureArb, fullAssignmentArb, (roles, feature, assignment) => {
        const resolved = resolveMultiRolePermissions(roles, feature, assignment);
        const uniquePerms = new Set(resolved);

        // The array length must equal the set size (no duplicates)
        expect(resolved.length).toBe(uniquePerms.size);
      }),
      { numRuns: 200 }
    );
  });

  it('multi-role resolution is at least as permissive as any single role', () => {
    fc.assert(
      fc.property(rolesArb, featureArb, fullAssignmentArb, (roles, feature, assignment) => {
        const resolved = resolveMultiRolePermissions(roles, feature, assignment);
        const resolvedSet = new Set(resolved);

        // For each individual role, every permission it grants must appear in the union
        for (const role of roles) {
          const singlePerms = getPermissions(role, feature, assignment);
          for (const perm of singlePerms) {
            expect(resolvedSet.has(perm)).toBe(true);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('multi-role resolution does not grant permissions beyond what individual roles provide', () => {
    fc.assert(
      fc.property(rolesArb, featureArb, fullAssignmentArb, (roles, feature, assignment) => {
        const resolved = resolveMultiRolePermissions(roles, feature, assignment);

        // Compute the union manually
        const expectedUnion = new Set<ContractPermission>();
        for (const role of roles) {
          for (const perm of getPermissions(role, feature, assignment)) {
            expectedUnion.add(perm);
          }
        }

        // Resolved must not contain anything outside the union
        for (const perm of resolved) {
          expect(expectedUnion.has(perm)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });
});
