// ─── Unified Project Workflow Orchestration: Governed Cross-Role Handoffs ────
// Records, resolves, and monitors governed transfers of responsibility for a
// project step from one appointed role to another. This is a thin orchestrator:
// it validates input, persists the obligation through an injectable repository,
// emits Action Centre `WorkflowEvent`s via `inboxEventAdapter`, audits actions
// through `auditTrailService`, and defers sensitive gated resolution
// (professional_certification / signature / payment_release) to
// `accessControlService`.
//
// The persistence layer is modelled as an injectable `HandoffRepository`
// (default in-memory) so the tier stays testable for the upcoming property
// tasks 5.2–5.6. Every repository access is tenant-scoped.
//
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8.

import type { BaseContext } from '../../types/agentOrchestration';
import { audit } from '../auditTrailService';
import { createWorkflowEvent } from '../inboxEventAdapter';
import { authorize } from './accessControlService';
import type {
  ActionType,
  ArchitexRole,
  AuthorizationContext,
  CrossRoleHandoff,
  HumanGate,
  ProjectRecordType,
  WorkflowEvent,
} from './orchestrationTypes';

// ── Public input / result shapes ────────────────────────────────────────────

/**
 * Input to {@link HandoffService.initiateHandoff}. `appointedRoles` is the set
 * of roles currently appointed to the project — appointment data lives in
 * Pack 5, so it is supplied by the caller rather than read here. `gate` is the
 * optional `HumanGate` the handed-off step sits behind, carried so resolution
 * can defer to the access-control gate (R3.8).
 */
export interface HandoffInput {
  projectId: string;
  tenantId: string;
  fromRole: ArchitexRole;
  toRole: ArchitexRole;
  relatedRecordType: ProjectRecordType;
  /** 1..1000 characters (R3.1, R3.2). */
  reason: string;
  /** Roles appointed to the project; the receiving role must be among them (R3.7). */
  appointedRoles: ArchitexRole[];
  /** Optional gate the handed-off step requires (R3.8). */
  gate?: HumanGate;
}

/** Cause-specific failure reasons. Each names a distinct rejection path. */
export type HandoffFailureReason =
  | 'invalid_reason'
  | 'role_not_appointed'
  | 'unauthorized'
  | 'not_found'
  | 'already_resolved';

/**
 * Discriminated result of a handoff operation. A successful `initiateHandoff`
 * carries both the recorded obligation and the emitted `approval_required`
 * event; a successful `resolveHandoff` carries the resolved obligation. A
 * failure carries a cause-specific reason and a human-readable error and
 * creates no obligation or event (R3.2, R3.7).
 */
export type HandoffResult =
  | { ok: true; handoff: CrossRoleHandoff; event?: WorkflowEvent }
  | { ok: false; reason: HandoffFailureReason; error: string };

/** Options for {@link HandoffService.resolveHandoff}. */
export interface ResolveHandoffOptions {
  /**
   * The `HumanGate` the handed-off step sits behind. When it is one of the
   * sensitive gates (professional_certification / signature / payment_release),
   * resolution is deferred to `accessControlService.authorize` (R3.8).
   */
  gate?: HumanGate;
}

// ── Persistence abstraction (injectable, tenant-scoped) ─────────────────────

/**
 * Tenant-scoped persistence for handoff obligations. The default is in-memory;
 * production supplies a Firestore-backed implementation. Reads are tenant
 * scoped so a handoff owned by another tenant is never returned (defence in
 * depth alongside `accessControlService`).
 */
export interface HandoffRepository {
  save(handoff: CrossRoleHandoff): Promise<void>;
  get(tenantId: string, handoffId: string): Promise<CrossRoleHandoff | null>;
  update(handoff: CrossRoleHandoff): Promise<void>;
  /** Open obligations for a project, used by overdue checks and dual-view display. */
  listOpen(tenantId: string, projectId: string): Promise<CrossRoleHandoff[]>;
}

const handoffKey = (tenantId: string, handoffId: string): string => `${tenantId}::${handoffId}`;

const cloneHandoff = (h: CrossRoleHandoff): CrossRoleHandoff => ({ ...h });

/** Default in-memory repository. Suitable for tests and decision-support glue. */
export class InMemoryHandoffRepository implements HandoffRepository {
  private store = new Map<string, CrossRoleHandoff>();

  async save(handoff: CrossRoleHandoff): Promise<void> {
    this.store.set(handoffKey(handoff.tenantId, handoff.id), cloneHandoff(handoff));
  }

  async get(tenantId: string, handoffId: string): Promise<CrossRoleHandoff | null> {
    const found = this.store.get(handoffKey(tenantId, handoffId));
    return found ? cloneHandoff(found) : null;
  }

  async update(handoff: CrossRoleHandoff): Promise<void> {
    this.store.set(handoffKey(handoff.tenantId, handoff.id), cloneHandoff(handoff));
  }

