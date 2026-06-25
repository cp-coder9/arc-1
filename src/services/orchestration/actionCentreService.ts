// ─── Unified Project Workflow Orchestration: Action Centre Aggregation ───────
// The Action Centre turns reconciled project state into the prioritised list of
// next actions for a user. It is a thin, pure-ish orchestrator over the
// existing packs: project conditions are derived from the `ProjectPassport`
// assembled by `projectPassportService.buildProjectPassport()` (which itself
// composes `lifecycleEngine.evaluateLifecycle()` and `riskEngine.evaluateRisks()`),
// and the resulting `WorkflowEvent`s are wrapped, aggregated across projects,
// totally ordered, and resolved as their underlying conditions settle.
//
// The three exported operations:
//   • detectConditions(passport)   — passport conditions → prioritised events
//   • buildActionCentre(ctx, …)    — aggregate across projects, totally ordered
//   • resolveSettled(items, …)     — drop events whose condition no longer holds
//
// Events are pure functions of the passport: their ids are content-derived and
// stable, so `resolveSettled` can recompute the still-valid condition set and
// drop anything that has settled. No persistence, no auditing, and no AI calls
// happen here — those concerns live in the dedicated services — which keeps the
// Action Centre deterministic and trivially testable for PBT tasks 8.2–8.6.
//
// Note on `task_overdue`: programme task overdue detection is owned by
// `programmeService.overdueEvents()`; those events are merged into the Action
// Centre by the UI/aggregation layer. `detectConditions` covers only the
// conditions derivable from the passport itself.
//
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8.

import type {
  ActionItem,
  ArchitexRole,
  AuthorizationContext,
  EventPriority,
  Priority,
  ProjectPassport,
  ProjectStateView,
  WorkflowEvent,
} from './orchestrationTypes';
import { PRIORITY_TO_EVENT_PRIORITY } from './orchestrationTypes';

// ── Empty-state representation (R5.8) ───────────────────────────────────────

/**
 * The explicit "no outstanding actions" indication surfaced when a user's
 * Action Centre holds no unresolved events (R5.8). The list representation is
 * simply an empty `ActionItem[]`; `hasOutstandingActions` and this message let
 * callers render the explicit empty state.
 */
export const NO_OUTSTANDING_ACTIONS_MESSAGE = 'No outstanding actions remain.';

/** Whether the Action Centre has any outstanding items (R5.8). */
export function hasOutstandingActions(items: ActionItem[]): boolean {
  return items.length > 0;
}

// ── Blocking-phase-advancement marker (R5.6) ────────────────────────────────

/**
 * Prefix stamped onto the `detail` of each missing-required-record event so the
 * Action Centre can indicate that the lifecycle phase cannot advance until the
 * record is provided (R5.6). Exposed so UI and tests can detect the flag
 * without parsing free text by hand.
 */
export const BLOCKS_PHASE_ADVANCEMENT_MARKER = '[blocks-phase-advancement]';

/** Whether an event is flagged as blocking phase advancement (R5.6). */
export function blocksPhaseAdvancement(event: WorkflowEvent): boolean {
  return event.detail.startsWith(BLOCKS_PHASE_ADVANCEMENT_MARKER);
}

// ── Lifecycle phases where municipal approval gates progression ─────────────

/**
 * Phase at and after which proceeding without municipal approval is a blocker.
 * Mirrors `riskEngine`'s construction-without-approval check (R5.1).
 */
const CONSTRUCTION_PHASE: ProjectPassport['currentPhase'] = 'construction_execution';

// ── Condition detection (R5.1, R5.6) ────────────────────────────────────────

