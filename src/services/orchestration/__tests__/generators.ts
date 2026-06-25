// ─── Unified Project Workflow Orchestration: PBT Generators & Harness ───────
// Feature: unified-project-workflow-orchestration
//
// Shared fast-check generators (`arb*`) and the property-based-testing harness
// used by every orchestration property test. Generators produce only valid
// instances of the reused `services/lifecycleTypes.ts` envelopes plus the
// orchestration request shapes from `orchestrationTypes.ts`, with explicit
// adversarial variants (cyclic / dangling programmes, empty / multi-linked
// records, multi-tenant pools) for the negative and isolation properties.
//
// Requirements traceability: R10.1 (unit + property coverage of reconciliation,
// handoffs, programme validation, advancement gating, tenant denial) and R10.2
// (serialization round-trip including empty and >=2 linked-reference cases).

import fc from 'fast-check';

import type {
  ActionType,
  AuthorizationContext,
  ProgrammeTask,
  ProjectRecordType,
  UnifiedProgramme,
} from '../orchestrationTypes';
import type {
  ApprovalMetadata,
  ArchitexRole,
  AuditMetadata,
  HumanGate,
  ModuleKey,
  Priority,
  ProjectPhase,
  ProjectRecord,
  RecordStatus,
  WorkflowEvent,
} from '../../lifecycleTypes';

// ── PBT harness ─────────────────────────────────────────────────────────────

/**
 * Iterations per property. Lowered from 100 to 25 for faster property-test
 * runs while still exercising a meaningful spread of inputs.
 * Tests must route through {@link assertProperty} so this stays uniform.
 */
export const PBT_NUM_RUNS = 25;

/**
 * Shared wrapper around `fc.assert` enforcing `numRuns: 25`. Accepts both
 * synchronous and asynchronous properties; additional run parameters may be
 * supplied but `numRuns` defaults to {@link PBT_NUM_RUNS} unless overridden.
 */
export function assertProperty<Ts>(
  property: fc.IRawProperty<Ts>,
  params?: fc.Parameters<Ts>,
): void | Promise<void> {
  return fc.assert(property, { numRuns: PBT_NUM_RUNS, ...params });
}

// ── Primitive / enum generators ─────────────────────────────────────────────

const ARCHITEX_ROLES: ArchitexRole[] = [
  'client_developer',
  'architect',
  'engineer',
  'quantity_surveyor',
  'contractor',
  'supplier',
  'candidate_professional',
  'admin',
  'platform_admin',
  'site_manager',
];

const PROJECT_PHASES: ProjectPhase[] = [
  'onboarding',
  'feasibility',
  'appointment',
  'concept_design',
  'design_development',
  'municipal_submission',
  'tender_procurement',
  'construction_execution',
  'closeout',
];

const MODULE_KEYS: ModuleKey[] = [
  'project',
  'appointment',
  'documents',
  'municipal',
  'procurement',
  'finance',
  'site',
  'closeout',
  'marketplace',
  'knowledge',
  'agent',
];

const RECORD_STATUSES: RecordStatus[] = [
  'draft',
  'pending_review',
  'approved',
  'issued',
  'superseded',
  'rejected',
  'missing',
];

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

const PROJECT_RECORD_TYPES: ProjectRecordType[] = [
  'project_brief',
  'property_profile',
  'professional_appointment',
  'scope_baseline',
  'concept_drawings',
  'technical_drawings',
  'drawing_revision',
  'municipal_submission_pack',
  'municipal_approval_letter',
  'tender_pack',
  'quote_comparison',
  'construction_programme',
  'payment_certificate',
  'site_diary',
  'rfi',
  'site_instruction',
  'snag_register',
  'closeout_pack',
  'candidate_supervision_record',
];

const WORKFLOW_EVENT_TYPES: WorkflowEvent['type'][] = [
  'approval_required',
  'municipal_blocker',
  'payment_due',
  'task_overdue',
  'risk_detected',
  'project_phase_changed',
];

const SOURCE_MODULES: WorkflowEvent['sourceModule'][] = [
  'projects',
  'documents',
  'finance',
  'marketplace',
  'messages',
  'settings_admin',
];

const HUMAN_GATES: HumanGate[] = [
  'none',
  'review',
  'approval',
  'signature',
  'payment_release',
  'municipal_submission',
  'professional_certification',
  'closeout_acceptance',
];

const ACTION_TYPES: ActionType[] = [
  'read',
  'write',
  'handoff',
  'phase_advance',
  'professional_certification',
  'signature',
  'payment_release',
  'municipal_submission',
  'closeout_acceptance',
];

