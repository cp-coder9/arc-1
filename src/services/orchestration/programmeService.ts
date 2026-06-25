// ─── Unified Project Workflow Orchestration: Unified Programme & Timeline ────
// Maintains the single shared `UnifiedProgramme` per project: a DAG of
// `ProgrammeTask`s spanning every appointed role. This is a thin, pure
// orchestrator over the shared envelope — it validates upserts (dates,
// dependency cap, missing references, and cycles), rolls dependent dates
// forward when a predecessor moves, raises one `task_overdue` event per
// overdue incomplete task, and exposes the role-authorised visible subset.
//
// All functions are pure over the `UnifiedProgramme` object (no heavy
// persistence). A lightweight in-memory store enforces the structural
// "one programme per project" invariant for callers that need it (R4.1).
//
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8.

import type {
  ArchitexRole,
  ProgrammeTask,
  UnifiedProgramme,
  WorkflowEvent,
} from './orchestrationTypes';

// ── Governance bounds ───────────────────────────────────────────────────────

/** Maximum number of tasks in one `UnifiedProgramme` (R4.1). */
export const MAX_PROGRAMME_TASKS = 10_000;

/** Maximum dependency references a single task may declare (R4.2). */
export const MAX_TASK_DEPENDENCIES = 50;

// ── Upsert result (discriminated, cause-specific errors) ────────────────────

/**
 * The cause of a rejected upsert. Each maps one-to-one to an acceptance
 * criterion so callers can surface a precise message (R4.5, R4.6, R4.7).
 */
export type ProgrammeUpsertError =
  | 'tenant_mismatch'
  | 'project_mismatch'
  | 'programme_full'
  | 'invalid_dates'
  | 'too_many_dependencies'
  | 'missing_dependency'
  | 'dependency_cycle';

/**
 * Result of an `upsertTask` attempt. On success the new programme and stored
 * task are returned. On failure a cause-specific error is returned together
 * with the prior persisted programme, left unchanged (R4.5, R4.6, R4.7).
 */
export type ProgrammeResult =
  | { ok: true; programme: UnifiedProgramme; task: ProgrammeTask }
  | {
      ok: false;
      reason: ProgrammeUpsertError;
      message: string;
      /** The prior persisted programme, unchanged. */
      programme: UnifiedProgramme;
    };

// ── Programme visibility model (R4.3) ───────────────────────────────────────

/**
 * Roles that coordinate the whole programme and may therefore view every task.
 * Every other role sees only the tasks for which it is the responsible role.
 * Kept explicit so the authorisation surface is auditable.
 */
export const PROGRAMME_FULL_VISIBILITY_ROLES: readonly ArchitexRole[] = [
  'admin',
  'platform_admin',
  'client_developer',
  'architect',
  'site_manager',
];

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Parse an ISO date/datetime to epoch ms, or `NaN` when unparseable. */
function toMs(value: string): number {
  return new Date(value).getTime();
}

