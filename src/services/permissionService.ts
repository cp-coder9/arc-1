import type { UserRole, PermissionAction as CentralPermissionAction, ProjectAccessRole as CentralProjectAccessRole, AdminOverrideRequest as CentralAdminOverrideRequest, AdminOverrideAuditEntry } from '@/types';
import { getLeadProfessionalId } from '@/lib/professionalRoleCompatibility';

export const CANONICAL_USER_ROLES = [
  'client',
  // Legacy/current UI role. For authorization, architect is treated as a BEP subtype.
  'architect',
  'bep',
  'contractor',
  'freelancer',
  'subcontractor',
  'supplier',
  'admin',
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
  'health_safety',
] as const satisfies readonly UserRole[];

export type NormalizedUserRole = Exclude<UserRole, 'architect'>;

export type ProjectAccessRole =
  | 'project_owner'
  | 'lead_bep'
  | 'lead_consultant'
  | 'project_administrator'
  | 'design_team_member'
  | 'contractor'
  | 'subcontractor_package_assignee'
  | 'supplier_package_assignee'
  | 'freelancer_task_assignee';

export type PermissionAction =
  | 'project:read'
  | 'project:update'
  | 'project:manage_members'
  | 'profile:read'
  | 'profile:update'
  | 'verification:review'
  | 'audit:read'
  | 'audit:write'
  | 'admin:override'
  | 'payment:read'
  | 'payment:manage'
  | 'escrow:release'
  | 'compliance:sign'
  | 'municipal:manage'
  | 'municipal:view_insight';

export interface AuthzUser {
  uid: string;
  role?: UserRole | string;
  admin?: boolean;
  verificationStatus?: string;
  /** Indicates this user has platform_admin permissions merged (e.g. Professional_Role + admin:true) */
  isPlatformAdmin?: boolean;
}

export interface AdminOverrideRequest {
  admin: AuthzUser | null | undefined;
  action?: CentralPermissionAction;
  projectId?: string;
  policy?: 'separation_of_duty';
  reason: string;
}

export interface ProjectMembershipLike {
  userId: string;
  accessRole: ProjectAccessRole;
  status: 'invited' | 'active' | 'removed' | 'suspended';
}

export interface ProjectAccessContext {
  projectId: string;
  clientId?: string;
  leadProfessionalId?: string;
  leadBepId?: string;
  leadArchitectId?: string;
  memberships?: ProjectMembershipLike[];
}

const ROLE_PERMISSIONS: Record<NormalizedUserRole, PermissionAction[]> = {
  client: ['project:read', 'profile:read', 'profile:update', 'payment:read', 'municipal:view_insight'],
  bep: ['project:read', 'project:update', 'profile:read', 'profile:update', 'compliance:sign', 'municipal:manage'],
  contractor: ['project:read', 'project:update', 'profile:read', 'profile:update', 'payment:read', 'municipal:view_insight'],
  freelancer: ['project:read', 'profile:read', 'profile:update'],
  subcontractor: ['project:read', 'profile:read', 'profile:update', 'payment:read'],
  supplier: ['project:read', 'profile:read', 'profile:update', 'payment:read'],
  admin: [
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
  ],
  engineer: ['project:read', 'profile:read', 'profile:update', 'compliance:sign'],
  quantity_surveyor: ['project:read', 'profile:read', 'profile:update', 'payment:read', 'payment:manage'],
  town_planner: ['project:read', 'profile:read', 'profile:update', 'municipal:manage'],
  energy_professional: ['project:read', 'profile:read', 'profile:update', 'compliance:sign'],
  fire_engineer: ['project:read', 'profile:read', 'profile:update', 'compliance:sign'],
  site_manager: ['project:read', 'profile:read', 'profile:update'],
  developer: ['project:read', 'profile:read', 'profile:update', 'payment:read', 'municipal:view_insight'],
  firm_admin: ['project:read', 'profile:read', 'profile:update', 'audit:read'],
  platform_admin: [
    'project:read', 'project:update', 'project:manage_members',
    'profile:read', 'profile:update', 'verification:review',
    'audit:read', 'audit:write', 'admin:override',
    'payment:read', 'payment:manage', 'escrow:release',
    'compliance:sign', 'municipal:manage', 'municipal:view_insight',
  ],
  land_surveyor: ['project:read', 'profile:read', 'profile:update', 'municipal:manage'],
  cpm: ['project:read', 'project:update', 'profile:read', 'profile:update', 'payment:read'],
};

