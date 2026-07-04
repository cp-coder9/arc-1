/**
 * RBAC is enforced in two layers:
 * 1. Client-side: UI visibility (hide/show tabs and action buttons) using role from UserProfile
 * 2. Server-side: All mutations go through API routes where the user's role and project assignment
 *    are verified from the authenticated Firebase session before calling service functions.
 *
 * This service provides the permission logic used by BOTH layers.
 * Client components use it for UI gating; API routes use it for authorization enforcement.
 */

/**
 * Contract Administration — Role-Based Access Control Service
 *
 * Encodes the role-feature-permission matrix per Requirements 9.1–9.9.
 * Provides permission lookup, access check, and multi-role resolution.
 *
 * @module contractRbacService
 */

import type { UserRole } from '@/types';
import type {
  ContractFeature,
  ContractPermission,
  ContractProjectAssignment,
  ContractError,
} from './contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Role-Feature-Permission Matrix
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Permission matrix encoding per Requirements 9.1–9.6.
 *
 * Each entry maps a role to the features it can access and what permissions
 * it holds on those features, along with the assignment predicate required.
 */
interface RolePermissionEntry {
  /** Which assignment field must be true (or null for no assignment needed) */
  assignmentCheck: keyof ContractProjectAssignment | null;
  /** Feature → permissions mapping */
  permissions: Partial<Record<ContractFeature, ContractPermission[]>>;
}

/**
 * The full RBAC matrix.
 *
 * Requirement 9.1: architect, bep, quantity_surveyor (assigned team member)
 *   → read+write on contract_setup, notices, variations, payment_schedule, claims, eot, data_sheet_view, data_sheet_edit
 *
 * Requirement 9.2: contractor (assigned contractor)
 *   → write claims, respond notices (write), request eot (write), read data_sheet_view, read variations
 *
 * Requirement 9.3: subcontractor (assigned subcontractor)
 *   → read scope (data_sheet_view), submit claims through contractor (read claims), view notices (read notices)
 *
 * Requirement 9.4: client, developer (project owner)
 *   → read contract status (data_sheet_view), approve variations, read claims summary (read claims)
 *
 * Requirement 9.5: site_manager (assigned site manager)
 *   → read+write notices (respond to site notices), read variations
 *
 * Requirement 9.6: admin, platform_admin
 *   → full read+write to all features across all projects (no project assignment needed)
 */