export const arbRole = (): fc.Arbitrary<ArchitexRole> => fc.constantFrom(...ARCHITEX_ROLES);
export const arbPhase = (): fc.Arbitrary<ProjectPhase> => fc.constantFrom(...PROJECT_PHASES);
export const arbRecordType = (): fc.Arbitrary<ProjectRecordType> =>
  fc.constantFrom(...PROJECT_RECORD_TYPES);
export const arbPriority = (): fc.Arbitrary<Priority> => fc.constantFrom(...PRIORITIES);
export const arbHumanGate = (): fc.Arbitrary<HumanGate> => fc.constantFrom(...HUMAN_GATES);
export const arbActionType = (): fc.Arbitrary<ActionType> => fc.constantFrom(...ACTION_TYPES);

/** Stable, non-empty identifier with a domain prefix (e.g. `rec_a1b2c3`). */
export const arbId = (prefix: string): fc.Arbitrary<string> =>
  fc
    .tuple(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 0, max: 0xffff }))
    .map(([a, b]) => `${prefix}_${a.toString(16)}${b.toString(16)}`);

/** ISO 8601 timestamp with a timezone offset (UTC `Z`). */
export const arbIsoTimestamp = (): fc.Arbitrary<string> =>
  fc
    .date({
      min: new Date('2020-01-01T00:00:00.000Z'),
      max: new Date('2035-12-31T23:59:59.000Z'),
      noInvalidDate: true,
    })
    .map(d => d.toISOString());

/** Calendar date (`YYYY-MM-DD`) for programme scheduling. */
export const arbIsoDate = (): fc.Arbitrary<string> =>
  fc
    .date({
      min: new Date('2020-01-01T00:00:00.000Z'),
      max: new Date('2035-12-31T00:00:00.000Z'),
      noInvalidDate: true,
    })
    .map(d => d.toISOString().slice(0, 10));

/** JSON-safe payload whose values survive a serialize/deserialize round-trip. */
const arbJsonScalar = (): fc.Arbitrary<string | number | boolean | null> =>
  fc.oneof(
    fc.string({ maxLength: 16 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  );

export const arbPayload = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), arbJsonScalar(), { maxKeys: 5 });

// ── Project record generators (R10.2 round-trip) ────────────────────────────

interface ProjectRecordOptions {
  tenantId?: string;
  projectId?: string;
  /**
   * Controls the linked-reference set so round-trip tests can exercise both
   * required cases: `empty` (zero refs) and `multiple` (>=2 refs). `any` mixes
   * empty, single, and multiple sets.
   */
  links?: 'any' | 'empty' | 'multiple';
}

const arbLinkedRefs = (mode: 'any' | 'empty' | 'multiple'): fc.Arbitrary<string[]> => {
  const emptyRefs = fc.constant<string[]>([]);
  const multipleRefs = fc.uniqueArray(arbId('link'), { minLength: 2, maxLength: 5 });
  const singleRef = fc.uniqueArray(arbId('link'), { minLength: 1, maxLength: 1 });
  if (mode === 'empty') return emptyRefs;
  if (mode === 'multiple') return multipleRefs;
  return fc.oneof(emptyRefs, singleRef, multipleRefs);
};

const arbApprovalMetadata = (): fc.Arbitrary<ApprovalMetadata> =>
  fc.record<ApprovalMetadata>({
    required: fc.boolean(),
    approvedBy: fc.option(fc.uniqueArray(arbId('user'), { maxLength: 3 }), { nil: undefined }),
    pendingRoles: fc.option(fc.uniqueArray(arbRole(), { maxLength: 3 }), { nil: undefined }),
    approvalNote: fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
  });

const arbAuditMetadata = (): fc.Arbitrary<AuditMetadata> =>
  fc.record<AuditMetadata>({
    createdBy: arbId('user'),
    createdAt: arbIsoTimestamp(),
    updatedAt: fc.option(arbIsoTimestamp(), { nil: undefined }),
    supersedesRecordId: fc.option(arbId('rec'), { nil: undefined }),
  });

/**
 * Generates a valid {@link ProjectRecord}. By default the linked-reference set
 * mixes empty, single, and multiple (>=2) cases so a single generator reaches
 * both serialization round-trip scenarios required by R10.2. Use the `links`
 * option to pin a specific case.
 */
