// ─── Unified Project Workflow Orchestration: Reconciled Source-of-Truth ──────
// The reconciled read/write service that makes every role dashboard and tool
// share one project source of truth. It is a thin orchestrator: it delegates
// authorization to `accessControlService`, passport assembly to
// `projectPassportService.buildProjectPassport()`, and auditing to
// `auditTrailService`. The only new logic here is reconciliation, optimistic
// concurrency (compare-and-set on the record version that mirrors
// `audit.revision`), provenance/staleness tracking, supersession resolution,
// conflict-by-timestamp reconciliation, and (de)serialization.
//
// The persistence layer is modelled as an injectable `ProjectStateRepository`
// so the tier stays testable and save-failure / timeout / propagation-failure
// can be simulated. The default implementation is in-memory; production wiring
// supplies a Firestore-transaction-backed repository for the CAS. Every
// collection access is tenant-scoped.
//
// Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 10.2.

import type { BaseContext } from '../../types/agentOrchestration';
import { audit } from '../auditTrailService';
import type { ProjectMetadata } from '../lifecycleTypes';
import { buildProjectPassport } from '../projectPassportService';
import { authorize } from './accessControlService';
import type {
  AuthorizationContext,
  DerivedFieldSource,
  ProjectRecord,
  ProjectStateView,
  WriteResult,
} from './orchestrationTypes';

// ── Errors ──────────────────────────────────────────────────────────────────

/**
 * Thrown when an authorized read is denied (tenant mismatch or missing
 * entitlement). Carries no target field values, only the denial reason,
 * preserving non-disclosure (R1.7, R8.2).
 */
export class OrchestrationAuthorizationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'OrchestrationAuthorizationError';
  }
}