/**
 * Derive the set of action-requiring conditions exhibited by a single project
 * passport and express each as a prioritised `WorkflowEvent` (R5.1). Detected
 * conditions:
 *
 *   • missing required record → one event per record, flagged as blocking phase
 *     advancement (R5.6);
 *   • open approval           → `approval_required`;
 *   • municipal blocker       → `municipal_blocker` (construction without
 *     municipal approval);
 *   • payment due             → `payment_due`;
 *   • detected risk           → `risk_detected` when the passport risk level is
 *     high or critical.
 *
 * Each event carries a `Priority` (one-to-one with the Action Centre
 * `EventPriority` set {Critical, High, Medium, Low}). Event ids are
 * content-derived and stable so `resolveSettled` can recompute the live set.
 */
export function detectConditions(passport: ProjectPassport): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];
  const { projectId, currentPhase, leadProfessionalRole } = passport;
  const createdAt = new Date().toISOString();

  // 1. Missing required records — each blocks phase advancement (R5.6).
  for (const missing of passport.lifecycle.missingRecords) {
    events.push({
      id: `${projectId}::missing::${missing.recordType}`,
      type: 'approval_required',
      projectId,
      title: `Missing required record: ${missing.recordType}`,
      detail: `${BLOCKS_PHASE_ADVANCEMENT_MARKER} ${missing.reason}`,
      priority: missing.priority,
      sourceModule: 'projects',
      assignedRoles: [leadProfessionalRole],
      createdAt,
    });
  }

  // 2. Open approval awaiting a decision (R5.1).
  if (passport.approvalStatus === 'pending') {
    events.push({
      id: `${projectId}::approval-pending`,
      type: 'approval_required',
      projectId,
      title: 'Approval pending',
      detail: 'A submitted record is awaiting approval before the project can proceed.',
      priority: 'high',
      sourceModule: 'projects',
      assignedRoles: [leadProfessionalRole, 'client_developer'],
      createdAt,
    });
  }

  // 3. Municipal blocker — construction proceeding without municipal approval (R5.1).
  if (currentPhase === CONSTRUCTION_PHASE && passport.approvalStatus !== 'approved') {
    events.push({
      id: `${projectId}::municipal-blocker`,
      type: 'municipal_blocker',
      projectId,
      title: 'Municipal approval outstanding',
      detail: 'Construction phase requires municipal approval evidence before proceeding.',
      priority: 'critical',
      sourceModule: 'projects',
      assignedRoles: [leadProfessionalRole, 'client_developer'],
      createdAt,
    });
  }

  // 4. Payment certificate awaiting review (R5.1).
  if (passport.financialStatus === 'pending_review') {
    events.push({
      id: `${projectId}::payment-due`,
      type: 'payment_due',
      projectId,
      title: 'Payment certificate awaiting review',
      detail: 'A payment certificate requires review before release.',
      priority: 'high',
      sourceModule: 'finance',
      assignedRoles: ['client_developer', 'quantity_surveyor'],
      createdAt,
    });
  }

  // 5. Detected risk — surface when the aggregate risk level is high/critical (R5.1).
  if (passport.riskLevel === 'high' || passport.riskLevel === 'critical') {
    events.push({
      id: `${projectId}::risk::${passport.riskLevel}`,
      type: 'risk_detected',
      projectId,
      title: `Project risk level: ${passport.riskLevel}`,
      detail: 'Elevated project risk detected from the current project state.',
      priority: passport.riskLevel,
      sourceModule: 'projects',
      assignedRoles: [leadProfessionalRole],
      createdAt,
    });
  }

  return events;
}

// ── Routing (R5.4, R5.7) ────────────────────────────────────────────────────

/**
 * Resolve the navigation route for an event, or `undefined` when no single
 * route can resolve it. A `risk_detected` event has no single resolution route
 * (the response depends on the specific finding), so it is surfaced with a
 * no-direct-route marker rather than being omitted (R5.4, R5.7).
 */