  async listOpen(tenantId: string, projectId: string): Promise<CrossRoleHandoff[]> {
    const out: CrossRoleHandoff[] = [];
    for (const h of this.store.values()) {
      if (h.tenantId === tenantId && h.projectId === projectId && h.status === 'open') {
        out.push(cloneHandoff(h));
      }
    }
    return out;
  }
}

// ── Governance: sensitive gates deferred to accessControlService (R3.8) ──────

/**
 * The sensitive gates whose satisfaction is deferred to the access-control gate
 * during resolution. Each maps to the `ActionType` whose authorization enforces
 * the qualified-role requirement and denies the AI identity (R3.8, R6.6, R8.5).
 */
const GATED_RESOLUTION_ACTIONS: Partial<Record<HumanGate, ActionType>> = {
  professional_certification: 'professional_certification',
  signature: 'signature',
  payment_release: 'payment_release',
};

// ── Time helpers ────────────────────────────────────────────────────────────

const RESPONSE_BUSINESS_DAYS = 5;

/**
 * Add `days` business days (Mon–Fri) to an ISO timestamp, skipping weekends,
 * and return the result as an ISO 8601 string. Used to compute the +5 business
 * day response-by deadline (R3.4).
 */
export function addBusinessDays(fromIso: string, days: number): string {
  const base = new Date(fromIso);
  const start = Number.isNaN(base.getTime()) ? new Date() : base;
  const cursor = new Date(start.getTime());
  let added = 0;
  while (added < days) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return cursor.toISOString();
}

// ── Reason validation (R3.1, R3.2) ──────────────────────────────────────────

const REASON_MAX_LENGTH = 1000;

/** True when the reason is present, non-empty (after trim), and <= 1000 chars. */
function isReasonValid(reason: unknown): reason is string {
  return (
    typeof reason === 'string' &&
    reason.trim().length >= 1 &&
    reason.length <= REASON_MAX_LENGTH
  );
}

// ── Service configuration & factory ─────────────────────────────────────────

export interface HandoffServiceConfig {
  repository: HandoffRepository;
  /** Returns the current instant as an ISO 8601 string. Defaults to wall clock. */
  clock?: () => string;
  /** Generates a unique handoff id. Defaults to a counter + timestamp. */
  idFactory?: () => string;
}

export interface HandoffService {
  initiateHandoff(ctx: AuthorizationContext, input: HandoffInput): Promise<HandoffResult>;
  resolveHandoff(
    ctx: AuthorizationContext,
    handoffId: string,
    options?: ResolveHandoffOptions,
  ): Promise<HandoffResult>;
  checkOverdue(now: string, handoffs: CrossRoleHandoff[]): WorkflowEvent[];
}

/**
 * Build a `handoffService` over an injected repository. Explicit dependencies
 * keep the tier testable: the clock and id factory can be made deterministic.
 */