/** Thrown when a requested project does not exist within the caller's scope. */
export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project '${projectId}' was not found.`);
    this.name = 'ProjectNotFoundError';
  }
}

// ── Persistence abstraction (injectable, tenant-scoped) ─────────────────────

/**
 * A stored record paired with its optimistic-concurrency version (mirrors
 * `audit.revision`) and the commit timestamp used for conflict reconciliation.
 */
export interface StoredRecordEntry<T extends Record<string, unknown> = Record<string, unknown>> {
  record: ProjectRecord<T>;
  version: number;
  committedAt: string;
}

/** Input to an atomic compare-and-set on a single record. */
export interface CompareAndSwapInput<T extends Record<string, unknown> = Record<string, unknown>> {
  record: ProjectRecord<T>;
  baseVersion: number;
  committedAt: string;
}

/** Outcome of an atomic compare-and-set. */
export type CompareAndSwapResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | { outcome: 'committed'; stored: StoredRecordEntry<T> }
  | { outcome: 'conflict'; current?: StoredRecordEntry<T> };

/**
 * Tenant-scoped persistence for project state. The default is in-memory;
 * production supplies a Firestore-transaction-backed implementation whose
 * `compareAndSwap` runs inside a transaction for the CAS (R1.6, R2.7).
 */
export interface ProjectStateRepository {
  /** Global metadata lookup; the service compares its tenant against the caller's. */
  loadMetadata(projectId: string): Promise<ProjectMetadata | null>;
  /** Tenant-scoped record listing — never returns another tenant's records. */
  listRecords(tenantId: string, projectId: string): Promise<ProjectRecord[]>;
  /** Fetch a single versioned record within the tenant scope. */
  getRecord(
    tenantId: string,
    projectId: string,
    recordId: string,
  ): Promise<StoredRecordEntry | null>;
  /** Atomic compare-and-set on the record version. */
  compareAndSwap(input: CompareAndSwapInput): Promise<CompareAndSwapResult>;
}

const scopeKey = (tenantId: string, projectId: string): string => `${tenantId}::${projectId}`;
const recordKey = (tenantId: string, projectId: string, recordId: string): string =>
  `${tenantId}::${projectId}::${recordId}`;

/**
 * Default in-memory repository. Suitable for tests and decision-support glue;
 * `compareAndSwap` is synchronous-atomic within the single-threaded runtime.
 */
export class InMemoryProjectStateRepository implements ProjectStateRepository {
  private metadata = new Map<string, ProjectMetadata>();
  private records = new Map<string, StoredRecordEntry>();

  /** Seed/replace project metadata (used by callers and tests). */
  seedMetadata(metadata: ProjectMetadata): void {
    this.metadata.set(metadata.projectId, { ...metadata });
  }

  /** Seed/replace a stored record at an explicit version (used by tests). */
  seedRecord(record: ProjectRecord, version = 1, committedAt = record.audit.createdAt): void {
    this.records.set(recordKey(record.tenantId, record.projectId, record.id), {
      record: { ...record, linkedRecordIds: [...record.linkedRecordIds] },
      version,
      committedAt,
    });
  }

  async loadMetadata(projectId: string): Promise<ProjectMetadata | null> {
    const found = this.metadata.get(projectId);
    return found ? { ...found } : null;
  }

  async listRecords(tenantId: string, projectId: string): Promise<ProjectRecord[]> {
    const prefix = `${scopeKey(tenantId, projectId)}::`;
    const out: ProjectRecord[] = [];
    for (const [key, entry] of this.records) {
      if (key.startsWith(prefix)) {
        out.push({ ...entry.record, linkedRecordIds: [...entry.record.linkedRecordIds] });
      }
    }
    return out;
  }

  async getRecord(
    tenantId: string,
    projectId: string,
    recordId: string,
  ): Promise<StoredRecordEntry | null> {
    const entry = this.records.get(recordKey(tenantId, projectId, recordId));
    if (!entry) return null;
    return {
      record: { ...entry.record, linkedRecordIds: [...entry.record.linkedRecordIds] },
      version: entry.version,
      committedAt: entry.committedAt,
    };
  }

  async compareAndSwap(input: CompareAndSwapInput): Promise<CompareAndSwapResult> {
    const { record, baseVersion, committedAt } = input;
    const key = recordKey(record.tenantId, record.projectId, record.id);
    const existing = this.records.get(key);
    const currentVersion = existing?.version ?? 0;

    // Optimistic concurrency: the caller's base version must match the stored
    // version (0 for a not-yet-persisted record). Otherwise the write is stale.
    if (baseVersion !== currentVersion) {
      return { outcome: 'conflict', current: existing ? { ...existing } : undefined };
    }

    const stored: StoredRecordEntry = {
      record: { ...record, linkedRecordIds: [...record.linkedRecordIds] },
      version: currentVersion + 1,
      committedAt,
    };
    this.records.set(key, stored);
    return { outcome: 'committed', stored: { ...stored } };
  }
}

// ── Service configuration & dependency injection ────────────────────────────

/** Signature for the derived-field reconciliation step (injectable for tests). */
export type DeriveSourcesFn = (args: {
  records: ProjectRecord[];
  metadata: ProjectMetadata;
  nowIso: string;
}) => DerivedFieldSource[] | Promise<DerivedFieldSource[]>;

export interface ProjectStateServiceConfig {
  repository: ProjectStateRepository;
  /** Returns the current instant as an ISO 8601 string. Defaults to wall clock. */
  clock?: () => string;
  /** Save failure / timeout budget in ms (R1.5). Default 10_000. */
  saveTimeoutMs?: number;
  /** Derived-field propagation budget in ms (R2.3). Default 5_000. */
  propagationTimeoutMs?: number;
  /** Override the derivation step to simulate slow/failed propagation. */
  deriveSources?: DeriveSourcesFn;
}

const DEFAULT_SAVE_TIMEOUT_MS = 10_000;
const DEFAULT_PROPAGATION_TIMEOUT_MS = 5_000;

// ── Time helpers ────────────────────────────────────────────────────────────

/** Normalise any parseable timestamp to a UTC ISO 8601 string (R1.2). */
function toUtcIso(input: string): string {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Render a timestamp in South African Standard Time (UTC+02:00) to the minute
 * as `YYYY-MM-DD HH:mm+02:00` (R2.2). Falls back to the current instant for an
 * unparseable input so the provenance string is always non-empty.
 */
export function toSast(input: string): string {
  const base = new Date(input);
  const ms = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();
  const sast = new Date(ms + 2 * 60 * 60 * 1000);
  const yyyy = sast.getUTCFullYear();
  const mm = pad2(sast.getUTCMonth() + 1);
  const dd = pad2(sast.getUTCDate());
  const hh = pad2(sast.getUTCHours());
  const min = pad2(sast.getUTCMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}+02:00`;
}

/** Race a promise against a timeout, rejecting with `onTimeout()` if it elapses. */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ── Supersession resolution (R2.4, R2.5) ────────────────────────────────────