export function routeForEvent(event: WorkflowEvent): string | undefined {
  const base = `/projects/${event.projectId}`;
  switch (event.type) {
    case 'approval_required':
      return `${base}/approvals`;
    case 'municipal_blocker':
      return `${base}/compliance`;
    case 'payment_due':
      return `${base}/payments`;
    case 'task_overdue':
      return `${base}/programme`;
    case 'project_phase_changed':
      return base;
    case 'risk_detected':
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Wrap a `WorkflowEvent` in an `ActionItem`, mapping its `Priority` to the
 * Action Centre `EventPriority` and attaching its route (or the explicit
 * no-direct-route marker). An item is never omitted (R5.4, R5.7).
 */
export function toActionItem(event: WorkflowEvent): ActionItem {
  const targetRoute = routeForEvent(event);
  return {
    event,
    priority: PRIORITY_TO_EVENT_PRIORITY[event.priority],
    dueDate: undefined,
    targetRoute,
    hasResolvableRoute: targetRoute !== undefined,
  };
}

// ── Total ordering (R5.2, R5.3) ─────────────────────────────────────────────

const EVENT_PRIORITY_RANK: Record<EventPriority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

/** Parse a timestamp to epoch ms; unparseable/empty sorts last. */
function timeValue(iso: string | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Total ordering over action items (R5.2, R5.3):
 *   1. priority — Critical first … Low last;
 *   2. due date — earliest first, items without a due date last;
 *   3. creation timestamp — oldest first.
 */
export function compareActionItems(a: ActionItem, b: ActionItem): number {
  const byPriority = EVENT_PRIORITY_RANK[a.priority] - EVENT_PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;

  const byDue = timeValue(a.dueDate) - timeValue(b.dueDate);
  if (byDue !== 0) return byDue;

  return timeValue(a.event.createdAt) - timeValue(b.event.createdAt);
}

// ── Aggregation across projects (R5.2, R5.3, R5.4, R5.7) ────────────────────

/**
 * Build a user's Action Centre across every supplied project view. For each
 * project passport the detected conditions become events; events assigned to
 * the requesting user's role are wrapped as `ActionItem`s and returned in the
 * total order defined by `compareActionItems` (R5.2, R5.3). Every qualifying
 * event yields an item — those without a resolvable route are flagged
 * `hasResolvableRoute: false` rather than omitted (R5.4, R5.7). An empty result
 * is the explicit "no outstanding actions" state (R5.8).
 */
export function buildActionCentre(
  ctx: AuthorizationContext,
  projects: ProjectStateView[],
): ActionItem[] {
  const items: ActionItem[] = [];

  for (const project of projects) {
    const events = detectConditions(project.passport);
    for (const event of events) {
      if (isAssignedTo(event, ctx.role)) {
        items.push(toActionItem(event));
      }
    }
  }

  return items.sort(compareActionItems);
}

/** Whether an event is assigned to the given role (R5.2). */
function isAssignedTo(event: WorkflowEvent, role: ArchitexRole): boolean {
  return event.assignedRoles.includes(role);
}

// ── Resolution of settled conditions (R5.5) ─────────────────────────────────

/**
 * Drop action items whose underlying condition no longer holds (R5.5). The
 * still-valid condition set is recomputed from the supplied passports; an item
 * is retained only when its (content-derived, stable) event id is still
 * produced by `detectConditions` for that project. Items for projects with no
 * supplied passport are retained, since their condition cannot be evaluated.
 * An empty result is the explicit "no outstanding actions" state (R5.8).
 */
export function resolveSettled(
  items: ActionItem[],
  passports: ProjectPassport[],
): ActionItem[] {
  const evaluatedProjects = new Set(passports.map((p) => p.projectId));
  const liveEventIds = new Set<string>();
  for (const passport of passports) {
    for (const event of detectConditions(passport)) {
      liveEventIds.add(event.id);
    }
  }

  return items.filter((item) => {
    const projectId = item.event.projectId;
    // Retain items we cannot evaluate (no passport supplied for the project).
    if (!evaluatedProjects.has(projectId)) return true;
    // Otherwise keep only items whose condition is still present.
    return liveEventIds.has(item.event.id);
  });
}

// Re-export the priority mapping for callers that surface event priorities
// alongside Action Centre items (single shared mapping, no divergence).
export { PRIORITY_TO_EVENT_PRIORITY };
export type { Priority };