/** Format an epoch-ms instant as an ISO calendar date (`YYYY-MM-DD`). */
function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Start-of-day (UTC) epoch ms for a date/datetime, for calendar comparison. */
function startOfDayMs(value: string): number {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return NaN;
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ── Empty programme factory ─────────────────────────────────────────────────

/** Create an empty `UnifiedProgramme` for a project. */
export function createEmptyProgramme(projectId: string, tenantId: string): UnifiedProgramme {
  return { projectId, tenantId, tasks: [] };
}

// ── Cycle detection (DFS over the proposed dependency set) ──────────────────

/**
 * Return `true` when the dependency graph formed by `tasks` (edges run from a
 * task to each of its `dependsOn` predecessors) contains a cycle. Uses an
 * iterative three-colour depth-first search; a back-edge to a node still on the
 * stack proves a cycle (R4.6). A self-dependency is a trivial cycle.
 */
function hasCycle(tasks: ProgrammeTask[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  // 0 = unvisited, 1 = on the current DFS stack, 2 = fully explored.
  const colour = new Map<string, number>();

  for (const root of tasks) {
    if (colour.get(root.id) === 2) continue;

    // Explicit stack of (nodeId, nextDependencyIndex) frames.
    const stack: Array<{ id: string; index: number }> = [{ id: root.id, index: 0 }];
    colour.set(root.id, 1);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const node = byId.get(frame.id);
      const deps = node ? node.dependsOn : [];

      if (frame.index >= deps.length) {
        colour.set(frame.id, 2);
        stack.pop();
        continue;
      }

      const depId = deps[frame.index];
      frame.index += 1;

      // Ignore references to tasks not in the proposed set; missing references
      // are reported separately by `upsertTask` before cycle detection runs.
      if (!byId.has(depId)) continue;

      const depColour = colour.get(depId) ?? 0;
      if (depColour === 1) {
        return true; // back-edge → cycle
      }
      if (depColour === 0) {
        colour.set(depId, 1);
        stack.push({ id: depId, index: 0 });
      }
    }
  }

  return false;
}

// ── upsertTask (R4.2, R4.5, R4.6, R4.7) ──────────────────────────────────────

function reject(
  programme: UnifiedProgramme,
  reason: ProgrammeUpsertError,
  message: string,
): ProgrammeResult {
  return { ok: false, reason, message, programme };
}

/**
 * Validate and apply a create-or-update of a single `ProgrammeTask`.
 *
 * Validation order (each retains the prior persisted programme on failure):
 *  1. Tenant / project scope — the task must belong to this programme.
 *  2. Capacity — a *new* task may not exceed the 10,000-task bound (R4.1).
 *  3. Dates — `finishDate` must be on or after `startDate` (R4.5).
 *  4. Dependency cap — at most 50 references (R4.2).
 *  5. Missing references — every dependency must exist in the programme (R4.7).
 *  6. Cycles — a DFS over the proposed graph rejects any back-edge (R4.6).
 *
 * On success the task's fields are stored exactly as supplied (R4.2).
 */
export function upsertTask(programme: UnifiedProgramme, task: ProgrammeTask): ProgrammeResult {
  // 1. Scope.
  if (task.tenantId !== programme.tenantId) {
    return reject(
      programme,
      'tenant_mismatch',
      `Task '${task.id}' tenant '${task.tenantId}' does not match programme tenant '${programme.tenantId}'.`,
    );
  }
  if (task.projectId !== programme.projectId) {
    return reject(
      programme,
      'project_mismatch',
      `Task '${task.id}' project '${task.projectId}' does not match programme project '${programme.projectId}'.`,
    );
  }

  const existingIndex = programme.tasks.findIndex((t) => t.id === task.id);
  const isNew = existingIndex === -1;

  // 2. Capacity (only a brand-new task grows the programme).
  if (isNew && programme.tasks.length >= MAX_PROGRAMME_TASKS) {
    return reject(
      programme,
      'programme_full',
      `Programme '${programme.projectId}' already holds the maximum of ${MAX_PROGRAMME_TASKS} tasks.`,
    );
  }

  // 3. Dates.
  const startMs = toMs(task.startDate);
  const finishMs = toMs(task.finishDate);
  if (Number.isNaN(startMs) || Number.isNaN(finishMs) || finishMs < startMs) {
    return reject(
      programme,
      'invalid_dates',
      `Task '${task.id}' finish date '${task.finishDate}' is earlier than start date '${task.startDate}'.`,
    );
  }

  // 4. Dependency cap.
  if (task.dependsOn.length > MAX_TASK_DEPENDENCIES) {
    return reject(
      programme,
      'too_many_dependencies',
      `Task '${task.id}' declares ${task.dependsOn.length} dependencies, exceeding the limit of ${MAX_TASK_DEPENDENCIES}.`,
    );
  }

  // Build the proposed task set (this task replacing or appended to existing).
  const storedTask: ProgrammeTask = { ...task, dependsOn: [...task.dependsOn] };
  const proposed = isNew
    ? [...programme.tasks, storedTask]
    : programme.tasks.map((t, i) => (i === existingIndex ? storedTask : t));
  const proposedIds = new Set(proposed.map((t) => t.id));

  // 5. Missing references.
  const missing = task.dependsOn.find((depId) => !proposedIds.has(depId));
  if (missing !== undefined) {
    return reject(
      programme,
      'missing_dependency',
      `Task '${task.id}' references missing dependency '${missing}'.`,
    );
  }

  // 6. Cycles.
  if (hasCycle(proposed)) {
    return reject(
      programme,
      'dependency_cycle',
      `Task '${task.id}' introduces a dependency cycle.`,
    );
  }

  return {
    ok: true,
    programme: { ...programme, tasks: proposed },
    task: storedTask,
  };
}

// ── recomputeSchedule (R4.4) ─────────────────────────────────────────────────

/**
 * Roll dependent dates forward after `changedTaskId`'s schedule changes.
 *
 * Tasks are processed in dependency (topological) order so every predecessor is
 * finalised first. A task whose start falls before the latest finish among its
 * predecessors is shifted to that finish, preserving its original duration; a
 * task already starting on or after its predecessors is left untouched. The
 * result is that every dependent task starts no earlier than the maximum finish
 * date of its predecessors (R4.4).
 *
 * If `changedTaskId` is absent from the programme, or the graph is not acyclic
 * (no valid ordering exists), the programme is returned unchanged.
 */
export function recomputeSchedule(
  programme: UnifiedProgramme,
  changedTaskId: string,
): UnifiedProgramme {
  if (!programme.tasks.some((t) => t.id === changedTaskId)) {
    return programme;
  }

  const order = topologicalOrder(programme.tasks);
  if (order === null) {
    // A cycle leaves no valid ordering; leave the programme untouched.
    return programme;
  }

  const updated = new Map<string, ProgrammeTask>(
    programme.tasks.map((t) => [t.id, { ...t, dependsOn: [...t.dependsOn] }] as const),
  );

  for (const id of order) {
    const task = updated.get(id);
    if (!task || task.dependsOn.length === 0) continue;

    let maxPredFinish = Number.NEGATIVE_INFINITY;
    for (const depId of task.dependsOn) {
      const pred = updated.get(depId);
      if (!pred) continue;
      const predFinish = toMs(pred.finishDate);
      if (!Number.isNaN(predFinish) && predFinish > maxPredFinish) {
        maxPredFinish = predFinish;
      }
    }
    if (maxPredFinish === Number.NEGATIVE_INFINITY) continue;

    const startMs = toMs(task.startDate);
    const finishMs = toMs(task.finishDate);
    if (Number.isNaN(startMs) || Number.isNaN(finishMs)) continue;

    // Lower-bound the start by the predecessors' latest finish; never pull a
    // task earlier than it already starts.
    const newStartMs = Math.max(startMs, maxPredFinish);
    if (newStartMs !== startMs) {
      const duration = finishMs - startMs;
      updated.set(id, {
        ...task,
        startDate: toIsoDate(newStartMs),
        finishDate: toIsoDate(newStartMs + duration),
      });
    }
  }

  // Preserve original task ordering in the returned programme.
  return {
    ...programme,
    tasks: programme.tasks.map((t) => updated.get(t.id) ?? t),
  };
}

/**
 * Kahn's-algorithm topological order over the dependency graph (edges run from
 * a predecessor to its dependents). Returns `null` if a cycle prevents a total
 * ordering. References to absent tasks are ignored.
 */
function topologicalOrder(tasks: ProgrammeTask[]): string[] | null {
  const ids = new Set(tasks.map((t) => t.id));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const t of tasks) {
    indegree.set(t.id, 0);
    dependents.set(t.id, []);
  }
  for (const t of tasks) {
    for (const depId of t.dependsOn) {
      if (!ids.has(depId)) continue;
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
      dependents.get(depId)!.push(t.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const childId of dependents.get(id) ?? []) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) queue.push(childId);
    }
  }

  return order.length === tasks.length ? order : null;
}

