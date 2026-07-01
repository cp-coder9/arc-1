import type { UserRole } from '@/types';
import type { MarketplaceAction, RbacCheckResult } from '../types';

/**
 * Role-action permission matrix for the Architex Marketplace.
 *
 * Maps each MarketplaceAction to the set of UserRoles permitted to perform it.
 * Architect and BEP roles are treated as equivalent per Requirement 12.8.
 */

const CLIENT_ROLES: UserRole[] = ['client', 'developer'];
const PROFESSIONAL_ROLES: UserRole[] = [
  'architect',
  'engineer',
  'quantity_surveyor',
  'town_planner',
  'energy_professional',
  'fire_engineer',
  'bep',
];
const CONTRACTOR_ROLES: UserRole[] = ['contractor', 'subcontractor'];
const FREELANCER_ROLES: UserRole[] = ['freelancer'];
const SUPPLIER_ROLES: UserRole[] = ['supplier'];
const ADMIN_ROLES: UserRole[] = ['platform_admin', 'admin'];

/**
 * Permission matrix: action → allowed roles.
 */
const PERMISSION_MATRIX: Record<MarketplaceAction, UserRole[]> = {
  // Clients/Developers
  create_project_posting: CLIENT_ROLES,
  search_professionals: CLIENT_ROLES,
  accept_proposal: CLIENT_ROLES,
  receive_certificate: CLIENT_ROLES,

  // Professionals (architect, engineer, QS, town planner, energy, fire, BEP)
  apply_project: [...PROFESSIONAL_ROLES, ...CONTRACTOR_ROLES],
  create_task: PROFESSIONAL_ROLES,
  hire_freelancer: [...PROFESSIONAL_ROLES, ...CONTRACTOR_ROLES],
  post_collaboration: PROFESSIONAL_ROLES,

  // Freelancers
  apply_task: FREELANCER_ROLES,
  create_freelancer_profile: FREELANCER_ROLES,

  // Suppliers
  create_material_listing: SUPPLIER_ROLES,
  respond_quote: SUPPLIER_ROLES,

  // Contractors/Subcontractors
  search_suppliers: CONTRACTOR_ROLES,
  request_quote: CONTRACTOR_ROLES,

  // Admins
  resolve_dispute: ADMIN_ROLES,
  manage_verification: ADMIN_ROLES,
  access_analytics: ADMIN_ROLES,
};

/**
 * Normalizes a role for permission lookups.
 * Architect and BEP are treated as equivalent (Requirement 12.8).
 */
function normalizeRole(role: UserRole): UserRole {
  return role === 'bep' ? 'architect' : role;
}

/**
 * Normalizes the allowed roles list to account for architect/BEP equivalence.
 * If either 'architect' or 'bep' is in the allowed list, both are considered allowed.
 */
function isRoleAllowed(role: UserRole, allowedRoles: UserRole[]): boolean {
  const normalized = normalizeRole(role);
  return allowedRoles.some((r) => normalizeRole(r) === normalized);
}

/**
 * Checks whether a user with the given role is permitted to perform
 * the specified marketplace action.
 *
 * @param role - The authenticated user's role
 * @param action - The marketplace action being attempted
 * @returns RbacCheckResult indicating allowed/denied with required roles on denial
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9
 */
export function checkMarketplacePermission(
  role: UserRole,
  action: MarketplaceAction
): RbacCheckResult {
  const allowedRoles = PERMISSION_MATRIX[action];

  if (!allowedRoles) {
    return {
      allowed: false,
      requiredRoles: [],
      reason: `Unknown marketplace action: ${action}`,
    };
  }

  if (isRoleAllowed(role, allowedRoles)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    requiredRoles: allowedRoles,
    reason: `Role '${role}' is not permitted to perform '${action}'. Required roles: ${allowedRoles.join(', ')}`,
  };
}

/**
 * Checks whether a user has access within a given tenant scope.
 *
 * Returns true if:
 * - The user's tenantId matches the resource tenantId, OR
 * - The user has a platform_admin or admin role (cross-tenant access)
 *
 * This is a lightweight helper for tenant isolation in listing/search queries.
 */
export async function checkTenantAccess(
  userId: string,
  tenantId: string
): Promise<boolean> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;

    const userData = userDoc.data();
    const userRole = userData?.role as UserRole | undefined;

    // Platform admins have cross-tenant access
    if (userRole === 'platform_admin' || userRole === 'admin') {
      return true;
    }

    // Check if user belongs to the tenant (by userId match or organisationId)
    const userTenantId = userData?.tenantId || userData?.organisationId || userId;
    return userTenantId === tenantId;
  } catch (error) {
    console.error('[MarketplaceRBAC] Failed to check tenant access:', error);
    return false;
  }
}
