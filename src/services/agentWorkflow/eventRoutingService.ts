/**
 * Event Routing Service — Pack 14: Agent Orchestration Core
 *
 * Routes ProjectRecords → correct agents, inbox events → correct users/roles.
 * Includes priority-based event queue and dead-letter queue for unhandled events.
 */
import type {
  Priority,
  WorkflowEvent,
  ArchitexRole,
} from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export type EventRouteTarget =
  | { type: 'agent'; agentId: string }
  | { type: 'role'; role: ArchitexRole }
  | { type: 'user'; userId: string };

export interface EventRoute {
  eventId: string;
  sourceEvent: WorkflowEvent;
  targets: EventRouteTarget[];
  priority: Priority;
  routedAt: string;
  expiresAt?: string;
  retryCount: number;
  maxRetries: number;
}

export interface DeadLetterEntry {
  eventId: string;
  originalEvent: WorkflowEvent;
  reason: string;
  failedAt: string;
  retryCount: number;
}

export interface EventQueue {
  active: EventRoute[];
  deadLetter: DeadLetterEntry[];
}

// ─── Route Definitions ────────────────────────────────────────────────────

type EventTypeRouter = (
  event: WorkflowEvent,
  context: { tenantId: string; projectId: string },
) => EventRouteTarget[];

const EVENT_ROUTERS: Record<string, EventTypeRouter> = {
  municipal_blocker: (event) => [
    { type: 'role', role: 'architect' },
    { type: 'role', role: 'client' },
    { type: 'role', role: 'platform_admin' },
  ],
  payment_due: (event) => [
    { type: 'role', role: 'quantity_surveyor' },
    { type: 'role', role: 'client' },
    { type: 'role', role: 'contractor' },
  ],
  approval_required: (event) => {
    // Route to the roles assigned in the event
    return event.assignedRoles.map((role) => ({ type: 'role', role }) as EventRouteTarget);
  },
  risk_detected: (event) => [
    { type: 'role', role: 'architect' },
    { type: 'role', role: 'platform_admin' },
  ],
  task_overdue: (event) => [
    { type: 'role', role: 'architect' },
    { type: 'role', role: 'contractor' },
  ],
  project_phase_changed: (event) => [
    { type: 'role', role: 'architect' },
    { type: 'role', role: 'client' },
    { type: 'role', role: 'platform_admin' },
  ],
};

// ─── Event Routing ────────────────────────────────────────────────────────

/**
 * Route a workflow event to the appropriate targets based on event type,
 * assigned roles, and priority.
 */
export function routeEvent(
  event: WorkflowEvent,
  context: { tenantId: string; projectId: string },
): EventRoute {
  const router = EVENT_ROUTERS[event.type] ?? defaultRouter;
  const targets = router(event, context);

  return {
    eventId: event.id,
    sourceEvent: event,
    targets,
    priority: event.priority,
    routedAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: event.priority === 'critical' ? 5 : 3,
  };
}

function defaultRouter(event: WorkflowEvent): EventRouteTarget[] {
  return [
    { type: 'role', role: 'architect' },
    { type: 'role', role: 'platform_admin' },
  ];
}

// ─── Priority Queue ───────────────────────────────────────────────────────

export function createEventQueue(): EventQueue {
  return { active: [], deadLetter: [] };
}

export function enqueueEvent(queue: EventQueue, route: EventRoute): void {
  // Insert in priority order (critical first)
  const insertIndex = queue.active.findIndex(
    (r) => priorityRank(r.priority) < priorityRank(route.priority),
  );
  if (insertIndex === -1) {
    queue.active.push(route);
  } else {
    queue.active.splice(insertIndex, 0, route);
  }
}

export function dequeueNext(queue: EventQueue): EventRoute | undefined {
  return queue.active.shift();
}

export function peekNext(queue: EventQueue): EventRoute | undefined {
  return queue.active[0];
}

// ─── Dead Letter Queue ────────────────────────────────────────────────────

export function moveToDeadLetter(
  queue: EventQueue,
  route: EventRoute,
  reason: string,
): void {
  queue.deadLetter.push({
    eventId: route.eventId,
    originalEvent: route.sourceEvent,
    reason,
    failedAt: new Date().toISOString(),
    retryCount: route.retryCount,
  });
}

export function requeueFromDeadLetter(
  queue: EventQueue,
  eventId: string,
): EventRoute | undefined {
  const index = queue.deadLetter.findIndex((e) => e.eventId === eventId);
  if (index === -1) return undefined;

  const entry = queue.deadLetter[index];
  queue.deadLetter.splice(index, 1);

  const route: EventRoute = {
    eventId: entry.originalEvent.id,
    sourceEvent: entry.originalEvent,
    targets: defaultRouter(entry.originalEvent),
    priority: entry.originalEvent.priority,
    routedAt: new Date().toISOString(),
    retryCount: entry.retryCount + 1,
    maxRetries: 3,
  };

  enqueueEvent(queue, route);
  return route;
}

// ─── Batch Routing ────────────────────────────────────────────────────────

export function routeEvents(
  events: WorkflowEvent[],
  context: { tenantId: string; projectId: string },
): EventQueue {
  const queue = createEventQueue();
  for (const event of events) {
    const route = routeEvent(event, context);
    enqueueEvent(queue, route);
  }
  return queue;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function priorityRank(p: Priority): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[p];
}
