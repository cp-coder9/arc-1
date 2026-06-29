// ─── Unified Project Workflow Orchestration: Lifecycle-Phase Progression ─────
// Coordinates lifecycle-phase evaluation and gated advancement. This is a thin
// orchestrator: it delegates phase evaluation and required-record gating to the
// existing `lifecycleEngine.evaluateLifecycle()` (R7.1), emits the single
// `project_phase_changed` `WorkflowEvent` for an eligible transition, and writes
// the from/to/actor/timestamp audit entry through `auditTrailService` (R7.7).
//
// The layer never advances a phase autonomously past its gate: advancement is
// only eligible when every required record exists AND carries an approval
// status of `approved` (R7.2). A blocked attempt retains the phase and creates
// no event (R7.3); an attempt at the final phase is refused with a
// no-subsequent-phase indication (R7.4).
//
// Concurrency: an injectable per-transition idempotency map keyed by
// `${projectId}:${fromPhase}->${toPhase}` guarantees that concurrent requests
// for the same transition produce exactly one event (R7.6). The check-and-set
// runs synchronously before any await, so it is race-free in the single-threaded
// runtime.
//
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7.

import type { BaseContext } from '../../types/agentOrchestration';
import { audit } from '../auditTrailService';
import { evaluateLifecycle } from '../lifecycleEngine';
import { LIFE_CYCLE_DEFINITIONS } from '../lifecycleDefinitions';
import type { ProjectMetadata } from '../lifecycleTypes';
import type {
  AdvancementResult,
  ArchitexRole,
  AuthorizationContext,
  LifecycleEvaluation,
  ProjectPhase,
  ProjectRecord,
  ProjectRecordType,
  WorkflowEvent,
} from './orchestrationTypes';

// ── Phase ordering ──────────────────────────────────────────────────────────

/**
 * Canonical phase order, taken from the single source of phase definitions so
 * the progression sequence never diverges from `lifecycleDefinitions.ts`.
 */
export const PHASE_ORDER: ProjectPhase[] = LIFE_CYCLE_DEFINITIONS.map((d) => d.phase);

/** The next phase after `phase`, or `undefined` when `phase` is the final one. */
export function nextPhase(phase: ProjectPhase): ProjectPhase | undefined {
  const idx = PHASE_ORDER.indexOf(phase);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return undefined;
  return PHASE_ORDER[idx + 1];
}

// ── Responsible roles per phase (R7.5) ──────────────────────────────────────

/**
 * Roles configured as responsible for each lifecycle phase. A
 * `project_phase_changed` event is assigned to the roles responsible for the
 * destination phase (R7.5). Overridable via service config so deployments can
 * tune the mapping without forking the service.
 */
export const RESPONSIBLE_ROLES_BY_PHASE: Record<ProjectPhase, ArchitexRole[]> = {
  onboarding: ['client_developer', 'architect'],
  feasibility: ['architect', 'client_developer'],
  appointment: ['architect', 'client_developer'],
  concept_design: ['architect'],
  design_development: ['architect', 'engineer'],
  municipal_submission: ['architect'],
  tender_procurement: ['quantity_surveyor', 'architect'],
  construction_execution: ['site_manager', 'contractor'],
  closeout: ['site_manager', 'architect', 'client_developer'],
};

// ── Advancement eligibility (R7.1, R7.2) ────────────────────────────────────

/**
 * The approval status a required record must carry for the phase to be eligible
 * to advance (R7.2). Distinct from the lifecycle engine's "usable" notion
 * (which also accepts `issued`): advancement requires explicit `approved`.
 */
const ADVANCEMENT_APPROVAL_STATUS = 'approved' as const;

/** True when at least one record of `type` exists with an `approved` status. */
function hasApprovedRecord(records: ProjectRecord[], type: ProjectRecordType): boolean {
  return records.some(
    (record) => record.recordType === type && record.status === ADVANCEMENT_APPROVAL_STATUS,
  );
}

/**
 * The required record types for the current phase that are absent or not yet
 * `approved` — i.e. the unmet gate for advancement (R7.3).
 */
export function unmetRequiredRecords(
  eligibility: LifecycleEvaluation,
  records: ProjectRecord[],
): ProjectRecordType[] {
  return eligibility.requiredRecordTypes.filter((type) => !hasApprovedRecord(records, type));
}

/**
 * Evaluate whether the project may advance from its current phase.
 *
 * `eligibility` is exactly the output of `lifecycleEngine.evaluateLifecycle()`
 * for the same inputs (R7.1). `mayAdvance` is true only when every required
 * record type for the current phase exists and each carries an approval status
 * of `approved` (R7.2).
 */
export function evaluateAdvancement(
  metadata: ProjectMetadata,
  records: ProjectRecord[],
): { mayAdvance: boolean; eligibility: LifecycleEvaluation } {
  const eligibility = evaluateLifecycle(metadata, records);
  const mayAdvance = unmetRequiredRecords(eligibility, records).length === 0;
  return { mayAdvance, eligibility };
}

// ── Service configuration & dependency injection ────────────────────────────