export function createHandoffService(config: HandoffServiceConfig): HandoffService {
  const repository = config.repository;
  const clock = config.clock ?? (() => new Date().toISOString());
  let seq = 0;
  const idFactory =
    config.idFactory ?? (() => `handoff-${Date.now().toString(36)}-${(seq += 1)}`);

  function auditContext(ctx: AuthorizationContext, projectId: string): BaseContext {
    return {
      tenantId: ctx.tenantId,
      projectId,
      userId: ctx.userId,
      actorRole: ctx.role,
      now: ctx.now,
    };
  }

  async function initiateHandoff(
    ctx: AuthorizationContext,
    input: HandoffInput,
  ): Promise<HandoffResult> {
    // 1. Validate the reason (1..1000 chars). Reject without side effects (R3.2).
    if (!isReasonValid(input.reason)) {
      return {
        ok: false,
        reason: 'invalid_reason',
        error:
          'Handoff reason is missing, empty, or exceeds the 1000-character limit.',
      };
    }

    // 1b. Reject cross-tenant handoff creation (PR #114 review — defence in depth).
    if (input.tenantId !== ctx.tenantId) {
      return {
        ok: false,
        reason: 'unauthorized',
        error: 'Cannot create a handoff in a different tenant.',
      };
    }

    // 2. Validate the receiving role is appointed to the project (R3.7).
    if (!input.appointedRoles.includes(input.toRole)) {
      return {
        ok: false,
        reason: 'role_not_appointed',
        error: `Receiving role '${input.toRole}' is not appointed to the project.`,
      };
    }

    // 3. Record the tracked obligation with provenance and a +5 business-day
    //    response-by deadline (R3.1, R3.4).
    const createdAt = clock();
    const handoff: CrossRoleHandoff = {
      id: idFactory(),
      projectId: input.projectId,
      tenantId: input.tenantId,
      fromRole: input.fromRole,
      toRole: input.toRole,
      relatedRecordType: input.relatedRecordType,
      reason: input.reason,
      status: 'open',
      createdAt,
      responseByDate: addBusinessDays(createdAt, RESPONSE_BUSINESS_DAYS),
    };
    await repository.save(handoff);

    // 4. Emit exactly one `approval_required` event to the receiving role (R3.3).
    //    The deterministic id keeps emission idempotent for the obligation.
    const event = createWorkflowEvent({
      id: `handoff-approval-${handoff.id}`,
      type: 'approval_required',
      projectId: handoff.projectId,
      title: `Handoff from ${handoff.fromRole} to ${handoff.toRole}`,
      detail: handoff.reason,
      priority: 'high',
      assignedRoles: [handoff.toRole],
      createdAt,
    });

    audit(
      auditContext(ctx, handoff.projectId),
      `handoff:initiated:from=${handoff.fromRole}:to=${handoff.toRole}`,
      handoff.id,
    );

    return { ok: true, handoff, event };
  }

  async function resolveHandoff(
    ctx: AuthorizationContext,
    handoffId: string,
    options: ResolveHandoffOptions = {},
  ): Promise<HandoffResult> {
    // Tenant-scoped lookup: another tenant's obligation reads as not-found,
    // disclosing nothing (defence in depth alongside accessControlService).
    const handoff = await repository.get(ctx.tenantId, handoffId);
    if (!handoff) {
      return {
        ok: false,
        reason: 'not_found',
        error: `Handoff '${handoffId}' was not found.`,
      };
    }
    if (handoff.status === 'resolved') {
      return {
        ok: false,
        reason: 'already_resolved',
        error: `Handoff '${handoffId}' is already resolved.`,
      };
    }

    // The receiving role completes the handed-off step (R3.6). This denies the
    // originating role and any other role from resolving on its behalf (R3.8).
    if (ctx.role !== handoff.toRole) {
      return {
        ok: false,
        reason: 'unauthorized',
        error: `Only the receiving role '${handoff.toRole}' may resolve handoff '${handoffId}'.`,
      };
    }

    // Sensitive gated steps defer to the access-control gate, which enforces the
    // qualified-role requirement and denies the AI identity (R3.8).
    const gateAction = options.gate ? GATED_RESOLUTION_ACTIONS[options.gate] : undefined;
    if (gateAction) {
      const decision = authorize(ctx, gateAction, {
        tenantId: handoff.tenantId,
        recordType: handoff.relatedRecordType,
      });
      if (decision.outcome === 'denied') {
        return {
          ok: false,
          reason: 'unauthorized',
          error: decision.reason ?? `Resolution of handoff '${handoffId}' was denied.`,
        };
      }
    }

    // Mark resolved and record the resolving actor, role, and timestamp (R3.6).
    const resolved: CrossRoleHandoff = {
      ...handoff,
      status: 'resolved',
      resolvedBy: ctx.userId,
      resolvedRole: ctx.role,
      resolvedAt: clock(),
    };
    await repository.update(resolved);

    audit(
      auditContext(ctx, resolved.projectId),
      `handoff:resolved:role=${ctx.role}`,
      resolved.id,
    );

    return { ok: true, handoff: resolved };
  }

  /**
   * Produce exactly one `task_overdue` event per open handoff whose response-by
   * deadline has passed, assigned to the receiving role (R3.4). Pure over the
   * supplied set; the deterministic event id keeps the mapping one-to-one.
   */
  function checkOverdue(now: string, handoffs: CrossRoleHandoff[]): WorkflowEvent[] {
    const nowMs = new Date(now).getTime();
    const reference = Number.isNaN(nowMs) ? Date.now() : nowMs;
    const events: WorkflowEvent[] = [];
    for (const handoff of handoffs) {
      if (handoff.status !== 'open') continue;
      const dueMs = new Date(handoff.responseByDate).getTime();
      if (Number.isNaN(dueMs) || dueMs >= reference) continue;
      events.push(
        createWorkflowEvent({
          id: `handoff-overdue-${handoff.id}`,
          type: 'task_overdue',
          projectId: handoff.projectId,
          title: `Handoff overdue: ${handoff.fromRole} → ${handoff.toRole}`,
          detail: `Response-by ${handoff.responseByDate} passed for handoff '${handoff.id}'.`,
          priority: 'high',
          assignedRoles: [handoff.toRole],
          createdAt: now,
        }),
      );
    }
    return events;
  }

  return { initiateHandoff, resolveHandoff, checkOverdue };
}

// ── Default instance ────────────────────────────────────────────────────────

/** Default in-memory-backed repository. Production wiring may replace this. */
export const defaultHandoffRepository = new InMemoryHandoffRepository();

/** The default service instance used by dashboards and tools. */
export const handoffService = createHandoffService({
  repository: defaultHandoffRepository,
});

export const initiateHandoff = handoffService.initiateHandoff;
export const resolveHandoff = handoffService.resolveHandoff;
export const checkOverdue = handoffService.checkOverdue;