const PROJECT_ACCESS_PERMISSIONS: Record<ProjectAccessRole, PermissionAction[]> = {
  project_owner: ['project:read', 'project:update', 'payment:read', 'municipal:view_insight'],
  lead_bep: ['project:read', 'project:update', 'project:manage_members', 'compliance:sign', 'municipal:manage', 'payment:read'],
  lead_consultant: ['project:read', 'project:update', 'project:manage_members', 'compliance:sign', 'municipal:manage', 'payment:read'],
  project_administrator: ['project:read', 'project:update', 'project:manage_members', 'audit:read', 'payment:read', 'payment:manage'],
  design_team_member: ['project:read', 'project:update', 'municipal:manage'],
  contractor: ['project:read', 'project:update', 'payment:read', 'municipal:view_insight'],
  subcontractor_package_assignee: ['project:read', 'payment:read'],
  supplier_package_assignee: ['project:read', 'payment:read'],
  freelancer_task_assignee: ['project:read'],
};

const PROJECT_ACCESS_ROLE_COMPATIBILITY: Record<ProjectAccessRole, NormalizedUserRole[]> = {
  project_owner: ['client'],
  lead_bep: ['bep'],
  lead_consultant: ['bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer'],
  project_administrator: ['bep', 'engineer', 'quantity_surveyor', 'contractor', 'firm_admin'],
  design_team_member: ['bep'],
  contractor: ['contractor'],
  subcontractor_package_assignee: ['subcontractor'],
  supplier_package_assignee: ['supplier'],
  freelancer_task_assignee: ['freelancer'],
};

// --- New permission sets and compatibility matrix (Role Architecture Refinement) ---

/**
 * Platform admin system-level permissions.
 * Grants cross-project read visibility plus platform governance actions.
 * Validates: Requirements 1.3
 */
export const PLATFORM_ADMIN_PERMISSIONS: CentralPermissionAction[] = [
  'verification:review',
  'audit:read',
  'audit:write',
  'admin:override',
  'payment:manage',
  'escrow:release',
  'project:read',
];

/**
 * Lead consultant project-scoped permissions.
 * Grants coordination and oversight on a specific project.
 * Validates: Requirements 3.3
 */
export const LEAD_CONSULTANT_PERMISSIONS: CentralPermissionAction[] = [
  'project:read',
  'project:update',
  'project:manage_members',
  'compliance:sign',
  'municipal:manage',
  'payment:read',
];

/**
 * Project administrator project-scoped permissions.
 * Grants full administrative control over a single project.
 * Validates: Requirements 3.4
 */
export const PROJECT_ADMINISTRATOR_PERMISSIONS: CentralPermissionAction[] = [
  'project:read',
  'project:update',
  'project:manage_members',
  'audit:read',
  'payment:read',
  'payment:manage',
];

/**
 * Professional roles compatible with the lead_consultant project access role.
 * Only users holding one of these roles may be assigned lead_consultant on a project.
 * Validates: Requirements 3.5
 */
export const LEAD_CONSULTANT_COMPATIBLE_ROLES: UserRole[] = [
  'bep',
  'architect',
  'engineer',
  'quantity_surveyor',
  'town_planner',
  'energy_professional',
  'fire_engineer',
];

/**
 * Professional roles compatible with the project_administrator project access role.
 * Only users holding one of these roles may be assigned project_administrator on a project.
 * Validates: Requirements 3.6
 */
export const PROJECT_ADMINISTRATOR_COMPATIBLE_ROLES: UserRole[] = [
  'bep',
  'architect',
  'engineer',
  'quantity_surveyor',
  'contractor',
  'firm_admin',
];

