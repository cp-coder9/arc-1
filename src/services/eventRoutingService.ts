import type { WorkflowRecord, Severity, AgentIdentity, EventRoute } from '../types/agentOrchestration';

interface RoutedEvent {
  eventId: string;
  sourceType: string;
  payload: Record<string, unknown>;
  priority: Severity;
  routedTo: string[];
  routedAt: string;
  status: 'pending' | 'delivered' | 'failed' | 'dead_letter';
}

interface PriorityQueue {
  critical: RoutedEvent[];
  high: RoutedEvent[];
  medium: RoutedEvent[];
  low: RoutedEvent[];
}

let seq = 1;

const eventRoutes: EventRoute[] = [];
const deadLetterQueue: RoutedEvent[] = [];
const priorityQueue: PriorityQueue = { critical: [], high: [], medium: [], low: [] };

export function createEventRoute(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `eventRoute-${seq++}`,
    type: 'eventRoute',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function registerRoute(route: Omit<EventRoute, 'routeId'>): EventRoute {
  const newRoute: EventRoute = { ...route, routeId: `route-${seq++}` };
  eventRoutes.push(newRoute);
  return newRoute;
}

export function routeEvent(
  sourceType: string,
  payload: Record<string, unknown>,
  priority: Severity,
): RoutedEvent {
  const matchingRoutes = eventRoutes.filter((r) => r.sourceType === sourceType);
  const targetAgents = matchingRoutes.length > 0
    ? matchingRoutes.map((r) => r.targetAgentKey)
    : ['default_orchestrator'];

  const event: RoutedEvent = {
    eventId: `event-${seq++}`,
    sourceType,
    payload,
    priority,
    routedTo: targetAgents,
    routedAt: new Date().toISOString(),
    status: 'pending',
  };

  priorityQueue[priority].push(event);
  return event;
}

export function processNextEvent(priority?: Severity): RoutedEvent | undefined {
  const levels: Severity[] = priority ? [priority] : ['critical', 'high', 'medium', 'low'];
  for (const level of levels) {
    const event = priorityQueue[level].shift();
    if (event) {
      event.status = 'delivered';
      return event;
    }
  }
  return undefined;
}

export function markFailed(eventId: string): void {
  for (const level of ['critical', 'high', 'medium', 'low'] as Severity[]) {
    const event = priorityQueue[level].find((e) => e.eventId === eventId);
    if (event) {
      event.status = 'failed';
      deadLetterQueue.push(event);
      return;
    }
  }
}

export function getDeadLetterQueue(): RoutedEvent[] {
  return [...deadLetterQueue];
}