// ── overdueEvents (R4.8) ─────────────────────────────────────────────────────

/**
 * Produce exactly one `task_overdue` `WorkflowEvent` per task whose finish date
 * is earlier than `now` (compared by calendar day) and whose status is not
 * `complete`, each assigned to the task's responsible role (R4.8).
 */
export function overdueEvents(now: string, programme: UnifiedProgramme): WorkflowEvent[] {
  const nowDay = startOfDayMs(now);
  if (Number.isNaN(nowDay)) return [];

  const events: WorkflowEvent[] = [];
  for (const task of programme.tasks) {
    if (task.status === 'complete') continue;
    const finishDay = startOfDayMs(task.finishDate);
    if (Number.isNaN(finishDay) || finishDay >= nowDay) continue;

    events.push({
      id: `task_overdue:${task.id}`,
      type: 'task_overdue',
      projectId: programme.projectId,
      title: `Task overdue: ${task.title}`,
      detail: `Programme task '${task.title}' was due ${task.finishDate} and is not complete.`,
      priority: 'high',
      sourceModule: 'projects',
      assignedRoles: [task.responsibleRole],
      createdAt: now,
    });
  }
  return events;
}

// ── visibleTasks (R4.3) ──────────────────────────────────────────────────────

/**
 * Return the subset of programme tasks the `role` is authorised to view, each
 * identifying its responsible role. Coordinating roles
 * (`PROGRAMME_FULL_VISIBILITY_ROLES`) see every task; every other role sees only
 * the tasks for which it is the responsible role (R4.3).
 */
export function visibleTasks(programme: UnifiedProgramme, role: ArchitexRole): ProgrammeTask[] {
  const seeAll = PROGRAMME_FULL_VISIBILITY_ROLES.includes(role);
  const tasks = seeAll
    ? programme.tasks
    : programme.tasks.filter((t) => t.responsibleRole === role);
  return tasks.map((t) => ({ ...t, dependsOn: [...t.dependsOn] }));
}

// ── In-memory single-programme-per-project store (R4.1) ─────────────────────

/**
 * Enforces the structural "one `UnifiedProgramme` per project" invariant for
 * callers that want managed storage. Pure functions above remain usable
 * standalone; this is convenience glue, not heavy persistence.
 */
export class InMemoryProgrammeStore {
  private programmes = new Map<string, UnifiedProgramme>();

  /** Return the single programme for a project, creating an empty one if absent. */
  getOrCreate(projectId: string, tenantId: string): UnifiedProgramme {
    const existing = this.programmes.get(projectId);
    if (existing) return existing;
    const created = createEmptyProgramme(projectId, tenantId);
    this.programmes.set(projectId, created);
    return created;
  }

  /** Get the programme for a project, or `undefined` if none exists. */
  get(projectId: string): UnifiedProgramme | undefined {
    return this.programmes.get(projectId);
  }

  /**
   * Apply an upsert to the project's single programme, persisting the result on
   * success. Returns the discriminated `ProgrammeResult` either way.
   */
  upsert(task: ProgrammeTask): ProgrammeResult {
    const programme = this.getOrCreate(task.projectId, task.tenantId);
    const result = upsertTask(programme, task);
    if (result.ok) {
      this.programmes.set(task.projectId, result.programme);
    }
    return result;
  }
}

/** The default store instance used by dashboards and the programme surface. */
export const defaultProgrammeStore = new InMemoryProgrammeStore();
