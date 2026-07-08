// @vitest-environment node
/**
 * Property-based tests — ITP Permission Matrix Enforcement
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 21: Permission matrix enforcement
 *   Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 *   For any (user role, project membership, operation) tuple, the service shall
 *   allow the operation only when the user's role grants the required permission
 *   AND the user has active project membership. Operations without both conditions
 *   shall be rejected with a permission denied error.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  checkITPPermission,
  ITPServiceError,
} from '@/services/itpService';
import type { ITPPermission, ITPProjectMembership } from '@/services/itpService';

// ─── Permission Matrix Definition ────────────────────────────────────────────

/**
 * The expected permission matrix — mirrors the implementation to test against.
 */
const PERMISSION_MATRIX: Record<ITPPermission, string[]> = {
  'itp:create': ['engineer', 'architect'],
  'itp:approve': ['engineer', 'architect'],
  'itp:read': [
    'site_manager', 'contractor', 'subcontractor', 'engineer', 'architect',
    'quantity_surveyor', 'client', 'developer',
  ],
  'inspection:request': ['site_manager', 'contractor', 'subcontractor', 'quantity_surveyor'],
  'inspection:sign_off': ['engineer', 'architect'],
  'test:record_result': ['engineer', 'site_manager'],
};

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** All ITP permissions. */
const ALL_PERMISSIONS: ITPPermission[] = [
  'itp:create',
  'itp:approve',
  'itp:read',
  'inspection:request',
  'inspection:sign_off',
  'test:record_result',
];

/** All roles that have at least one permission in the matrix. */
const ALL_ROLES = [
  'engineer', 'architect', 'site_manager', 'contractor',
  'subcontractor', 'quantity_surveyor', 'client', 'developer',
];

/** Roles that exist but have NO permissions at all (used for denial testing). */
const UNPERMITTED_ROLES = [
  'fire_engineer', 'town_planner', 'energy_professional',
  'freelancer', 'firm_admin', 'platform_admin', 'admin', 'bep',
];

/** Arbitrary for a user ID. */
const arbUserId = fc.uuid();

/** Arbitrary for a project ID. */
const arbProjectId = fc.uuid();

/** Arbitrary for an ITP permission. */
const arbPermission: fc.Arbitrary<ITPPermission> = fc.constantFrom(...ALL_PERMISSIONS);

/** Arbitrary for a role that appears in the permission matrix. */
const arbMatrixRole = fc.constantFrom(...ALL_ROLES);

/** Arbitrary for a role not in the matrix (should always be denied). */
const arbUnpermittedRole = fc.constantFrom(...UNPERMITTED_ROLES);

/** Arbitrary for a membership status. */
const arbMembershipStatus: fc.Arbitrary<'active' | 'inactive' | 'removed'> =
  fc.constantFrom('active', 'inactive', 'removed');

/** Arbitrary for a non-active membership status. */
const arbInactiveMembershipStatus: fc.Arbitrary<'inactive' | 'removed'> =
  fc.constantFrom('inactive', 'removed');

/**
 * Given a permission, returns an arbitrary for a role that IS in the allowed list.
 */
function arbAllowedRoleForPermission(permission: ITPPermission): fc.Arbitrary<string> {
  const allowedRoles = PERMISSION_MATRIX[permission];
  return fc.constantFrom(...allowedRoles);
}

/**
 * Given a permission, returns an arbitrary for a role that is NOT in the allowed list.
 */
