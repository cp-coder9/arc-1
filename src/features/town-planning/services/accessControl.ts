/**
 * Town Planning Access Control Service
 *
 * Implements role-based access control for the Town Planning module.
 * Uses a permission matrix mapping roles to allowed actions, supports
 * multi-role union logic (least restrictive per feature), and validates
 * project membership for non-admin roles.
 */

import type { UserRole } from '@/types';
import type {
  TownPlanningAction,
  TownPlanningPermissions,
  PermissionCheckResult,
} from '../types';

// ─── Permission Matrix ───────────────────────────────────────────────────────

/** All actions available in the town planning module */
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

/**
 * Role-action permission matrix.
 * Maps each UserRole to its permitted TownPlanningActions.
 *
 * Groupings:
 * - town_planner: all actions except approve_costs
 * - land_surveyor: view + property + subdivision + surveyor
 * - architect, bep: view + property + link_drawings
 * - client, developer: view + approve_costs
 * - site_manager: view only
 * - admin, platform_admin: ALL actions (full access)
 * - All other roles: [] (no access)
 */
export const PERMISSION_MATRIX: Record<UserRole, TownPlanningAction[]> = {
  // Full planning access (all except approve_costs)
  town_planner: ALL_ACTIONS.filter((a) => a !== 'approve_costs'),

  // Surveyor access: view + property + subdivision
  land_surveyor: [
    'view_application',
    'view_property',
    'update_property',
    'manage_subdivision',
    'manage_surveyor',
    'view_conditions',
    'view_documents',
  ],

  // Architect & BEP: view + property + link drawings
  architect: [
    'view_application',
    'view_property',
    'update_property',
    'link_drawings',
    'view_conditions',
    'view_documents',
  ],
  bep: [
    'view_application',
    'view_property',
    'update_property',
    'link_drawings',
    'view_conditions',
    'view_documents',
  ],

  // Client & Developer: view + approve costs
  client: [
    'view_application',
    'view_conditions',
    'approve_costs',
    'view_documents',
  ],
  developer: [
    'view_application',
    'view_conditions',
    'approve_costs',
    'view_documents',
  ],

  // Site manager: view only
  site_manager: [
    'view_application',
    'view_conditions',
    'view_documents',
  ],

  // Admin roles: full access
  admin: [...ALL_ACTIONS],
  platform_admin: [...ALL_ACTIONS],

  // All other roles: no access
  engineer: [],
  quantity_surveyor: [],
  energy_professional: [],
  fire_engineer: [],
  contractor: [],
  subcontractor: [],
  supplier: [],
  freelancer: [],
  firm_admin: [],
  cpm: [],
};

// ─── Admin Role Check ────────────────────────────────────────────────────────

/**
 * Returns true if the given role has admin-level access (bypasses project membership).
 */
export function isAdminRole(role: UserRole): boolean {
  return role === 'admin' || role === 'platform_admin';
}

// ─── Effective Permissions ───────────────────────────────────────────────────

/**
 * Computes the effective permissions for a set of roles by taking the union
 * of all permitted actions (least restrictive per feature / multi-role union).
 *
 * If any role is an admin role, the user gets full access.
 */
export function getEffectivePermissions(roles: UserRole[]): TownPlanningPermissions {
  const hasAdmin = roles.some(isAdminRole);

  if (hasAdmin) {
    return {
      allowedActions: [...ALL_ACTIONS],
      isAdmin: true,
      roles,
    };
  }

  // Union of all actions across all roles (least restrictive)
  const actionSet = new Set<TownPlanningAction>();
  for (const role of roles) {
    const actions = PERMISSION_MATRIX[role] ?? [];
    for (const action of actions) {
      actionSet.add(action);
    }
  }

  return {
    allowedActions: Array.from(actionSet),
    isAdmin: false,
    roles,
  };
}

// ─── Permission Check ────────────────────────────────────────────────────────

export interface CheckPermissionOptions {
  /** User ID performing the action */
  userId: string;
  /** Project the action is being performed on */
  projectId: string;
  /** The action being attempted */
  action: TownPlanningAction;
  /** User's roles (if already known; avoids re-fetching) */
  roles?: UserRole[];
  /**
   * Override for project membership check (for testability).
   * When provided, skips Firestore lookup and uses this value directly.
   * When omitted, defaults to performing a Firestore project team lookup.
   */
  isProjectMember?: boolean;
}

/**
 * Checks whether a user is permitted to perform a given action on a project.
 *
 * Logic:
 * 1. Admin/platform_admin roles bypass project membership check.
 * 2. All other roles require project team membership.
 * 3. If user has multiple roles, compute union of permissions (multi-role logic).
 * 4. Returns allowed=true only if action is in effective permission set AND membership is satisfied.
 */
export async function checkPermission(
  options: CheckPermissionOptions
): Promise<PermissionCheckResult> {
  const { userId, projectId, action, roles = [], isProjectMember } = options;

  // No roles → no access
  if (roles.length === 0) {
    return {
      allowed: false,
      reason: 'No roles assigned to user',
    };
  }

  // Compute effective permissions from all roles
  const permissions = getEffectivePermissions(roles);

  // Check if action is in the effective permission set
  if (!permissions.allowedActions.includes(action)) {
    return {
      allowed: false,
      reason: `Action '${action}' is not permitted for roles: ${roles.join(', ')}`,
    };
  }

  // Admin roles bypass project membership check
  if (permissions.isAdmin) {
    return { allowed: true };
  }

  // Non-admin roles require project membership
  const membershipStatus =
    isProjectMember !== undefined
      ? isProjectMember
      : await lookupProjectMembership(userId, projectId);

  if (!membershipStatus) {
    return {
      allowed: false,
      reason: `User '${userId}' is not a member of project '${projectId}'`,
    };
  }

  return { allowed: true };
}

// ─── Project Membership Lookup ───────────────────────────────────────────────

/**
 * Looks up whether a user is a member of the given project's team.
 * Queries Firestore `projects/{projectId}/team` collection or the project's
 * team array field.
 *
 * This is a placeholder implementation that will be wired to actual Firestore
 * once the persistence layer is integrated. For now it returns false by default,
 * requiring callers to pass `isProjectMember` for testability.
 */
async function lookupProjectMembership(
  _userId: string,
  _projectId: string
): Promise<boolean> {
  // TODO: Wire to Firestore project team lookup
  // const projectDoc = await db.collection('projects').doc(projectId).get();
  // const teamMembers = projectDoc.data()?.team ?? [];
  // return teamMembers.some(member => member.userId === userId);
  return false;
}
