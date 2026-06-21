import type { AgentInboxEvent, Severity } from '../types/agentOrchestration';
import type { ArchitexRole, WorkflowEvent } from '../services/lifecycleTypes';
import type { SiteInboxEvent } from '../types';

type InboxEvent = AgentInboxEvent & { moduleKey: string; acknowledged: boolean; acknowledgedBy?: string; eventType: string };

let seq = 1;
const inboxStore: InboxEvent[] = [];

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

function buildBaseEvent(recipientRole: string, title: string, sourceObjectId: string, priority: Severity, eventType: string): InboxEvent {
  return {
    eventId: `inbox-trust-${seq++}`,
    recipientRole,
    title,
    sourceObjectId,
    priority,
    eventType,
    moduleKey: 'trust_verification_compliance',
    acknowledged: false,
  };
}

export function buildComplianceInboxEvent(params: {
  recipientRole: string;
  title: string;
  sourceObjectId: string;
  priority: Severity;
  eventType: string;
  description?: string;
  projectId?: string;
}): AgentInboxEvent & { moduleKey: string; acknowledged: boolean; acknowledgedBy?: string } {
  const event = buildBaseEvent(params.recipientRole, params.title, params.sourceObjectId, params.priority, params.eventType);
  inboxStore.push(event);
  return event;
}

export function buildVerificationRequiredEvent(recipientRole: string, sourceObjectId: string, professionalType: string): AgentInboxEvent & { moduleKey: string; acknowledged: boolean } {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Verification required for ${professionalType}`,
    sourceObjectId,
    priority: 'high',
    eventType: 'verification_required',
  });
}

export function buildDocumentExpiringEvent(recipientRole: string, documentType: string, sourceObjectId: string, daysRemaining: number): AgentInboxEvent & { moduleKey: string; acknowledged: boolean } {
  const priority: Severity = daysRemaining < 7 ? 'critical' : daysRemaining < 30 ? 'high' : 'medium';
  return buildComplianceInboxEvent({
    recipientRole,
    title: `${documentType} expiring in ${daysRemaining} days`,
    sourceObjectId,
    priority,
    eventType: 'document_expiring',
  });
}

export function buildDocumentExpiredEvent(recipientRole: string, documentType: string, sourceObjectId: string): AgentInboxEvent & { moduleKey: string; acknowledged: boolean } {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `${documentType} has expired`,
    sourceObjectId,
    priority: 'critical',
    eventType: 'document_expired',
  });
}

export function buildRegistrationRenewalEvent(recipientRole: string, body: string, sourceObjectId: string, daysRemaining: number): AgentInboxEvent & { moduleKey: string; acknowledged: boolean } {
  const priority: Severity = daysRemaining <= 14 ? 'critical' : 'high';
  return buildComplianceInboxEvent({
    recipientRole,
    title: `${body} registration renewal in ${daysRemaining} days`,
    sourceObjectId,
    priority,
    eventType: 'registration_renewal',
  });
}

export function buildInsuranceExpiringEvent(recipientRole: string, provider: string, sourceObjectId: string, daysRemaining: number): AgentInboxEvent & { moduleKey: string; acknowledged: boolean } {
  const priority: Severity = daysRemaining <= 14 ? 'critical' : 'high';
  return buildComplianceInboxEvent({
    recipientRole,
    title: `${provider} insurance expiring in ${daysRemaining} days`,
    sourceObjectId,
    priority,
    eventType: 'insurance_renewal',
  });
}

export function buildComplianceCheckFailedEvent(recipientRole: string, entityId: string, checkType: string, projectId: string): AgentInboxEvent & { moduleKey: string; acknowledged: boolean } {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Compliance check failed for ${entityId}: ${checkType}`,
    sourceObjectId: entityId,
    priority: 'high',
    eventType: 'compliance_check',
    projectId,
  });
}

export function buildRiskAlertEvent(recipientRole: string, sourceObjectId: string, priority: Severity, count: number): AgentInboxEvent & { moduleKey: string; acknowledged: boolean } {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `${count} risk(s) detected`,
    sourceObjectId,
    priority,
    eventType: 'risk_alert',
  });
}

export function buildConsentRequiredEvent(recipientRole: string, sourceObjectId: string, consentType: string): AgentInboxEvent & { moduleKey: string; acknowledged: boolean } {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Consent required for ${consentType}`,
    sourceObjectId,
    priority: 'high',
    eventType: 'consent_required',
  });
}

export function inbox(recipientRole: string, title: string, sourceObjectId: string, priority: Severity): AgentInboxEvent {
  const event = buildBaseEvent(recipientRole, title, sourceObjectId, priority, 'verification_required');
  inboxStore.push(event);
  return event;
}

export function getInboxEvents(filters?: { recipientRole?: string; priority?: Severity; unacknowledgedOnly?: boolean }): AgentInboxEvent[] {
  let events: AgentInboxEvent[] = [...inboxStore];
  if (filters?.recipientRole) events = events.filter((e) => e.recipientRole === filters.recipientRole);
  if (filters?.priority) events = events.filter((e) => e.priority === filters.priority);
  if (filters?.unacknowledgedOnly) events = inboxStore.filter((e) => !e.acknowledged);
  return events;
}

export function acknowledgeInboxEvent(eventId: string, acknowledgedBy: string): AgentInboxEvent | undefined {
  const event = inboxStore.find((e) => e.eventId === eventId);
  if (!event) return undefined;
  event.acknowledged = true;
  event.acknowledgedBy = acknowledgedBy;
  return event;
}

export function getInboxEventCount(filters?: { recipientRole?: string; priority?: Severity }): number {
  return getInboxEvents(filters as { recipientRole?: string; priority?: Severity }).length;
}

export function resetInboxState(): void {
  inboxStore.length = 0;
}
