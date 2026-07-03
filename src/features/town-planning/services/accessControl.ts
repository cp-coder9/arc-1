/**
 * Town Planning Access Control Service
 *
 * Role-based access control for town planning workflows.
 * Uses dependency injection for Firestore to enable testability.
 */

import type { UserRole } from '@/types';
import type { TownPlanningAction, TownPlanningPermissions, ActorContext } from '../types';
import { ROLE_PERMISSIONS, hasPermission } from '../types';

// ─── Firestore DI Interface ───────────────────────────────────────────────────

export interface FirestoreDB {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>): Promise<void>;
      update(data: Record<string, unknown>): Promise<void>;
    };
    where(field: string, op: string, value: unknown): {
      get(): Promise<{ docs: Array<{ id: string; data(): Record<string, unknown> }> }>;
    };
    add(data: Record<string, unknown>): Promise<{ id: string }>;
  };
}

// ─── Permission Matrix ────────────────────────────────────────────────────────

/**
 * Full permission matrix mapping roles to allowed actions.
 * Re-exported from types for service-layer consumers.
 */
export const PERMISSION_MATRIX: Record<UserRole, TownPlanningAction[]> = ROLE_PERMISSIONS;

// ─── Admin Role Check ─────────────────────────────────────────────────────────

const ADMIN_ROLES: UserRole[] = ['admin', 'platform_admin'];

/**
 * Check if a role has admin-level access for town planning.
 */
export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

// ─── Permission Checking ──────────────────────────────────────────────────────

/**
 * Check if a given role has permission to perform a specific action.
 * Throws if the action is not permitted.
 */
export function checkPermission(
  role: UserRole,
  action: TownPlanningAction,
): { allowed: boolean; reason?: string } {
  const allowed = hasPermission(role, action);
  if (!allowed) {
    return {
      allowed: false,
      reason: `Role '${role}' does not have permission to perform '${action}'`,
    };
  }
  return { allowed: true };
}

// ─── Effective Permissions ────────────────────────────────────────────────────

/**
 * Get the full set of effective permissions for a given role.
 */
export function getEffectivePermissions(role: UserRole): TownPlanningPermissions {
  const allActions: TownPlanningAction[] = [
    'create_application',
    'edit_application',
    'view_application',
    'transition_stage',
    'add_comment',
    'respond_to_comment',
    'add_condition',
    'update_condition',
    'waive_condition',
    'upload_document',
    'manage_municipality',
    'submit_appeal',
    'decide_application',
    'view_all_applications',
    'delete_application',
  ];

  const permissions = {} as TownPlanningPermissions;
  for (const action of allActions) {
    permissions[action] = hasPermission(role, action);
  }

  return permissions;
}

/**
 * Build an ActorContext from user identity and role.
 */
export function buildActorContext(
  userId: string,
  role: UserRole,
  options?: { municipalityId?: string; firmId?: string },
): ActorContext {
  return {
    userId,
    role,
    permissions: getEffectivePermissions(role),
    municipalityId: options?.municipalityId,
    firmId: options?.firmId,
  };
}
