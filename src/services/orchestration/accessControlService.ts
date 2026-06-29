// ─── Unified Project Workflow Orchestration: Access Control & Governance Gate ─
// Central governance gate used by every other orchestration service. It makes a
// synchronous authorization decision (well within the 2 s budget of R8.1/R8.4),
// enforcing tenant isolation, role entitlement, and the qualified-role mapping
// for sensitive `HumanGate` checkpoints. Every decision — permitted or denied —
// is written through the existing `auditTrailService` (R8.6, R8.7).
//
// This layer is decision-support glue only: it never performs the sensitive
// action itself, and the AI identity is never qualified to satisfy a gate
// (R6.6, R8.5).
//
// Requirements: 1.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7.

import type { BaseContext } from '../../types/agentOrchestration';
import { audit } from '../auditTrailService';
import {
  QUALIFIED_ROLES_BY_GATE,
  type ActionType,
  type AuthorizationContext,
  type AuthorizationResult,
  type HumanGate,
  type ProjectRecordType,
} from './orchestrationTypes';

/** Target of an authorization decision. Holds no field values (R8.2). */
export interface AuthorizationTarget {
  tenantId: string;
  recordType?: ProjectRecordType;
  /** Optional gate the action sits behind (e.g. a gated write/handoff). */
  gate?: HumanGate;
}

/**
 * Sensitive action types map one-to-one to the `HumanGate` they sit behind.
 * Any other action type derives its gate from `target.gate` (default `none`).
 */
const SENSITIVE_ACTION_GATES: Partial<Record<ActionType, HumanGate>> = {
  professional_certification: 'professional_certification',
  signature: 'signature',
  payment_release: 'payment_release',
  municipal_submission: 'municipal_submission',
  closeout_acceptance: 'closeout_acceptance',
};

/**
 * Identity markers for the embedded AI guide. The AI identity is never present
 * in `QUALIFIED_ROLES_BY_GATE`, and is additionally rejected outright for any
 * gated action so it can never satisfy a gate on a human's behalf (R6.6, R8.5).
 */
const AI_ACTOR_PREFIXES = ['ai:', 'agent:'] as const;
const AI_ACTOR_IDS = new Set(['ai_guide', 'ai-guide']);

/** True when the acting context represents the AI identity rather than a human. */
export function isAiActor(ctx: AuthorizationContext): boolean {
  const id = ctx.userId.trim().toLowerCase();
  if (AI_ACTOR_IDS.has(id)) return true;
  return AI_ACTOR_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** A gate other than `none` requires the acting role to be qualified for it. */
function requiresQualifiedRole(gate: HumanGate): boolean {
  return gate !== 'none';
}

/** Resolve the gate an action must clear. */
function resolveRequiredGate(action: ActionType, target: AuthorizationTarget): HumanGate {
  const sensitive = SENSITIVE_ACTION_GATES[action];
  if (sensitive) return sensitive;
  return target.gate ?? 'none';
}

/**
 * Build the denial reason. It names the attempted action type, the role, and
 * the required gate, and discloses no target field values (R8.2, R8.3, R8.5).
 */
function denialReason(
  action: ActionType,
  role: string,
  requiredGate: HumanGate,
  cause: string,
): string {
  return `Action '${action}' denied for role '${role}': ${cause} (required gate '${requiredGate}').`;
}

/**
 * Record the decision through the audit trail (R8.6, R8.7). The encoded action
 * string captures the action type, actor role, required gate, and outcome so
 * the full decision is recoverable from the immutable audit record.
 */
function recordDecision(
  ctx: AuthorizationContext,
  action: ActionType,
  target: AuthorizationTarget,
  requiredGate: HumanGate,
  outcome: 'permitted' | 'denied',
): void {
  const auditCtx: BaseContext = {
    tenantId: ctx.tenantId,
    projectId: '',
    userId: ctx.userId,
    actorRole: ctx.role,
    now: ctx.now,
  };
  const encodedAction = `authorize:${action}:role=${ctx.role}:gate=${requiredGate}:outcome=${outcome}`;
  const sourceObjectId = target.recordType ?? 'project';
  audit(auditCtx, encodedAction, sourceObjectId);
}

/**
 * Make an authorization decision for `action` against `target` in `ctx`.
 *
 * Order of checks:
 *  1. Tenant match — a tenant mismatch is always denied (R1.7, R8.2, R8.7).
 *  2. AI identity — never satisfies a gated action (R6.6, R8.5).
 *  3. Gate qualification — gated actions require a role in
 *     `QUALIFIED_ROLES_BY_GATE[gate]` (R8.3, R8.4, R8.5).
 *
 * Every decision is audited before returning. The function is synchronous and
 * returns immediately, comfortably within the 2 s budget (R8.1, R8.4).
 */
export function authorize(
  ctx: AuthorizationContext,
  action: ActionType,
  target: AuthorizationTarget,
): AuthorizationResult {
  const requiredGate = resolveRequiredGate(action, target);

  // 1. Tenant isolation — mismatched tenant is always denied.
  if (ctx.tenantId !== target.tenantId) {
    recordDecision(ctx, action, target, requiredGate, 'denied');
    return {
      outcome: 'denied',
      requiredGate,
      reason: denialReason(action, ctx.role, requiredGate, 'tenant mismatch'),
    };
  }

  const gated = requiresQualifiedRole(requiredGate);

  // 2. The AI identity is never qualified to satisfy a gate.
  if (gated && isAiActor(ctx)) {
    recordDecision(ctx, action, target, requiredGate, 'denied');
    return {
      outcome: 'denied',
      requiredGate,
      reason: denialReason(action, ctx.role, requiredGate, 'AI identity is not qualified for this gate'),
    };
  }

  // 3. Gated actions require a qualified role.
  if (gated && !QUALIFIED_ROLES_BY_GATE[requiredGate].includes(ctx.role)) {
    recordDecision(ctx, action, target, requiredGate, 'denied');
    return {
      outcome: 'denied',
      requiredGate,
      reason: denialReason(action, ctx.role, requiredGate, 'role is not qualified for the required gate'),
    };
  }

  // Entitled: in-tenant role clears any required gate.
  recordDecision(ctx, action, target, requiredGate, 'permitted');
  return { outcome: 'permitted', requiredGate };
}
