/**
 * Inbox Event Adapter — Pack 14: Agent Orchestration Core
 *
 * Creates inbox events from agent recommendations, workflow events,
 * and project records, routing them to the correct user roles.
 */
import type { ArchitexRole, Priority } from '@/types/architexMasterTypes';
import type { WorkflowEvent } from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export type InboxEventSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AgentInboxEvent {
  id: string;
  eventId: string;
  recipientRole: ArchitexRole;
  title: string;
  detail: string;
  sourceObjectId: string; // ID of the originating record/event
  sourceType: 'agent_recommendation' | 'workflow_event' | 'approval_required' | 'risk_alert' | 'system_notification';
  priority: Priority;
  isRead: boolean;
  requiresAction: boolean;
  actionableRoute?: string; // Frontend route
  createdAt: string;
  expiresAt?: string;
}

export interface InboxEventBatch {
  events: AgentInboxEvent[];
  generatedAt: string;
  summary: {
    total: number;
    byPriority: Record<Priority, number>;
    byRole: Record<string, number>;
  };
}

// ─── Factory ───────────────────────────────────────────────────────────────

let eventSeq = 1;

/**
 * Create a single inbox event for a recipient role.
 */
export function createInboxEvent(params: {
  recipientRole: ArchitexRole;
  title: string;
  detail?: string;
  sourceObjectId: string;
  priority: Priority;
  sourceType?: AgentInboxEvent['sourceType'];
  actionableRoute?: string;
  expiresInDays?: number;
}): AgentInboxEvent {
  const now = new Date().toISOString();
  return {
    id: `inbox-agent-${eventSeq++}`,
    eventId: `evt-${params.sourceObjectId}-${eventSeq}`,
    recipientRole: params.recipientRole,
    title: params.title,
    detail: params.detail ?? params.title,
    sourceObjectId: params.sourceObjectId,
    sourceType: params.sourceType ?? 'agent_recommendation',
    priority: params.priority,
    isRead: false,
    requiresAction: params.priority === 'high' || params.priority === 'critical',
    actionableRoute: params.actionableRoute,
    createdAt: now,
    expiresAt: params.expiresInDays
      ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  };
}

// ─── Workflow Event → Inbox Events ────────────────────────────────────────

const ROLE_ROUTING: Record<string, ArchitexRole[]> = {
  approval_required: ['architect', 'client'],
  municipal_blocker: ['architect', 'town_planner', 'client'],
  payment_due: ['quantity_surveyor', 'client', 'contractor'],
  task_overdue: ['architect', 'contractor', 'site_manager'],
  risk_detected: ['architect', 'platform_admin'],
  project_phase_changed: ['architect', 'client', 'contractor'],
};

/**
 * Convert a platform WorkflowEvent into inbox events for each
 * responsible role, with appropriate priority and routing.
 */
export function workflowEventToInboxEvents(
  event: WorkflowEvent,
): AgentInboxEvent[] {
  const roles = ROLE_ROUTING[event.type] ?? ['architect', 'platform_admin'];
  return roles.map((role) =>
    createInboxEvent({
      recipientRole: role,
      title: event.title,
      detail: event.detail,
      sourceObjectId: event.id,
      priority: event.priority,
      sourceType: 'workflow_event',
      actionableRoute: resolveRouteForEvent(event.type),
    }),
  );
}

/**
 * Convert a batch of WorkflowEvents into a consolidated inbox event batch.
 */
export function workflowEventsToInboxBatch(
  events: WorkflowEvent[],
): InboxEventBatch {
  const allEvents = events.flatMap(workflowEventToInboxEvents);

  const byPriority: Record<Priority, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const byRole: Record<string, number> = {};

  for (const evt of allEvents) {
    byPriority[evt.priority] = (byPriority[evt.priority] ?? 0) + 1;
    byRole[evt.recipientRole] = (byRole[evt.recipientRole] ?? 0) + 1;
  }

  return {
    events: allEvents,
    generatedAt: new Date().toISOString(),
    summary: {
      total: allEvents.length,
      byPriority,
      byRole,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function resolveRouteForEvent(
  eventType: WorkflowEvent['type'],
): string {
  const routes: Record<string, string> = {
    approval_required: '/projects/approvals',
    municipal_blocker: '/projects/municipal',
    payment_due: '/finance/payments',
    task_overdue: '/projects/tasks',
    risk_detected: '/projects/risks',
    project_phase_changed: '/projects/passport',
  };
  return routes[eventType] ?? '/command-centre';
}