/**
 * Validates whether a given user role is compatible with a project access role
 * (lead_consultant or project_administrator). Uses the centralized types from src/types.ts.
 *
 * For legacy project access roles (project_owner, lead_bep, etc.), falls through to the
 * existing compatibility matrix.
 *
 * Validates: Requirements 3.5, 3.6
 */
export function isProjectAccessRoleCompatibleWithUserRole(
  accessRole: ProjectAccessRole | CentralProjectAccessRole,
  userRole?: UserRole | string,
): boolean {
  // Handle new project-scoped access roles with dedicated compatibility arrays
  if (accessRole === 'lead_consultant') {
    return typeof userRole === 'string' && (LEAD_CONSULTANT_COMPATIBLE_ROLES as readonly string[]).includes(userRole);
  }
  if (accessRole === 'project_administrator') {
    return typeof userRole === 'string' && (PROJECT_ADMINISTRATOR_COMPATIBLE_ROLES as readonly string[]).includes(userRole);
  }

  // Fall through to legacy compatibility matrix for other access roles
  const normalizedRole = normalizeUserRole(userRole);
  return Boolean(normalizedRole && PROJECT_ACCESS_ROLE_COMPATIBILITY[accessRole as ProjectAccessRole]?.includes(normalizedRole));
}

export function isCanonicalUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (CANONICAL_USER_ROLES as readonly string[]).includes(role);
}

export function normalizeUserRole(role?: UserRole | string): NormalizedUserRole | null {
  if (!isCanonicalUserRole(role)) return null;
  return role === 'architect' ? 'bep' : role;
}

/**
 * Professional roles — all UserRole values that represent a professional discipline
 * (i.e. everything except 'admin' and 'platform_admin').
 */
const PROFESSIONAL_ROLES: readonly string[] = [
  'client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor',
  'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional',
  'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'land_surveyor', 'health_safety',
];

/**
 * Structured deprecation warning interface.
 * Emitted when legacy fields are detected during normalization.
 */
export interface RoleDeprecationWarning {
  level: 'warn';
  type: 'role_deprecation';
  uid: string;
  legacyField: 'role:admin' | 'admin:true';
  normalizedTo: 'platform_admin';
  timestamp: string;
}

/**
 * Emits a structured deprecation warning via console.warn.
 */
function emitDeprecationWarning(uid: string, legacyField: RoleDeprecationWarning['legacyField']): void {
  const warning: RoleDeprecationWarning = {
    level: 'warn',
    type: 'role_deprecation',
    uid,
    legacyField,
    normalizedTo: 'platform_admin',
    timestamp: new Date().toISOString(),
  };
  console.warn(JSON.stringify(warning));
}

/**
 * Normalizes a user for authorization evaluation.
 *
 * Normalization rules:
 * - `role: 'admin'` → `role: 'platform_admin'` + deprecation warning
 * - `admin: true` without role (or role undefined) → `role: 'platform_admin'` + deprecation warning
 * - `admin: true` + Professional_Role → preserve role + set `isPlatformAdmin: true` (merge platform_admin permissions)
 * - `role: 'firm_admin'` → unchanged (never normalized)
 * - `role: 'admin'` + `admin: true` → single normalization to `platform_admin`, no duplicate grants
 * - Already-normalized users pass through unchanged (idempotent)
 *
 * Returns null/undefined unchanged if input is null/undefined.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 7.5
 */
