// ─── Unified Project Workflow Orchestration: Tool Reconciliation ────────────
// Connects existing standalone-tool runs to the shared project source of truth.
// When a tool's registered domain has a record adapter, the tool output becomes
// exactly one `ProjectRecord` carrying the domain's phase/moduleKey/recordType
// (R9.1, R9.2). When no adapter exists, or the adapter/validation fails, the
// original output is retained as an unmapped linked artefact — never discarded —
// and an error names the affected tool run (R9.4, R9.6). Module records whose
// recordType is required/optional for the current phase feed the passport
// evaluation (R9.3), and shared records resolve through `linkedRecordIds` to a
// single instance rather than a duplicate (R9.5).
//
// This is a thin orchestrator: it delegates record construction to the tool's
// registered domain adapter, audits each reconciliation via `auditTrailService`,
// and keeps the adapter registry and store injectable (mirroring the injectable
// repository in `projectStateService`) so it stays testable for PBT 11.2–11.3.
//
// Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6.

import type { BaseContext } from '../../types/agentOrchestration';
import { audit } from '../auditTrailService';
import { definitionForPhase } from '../lifecycleDefinitions';
import type { ModuleKey } from '../lifecycleTypes';
import type {
  AuthorizationContext,
  ProjectPhase,
  ProjectRecord,
  ProjectRecordType,
  ReconciliationResult,
  ToolAssignment,
} from './orchestrationTypes';

// ── Tool domain + adapter registry (injectable) ─────────────────────────────

/**
 * The registered domain for a tool: the phase, moduleKey, and recordType that
 * every record mapped from this tool's output receives (R9.2). This is the key
 * the adapter registry is organised around — a tool with no entry has no
 * adapter and its output is retained as an unmapped artefact (R9.4).
 */
export interface ToolDomain {
  phase: ProjectPhase;
  moduleKey: ModuleKey;
  recordType: ProjectRecordType;
}

/**
 * A domain adapter for a single tool. `domain` fixes the phase/moduleKey/
 * recordType of the produced record. `toPayload` may transform/validate the
 * raw tool output and MAY throw to signal a validation failure, in which case
 * the output is retained as an unmapped artefact (R9.6). `title` derives a
 * human-readable record title; it defaults to a domain-derived label.
 */
export interface ToolDomainAdapter {
  domain: ToolDomain;
  toPayload?: (assignment: ToolAssignment) => Record<string, unknown>;
  title?: (assignment: ToolAssignment) => string;
}

/** Adapter registry keyed by `StandaloneToolDef.id` (the tool's registered domain). */
export type ToolAdapterRegistry = Map<string, ToolDomainAdapter>;

/**
 * Default registry mapping known standalone tools to their lifecycle domain.
 * Additive and intentionally conservative — tools not listed here are treated
 * as having no adapter (their output is retained as an unmapped artefact),
 * which is the safe, non-discarding default (R9.4). Production wiring may
 * supply an expanded registry without changing this service.
 */
export function createDefaultToolAdapterRegistry(): ToolAdapterRegistry {
  const registry: ToolAdapterRegistry = new Map();
  const register = (toolId: string, domain: ToolDomain): void => {
    registry.set(toolId, { domain });
  };

  // Documents & Drawing Intelligence (Pack 3)
  register('drawing_register', {
    phase: 'design_development',
    moduleKey: 'documents',
    recordType: 'drawing_revision',
  });
  register('ai_drawing_checker', {
    phase: 'design_development',
    moduleKey: 'documents',
    recordType: 'technical_drawings',
  });
  register('cad_upload_check', {
    phase: 'design_development',
    moduleKey: 'documents',
    recordType: 'technical_drawings',
  });
  register('technical_brief', {
    phase: 'onboarding',
    moduleKey: 'project',
    recordType: 'project_brief',
  });

  // Site Execution (Pack 9)
  register('site_diary_entry', {
    phase: 'construction_execution',
    moduleKey: 'site',
    recordType: 'site_diary',
  });
  register('rfi_generator', {
    phase: 'construction_execution',
    moduleKey: 'site',
    recordType: 'rfi',
  });
  register('rfi_response', {
    phase: 'construction_execution',
    moduleKey: 'site',
    recordType: 'rfi',
  });
  register('snag_creator', {
    phase: 'closeout',
    moduleKey: 'site',
    recordType: 'snag_register',
  });

  // Finance / Payment (Pack 8)
  register('payment_claim_builder', {
    phase: 'construction_execution',
    moduleKey: 'finance',
    recordType: 'payment_certificate',
  });

  // Tender / Procurement
  register('tender_bid_bench', {
    phase: 'tender_procurement',
    moduleKey: 'procurement',
    recordType: 'tender_pack',
  });
  register('boq_takeoff', {
    phase: 'tender_procurement',
    moduleKey: 'procurement',
    recordType: 'tender_pack',
  });

  return registry;
}

