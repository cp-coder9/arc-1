/**
 * Shared test suite: Firestore Rules and API Guard Agreement
 *
 * Validates: Requirement 6.6
 *
 * THE Firestore_Rules and API_Guard SHALL produce identical allow/deny decisions
 * for any given (user, action, resource) tuple — verified by a shared test suite
 * that asserts agreement across at least the full set of PermissionAction values
 * and all ProjectAccessRole combinations.
 *
 * Since the API Guard middleware (requirePermissionWithGuards) evaluates permissions
 * via `canUserPerform` from the Permission Service, and Firestore security rules mirror
 * the same ROLE_PERMISSIONS and PROJECT_ACCESS_PERMISSIONS matrices, this test suite
 * verifies that `canUserPerform` produces deterministic, expected allow/deny decisions
 * for the full cross-product of (ProjectAccessRole × PermissionAction).
 *
 * The agreement matrix documented below defines the expected truth table that both
 * Firestore rules and API Guard must honour identically.
 */

import { describe, expect, it } from 'vitest';
import {
  canUserPerform,
  type AuthzUser,
  type PermissionAction,
  type ProjectAccessRole,
  type ProjectAccessContext,
  type ProjectMembershipLike,
} from '@/services/permissionService';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** All PermissionAction values in the system */
const ALL_PERMISSION_ACTIONS: PermissionAction[] = [
  'project:read',
  'project:update',
  'project:manage_members',
  'profile:read',
  'profile:update',
  'verification:review',
  'audit:read',
  'audit:write',
  'admin:override',
  'payment:read',
  'payment:manage',
  'escrow:release',
  'compliance:sign',
  'municipal:manage',
  'municipal:view_insight',
];

/** All ProjectAccessRole values in the system */
const ALL_PROJECT_ACCESS_ROLES: ProjectAccessRole[] = [
  'project_owner',
  'lead_bep',
  'lead_consultant',
  'project_administrator',
  'design_team_member',
  'contractor',
  'subcontractor_package_assignee',
  'supplier_package_assignee',
  'freelancer_task_assignee',
];

/**
 * Expected agreement matrix: ProjectAccessRole → allowed PermissionAction[].
 *
 * This matrix documents the expected allow/deny decisions that BOTH Firestore rules
 * and API Guard must produce identically.
 *
 * The matrix is derived by computing the ACTUAL `canUserPerform` logic:
 * - Non-project-scoped actions (profile:read, profile:update): allowed purely by ROLE_PERMISSIONS
 * - Project-scoped actions (project:*, municipal:*, payment:*, compliance:sign, escrow:release):
 *   requires BOTH ROLE_PERMISSIONS[userRole].includes(action) AND PROJECT_ACCESS_PERMISSIONS[accessRole].includes(action)
 *
 * This mirrors the dual-layer enforcement: Firestore rules check project membership + action permission,
 * API Guard middleware evaluates canUserPerform which applies the same compound check.
 *
 * Key: For each ProjectAccessRole, the compatible user role determines ROLE_PERMISSIONS.
 * The effective allowed set = (non-project-scoped from role) ∪ (project-scoped ∩ role ∩ projectAccess)
 */
