import type { UserRole } from '@/types';
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
] as const satisfies readonly UserRole[];

export type NormalizedUserRole = Exclude<UserRole, 'architect'>;

export type ProjectAccessRole =
  | 'project_owner'
  | 'lead_bep'
  | 'design_team_member'
  | 'contractor'
  | 'subcontractor_package_assignee'
  | 'supplier_package_assignee'
  | 'freelancer_task_assignee'
  | 'admin';

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
}

export interface AdminOverrideRequest {
  admin: AuthzUser | null | undefined;
  policy: 'separation_of_duty';
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
  developer: ['project:read', 'profile:read', 'profile:update', 'payment:read', 'municipal:view_insight'],
  engineer: ['project:read', 'project:update', 'profile:read', 'profile:update', 'compliance:sign', 'municipal:manage'],
  quantity_surveyor: ['project:read', 'project:update', 'profile:read', 'profile:update', 'payment:read', 'municipal:manage'],
  planner: ['project:read', 'project:update', 'profile:read', 'profile:update', 'municipal:manage', 'municipal:view_insight'],
  project_manager: ['project:read', 'project:update', 'project:manage_members', 'profile:read', 'profile:update', 'payment:read', 'compliance:sign', 'municipal:manage', 'municipal:view_insight'],
};

const PROJECT_ACCESS_PERMISSIONS: Record<ProjectAccessRole, PermissionAction[]> = {
  project_owner: ['project:read', 'project:update', 'payment:read', 'municipal:view_insight'],
  lead_bep: ['project:read', 'project:update', 'project:manage_members', 'compliance:sign', 'municipal:manage', 'payment:read'],
  design_team_member: ['project:read', 'project:update', 'municipal:manage'],
  contractor: ['project:read', 'project:update', 'payment:read', 'municipal:view_insight'],
  subcontractor_package_assignee: ['project:read', 'payment:read'],
  supplier_package_assignee: ['project:read', 'payment:read'],
  freelancer_task_assignee: ['project:read'],
  admin: ROLE_PERMISSIONS.admin,
};

const PROJECT_ACCESS_ROLE_COMPATIBILITY: Record<ProjectAccessRole, NormalizedUserRole[]> = {
  project_owner: ['client'],
  lead_bep: ['bep'],
  design_team_member: ['bep'],
  contractor: ['contractor'],
  subcontractor_package_assignee: ['subcontractor'],
  supplier_package_assignee: ['supplier'],
  freelancer_task_assignee: ['freelancer'],
  admin: ['admin'],
};

export function isProjectAccessRoleCompatibleWithUserRole(
  accessRole: ProjectAccessRole,
  userRole?: UserRole | string,
): boolean {
  const normalizedRole = normalizeUserRole(userRole);
  return Boolean(normalizedRole && PROJECT_ACCESS_ROLE_COMPATIBILITY[accessRole]?.includes(normalizedRole));
}

export function isCanonicalUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (CANONICAL_USER_ROLES as readonly string[]).includes(role);
}

export function normalizeUserRole(role?: UserRole | string): NormalizedUserRole | null {
  if (!isCanonicalUserRole(role)) return null;
  return role === 'architect' ? 'bep' : role;
}

export function isAdminUser(user?: AuthzUser | null): boolean {
  return Boolean(user?.admin || user?.role === 'admin');
}

export function getRolePermissions(role?: UserRole | string): PermissionAction[] {
  const normalizedRole = normalizeUserRole(role);
  if (!normalizedRole) return [];
  return ROLE_PERMISSIONS[normalizedRole];
}

export function canAdminOverrideSeparationOfDuty(request: AdminOverrideRequest): boolean {
  return request.policy === 'separation_of_duty' && isAdminUser(request.admin) && request.reason.trim().length >= 10;
}

export function getActiveProjectAccessRoles(user: AuthzUser, project?: ProjectAccessContext | null): ProjectAccessRole[] {
  if (!project) return isAdminUser(user) ? ['admin'] : [];
  if (isAdminUser(user)) return ['admin'];

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

export function canUserPerform(
  user: AuthzUser | null | undefined,
  action: PermissionAction,
  project?: ProjectAccessContext | null,
): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;

  const roleAllows = getRolePermissions(user.role).includes(action);
  const projectAllows = getActiveProjectAccessRoles(user, project).some(accessRole =>
    PROJECT_ACCESS_PERMISSIONS[accessRole]?.includes(action),
  );

  if (action.startsWith('project:') || action.startsWith('municipal:') || action.startsWith('payment:') || action === 'compliance:sign') {
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