// ── Unmapped-artefact retention + persistence (injectable) ──────────────────

/**
 * A retained tool output that could not be mapped to a `ProjectRecord`. It is
 * never discarded and is held with an `unmapped` status until it is mapped
 * (R9.4, R9.6).
 */
export interface UnmappedArtifact {
  id: string;
  toolId: string;
  projectId: string;
  tenantId: string;
  output: Record<string, unknown>;
  status: 'unmapped';
  reason: string;
  retainedAt: string;
}

/**
 * Persistence for reconciliation outputs. Mapped records and retained unmapped
 * artefacts are both stored so the source of truth never loses a tool run.
 */
export interface ToolReconciliationStore {
  saveMapped(record: ProjectRecord): void;
  retainUnmapped(artifact: UnmappedArtifact): void;
}

/** Default in-memory store. Suitable for tests and decision-support glue. */
export class InMemoryToolReconciliationStore implements ToolReconciliationStore {
  private mapped: ProjectRecord[] = [];
  private unmapped: UnmappedArtifact[] = [];

  saveMapped(record: ProjectRecord): void {
    this.mapped.push({ ...record, linkedRecordIds: [...record.linkedRecordIds] });
  }

  retainUnmapped(artifact: UnmappedArtifact): void {
    this.unmapped.push({ ...artifact, output: { ...artifact.output } });
  }

  /** All mapped records (test/inspection accessor). */
  listMapped(): ProjectRecord[] {
    return this.mapped.map((r) => ({ ...r, linkedRecordIds: [...r.linkedRecordIds] }));
  }

  /** All retained unmapped artefacts (test/inspection accessor). */
  listUnmapped(): UnmappedArtifact[] {
    return this.unmapped.map((a) => ({ ...a, output: { ...a.output } }));
  }

  /** Reset state (for testing). */
  reset(): void {
    this.mapped.length = 0;
    this.unmapped.length = 0;
  }
}

// ── Service configuration & dependency injection ────────────────────────────

export interface ToolReconciliationServiceConfig {
  /** Adapter registry keyed by tool id. Defaults to the built-in registry. */
  registry?: ToolAdapterRegistry;
  /** Persistence for mapped records and retained artefacts. Defaults to in-memory. */
  store?: ToolReconciliationStore;
  /** Monotonic id generator for produced records/artefacts. Defaults to a counter. */
  idgen?: () => string;
}

const defaultTitleForDomain = (domain: ToolDomain, toolId: string): string =>
  `${domain.recordType} (from ${toolId})`;

// ── Passport-feeding helper (R9.3) ──────────────────────────────────────────

/**
 * Filter module-produced records (Documents/Finance/Site/Analytics) down to the
 * set whose `recordType` is required or optional for `phase`, excluding
 * superseded revisions. These are the records that should feed the passport
 * evaluation, consistent with how `lifecycleEngine`/`projectPassportService`
 * consume records by recordType-vs-phase (R9.3).
 */
export function recordsForPassportInclusion(
  records: ProjectRecord[],
  phase: ProjectPhase,
): ProjectRecord[] {
  const definition = definitionForPhase(phase);
  const eligible = new Set<ProjectRecordType>([
    ...definition.requiredRecordTypes,
    ...definition.optionalRecordTypes,
  ]);
  return records.filter((r) => eligible.has(r.recordType) && r.status !== 'superseded');
}

// ── Shared-record resolution (R9.5) ─────────────────────────────────────────

/**
 * Resolve a referenced record to the single shared instance, following
 * `linkedRecordIds` relationships rather than creating a duplicate (R9.5).
 *
 * Resolution order:
 *  1. A direct match on `id` returns that single instance.
 *  2. Otherwise a record whose `linkedRecordIds` contains `recordId` is the
 *     owning instance the reference points at.
 *
 * Throws when no instance is resolvable so callers never fabricate a duplicate.
 */
export function linkSharedRecord(records: ProjectRecord[], recordId: string): ProjectRecord {
  const direct = records.find((r) => r.id === recordId);
  if (direct) {
    return direct;
  }
  const viaLink = records.find((r) => r.linkedRecordIds.includes(recordId));
  if (viaLink) {
    return viaLink;
  }
  throw new Error(`No shared record resolvable for reference '${recordId}'.`);
}