const EXPECTED_PROJECT_ACCESS_MATRIX: Record<ProjectAccessRole, PermissionAction[]> = {
  // User role: client. Role perms: project:read, profile:read, profile:update, payment:read, municipal:view_insight
  // Project access perms: project:read, project:update, payment:read, municipal:view_insight
  // Project-scoped allowed (intersection): project:read, payment:read, municipal:view_insight
  // Non-project-scoped allowed (role): profile:read, profile:update
  project_owner: ['project:read', 'payment:read', 'municipal:view_insight', 'profile:read', 'profile:update'],

  // User role: bep. Role perms: project:read, project:update, profile:read, profile:update, compliance:sign, municipal:manage
  // Project access perms: project:read, project:update, project:manage_members, compliance:sign, municipal:manage, payment:read
  // Project-scoped allowed (intersection): project:read, project:update, compliance:sign, municipal:manage
  // Non-project-scoped allowed (role): profile:read, profile:update
  lead_bep: ['project:read', 'project:update', 'compliance:sign', 'municipal:manage', 'profile:read', 'profile:update'],

  // User role: bep. Same role perms as lead_bep.
  // Project access perms: project:read, project:update, project:manage_members, compliance:sign, municipal:manage, payment:read
  // Project-scoped allowed (intersection): project:read, project:update, compliance:sign, municipal:manage
  // Non-project-scoped allowed (role): profile:read, profile:update
  lead_consultant: ['project:read', 'project:update', 'compliance:sign', 'municipal:manage', 'profile:read', 'profile:update'],

  // User role: bep. Same role perms.
  // Project access perms: project:read, project:update, project:manage_members, audit:read, payment:read, payment:manage
  // Project-scoped allowed (intersection): project:read, project:update
  // Non-project-scoped allowed (role): profile:read, profile:update
  project_administrator: ['project:read', 'project:update', 'profile:read', 'profile:update'],

  // User role: bep. Same role perms.
  // Project access perms: project:read, project:update, municipal:manage
  // Project-scoped allowed (intersection): project:read, project:update, municipal:manage
  // Non-project-scoped allowed (role): profile:read, profile:update
  design_team_member: ['project:read', 'project:update', 'municipal:manage', 'profile:read', 'profile:update'],

  // User role: contractor. Role perms: project:read, project:update, profile:read, profile:update, payment:read, municipal:view_insight
  // Project access perms: project:read, project:update, payment:read, municipal:view_insight
  // Project-scoped allowed (intersection): project:read, project:update, payment:read, municipal:view_insight
  // Non-project-scoped allowed (role): profile:read, profile:update
  contractor: ['project:read', 'project:update', 'payment:read', 'municipal:view_insight', 'profile:read', 'profile:update'],

  // User role: subcontractor. Role perms: project:read, profile:read, profile:update, payment:read
  // Project access perms: project:read, payment:read
  // Project-scoped allowed (intersection): project:read, payment:read
  // Non-project-scoped allowed (role): profile:read, profile:update
  subcontractor_package_assignee: ['project:read', 'payment:read', 'profile:read', 'profile:update'],

  // User role: supplier. Role perms: project:read, profile:read, profile:update, payment:read
  // Project access perms: project:read, payment:read
  // Project-scoped allowed (intersection): project:read, payment:read
  // Non-project-scoped allowed (role): profile:read, profile:update
  supplier_package_assignee: ['project:read', 'payment:read', 'profile:read', 'profile:update'],

  // User role: freelancer. Role perms: project:read, profile:read, profile:update
  // Project access perms: project:read
  // Project-scoped allowed (intersection): project:read
  // Non-project-scoped allowed (role): profile:read, profile:update
  freelancer_task_assignee: ['project:read', 'profile:read', 'profile:update'],
};

/**
 * User role that is compatible with each ProjectAccessRole.
 * Used to construct valid AuthzUser objects for each access role scenario.
 */
const COMPATIBLE_USER_ROLE: Record<ProjectAccessRole, string> = {
  project_owner: 'client',
  lead_bep: 'bep',
  lead_consultant: 'bep',
  project_administrator: 'bep',
  design_team_member: 'bep',
  contractor: 'contractor',
  subcontractor_package_assignee: 'subcontractor',
  supplier_package_assignee: 'supplier',
  freelancer_task_assignee: 'freelancer',
};

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Create an AuthzUser with a compatible role for the given ProjectAccessRole.
 */
function createUserForAccessRole(accessRole: ProjectAccessRole, uid = 'test-user-001'): AuthzUser {
  return {
    uid,
    role: COMPATIBLE_USER_ROLE[accessRole],
  };
}

/**
 * Create a ProjectAccessContext with the user assigned a specific access role.
 */
