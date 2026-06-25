// ─── Unified Project Workflow Orchestration: Shared Types & Governance ──────
// Additive shared-types module for the orchestration tier. This layer is an
// integration and coordination tier on top of the existing Architex packs:
// it reconciles and routes project state but never replaces role-specific
// tool logic. All shared project state remains the existing `ProjectRecord` /
// `ProjectPassport` envelope from `services/lifecycleTypes.ts`; no duplicate
// state types are introduced here.
//
// Requirements traceability: R1.4 (single reconciled value sourced from one
// record), R8.5 (sensitive gates require a qualified role; the AI identity is
// never qualified).

import type {
  AgentRecommendation,
  ArchitexRole,
  HumanGate,
  LifecycleEvaluation,
  Priority,
  ProjectPassport,
  ProjectPhase,
  ProjectRecord,
  ProjectRecordType,
  RecordStatus,
  RiskFinding,
  WorkflowEvent,
} from '../lifecycleTypes';

// ── Re-export reused state types (single source — no duplicates) ────────────
// Orchestration services import these from here so the shared envelope stays
// the canonical state representation across the tier.
export type {
  AgentRecommendation,
  ArchitexRole,
  HumanGate,
  LifecycleEvaluation,
  Priority,
  ProjectPassport,
  ProjectPhase,
  ProjectRecord,
  ProjectRecordType,
  RecordStatus,
  RiskFinding,
  WorkflowEvent,
};

// ── Governance: authorization context, actions, and decisions ───────────────

/**
 * The actor context for every orchestration operation. Mirrors the
 * `BaseContext` shape used by existing services but is the explicit input to
 * the central `accessControlService`.
 */
export interface AuthorizationContext {
  tenantId: string;
  userId: string;
  role: ArchitexRole;
  /** ISO 8601 timestamp with timezone offset. */
  now: string;
}

/**
 * Every governed action type. The first four are routine orchestration
 * operations; the remainder are sensitive actions that sit behind a
 * `HumanGate` and require a qualified human role (R8.4, R8.5).
 */
export type ActionType =
  | 'read'
  | 'write'
  | 'handoff'
  | 'phase_advance'
  | 'professional_certification'
  | 'signature'
  | 'payment_release'
  | 'municipal_submission'
  | 'closeout_acceptance';

/**
 * Outcome of an authorization decision. On denial the `reason` names the
 * attempted action type, the role, and the required gate, and never discloses
 * any target field values (R8.2, R8.3, R8.5).
 */
export interface AuthorizationResult {
  outcome: 'permitted' | 'denied';
  requiredGate: HumanGate;
  reason?: string;
}

// ── Source-of-truth read/write (optimistic concurrency) ─────────────────────

/**
 * A `ProjectRecord` paired with its optimistic-concurrency version, which
 * mirrors `audit.revision` for compare-and-set writes (R1.6, R2.7).
 */
export interface VersionedRecord<T extends Record<string, unknown> = Record<string, unknown>> {
  record: ProjectRecord<T>;
  version: number;
}

/**
 * The reconciled view returned to a dashboard: the derived passport, the
 * underlying record set, and per-derived-value provenance (R1.1, R2.2).
 */
export interface ProjectStateView {
  passport: ProjectPassport;
  records: ProjectRecord[];
  derivedSources: DerivedFieldSource[];
}

/**
 * Provenance for a single derived passport field: the source record id and
 * its last-updated time in SAST (UTC+02:00) to the minute, plus a stale flag
 * raised when propagation fails (R2.2, R2.3).
 */
export interface DerivedFieldSource {
  field: 'approvalStatus' | 'documentStatus' | 'financialStatus' | 'currentPhase' | 'riskLevel';
  sourceRecordId: string;
  /** SAST (UTC+02:00) timestamp rendered to the minute. */
  lastUpdatedSast: string;
  stale: boolean;
}

/**
 * Discriminated result of a write attempt. On failure the prior value is left
 * unchanged and the submitted input is retained for resubmission without
 * re-entry (R1.5, R1.6, R2.7).
 */
export type WriteResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | { ok: true; record: ProjectRecord<T>; version: number }
  | {
      ok: false;
      reason: 'conflict' | 'save_failed' | 'unauthorized';
      currentValue?: ProjectRecord<T>;
      retainedInput: ProjectRecord<T>;
    };

// ── Governed cross-role handoffs ────────────────────────────────────────────

/**
 * A tracked obligation transferring responsibility for a project step from one
 * appointed role to another. `reason` is constrained to 1..1000 chars and
 * `responseByDate` is +5 business days from creation (R3.1, R3.4).
 */
export interface CrossRoleHandoff {
  id: string;
  projectId: string;
  tenantId: string;
  fromRole: ArchitexRole;
  toRole: ArchitexRole;
  relatedRecordType: ProjectRecordType;
  /** 1..1000 characters (R3.1, R3.2). */
  reason: string;
  status: 'open' | 'resolved';
  createdAt: string;
  /** +5 business days from creation (R3.4). */
  responseByDate: string;
  resolvedBy?: string;
  resolvedRole?: ArchitexRole;
  resolvedAt?: string;
}

// ── Unified programme and timeline ──────────────────────────────────────────