export function normalizeUserForAuthz(user: AuthzUser | null | undefined): AuthzUser | null | undefined {
  if (user == null) return user;

  const role = user.role;
  const hasAdminFlag = user.admin === true;
  const hasLegacyAdminRole = role === 'admin';
  const hasProfessionalRole = typeof role === 'string' && PROFESSIONAL_ROLES.includes(role);

  // Idempotency: if already normalized (platform_admin role or isPlatformAdmin set with professional role), return unchanged
  if (role === 'platform_admin' && !hasLegacyAdminRole) {
    return user;
  }
  if (hasProfessionalRole && user.isPlatformAdmin === true && !hasLegacyAdminRole) {
    return user;
  }

  // Case: role is 'admin' (with or without admin:true flag) → normalize to platform_admin
  if (hasLegacyAdminRole) {
    emitDeprecationWarning(user.uid, 'role:admin');
    return {
      ...user,
      role: 'platform_admin',
      isPlatformAdmin: true,
    };
  }

  // Case: admin:true flag with a Professional_Role → preserve role, merge platform_admin permissions
  if (hasAdminFlag && hasProfessionalRole) {
    // firm_admin is never normalized to platform_admin, but if it has admin:true,
    // we still mark isPlatformAdmin for permission merging
    emitDeprecationWarning(user.uid, 'admin:true');
    return {
      ...user,
      isPlatformAdmin: true,
    };
  }

  // Case: admin:true flag with no role (or role undefined/empty) → treat as platform_admin
  if (hasAdminFlag && !hasProfessionalRole && !hasLegacyAdminRole) {
    emitDeprecationWarning(user.uid, 'admin:true');
    return {
      ...user,
      role: 'platform_admin',
      isPlatformAdmin: true,
    };
  }

  // No legacy fields detected — return unchanged
  return user;
}

export function isAdminUser(user?: AuthzUser | null): boolean {
  if (!user) return false;
  return user.admin === true || user.role === 'platform_admin';
}

export function getRolePermissions(role?: UserRole | string): PermissionAction[] {
  const normalizedRole = normalizeUserRole(role);
  if (!normalizedRole) return [];
  return ROLE_PERMISSIONS[normalizedRole];
}

/**
 * Generate a unique event ID for audit trail entries.
 */
function generateAuditEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `ov-${ts}-${rand}`;
}

/**
 * Evaluates whether a platform_admin can override separation-of-duty constraints
 * and records the override in the project audit trail.
 *
 * Validation:
 * - Requesting user must pass `isAdminUser()`
 * - Reason must have `reason.trim().length >= 10`
 *
 * On success, writes an `AdminOverrideAuditRecord` to
 * `projects/{projectId}/auditTrail/{eventId}` in Firestore.
 *
 * Returns `true` if the override is granted, `false` otherwise.
 *
 * Validates: Requirements 4.6, 4.7, 4.8
 */
export async function canAdminOverrideSeparationOfDuty(
  request: AdminOverrideRequest | CentralAdminOverrideRequest,
): Promise<boolean> {
  // Validate requesting user is an admin
  const admin = request.admin;
  if (!isAdminUser(admin)) return false;

  // Validate reason is at least 10 characters (trimmed)
  if (!request.reason || request.reason.trim().length < 10) return false;

  // Determine projectId from the request
  const projectId = request.projectId;

  // Write audit record to Firestore if projectId is provided
  if (projectId && admin) {
    const eventId = generateAuditEventId();
    const timestamp = new Date().toISOString();

    const auditRecord: AdminOverrideAuditEntry & { type: string; createdAt: string } = {
      type: 'admin_override',
      adminUid: admin.uid,
      action: (request as CentralAdminOverrideRequest).action ?? ('admin:override' as CentralPermissionAction),
      projectId,
      reason: request.reason,
      timestamp,
      createdAt: timestamp,
    };

    try {
      // Dynamic import to avoid circular dependencies and allow the function
      // to remain testable without requiring Firebase Admin in unit tests
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb
        .collection(`projects/${projectId}/auditTrail`)
        .doc(eventId)
        .set(auditRecord);
    } catch (err) {
      // Log the failure but do not block the override — the permission decision
      // itself was already validated. Audit persistence failure is an operational issue.
      console.error('[AdminOverride] Failed to write audit record:', err);
    }
  }

  return true;
}

export function getActiveProjectAccessRoles(user: AuthzUser, project?: ProjectAccessContext | null): ProjectAccessRole[] {
  if (!project) return [];

  const roles = new Set<ProjectAccessRole>();
  if (project.clientId === user.uid) roles.add('project_owner');
  if (getLeadProfessionalId(project) === user.uid) roles.add('lead_bep');

  for (const membership of project.memberships || []) {
    if (
      membership.userId === user.uid &&
      membership.status === 'active' &&
      isProjectAccessRoleCompatibleWithUserRole(membership.accessRole, user.role)
    ) {
      roles.add(membership.accessRole);
    }
  }

  return [...roles];
}

