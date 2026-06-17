import type { AgentInboxEvent, Severity } from '../types/agentOrchestration';
import type { ArchitexRole, WorkflowEvent } from '../services/lifecycleTypes';
import type { SiteInboxEvent } from '../types';

let seq = 1;

export function createInboxEvent(
  recipientRole: string,
  title: string,
  sourceObjectId: string,
  priority: Severity,
): AgentInboxEvent;

export function createInboxEvent(params: {
  projectId: string;
  recipientRole: string;
  title: string;
  description?: string;
  sourceObjectId: string;
  priority: Severity;
}): Promise<string>;

export function createInboxEvent(
  p1: string | { projectId: string; recipientRole: string; title: string; description?: string; sourceObjectId: string; priority: Severity },
  p2?: string,
  p3?: string,
  p4?: Severity,
): AgentInboxEvent | Promise<string> {
  if (typeof p1 === 'object') {
    const id = `inbox-${seq++}`;
    return Promise.resolve(id);
  }
  return {
    eventId: `inbox-${seq++}`,
    recipientRole: p1 as string,
    title: p2 ?? '',
    sourceObjectId: p3 ?? '',
    priority: p4 ?? 'medium',
  };
}

export function inboxEventToWorkflowEvent(
  event: AgentInboxEvent,
  projectId: string,
): WorkflowEvent {
  return {
    id: event.eventId,
    type: 'risk_detected',
    projectId,
    title: event.title,
    detail: event.title,
    priority: event.priority,
    sourceModule: 'projects',
    assignedRoles: [event.recipientRole as ArchitexRole],
    createdAt: new Date().toISOString(),
  };
}

export function workflowEventToInboxEvent(
  event: WorkflowEvent,
): AgentInboxEvent {
  return {
    eventId: event.id,
    recipientRole: event.assignedRoles[0] ?? 'architect',
    title: event.title,
    sourceObjectId: event.id,
    priority: event.priority,
  };
}

export function workflowEventsFromReadiness(
  _projectId: string,
  _readinessReports: unknown[],
): WorkflowEvent[] {
  return [];
}

export function subscribeToInboxEvents(
  _projectId: string,
  callback: (events: SiteInboxEvent[]) => void,
): () => void {
  callback([]);
  return () => {};
}