// ── Service factory ─────────────────────────────────────────────────────────

export interface ToolReconciliationService {
  reconcileToolRun(
    ctx: AuthorizationContext,
    assignment: ToolAssignment,
  ): Promise<ReconciliationResult>;
  linkSharedRecord(records: ProjectRecord[], recordId: string): ProjectRecord;
  recordsForPassportInclusion(records: ProjectRecord[], phase: ProjectPhase): ProjectRecord[];
}

/**
 * Build a `toolReconciliationService` over an injected adapter registry and
 * store. Keeping both injectable lets tests exercise mapped/unmapped paths and
 * adapter failures without real persistence.
 */
export function createToolReconciliationService(
  config: ToolReconciliationServiceConfig = {},
): ToolReconciliationService {
  const registry = config.registry ?? createDefaultToolAdapterRegistry();
  const store = config.store ?? new InMemoryToolReconciliationStore();
  let seq = 0;
  const idgen = config.idgen ?? (() => `toolrec-${++seq}`);

  function auditCtx(ctx: AuthorizationContext, assignment: ToolAssignment): BaseContext {
    return {
      tenantId: ctx.tenantId,
      projectId: assignment.projectId,
      userId: ctx.userId,
      actorRole: ctx.role,
      now: ctx.now,
    };
  }

  /** Retain a tool output as an unmapped linked artefact (never discarded). */
  function retain(
    ctx: AuthorizationContext,
    assignment: ToolAssignment,
    reason: string,
  ): string {
    const id = idgen();
    store.retainUnmapped({
      id,
      toolId: assignment.toolId,
      projectId: assignment.projectId,
      tenantId: assignment.tenantId,
      output: assignment.output,
      status: 'unmapped',
      reason,
      retainedAt: ctx.now,
    });
    audit(auditCtx(ctx, assignment), `tool_reconcile:unmapped:tool=${assignment.toolId}`, id);
    return id;
  }

  async function reconcileToolRun(
    ctx: AuthorizationContext,
    assignment: ToolAssignment,
  ): Promise<ReconciliationResult> {
    const adapter = registry.get(assignment.toolId);

    // No adapter for the tool's domain → retain output as an unmapped linked
    // artefact and name the affected tool run (R9.4, R9.6).
    if (!adapter) {
      const linkedArtifactId = retain(ctx, assignment, 'no record adapter registered for tool domain');
      return {
        outcome: 'unmapped',
        linkedArtifactId,
        error: `Tool run '${assignment.toolId}' for project '${assignment.projectId}' has no registered record adapter; output retained as an unmapped artefact.`,
      };
    }

    try {
      const payload = adapter.toPayload ? adapter.toPayload(assignment) : { ...assignment.output };
      const title = adapter.title ? adapter.title(assignment) : defaultTitleForDomain(adapter.domain, assignment.toolId);

      // Adapter exists → exactly one ProjectRecord whose phase/moduleKey/
      // recordType come from the tool's registered domain (R9.1, R9.2).
      const record: ProjectRecord = {
        id: idgen(),
        tenantId: assignment.tenantId,
        projectId: assignment.projectId,
        phase: adapter.domain.phase,
        moduleKey: adapter.domain.moduleKey,
        recordType: adapter.domain.recordType,
        title,
        status: 'draft',
        payload,
        approvals: { required: false },
        audit: { createdBy: ctx.userId, createdAt: ctx.now },
        linkedRecordIds: [],
      };

      store.saveMapped(record);
      audit(auditCtx(ctx, assignment), `tool_reconcile:mapped:tool=${assignment.toolId}`, record.id);
      return { outcome: 'mapped', record };
    } catch (err) {
      // Adapter or validation failure → preserve the original output as an
      // unmapped artefact and surface an error naming the tool run (R9.6).
      const message = err instanceof Error ? err.message : String(err);
      const linkedArtifactId = retain(ctx, assignment, `adapter/validation failure: ${message}`);
      return {
        outcome: 'unmapped',
        linkedArtifactId,
        error: `Tool run '${assignment.toolId}' for project '${assignment.projectId}' could not be mapped (${message}); output retained as an unmapped artefact.`,
      };
    }
  }

  return { reconcileToolRun, linkSharedRecord, recordsForPassportInclusion };
}

// ── Default instance ────────────────────────────────────────────────────────

/** The default service instance used by dashboards and tools. */
export const toolReconciliationService = createToolReconciliationService();

export const reconcileToolRun = toolReconciliationService.reconcileToolRun;