/**
 * A single scheduled item on the `UnifiedProgramme`. `finishDate` must be
 * `>= startDate`, `dependsOn` holds up to 50 references to existing tasks, and
 * the dependency graph must remain acyclic (R4.2, R4.5, R4.6, R4.7).
 */
export interface ProgrammeTask {
  id: string;
  projectId: string;
  tenantId: string;
  responsibleRole: ArchitexRole;
  title: string;
  /** ISO date. */
  startDate: string;
  /** ISO date, must be >= startDate (R4.5). */
  finishDate: string;
  status: 'not_started' | 'in_progress' | 'complete';
  /** <= 50 refs; each must exist; acyclic (R4.2, R4.6, R4.7). */
  dependsOn: string[];
}

/**
 * The single shared programme per project, bounded at 10,000 tasks (R4.1).
 */
export interface UnifiedProgramme {
  projectId: string;
  tenantId: string;
  /** <= 10,000 tasks (R4.1). */
  tasks: ProgrammeTask[];
}

// ── Action Centre ───────────────────────────────────────────────────────────

/** Action Centre priority surface (capitalised, Critical-first ordering). */
export type EventPriority = 'Critical' | 'High' | 'Medium' | 'Low';

/**
 * A single Action Centre row wrapping a `WorkflowEvent`. Events without a
 * resolvable route are still shown, flagged with `hasResolvableRoute: false`
 * rather than being omitted (R5.4, R5.7).
 */
export interface ActionItem {
  event: WorkflowEvent;
  priority: EventPriority;
  dueDate?: string;
  targetRoute?: string;
  hasResolvableRoute: boolean;
}

// ── Embedded AI guidance ────────────────────────────────────────────────────

/**
 * Input to AI guidance generation, scoped to a single in-tenant project and a
 * specific surface (R6.1, R6.4, R6.8).
 */
export interface GuidanceRequest {
  ctx: AuthorizationContext;
  surface: 'dashboard' | 'tool' | 'workflow_step';
  passport: ProjectPassport;
}

/**
 * Result of guidance generation. `recommendations` is capped at 10 ordered by
 * descending priority. `status` distinguishes a successful result, an AI
 * timeout/failure (`unavailable`), and an empty applicable set (`none`) so the
 * surface never blocks (R6.1, R6.2, R6.10, R6.11).
 */
export interface GuidanceResult {
  recommendations: AgentRecommendation[];
  stepGuidance?: string;
  status: 'ok' | 'unavailable' | 'none';
}

// ── Tool reconciliation ─────────────────────────────────────────────────────

/**
 * An existing standalone-tool run assigned to a project, awaiting mapping to a
 * `ProjectRecord` via a domain adapter (R9.1, R9.2).
 */
export interface ToolAssignment {
  /** `StandaloneToolDef.id`. */
  toolId: string;
  projectId: string;
  tenantId: string;
  output: Record<string, unknown>;
}

/**
 * Result of reconciling a tool run. When an adapter exists the output becomes
 * exactly one mapped `ProjectRecord`; otherwise the output is retained as an
 * unmapped linked artefact (never discarded) and `error` names the affected
 * tool run (R9.1, R9.2, R9.4, R9.6).
 */
export interface ReconciliationResult {
  outcome: 'mapped' | 'unmapped';
  record?: ProjectRecord;
  linkedArtifactId?: string;
  error?: string;
}

// ── Lifecycle-phase progression ─────────────────────────────────────────────

/**
 * Result of a phase-advancement attempt. A blocked attempt returns the unmet
 * required records and retains the phase with no event; an eligible attempt
 * emits exactly one `project_phase_changed` event (R7.3, R7.4, R7.5).
 */
export interface AdvancementResult {
  outcome: 'advanced' | 'blocked' | 'final_phase';
  fromPhase?: ProjectPhase;
  toPhase?: ProjectPhase;
  unmetRequiredRecords?: ProjectRecordType[];
  event?: WorkflowEvent;
}

// ── Governance constants ────────────────────────────────────────────────────

/**
 * Roles qualified to satisfy each sensitive `HumanGate`. The AI identity is
 * never present in any list, so AI can never satisfy a gate autonomously
 * (R6.6, R8.5). Routine gates (`none`, `review`, `approval`) and the sensitive
 * statutory gates are all enumerated so the map is exhaustive over `HumanGate`.
 */
export const QUALIFIED_ROLES_BY_GATE: Record<HumanGate, ArchitexRole[]> = {
  none: [],
  review: ['architect', 'engineer', 'quantity_surveyor', 'site_manager'],
  approval: ['client_developer', 'architect'],
  signature: ['architect', 'engineer', 'client_developer'],
  payment_release: ['client_developer'],
  municipal_submission: ['architect'],
  professional_certification: ['architect', 'engineer'],
  closeout_acceptance: ['client_developer', 'architect'],
};

/**
 * The single one-to-one mapping from the existing `Priority` to the Action
 * Centre `EventPriority`. Defined once to prevent divergence between R5
 * ordering and R6 recommendation-priority surfaces.
 */
export const PRIORITY_TO_EVENT_PRIORITY: Record<Priority, EventPriority> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