/**
 * Project-scoped write actions that require explicit ProjectAccessRole membership
 * for platform_admin users. platform_admin gets implicit project:read on all projects
 * but must have membership for any write action.
 */
const PROJECT_SCOPED_WRITE_ACTIONS: PermissionAction[] = [
  'project:update',
  'project:manage_members',
  'compliance:sign',
  'municipal:manage',
  'payment:manage',
  'escrow:release',
];

/**
 * Returns actual project memberships for a platform_admin user without the admin bypass.
 * This evaluates real project access roles from ownership, lead professional status,
 * and explicit memberships — NOT the unconditional ['admin'] return.
 *
 * Used by canUserPerform to enforce project-scoped write restrictions on platform_admin.
 */
function getAdminProjectMemberships(user: AuthzUser, project?: ProjectAccessContext | null): ProjectAccessRole[] {
  if (!project) return [];

  const roles = new Set<ProjectAccessRole>();
  if (project.clientId === user.uid) roles.add('project_owner');
  if (getLeadProfessionalId(project) === user.uid) roles.add('lead_bep');

  for (const membership of project.memberships || []) {
    if (
      membership.userId === user.uid &&
      membership.status === 'active'
    ) {
      roles.add(membership.accessRole);
    }
  }

  return [...roles];
}

export function canUserPerform(
  user: AuthzUser | null | undefined,
  action: PermissionAction,
  project?: ProjectAccessContext | null,
): boolean {
  if (!user) return false;

  // Determine if this is a project-scoped action
  const isProjectScoped =
    action.startsWith('project:') ||
    action.startsWith('municipal:') ||
    action.startsWith('payment:') ||
    action === 'compliance:sign' ||
    action === 'escrow:release';

  // --- Platform admin scoped evaluation (no unconditional bypass) ---
  if (isAdminUser(user)) {
    // Check if the action is in the platform_admin permission set
    const platformAdminAllows = (PLATFORM_ADMIN_PERMISSIONS as readonly string[]).includes(action);

    // For dual-role users (Professional_Role + admin:true), also check their professional role
    const hasProfessionalRole = typeof user.role === 'string' && user.role !== 'platform_admin' && user.role !== 'admin';
    const professionalRoleAllows = hasProfessionalRole ? getRolePermissions(user.role).includes(action) : false;

    if (!isProjectScoped) {
      // Non-project-scoped: evaluate against platform_admin permission set OR professional role permissions
      return platformAdminAllows || professionalRoleAllows;
    }

    // Project-scoped: platform_admin gets implicit project:read on ALL projects without membership
    if (action === 'project:read') {
      return true;
    }

    // All other project-scoped actions require active ProjectAccessRole membership on the target project.
    // Check actual project memberships (bypassing the admin shortcut in getActiveProjectAccessRoles)
    const projectRoles = getAdminProjectMemberships(user, project);
    const hasProjectMembership = projectRoles.some(accessRole =>
      PROJECT_ACCESS_PERMISSIONS[accessRole]?.includes(action),
    );
    return hasProjectMembership;
  }

  // --- Non-admin users: standard evaluation ---
  const roleAllows = getRolePermissions(user.role).includes(action);
  const projectAllows = getActiveProjectAccessRoles(user, project).some(accessRole =>
    PROJECT_ACCESS_PERMISSIONS[accessRole]?.includes(action),
  );

  if (isProjectScoped) {
    return roleAllows && projectAllows;
  }

  return roleAllows;
}

export function assertCanUserPerform(
  user: AuthzUser | null | undefined,
  action: PermissionAction,
  project?: ProjectAccessContext | null,
): void {
  if (!canUserPerform(user, action, project)) {
    const error = new Error(`Permission denied for action: ${action}`);
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}