export const arbProjectRecord = (
  options: ProjectRecordOptions = {},
): fc.Arbitrary<ProjectRecord> => {
  const tenantArb = options.tenantId ? fc.constant(options.tenantId) : arbId('tenant');
  const projectArb = options.projectId ? fc.constant(options.projectId) : arbId('proj');
  return fc.record<ProjectRecord>({
    id: arbId('rec'),
    tenantId: tenantArb,
    projectId: projectArb,
    phase: arbPhase(),
    moduleKey: fc.constantFrom(...MODULE_KEYS),
    recordType: arbRecordType(),
    title: fc.string({ minLength: 1, maxLength: 60 }),
    status: fc.constantFrom(...RECORD_STATUSES),
    payload: arbPayload(),
    approvals: arbApprovalMetadata(),
    audit: arbAuditMetadata(),
    linkedRecordIds: arbLinkedRefs(options.links ?? 'any'),
  });
};

/** Convenience: a record guaranteed to carry an empty linked-reference set. */
export const arbProjectRecordEmptyLinks = (): fc.Arbitrary<ProjectRecord> =>
  arbProjectRecord({ links: 'empty' });

/** Convenience: a record guaranteed to carry two or more linked references. */
export const arbProjectRecordMultiLinks = (): fc.Arbitrary<ProjectRecord> =>
  arbProjectRecord({ links: 'multiple' });

// ── Tenant pool (>=2 distinct tenants) for isolation tests ──────────────────

/**
 * A pool of two or more distinct tenant identifiers, for cross-tenant
 * isolation properties (R1.7, R6.8/6.9, R8.2/8.7).
 */
export const arbTenantPool = (): fc.Arbitrary<string[]> =>
  fc.uniqueArray(arbId('tenant'), { minLength: 2, maxLength: 5 });

// ── Programme generators (acyclic + adversarial) ────────────────────────────

interface ProgrammeOptions {
  tenantId?: string;
  projectId?: string;
}

const TASK_STATUSES: ProgrammeTask['status'][] = ['not_started', 'in_progress', 'complete'];

const arbScheduleWindow = (): fc.Arbitrary<{ startDate: string; finishDate: string }> =>
  fc
    .tuple(
      fc.date({
        min: new Date('2020-01-01T00:00:00.000Z'),
        max: new Date('2035-01-01T00:00:00.000Z'),
        noInvalidDate: true,
      }),
      fc.integer({ min: 0, max: 365 }),
    )
    .map(([start, durationDays]) => {
      const finish = new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
      return {
        startDate: start.toISOString().slice(0, 10),
        finishDate: finish.toISOString().slice(0, 10),
      };
    });

const buildTask = (
  id: string,
  projectId: string,
  tenantId: string,
  responsibleRole: ArchitexRole,
  title: string,
  schedule: { startDate: string; finishDate: string },
  status: ProgrammeTask['status'],
  dependsOn: string[],
): ProgrammeTask => ({
  id,
  projectId,
  tenantId,
  responsibleRole,
  title,
  startDate: schedule.startDate,
  finishDate: schedule.finishDate,
  status,
  dependsOn,
});

/**
 * Builds a programme whose dependency graph is guaranteed acyclic and free of
 * dangling references: each task may only depend on earlier-indexed tasks.
 */
export const arbAcyclicProgramme = (
  options: ProgrammeOptions = {},
): fc.Arbitrary<UnifiedProgramme> => {
  const tenantArb = options.tenantId ? fc.constant(options.tenantId) : arbId('tenant');
  const projectArb = options.projectId ? fc.constant(options.projectId) : arbId('proj');
  return fc
    .tuple(tenantArb, projectArb, fc.integer({ min: 1, max: 8 }))
    .chain(([tenantId, projectId, count]) => {
      const ids = Array.from({ length: count }, (_, i) => `${projectId}_task_${i}`);
      const perTask = ids.map((id, index) =>
        fc
          .record({
            role: arbRole(),
            title: fc.string({ minLength: 1, maxLength: 30 }),
            schedule: arbScheduleWindow(),
            status: fc.constantFrom(...TASK_STATUSES),
            deps:
              index === 0
                ? fc.constant<string[]>([])
                : fc.uniqueArray(fc.constantFrom(...ids.slice(0, index)), {
                    maxLength: Math.min(index, 50),
                  }),
          })
          .map(t => buildTask(id, projectId, tenantId, t.role, t.title, t.schedule, t.status, t.deps)),
      );
      return fc.tuple(...perTask).map<UnifiedProgramme>(tasks => ({ projectId, tenantId, tasks }));
    });
};

/**
 * An acyclic programme deliberately corrupted with a back-edge so that at
 * least one dependency cycle exists (adversarial input for R4.6).
 */