/** Result of resolving a (possibly superseded) record to its active revision. */
export interface ActiveResolution {
  /** The current, non-superseded revision. */
  record: ProjectRecord;
  /** The originally requested id, present only when it had been superseded. */
  supersededId?: string;
}

/**
 * Resolve `id` to the active revision. A record superseded by a newer revision
 * (linked via the newer record's `audit.supersedesRecordId`) resolves forward
 * to the current superseding record, returned together with the superseded
 * id (R2.4, R2.5). A live record resolves to itself.
 */
export function resolveActive(records: ProjectRecord[], id: string): ActiveResolution {
  const byId = new Map(records.map((r) => [r.id, r] as const));
  const target = byId.get(id);
  if (!target) {
    throw new ProjectNotFoundError(id);
  }
  if (target.status !== 'superseded') {
    return { record: target };
  }

  const visited = new Set<string>([id]);
  let current = target;
  // Walk forward along the supersession chain until we reach the live revision.
  for (;;) {
    const next = records.find((r) => r.audit.supersedesRecordId === current.id);
    if (!next || visited.has(next.id)) break;
    visited.add(next.id);
    current = next;
    if (current.status !== 'superseded') break;
  }
  return { record: current, supersededId: id };
}

// ── Conflict-by-later-timestamp reconciliation (R2.7) ───────────────────────

/** A commit candidate competing for the same record. */
export interface CommitCandidate<T extends Record<string, unknown> = Record<string, unknown>> {
  record: ProjectRecord<T>;
  committedAt: string;
}

/** Outcome of reconciling two conflicting commits by commit timestamp. */
export interface ConflictReconciliation<T extends Record<string, unknown> = Record<string, unknown>> {
  winner: CommitCandidate<T>;
  loser: CommitCandidate<T>;
  /** Error surfaced to the losing participant, naming the affected record. */
  error: string;
}

/**
 * Reconcile two conflicting commits to the same record that raced past version
 * checking: the commit with the later timestamp wins, the rejected commit is
 * retained in the audit trail, and the loser receives an error identifying the
 * affected record (R2.7). On an exact timestamp tie, `a` is preferred.
 */
export function reconcileConflictingCommits<T extends Record<string, unknown>>(
  ctx: AuthorizationContext,
  a: CommitCandidate<T>,
  b: CommitCandidate<T>,
): ConflictReconciliation<T> {
  const aTime = new Date(a.committedAt).getTime();
  const bTime = new Date(b.committedAt).getTime();
  const aWins = Number.isNaN(bTime) || aTime >= bTime;
  const winner = aWins ? a : b;
  const loser = aWins ? b : a;

  const auditCtx: BaseContext = {
    tenantId: ctx.tenantId,
    projectId: loser.record.projectId,
    userId: ctx.userId,
    actorRole: ctx.role,
    now: ctx.now,
  };
  audit(
    auditCtx,
    `reconcile:rejected:later-timestamp-wins:winner=${winner.committedAt}`,
    loser.record.id,
  );

  return {
    winner,
    loser,
    error: `Commit to record '${loser.record.id}' was rejected: a later commit at ${winner.committedAt} reconciled as the current value.`,
  };
}

// ── Serialization round-trip (R10.2) ────────────────────────────────────────

/**
 * Serialize a `ProjectRecord` to a JSON string preserving every field, its
 * status, and the exact linked-reference set (R10.2).
 */
export function serializeRecord<T extends Record<string, unknown>>(record: ProjectRecord<T>): string {
  return JSON.stringify(record);
}

/**
 * Reconstruct a `ProjectRecord` from its serialized form. The round-trip
 * reproduces identical field values, identical status, and an identical set of
 * linked record references (R10.2).
 */
export function deserializeRecord<T extends Record<string, unknown> = Record<string, unknown>>(
  serialized: string,
): ProjectRecord<T> {
  const parsed = JSON.parse(serialized) as ProjectRecord<T>;
  return {
    ...parsed,
    linkedRecordIds: Array.isArray(parsed.linkedRecordIds) ? [...parsed.linkedRecordIds] : [],
  };
}

// ── Derived-field provenance (R2.1, R2.2) ───────────────────────────────────

/** The active (non-superseded) records, used as derived-field sources. */
function activeRecords(records: ProjectRecord[]): ProjectRecord[] {
  return records.filter((r) => r.status !== 'superseded');
}

