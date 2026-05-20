import type { UserRole } from '@/types';
import { buildAuditEvent, type AuditEventInput } from './auditService';
import { isCanonicalUserRole, normalizeUserRole } from './permissionService';

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