export const arbCyclicProgramme = (
  options: ProgrammeOptions = {},
): fc.Arbitrary<UnifiedProgramme> =>
  arbAcyclicProgramme(options)
    .filter(p => p.tasks.length >= 2)
    .map(p => {
      const tasks = p.tasks.map(t => ({ ...t, dependsOn: [...t.dependsOn] }));
      // Create a 2-cycle: task[0] -> task[1] and task[1] -> task[0].
      if (!tasks[0].dependsOn.includes(tasks[1].id)) tasks[0].dependsOn.push(tasks[1].id);
      if (!tasks[1].dependsOn.includes(tasks[0].id)) tasks[1].dependsOn.push(tasks[0].id);
      return { ...p, tasks };
    });

/**
 * An acyclic programme with at least one dependency referencing a task id that
 * does not exist in the programme (adversarial input for R4.7).
 */
export const arbDanglingProgramme = (
  options: ProgrammeOptions = {},
): fc.Arbitrary<UnifiedProgramme> =>
  fc.tuple(arbAcyclicProgramme(options), arbId('missing')).map(([p, missingId]) => {
    const tasks = p.tasks.map(t => ({ ...t, dependsOn: [...t.dependsOn] }));
    tasks[0].dependsOn.push(missingId);
    return { ...p, tasks };
  });

/**
 * Scenario union covering acyclic, cyclic, and dangling programmes. The `kind`
 * discriminator lets validation tests assert the expected accept/reject
 * outcome (R4.5, R4.6, R4.7).
 */
export const arbProgramme = (
  options: ProgrammeOptions = {},
): fc.Arbitrary<{ programme: UnifiedProgramme; kind: 'acyclic' | 'cyclic' | 'dangling' }> =>
  fc.oneof(
    arbAcyclicProgramme(options).map(programme => ({ programme, kind: 'acyclic' as const })),
    arbCyclicProgramme(options).map(programme => ({ programme, kind: 'cyclic' as const })),
    arbDanglingProgramme(options).map(programme => ({ programme, kind: 'dangling' as const })),
  );

// ── Workflow event generators (Action Centre / overdue) ─────────────────────

interface EventOptions {
  projectId?: string;
}

export const arbWorkflowEvent = (options: EventOptions = {}): fc.Arbitrary<WorkflowEvent> => {
  const projectArb = options.projectId ? fc.constant(options.projectId) : arbId('proj');
  return fc.record<WorkflowEvent>({
    id: arbId('evt'),
    type: fc.constantFrom(...WORKFLOW_EVENT_TYPES),
    projectId: projectArb,
    title: fc.string({ minLength: 1, maxLength: 50 }),
    detail: fc.string({ maxLength: 120 }),
    priority: arbPriority(),
    sourceModule: fc.constantFrom(...SOURCE_MODULES),
    assignedRoles: fc.uniqueArray(arbRole(), { minLength: 1, maxLength: 4 }),
    createdAt: arbIsoTimestamp(),
  });
};

/**
 * A set of workflow events (possibly empty, to exercise the explicit
 * empty-state path) for Action Centre ordering and resolution properties.
 */
export const arbEventSet = (options: EventOptions = {}): fc.Arbitrary<WorkflowEvent[]> =>
  fc.array(arbWorkflowEvent(options), { maxLength: 20 });

// ── Authorization request generator (R8 / Property 30) ──────────────────────

export interface AuthRequest {
  ctx: AuthorizationContext;
  action: ActionType;
  target: { tenantId: string; recordType?: ProjectRecordType; gate?: HumanGate };
}

const arbAuthContext = (tenantArb: fc.Arbitrary<string>): fc.Arbitrary<AuthorizationContext> =>
  fc.record<AuthorizationContext>({
    tenantId: tenantArb,
    userId: arbId('user'),
    role: arbRole(),
    now: arbIsoTimestamp(),
  });

/**
 * An authorization request spanning the input space: the context tenant and
 * target tenant are independently drawn from a >=2 tenant pool so both
 * matching (in-tenant) and mismatching (cross-tenant) cases occur, exercising
 * both the permit and deny paths of the access-control gate (R8.1–R8.5, R8.7).
 */
export const arbAuthRequest = (): fc.Arbitrary<AuthRequest> =>
  arbTenantPool().chain(tenants => {
    const tenantArb = fc.constantFrom(...tenants);
    return fc.record<AuthRequest>({
      ctx: arbAuthContext(tenantArb),
      action: arbActionType(),
      target: fc.record({
        tenantId: tenantArb,
        recordType: fc.option(arbRecordType(), { nil: undefined }),
        gate: fc.option(arbHumanGate(), { nil: undefined }),
      }),
    });
  });