/** Last-updated timestamp of a record (prefers `updatedAt`). */
function recordTimestamp(record: ProjectRecord): string {
  return record.audit.updatedAt ?? record.audit.createdAt;
}

/**
 * Compute the provenance for each derived passport field, mapping each to the
 * single source record that determines it (R2.1, R2.2). Where no concrete
 * record drives a field, a non-empty project-scoped sentinel id is used so the
 * provenance is always displayable (R2.2 requires a non-empty source id).
 */
export function computeDerivedSources(
  records: ProjectRecord[],
  metadata: ProjectMetadata,
  nowIso: string,
): DerivedFieldSource[] {
  const live = activeRecords(records);
  const fallbackId = `project:${metadata.projectId}`;

  const mostRecent = (subset: ProjectRecord[]): ProjectRecord | undefined =>
    subset
      .slice()
      .sort((x, y) => new Date(recordTimestamp(y)).getTime() - new Date(recordTimestamp(x)).getTime())[0];

  const source = (
    field: DerivedFieldSource['field'],
    candidate: ProjectRecord | undefined,
  ): DerivedFieldSource => ({
    field,
    sourceRecordId: candidate?.id ?? fallbackId,
    lastUpdatedSast: toSast(candidate ? recordTimestamp(candidate) : nowIso),
    stale: false,
  });

  const approval = live.find((r) => r.recordType === 'municipal_approval_letter');
  const documents = mostRecent(
    live.filter((r) =>
      ['concept_drawings', 'technical_drawings', 'municipal_submission_pack', 'tender_pack'].includes(
        r.recordType,
      ),
    ),
  );
  const finance = live.find((r) => r.recordType === 'payment_certificate');
  const phase = mostRecent(live.filter((r) => r.phase === metadata.currentPhase));
  const risk = mostRecent(live);

  return [
    source('approvalStatus', approval),
    source('documentStatus', documents),
    source('financialStatus', finance),
    source('currentPhase', phase),
    source('riskLevel', risk),
  ];
}

/** Mark a set of derived sources stale, preserving their last reconciled values (R2.3). */
function markStale(sources: DerivedFieldSource[]): DerivedFieldSource[] {
  return sources.map((s) => ({ ...s, stale: true }));
}

// ── Service factory ─────────────────────────────────────────────────────────

export interface ProjectStateService {
  loadProjectState(ctx: AuthorizationContext, projectId: string): Promise<ProjectStateView>;
  writeRecord<T extends Record<string, unknown>>(
    ctx: AuthorizationContext,
    update: { record: ProjectRecord<T>; baseVersion: number },
  ): Promise<WriteResult<T>>;
  resolveActive(records: ProjectRecord[], id: string): ActiveResolution;
}

/**
 * Build a `projectStateService` over an injected repository. Keeping the
 * dependencies explicit lets tests simulate save failures, timeouts, and
 * propagation failures without real timers or Firestore.
 */