const ROLE_PERMISSION_MATRIX: Partial<Record<UserRole, RolePermissionEntry>> = {
  architect: {
    assignmentCheck: 'isAssignedTeamMember',
    permissions: {
      contract_setup: ['read', 'write'],
      notices: ['read', 'write'],
      variations: ['read', 'write'],
      payment_schedule: ['read', 'write'],
      claims: ['read', 'write'],
      eot: ['read', 'write'],
      data_sheet_view: ['read'],
      data_sheet_edit: ['read', 'write'],
    },
  },
  bep: {
    assignmentCheck: 'isAssignedTeamMember',
    permissions: {
      contract_setup: ['read', 'write'],
      notices: ['read', 'write'],
      variations: ['read', 'write'],
      payment_schedule: ['read', 'write'],
      claims: ['read', 'write'],
      eot: ['read', 'write'],
      data_sheet_view: ['read'],
      data_sheet_edit: ['read', 'write'],
    },
  },
  quantity_surveyor: {
    assignmentCheck: 'isAssignedTeamMember',
    permissions: {
      contract_setup: ['read', 'write'],
      notices: ['read', 'write'],
      variations: ['read', 'write'],
      payment_schedule: ['read', 'write'],
      claims: ['read', 'write'],
      eot: ['read', 'write'],
      data_sheet_view: ['read'],
      data_sheet_edit: ['read', 'write'],
    },
  },
  contractor: {
    assignmentCheck: 'isAssignedContractor',
    permissions: {
      claims: ['read', 'write'],
      notices: ['read', 'write'],
      eot: ['read', 'write'],
      data_sheet_view: ['read'],
      variations: ['read'],
    },
  },
  subcontractor: {
    assignmentCheck: 'isAssignedSubcontractor',
    permissions: {
      data_sheet_view: ['read'],
      claims: ['read'],
      notices: ['read'],
    },
  },
  client: {
    assignmentCheck: 'isProjectOwner',
    permissions: {
      data_sheet_view: ['read'],
      variations: ['read', 'approve'],
      claims: ['read'],
    },
  },
  developer: {
    assignmentCheck: 'isProjectOwner',
    permissions: {
      data_sheet_view: ['read'],
      variations: ['read', 'approve'],
      claims: ['read'],
    },
  },
  site_manager: {
    assignmentCheck: 'isAssignedSiteManager',
    permissions: {
      notices: ['read', 'write'],
      variations: ['read'],
    },
  },
  admin: {
    assignmentCheck: null,
    permissions: {
      contract_setup: ['read', 'write'],
      notices: ['read', 'write'],
      variations: ['read', 'write', 'approve'],
      payment_schedule: ['read', 'write'],
      claims: ['read', 'write'],
      eot: ['read', 'write'],
      data_sheet_view: ['read'],
      data_sheet_edit: ['read', 'write'],
    },
  },
  platform_admin: {
    assignmentCheck: null,
    permissions: {
      contract_setup: ['read', 'write'],
      notices: ['read', 'write'],
      variations: ['read', 'write', 'approve'],
      payment_schedule: ['read', 'write'],
      claims: ['read', 'write'],
      eot: ['read', 'write'],
      data_sheet_view: ['read'],
      data_sheet_edit: ['read', 'write'],
    },
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get the permissions a user role has for a given contract feature.
 *
 * Returns an empty array if the role has no access to the feature or
 * the user does not meet the required project assignment condition.
 *
 * @param userRole - The user's role in the platform
 * @param feature - The contract feature being accessed
 * @param projectAssignment - The user's project-level assignment details
 * @returns Array of permissions the user has for the feature
 */
export function getPermissions(
  userRole: UserRole,
  feature: ContractFeature,
  projectAssignment: ContractProjectAssignment
): ContractPermission[] {
  const entry = ROLE_PERMISSION_MATRIX[userRole];

  if (!entry) {
    return [];
  }

  // Check project assignment requirement (Req 9.1–9.5 require assignment; 9.6 does not)
  if (entry.assignmentCheck !== null) {
    const assignmentValue = projectAssignment[entry.assignmentCheck];
    if (!assignmentValue) {
      return [];
    }
  }

  const featurePermissions = entry.permissions[feature];
  if (!featurePermissions) {
    return [];
  }

  return [...featurePermissions];
}

/**
 * Check whether a user role can perform a specific permission on a contract feature.
 *
 * @param userRole - The user's role in the platform
 * @param feature - The contract feature being accessed
 * @param permission - The specific permission being checked (read, write, approve)
 * @param projectAssignment - The user's project-level assignment details
 * @returns true if the user has the specified permission, false otherwise
 */
export function canAccess(
  userRole: UserRole,
  feature: ContractFeature,
  permission: ContractPermission,
  projectAssignment: ContractProjectAssignment
): boolean {
  const permissions = getPermissions(userRole, feature, projectAssignment);
  return permissions.includes(permission);
}

/**
 * Resolve permissions for a user holding multiple roles.
 *
 * Per Requirement 9.8: grants the union of permissions associated with each
 * assigned role, applying the least restrictive (most permissive) access.
 *
 * @param roles - Array of roles the user holds
 * @param feature - The contract feature being accessed
 * @param projectAssignment - The user's project-level assignment details
 * @returns Union of all permissions from all roles (deduplicated)
 */
export function resolveMultiRolePermissions(
  roles: UserRole[],
  feature: ContractFeature,
  projectAssignment: ContractProjectAssignment
): ContractPermission[] {
  const permissionSet = new Set<ContractPermission>();

  for (const role of roles) {
    const rolePermissions = getPermissions(role, feature, projectAssignment);
    for (const perm of rolePermissions) {
      permissionSet.add(perm);
    }
  }

  return Array.from(permissionSet);
}

/**
 * Assert that a user has access to a feature with a specific permission.
 * Throws a structured UNAUTHORIZED error if access is denied.
 *
 * Per Requirement 9.7: denies the action, prevents state change, and returns
 * an error indicating the user lacks authorization.
 *
 * @param userRole - The user's role (or roles for multi-role check)
 * @param feature - The contract feature being accessed
 * @param permission - The required permission
 * @param projectAssignment - The user's project-level assignment details
 * @throws ContractError with code UNAUTHORIZED if access is denied
 */
export function assertAccess(
  userRole: UserRole | UserRole[],
  feature: ContractFeature,
  permission: ContractPermission,
  projectAssignment: ContractProjectAssignment
): void {
  const roles = Array.isArray(userRole) ? userRole : [userRole];

  const resolvedPermissions = resolveMultiRolePermissions(roles, feature, projectAssignment);

  if (!resolvedPermissions.includes(permission)) {
    const error: ContractError = {
      code: 'UNAUTHORIZED',
      message: `Access denied: user lacks '${permission}' permission for '${feature}'. Required role/assignment not satisfied.`,
      details: {
        invalidFields: [feature],
      },
    };
    throw error;
  }
}

/** Default approval threshold per Requirement 9.9 */
export const DEFAULT_APPROVAL_THRESHOLD = 0;