export interface PhaseProgressionServiceConfig {
  /**
   * Per-transition idempotency store keyed by `${projectId}:${from}->${to}`.
   * Concurrent requests for the same transition return the single stored event
   * rather than creating a duplicate (R7.6). Injectable for tests; defaults to
   * an internal `Map`.
   */
  emittedTransitions?: Map<string, WorkflowEvent>;
  /** Override the responsible-role mapping for destination phases (R7.5). */
  responsibleRolesByPhase?: Record<ProjectPhase, ArchitexRole[]>;
}

/** Idempotency key for a single phase transition (R7.6). */
export function transitionKey(
  projectId: string,
  fromPhase: ProjectPhase,
  toPhase: ProjectPhase,
): string {
  return `${projectId}:${fromPhase}->${toPhase}`;
}

export interface PhaseProgressionService {
  evaluateAdvancement(
    metadata: ProjectMetadata,
    records: ProjectRecord[],
  ): { mayAdvance: boolean; eligibility: LifecycleEvaluation };
  advancePhase(
    ctx: AuthorizationContext,
    metadata: ProjectMetadata,
    records: ProjectRecord[],
  ): Promise<AdvancementResult>;
}

/**
 * Build a `phaseProgressionService` over injected dependencies. Keeping the
 * idempotency store and role mapping explicit lets tests exercise concurrent
 * advancement and destination-role assignment deterministically.
 */
export function createPhaseProgressionService(
  config: PhaseProgressionServiceConfig = {},
): PhaseProgressionService {
  const emittedTransitions = config.emittedTransitions ?? new Map<string, WorkflowEvent>();
  const responsibleRoles = config.responsibleRolesByPhase ?? RESPONSIBLE_ROLES_BY_PHASE;

  function writeAdvanceAudit(
    ctx: AuthorizationContext,
    projectId: string,
    fromPhase: ProjectPhase,
    toPhase: ProjectPhase,
  ): void {
    const auditCtx: BaseContext = {
      tenantId: ctx.tenantId,
      projectId,
      userId: ctx.userId,
      actorRole: ctx.role,
      now: ctx.now,
    };
    // The audit record captures the originating phase, the destination phase,
    // the actor, and the timestamp (R7.7). actorId + createdAt are recorded by
    // the audit service from the context.
    audit(
      auditCtx,
      `phase_advance:committed:from=${fromPhase}:to=${toPhase}:role=${ctx.role}`,
      projectId,
    );
  }

  function buildPhaseChangedEvent(
    ctx: AuthorizationContext,
    projectId: string,
    fromPhase: ProjectPhase,
    toPhase: ProjectPhase,
  ): WorkflowEvent {
    const assignedRoles = [...(responsibleRoles[toPhase] ?? [])];
    return {
      id: `phase-changed:${transitionKey(projectId, fromPhase, toPhase)}`,
      type: 'project_phase_changed',
      projectId,
      title: `Project advanced to ${toPhase}`,
      detail: `Lifecycle phase advanced from ${fromPhase} to ${toPhase}.`,
      priority: 'medium',
      sourceModule: 'projects',
      assignedRoles,
      createdAt: ctx.now,
    };
  }

  async function advancePhase(
    ctx: AuthorizationContext,
    metadata: ProjectMetadata,
    records: ProjectRecord[],
  ): Promise<AdvancementResult> {
    const fromPhase = metadata.currentPhase;
    const target = nextPhase(fromPhase);

    // R7.4: at the final phase there is no subsequent phase to advance to.
    if (!target) {
      return { outcome: 'final_phase', fromPhase };
    }

    // Tenant authorization: reject cross-tenant advancement (PR #114 review).
    if (ctx.tenantId !== metadata.tenantId) {
      return { outcome: 'blocked', fromPhase, unmetRequiredRecords: [] };
    }

    const { mayAdvance, eligibility } = evaluateAdvancement(metadata, records);

    // R7.3: blocked — retain the phase, create no event, return unmet records.
    if (!mayAdvance) {
      return {
        outcome: 'blocked',
        fromPhase,
        unmetRequiredRecords: unmetRequiredRecords(eligibility, records),
      };
    }

    // Eligible. Idempotency check-and-set runs synchronously (no await between
    // `has` and `set`), so concurrent requests for the same transition resolve
    // to the single stored event without emitting a duplicate (R7.6).
    const key = transitionKey(metadata.projectId, fromPhase, target);
    const existing = emittedTransitions.get(key);
    if (existing) {
      return { outcome: 'advanced', fromPhase, toPhase: target, event: existing };
    }

    const event = buildPhaseChangedEvent(ctx, metadata.projectId, fromPhase, target);
    emittedTransitions.set(key, event);

    // R7.5: one event assigned to the new phase's responsible roles. R7.7: the
    // from/to/actor/timestamp audit entry.
    writeAdvanceAudit(ctx, metadata.projectId, fromPhase, target);

    return { outcome: 'advanced', fromPhase, toPhase: target, event };
  }

  return { evaluateAdvancement, advancePhase };
}

// ── Default instance ────────────────────────────────────────────────────────

/** The default service instance used by dashboards and orchestration wiring. */
export const phaseProgressionService = createPhaseProgressionService();

export const advancePhase = phaseProgressionService.advancePhase;