function arbDeniedRoleForPermission(permission: ITPPermission): fc.Arbitrary<string> {
  const allowedRoles = PERMISSION_MATRIX[permission];
  const deniedRoles = [...ALL_ROLES, ...UNPERMITTED_ROLES].filter(
    (r) => !allowedRoles.includes(r),
  );
  return fc.constantFrom(...deniedRoles);
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 21: Permission matrix enforcement
// Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 21: Permission matrix enforcement', () => {

  // ── Case 1: Role IS allowed AND membership IS active → allowed ────────────

  describe('Grant access when role is allowed AND membership is active', () => {
    /**
     * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.7**
     *
     * For any (permission, role) pair where the role is in the allowed list for
     * that permission, and the user has an active project membership, the function
     * returns { allowed: true }.
     */
    it('returns { allowed: true } when role is in allowed list and membership is active', () => {
      fc.assert(
        fc.property(
          arbUserId,
          arbProjectId,
          arbPermission,
          (userId, projectId, permission) => {
            // Pick a role that is allowed for this permission
            const allowedRoles = PERMISSION_MATRIX[permission];
            const role = allowedRoles[Math.floor(Math.random() * allowedRoles.length)];

            const memberships: ITPProjectMembership[] = [
              { userId, projectId, role, status: 'active' },
            ];

            const result = checkITPPermission(userId, projectId, permission, role, memberships);
            expect(result).toEqual({ allowed: true });
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Case 2: Role is NOT in allowed list → permission_denied ───────────────

  describe('Deny access when role is NOT in the allowed list', () => {
    /**
     * **Validates: Requirements 9.6**
     *
     * For any (permission, role) pair where the role is NOT in the allowed list,
     * even with an active project membership, the function throws ITPServiceError
     * with code 'permission_denied'.
     */
    it('throws ITPServiceError with code permission_denied when role is not allowed', () => {
      fc.assert(
        fc.property(
          arbUserId,
          arbProjectId,
          arbPermission,
          (userId, projectId, permission) => {
            // Pick a role that is NOT allowed for this permission
            const allowedRoles = PERMISSION_MATRIX[permission];
            const deniedRoles = [...ALL_ROLES, ...UNPERMITTED_ROLES].filter(
              (r) => !allowedRoles.includes(r),
            );
            const role = deniedRoles[Math.floor(Math.random() * deniedRoles.length)];

            const memberships: ITPProjectMembership[] = [
              { userId, projectId, role, status: 'active' },
            ];

            expect(() =>
              checkITPPermission(userId, projectId, permission, role, memberships),
            ).toThrow(ITPServiceError);

            try {
              checkITPPermission(userId, projectId, permission, role, memberships);
            } catch (err) {
              expect(err).toBeInstanceOf(ITPServiceError);
              expect((err as ITPServiceError).code).toBe('permission_denied');
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Case 3: Membership NOT active → permission_denied ─────────────────────

  describe('Deny access when membership is NOT active', () => {
    /**
     * **Validates: Requirements 9.7, 9.8**
     *
     * For any (permission, role) pair — even if the role IS in the allowed list —
     * if the user's membership status is 'inactive' or 'removed', the function
     * throws ITPServiceError with code 'permission_denied'.
     */
    it('throws ITPServiceError with code permission_denied when membership is inactive/removed', () => {
      fc.assert(
        fc.property(
          arbUserId,
          arbProjectId,
          arbPermission,
          arbMatrixRole,
          arbInactiveMembershipStatus,
          (userId, projectId, permission, role, status) => {
            const memberships: ITPProjectMembership[] = [
              { userId, projectId, role, status },
            ];

            expect(() =>
              checkITPPermission(userId, projectId, permission, role, memberships),
            ).toThrow(ITPServiceError);

            try {
              checkITPPermission(userId, projectId, permission, role, memberships);
            } catch (err) {
              expect(err).toBeInstanceOf(ITPServiceError);
              expect((err as ITPServiceError).code).toBe('permission_denied');
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Case 4: No membership at all → permission_denied ──────────────────────

  describe('Deny access when user has no project membership', () => {
    /**
     * **Validates: Requirements 9.8**
     *
     * For any user with an empty memberships array (no membership on the project),
     * the function throws ITPServiceError with code 'permission_denied'.
     */
    it('throws ITPServiceError with code permission_denied when memberships array is empty', () => {
      fc.assert(
        fc.property(
          arbUserId,
          arbProjectId,
          arbPermission,
          arbMatrixRole,
          (userId, projectId, permission, role) => {
            const memberships: ITPProjectMembership[] = [];

            expect(() =>
              checkITPPermission(userId, projectId, permission, role, memberships),
            ).toThrow(ITPServiceError);

            try {
              checkITPPermission(userId, projectId, permission, role, memberships);
            } catch (err) {
              expect(err).toBeInstanceOf(ITPServiceError);
              expect((err as ITPServiceError).code).toBe('permission_denied');
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 9.8**
     *
     * When the user has memberships for OTHER projects but not the target project,
     * the function throws ITPServiceError with code 'permission_denied'.
     */
    it('throws ITPServiceError when user has membership on different project only', () => {
      fc.assert(
        fc.property(
          arbUserId,
          arbProjectId,
          fc.uuid(), // different project ID
          arbPermission,
          arbMatrixRole,
          (userId, targetProjectId, otherProjectId, permission, role) => {
            // Ensure different projects
            fc.pre(targetProjectId !== otherProjectId);

            const memberships: ITPProjectMembership[] = [
              { userId, projectId: otherProjectId, role, status: 'active' },
            ];

            expect(() =>
              checkITPPermission(userId, targetProjectId, permission, role, memberships),
            ).toThrow(ITPServiceError);

            try {
              checkITPPermission(userId, targetProjectId, permission, role, memberships);
            } catch (err) {
              expect(err).toBeInstanceOf(ITPServiceError);
              expect((err as ITPServiceError).code).toBe('permission_denied');
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Case 5: Exhaustive permission matrix validation ───────────────────────

  describe('Exhaustive permission-to-role mapping validation', () => {
    /**
     * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
     *
     * For every permission in the matrix, generating a random role from its
     * allowed list with active membership always succeeds. This exhaustively
     * validates all permission×role combinations.
     */
    it('every allowed (permission, role) pair with active membership succeeds', () => {
      for (const permission of ALL_PERMISSIONS) {
        fc.assert(
          fc.property(
            arbUserId,
            arbProjectId,
            arbAllowedRoleForPermission(permission),
            (userId, projectId, role) => {
              const memberships: ITPProjectMembership[] = [
                { userId, projectId, role, status: 'active' },
              ];

              const result = checkITPPermission(userId, projectId, permission, role, memberships);
              expect(result).toEqual({ allowed: true });
            },
          ),
          { numRuns: 100 },
        );
      }
    });

    /**
     * **Validates: Requirements 9.6**
     *
     * For every permission in the matrix, generating a random role NOT in its
     * allowed list with active membership always throws permission_denied.
     */
    it('every denied (permission, role) pair with active membership throws permission_denied', () => {
      for (const permission of ALL_PERMISSIONS) {
        fc.assert(
          fc.property(
            arbUserId,
            arbProjectId,
            arbDeniedRoleForPermission(permission),
            (userId, projectId, role) => {
              const memberships: ITPProjectMembership[] = [
                { userId, projectId, role, status: 'active' },
              ];

              try {
                checkITPPermission(userId, projectId, permission, role, memberships);
                // Should not reach here
                expect(true).toBe(false);
              } catch (err) {
                expect(err).toBeInstanceOf(ITPServiceError);
                expect((err as ITPServiceError).code).toBe('permission_denied');
              }
            },
          ),
          { numRuns: 100 },
        );
      }
    });
  });
});