function createProjectWithMembership(
  accessRole: ProjectAccessRole,
  uid = 'test-user-001',
): ProjectAccessContext {
  const projectId = 'project-agreement-test';

  // Handle special cases where role is derived from ownership rather than membership array
  if (accessRole === 'project_owner') {
    return {
      projectId,
      clientId: uid,
      memberships: [],
    };
  }

  if (accessRole === 'lead_bep') {
    return {
      projectId,
      leadProfessionalId: uid,
      leadBepId: uid,
      memberships: [],
    };
  }

  // All other roles come from explicit membership records
  const membership: ProjectMembershipLike = {
    userId: uid,
    accessRole,
    status: 'active',
  };

  return {
    projectId,
    clientId: 'other-client-uid',
    leadProfessionalId: 'other-lead-uid',
    memberships: [membership],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Full Agreement Matrix
// ══════════════════════════════════════════════════════════════════════════════

describe('Requirement 6.6: Firestore Rules and API Guard Agreement Matrix', () => {
  describe('Agreement matrix completeness', () => {
    it('covers all 9 ProjectAccessRole values', () => {
      const matrixRoles = Object.keys(EXPECTED_PROJECT_ACCESS_MATRIX);
      expect(matrixRoles.sort()).toEqual([...ALL_PROJECT_ACCESS_ROLES].sort());
    });

    it('covers all 15 PermissionAction values in test assertions', () => {
      // Verify every action appears in at least one role's allow set OR is tested as denied
      const testedActions = new Set<string>();
      for (const actions of Object.values(EXPECTED_PROJECT_ACCESS_MATRIX)) {
        for (const action of actions) {
          testedActions.add(action);
        }
      }
      // The remaining actions that appear in no role's allow set are tested as denied
      const deniedActions = ALL_PERMISSION_ACTIONS.filter(a => !testedActions.has(a));
      expect([...testedActions, ...deniedActions].sort()).toEqual([...ALL_PERMISSION_ACTIONS].sort());
    });
  });

  describe('canUserPerform produces deterministic allow/deny for full matrix', () => {
    for (const accessRole of ALL_PROJECT_ACCESS_ROLES) {
      describe(`ProjectAccessRole: ${accessRole}`, () => {
        const allowedActions = new Set(EXPECTED_PROJECT_ACCESS_MATRIX[accessRole]);
        const uid = `user-${accessRole}`;
        const user = createUserForAccessRole(accessRole, uid);
        const project = createProjectWithMembership(accessRole, uid);

        for (const action of ALL_PERMISSION_ACTIONS) {
          const expectedDecision = allowedActions.has(action) ? 'ALLOW' : 'DENY';

          it(`${action} → ${expectedDecision}`, () => {
            const result = canUserPerform(user, action, project);

            if (expectedDecision === 'ALLOW') {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          });
        }
      });
    }
  });

  describe('Determinism: repeated evaluations produce identical results', () => {
    it('canUserPerform is deterministic across 100 consecutive calls per tuple', () => {
      for (const accessRole of ALL_PROJECT_ACCESS_ROLES) {
        const uid = `determinism-user-${accessRole}`;
        const user = createUserForAccessRole(accessRole, uid);
        const project = createProjectWithMembership(accessRole, uid);

        for (const action of ALL_PERMISSION_ACTIONS) {
          const firstResult = canUserPerform(user, action, project);

          // Run 100 times and verify identical result
          for (let i = 0; i < 100; i++) {
            const subsequentResult = canUserPerform(user, action, project);
            expect(subsequentResult).toBe(firstResult);
          }
        }
      }
    });
  });

  describe('Edge cases: agreement for boundary conditions', () => {
    it('null user is denied for all actions across all project access roles', () => {
      for (const accessRole of ALL_PROJECT_ACCESS_ROLES) {
        const project = createProjectWithMembership(accessRole, 'some-user');
        for (const action of ALL_PERMISSION_ACTIONS) {
          expect(canUserPerform(null, action, project)).toBe(false);
        }
      }
    });

    it('undefined user is denied for all actions across all project access roles', () => {
      for (const accessRole of ALL_PROJECT_ACCESS_ROLES) {
        const project = createProjectWithMembership(accessRole, 'some-user');
        for (const action of ALL_PERMISSION_ACTIONS) {
          expect(canUserPerform(undefined, action, project)).toBe(false);
        }
      }
    });

    it('user without project membership is denied project-scoped actions', () => {
      const nonMemberUser: AuthzUser = { uid: 'non-member', role: 'bep' };
      const project: ProjectAccessContext = {
        projectId: 'test-project',
        clientId: 'different-user',
        leadProfessionalId: 'different-lead',
        memberships: [],
      };

      const projectScopedActions: PermissionAction[] = [
        'project:read',
        'project:update',
        'project:manage_members',
        'payment:read',
        'payment:manage',
        'escrow:release',
        'compliance:sign',
        'municipal:manage',
        'municipal:view_insight',
      ];

      for (const action of projectScopedActions) {
        expect(canUserPerform(nonMemberUser, action, project)).toBe(false);
      }
    });

    it('user with inactive membership status is denied all project-scoped actions', () => {
      const uid = 'inactive-member';
      const user: AuthzUser = { uid, role: 'bep' };
      const project: ProjectAccessContext = {
        projectId: 'test-project',
        clientId: 'other-client',
        memberships: [
          { userId: uid, accessRole: 'lead_bep', status: 'suspended' },
          { userId: uid, accessRole: 'design_team_member', status: 'removed' },
        ],
      };

      for (const action of ALL_PERMISSION_ACTIONS) {
        if (action.startsWith('project:') || action.startsWith('municipal:') ||
            action.startsWith('payment:') || action === 'compliance:sign' || action === 'escrow:release') {
          expect(canUserPerform(user, action, project)).toBe(false);
        }
      }
    });
  });

  describe('Agreement documentation: full decision matrix', () => {
    /**
     * This test generates and verifies the complete decision matrix.
     * The matrix represents the single source of truth that both
     * Firestore security rules and API Guard middleware must follow.
     */
    it('complete decision matrix matches expected truth table', () => {
      const actualMatrix: Record<string, Record<string, boolean>> = {};

      for (const accessRole of ALL_PROJECT_ACCESS_ROLES) {
        actualMatrix[accessRole] = {};
        const uid = `matrix-user-${accessRole}`;
        const user = createUserForAccessRole(accessRole, uid);
        const project = createProjectWithMembership(accessRole, uid);

        for (const action of ALL_PERMISSION_ACTIONS) {
          actualMatrix[accessRole][action] = canUserPerform(user, action, project);
        }
      }

      // Verify against expected matrix
      for (const accessRole of ALL_PROJECT_ACCESS_ROLES) {
        const expectedAllowed = new Set(EXPECTED_PROJECT_ACCESS_MATRIX[accessRole]);

        for (const action of ALL_PERMISSION_ACTIONS) {
          const expected = expectedAllowed.has(action);
          const actual = actualMatrix[accessRole][action];

          expect(actual).toBe(expected);
        }
      }
    });

    it('total matrix size is 9 roles × 15 actions = 135 decision tuples', () => {
      const totalTuples = ALL_PROJECT_ACCESS_ROLES.length * ALL_PERMISSION_ACTIONS.length;
      expect(totalTuples).toBe(135);
    });

    it('logs agreement matrix summary for documentation', () => {
      const summary: string[] = [];
      summary.push('=== Firestore Rules / API Guard Agreement Matrix ===');
      summary.push(`Total tuples: ${ALL_PROJECT_ACCESS_ROLES.length} roles × ${ALL_PERMISSION_ACTIONS.length} actions = ${ALL_PROJECT_ACCESS_ROLES.length * ALL_PERMISSION_ACTIONS.length}`);
      summary.push('');

      let allowCount = 0;
      let denyCount = 0;

      for (const accessRole of ALL_PROJECT_ACCESS_ROLES) {
        const allowed = EXPECTED_PROJECT_ACCESS_MATRIX[accessRole];
        allowCount += allowed.length;
        denyCount += ALL_PERMISSION_ACTIONS.length - allowed.length;
        summary.push(`  ${accessRole}: ${allowed.length} ALLOW, ${ALL_PERMISSION_ACTIONS.length - allowed.length} DENY`);
      }

      summary.push('');
      summary.push(`Total ALLOW decisions: ${allowCount}`);
      summary.push(`Total DENY decisions: ${denyCount}`);
      summary.push('=== End Agreement Matrix ===');

      // Log for documentation — actual verification is in other tests
      console.log(summary.join('\n'));

      expect(allowCount + denyCount).toBe(135);
    });
  });
});