export function createProjectStateService(config: ProjectStateServiceConfig): ProjectStateService {
  const repository = config.repository;
  const clock = config.clock ?? (() => new Date().toISOString());
  const saveTimeoutMs = config.saveTimeoutMs ?? DEFAULT_SAVE_TIMEOUT_MS;
  const propagationTimeoutMs = config.propagationTimeoutMs ?? DEFAULT_PROPAGATION_TIMEOUT_MS;
  const derive: DeriveSourcesFn =
    config.deriveSources ??
    (({ records, metadata, nowIso }) => computeDerivedSources(records, metadata, nowIso));

  /** Per-project cache of the last successfully reconciled derived sources (R2.3). */
  const lastReconciled = new Map<string, DerivedFieldSource[]>();

  function writeAudit(
    ctx: AuthorizationContext,
    record: ProjectRecord,
    action: string,
  ): void {
    const auditCtx: BaseContext = {
      tenantId: ctx.tenantId,
      projectId: record.projectId,
      userId: ctx.userId,
      actorRole: ctx.role,
      now: ctx.now,
    };
    audit(auditCtx, action, record.id);
  }

  async function loadProjectState(
    ctx: AuthorizationContext,
    projectId: string,
  ): Promise<ProjectStateView> {
    const metadata = await repository.loadMetadata(projectId);
    if (!metadata) {
      throw new ProjectNotFoundError(projectId);
    }

    // Authorize the read against the project's owning tenant. A tenant mismatch
    // is denied with no field disclosure (R1.7, R8.2).
    const decision = authorize(ctx, 'read', { tenantId: metadata.tenantId });
    if (decision.outcome === 'denied') {
      throw new OrchestrationAuthorizationError(
        decision.reason ?? 'Read access denied.',
      );
    }

    const records = await repository.listRecords(metadata.tenantId, projectId);
    const passport = buildProjectPassport(metadata, records);

    const nowIso = clock();
    let derivedSources: DerivedFieldSource[];
    try {
      derivedSources = await withTimeout(
        Promise.resolve(derive({ records, metadata, nowIso })),
        propagationTimeoutMs,
        () => new Error('derived-field propagation timed out'),
      );
      lastReconciled.set(projectId, derivedSources);
    } catch {
      // Propagation failed/timed out: retain the last reconciled values and
      // mark them stale, naming the source record via `sourceRecordId` (R2.3).
      const cached = lastReconciled.get(projectId);
      derivedSources = markStale(cached ?? computeDerivedSources(records, metadata, nowIso));
    }

    return { passport, records, derivedSources };
  }

  async function writeRecord<T extends Record<string, unknown>>(
    ctx: AuthorizationContext,
    update: { record: ProjectRecord<T>; baseVersion: number },
  ): Promise<WriteResult<T>> {
    const { record, baseVersion } = update;

    // Authorize the write (role entitlement + tenant match) (R8.3, R1.7).
    const decision = authorize(ctx, 'write', {
      tenantId: record.tenantId,
      recordType: record.recordType,
    });
    if (decision.outcome === 'denied') {
      writeAudit(ctx, record, `write:denied:reason=unauthorized:role=${ctx.role}`);
      return { ok: false, reason: 'unauthorized', retainedInput: record };
    }

    // Stamp provenance: actor/role recorded via the audit trail; the write time
    // is persisted on the record as a UTC ISO 8601 timestamp (R1.2).
    const committedAtIso = toUtcIso(ctx.now);
    const stamped: ProjectRecord<T> = {
      ...record,
      audit: { ...record.audit, updatedAt: committedAtIso },
      linkedRecordIds: [...record.linkedRecordIds],
    };

    let result: CompareAndSwapResult;
    try {
      result = await withTimeout(
        repository.compareAndSwap({ record: stamped, baseVersion, committedAt: committedAtIso }),
        saveTimeoutMs,
        () => new Error('save timed out'),
      );
    } catch {
      // Save failed or exceeded the 10 s budget: prior value is left unchanged
      // (the CAS never committed) and the submitted input is retained (R1.5).
      writeAudit(ctx, record, `write:denied:reason=save_failed:role=${ctx.role}`);
      return { ok: false, reason: 'save_failed', retainedInput: record };
    }

    if (result.outcome === 'conflict') {
      // Stale base version: reject, leave the current value unchanged, retain
      // the submitted input for resubmission without re-entry (R1.6).
      writeAudit(ctx, record, `write:denied:reason=conflict:role=${ctx.role}`);
      return {
        ok: false,
        reason: 'conflict',
        currentValue: result.current?.record as ProjectRecord<T> | undefined,
        retainedInput: record,
      };
    }

    const committed = result.stored.record as ProjectRecord<T>;
    writeAudit(
      ctx,
      committed,
      `write:committed:role=${ctx.role}:version=${result.stored.version}`,
    );
    // Invalidate cached provenance so the next load recomputes derived fields
    // from the freshly committed record set (R2.1).
    lastReconciled.delete(committed.projectId);

    return { ok: true, record: committed, version: result.stored.version };
  }

  return { loadProjectState, writeRecord, resolveActive };
}

// ── Default instance ────────────────────────────────────────────────────────

/**
 * The default in-memory-backed repository. Production wiring may replace this
 * with a Firestore-transaction-backed implementation while preserving the
 * `ProjectStateRepository` contract.
 */
export const defaultProjectStateRepository = new InMemoryProjectStateRepository();

/** The default service instance used by dashboards and tools. */
export const projectStateService = createProjectStateService({
  repository: defaultProjectStateRepository,
});

export const loadProjectState = projectStateService.loadProjectState;
export const writeRecord = projectStateService.writeRecord;
