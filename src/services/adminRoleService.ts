import type { UserRole, ProjectAccessRoleAssignment } from '@/types';
import { buildAuditEvent, type AuditEventInput } from './auditService';
import { isCanonicalUserRole, normalizeUserRole, isProjectAccessRoleCompatibleWithUserRole } from './permissionService';
import type { AuthzUser } from './permissionService';
import { adminDb } from '@/lib/firebase-admin';

export type RoleChangeReasonCode =
  | 'verification_approved'
  | 'admin_correction'
  | 'user_onboarding'
  | 'legacy_migration'
  | 'support_request';

export interface RoleChangeActor {
  uid: string;
  role?: UserRole | string;
  email?: string;
  displayName?: string;
  admin?: boolean;
  authorizationType?: string;
}

export interface RoleChangeRequest {
  actor: RoleChangeActor;
  targetUserId: string;
  currentRole?: UserRole | string | null;
  requestedRole: UserRole | string;
  reason: string;
  reasonCode: RoleChangeReasonCode;
  allowSelfService?: boolean;
  createdAt?: string;
}

export interface RoleChangeDecision {
  allowed: boolean;
  targetUserId: string;
  previousRole: UserRole | string | null;
  assignedRole: UserRole;
  normalizedAssignedRole: Exclude<UserRole, 'architect'>;
  reason: string;
  reasonCode: RoleChangeReasonCode;
  requiresAdmin: boolean;
  createdAt: string;
}

const SELF_SERVICE_ROLES = new Set<UserRole>([
  'client',
  'architect',
  'bep',
  'contractor',
  'freelancer',
  'subcontractor',
  'supplier',
]);

export function isServerAuthoritativeAdmin(actor?: RoleChangeActor | null): boolean {
  return Boolean(actor?.admin === true || actor?.role === 'admin');
}

export function buildRoleChangeDecision(request: RoleChangeRequest): RoleChangeDecision {
  if (!request.actor?.uid) throw new Error('Role change actor uid is required');
  if (!request.targetUserId?.trim()) throw new Error('Role change targetUserId is required');
  if (!isCanonicalUserRole(request.requestedRole)) throw new Error(`Unsupported role: ${request.requestedRole}`);
  if (!request.reason?.trim() || request.reason.trim().length < 10) throw new Error('Role change reason must be at least 10 characters');

  const requestedRole = request.requestedRole;
  const actorIsAdmin = isServerAuthoritativeAdmin(request.actor);
  const isSelfChange = request.actor.uid === request.targetUserId;
  const selfServiceAllowed = request.allowSelfService === true && isSelfChange && SELF_SERVICE_ROLES.has(requestedRole);
  const requiresAdmin = requestedRole === 'admin' || !selfServiceAllowed;

  if (requiresAdmin && !actorIsAdmin) {
    const error = new Error('Admin access required for role change');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  const normalizedAssignedRole = normalizeUserRole(requestedRole);
  if (!normalizedAssignedRole) throw new Error(`Unsupported role: ${requestedRole}`);

  return {
    allowed: true,
    targetUserId: request.targetUserId,
    previousRole: request.currentRole || null,
    assignedRole: requestedRole,
    normalizedAssignedRole,
    reason: request.reason.trim(),
    reasonCode: request.reasonCode,
    requiresAdmin,
    createdAt: request.createdAt || new Date().toISOString(),
  };
}

export function buildRoleChangePatch(decision: RoleChangeDecision): Record<string, unknown> {
  return {
    role: decision.assignedRole,
    normalizedRole: decision.normalizedAssignedRole,
    roleUpdatedAt: decision.createdAt,
    roleChangeReasonCode: decision.reasonCode,
    updatedAt: decision.createdAt,
  };
}

export function buildRoleChangeAuditInput(actor: RoleChangeActor, decision: RoleChangeDecision): AuditEventInput {
  return buildAuditEvent({
    category: 'role',
    action: decision.requiresAdmin ? 'role.admin_assigned' : 'role.self_selected',
    actor,
    target: { type: 'user', id: decision.targetUserId },
    reason: decision.reason,
    metadata: {
      previousRole: decision.previousRole,
      assignedRole: decision.assignedRole,
      normalizedAssignedRole: decision.normalizedAssignedRole,
      reasonCode: decision.reasonCode,
      requiresAdmin: decision.requiresAdmin,
    },
    createdAt: decision.createdAt,
  });
}


// --- Project Access Role Assignment and Revocation (Requirements 3.7, 3.8, 3.9) ---

export interface ProjectAccessRoleError {
  error: string;
  status: number;
}

/**
 * Assigns a project access role (lead_consultant or project_administrator) to a target user
 * on a specific project, after validating Professional_Role compatibility and mutual exclusivity.
 *
 * - Validates that the target user's Professional_Role is compatible with the requested access role
 * - Enforces mutual exclusivity: a user cannot hold both lead_consultant and project_administrator
 *   on the same project
 * - Writes the assignment to Firestore at `projects/{projectId}/accessRoles/{userId}`
 *
 * Validates: Requirements 3.7, 3.8, 3.9
 */
export async function assignProjectAccessRole(
  targetUser: AuthzUser,
  projectAccessRole: 'lead_consultant' | 'project_administrator',
  projectId: string,
  assignedBy: string,
): Promise<ProjectAccessRoleAssignment | ProjectAccessRoleError> {
  const userRole = targetUser.role as UserRole | undefined;

  // Validate Professional_Role compatibility
  if (!isProjectAccessRoleCompatibleWithUserRole(projectAccessRole, userRole)) {
    return {
      error: `Role ${userRole ?? 'unknown'} is not compatible with project access role ${projectAccessRole}`,
      status: 400,
    };
  }

  // Enforce mutual exclusivity: check if user already holds the other role on this project
  const oppositeRole: 'lead_consultant' | 'project_administrator' =
    projectAccessRole === 'lead_consultant' ? 'project_administrator' : 'lead_consultant';

  const existingDocRef = adminDb
    .collection('projects')
    .doc(projectId)
    .collection('accessRoles')
    .doc(targetUser.uid);

  const existingDoc = await existingDocRef.get();

  if (existingDoc.exists) {
    const existingData = existingDoc.data() as ProjectAccessRoleAssignment | undefined;
    if (existingData && existingData.accessRole === oppositeRole) {
      return {
        error: `User already holds ${oppositeRole} on project ${projectId}; revoke it first`,
        status: 409,
      };
    }
  }

  // Persist the assignment
  const assignment: ProjectAccessRoleAssignment = {
    userId: targetUser.uid,
    projectId,
    accessRole: projectAccessRole,
    assignedBy,
    assignedAt: new Date().toISOString(),
    userProfessionalRole: userRole as UserRole,
  };

  await existingDocRef.set(assignment);

  return assignment;
}

/**
 * Revokes a project access role from a user on a specific project.
 * Deletes the document at `projects/{projectId}/accessRoles/{userId}` in Firestore.
 *
 * Validates: Requirements 3.7, 3.9
 */
export async function revokeProjectAccessRole(
  targetUser: AuthzUser,
  projectAccessRole: 'lead_consultant' | 'project_administrator',
  projectId: string,
  revokedBy: string,
): Promise<void> {
  const docRef = adminDb
    .collection('projects')
    .doc(projectId)
    .collection('accessRoles')
    .doc(targetUser.uid);

  await docRef.delete();
}
