/**
 * Field Access Service — Role-based permission gate for field tool actions.
 *
 * Pure function `canPerform` determines if a given UserRole is permitted
 * to execute a given FieldActionType. Editor roles can perform all field
 * actions; client role is denied all mutating actions (FieldActionType does
 * not include 'view'); all other roles are denied.
 *
 * Pure function `assertFieldAction` returns a permit/deny decision with
 * an authorization error on deny. It does not modify the target record.
 *
 * Validates: Requirements 6.1, 6.2, 6.5, 6.21
 */

import type { UserRole, FieldActionType } from '@/types';
import { siteAuditTrailService } from '@/services/siteAuditTrailService';

/**
 * Roles permitted to create, edit, delete, transition status, and release payments.
 */
export const EDITOR_ROLES: UserRole[] = [
  'site_manager',
  'contractor',
  'subcontractor',
  'architect',
  'engineer',
  'bep',
];

/**
 * Authorization error returned when a field action is denied.
 */
export interface AuthorizationError {
  code: 'unauthorized';
  role: string;
  action: FieldActionType;
  message: string;
}

/**
 * Decision result from assertFieldAction.
 * Pure value — no side effects, does not modify the target record.
 */
export interface FieldActionDecision {
  outcome: 'permitted' | 'denied';
  error?: AuthorizationError;
}

/**
 * Pure permission check.
 *
 * - EDITOR_ROLES can perform all FieldActionTypes → true
 * - 'client' cannot perform any FieldActionType → false
 *   (FieldActionType only covers mutating actions; client is view-only)
 * - Any other role → false
 */
export function canPerform(role: UserRole, _action: FieldActionType): boolean {
  if (EDITOR_ROLES.includes(role)) {
    return true;
  }
  // Client is view-only — denied all mutating actions (which is all FieldActionTypes)
  // All other roles are also denied
  return false;
}

/**
 * Pure function that returns a permit/deny decision for a field action.
 *
 * - Calls `canPerform(role, action)`
 * - If permitted → returns { outcome: 'permitted' }
 * - If denied → returns { outcome: 'denied', error: AuthorizationError }
 *
 * Does not modify the target record. No I/O, no side effects.
 *
 * Validates: Requirements 6.2, 6.5, 6.21
 */
export function assertFieldAction(
  role: UserRole,
  action: FieldActionType,
  targetId: string,
): FieldActionDecision {
  if (canPerform(role, action)) {
    return { outcome: 'permitted' };
  }

  return {
    outcome: 'denied',
    error: {
      code: 'unauthorized',
      role,
      action,
      message: `User with role '${role}' is not permitted to perform '${action}' on '${targetId}'`,
    },
  };
}

/**
 * Context for the actor performing a field action.
 * Used by the I/O wrapper to record audit trail entries.
 */
export interface ActorContext {
  actorId: string;
  actorRole: UserRole;
  projectId: string;
}

/**
 * I/O wrapper around the pure `assertFieldAction` decision.
 *
 * 1. Calls `assertFieldAction(ctx.actorRole, action, targetId)` to get the decision.
 * 2. Writes a SiteAuditRecord via `siteAuditTrailService.recordAudit()` with:
 *    - projectId, actorId, actorRole from ctx
 *    - action: `field_action_${action}` (descriptive)
 *    - actionType: action
 *    - outcome: decision.outcome
 *    - sourceObjectId: targetId
 *    - sourceObjectType: 'field_issue'
 * 3. Returns the decision (does NOT throw even if denied — caller decides).
 *
 * Every attempted field action is audited with its outcome (Req 6.4, 6.22).
 */
export async function assertFieldActionIO(
  ctx: ActorContext,
  action: FieldActionType,
  targetId: string,
): Promise<FieldActionDecision> {
  const decision = assertFieldAction(ctx.actorRole, action, targetId);

  await siteAuditTrailService.recordAudit({
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    action: `field_action_${action}`,
    actionType: action,
    outcome: decision.outcome,
    sourceObjectId: targetId,
    sourceObjectType: 'field_issue',
  });

  return decision;
}
