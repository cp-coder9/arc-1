/**
 * Inbox Event Adapter â€” Trust, Verification & Compliance
 *
 * Creates inbox events for compliance actions requiring attention.
 * Routes events to appropriate recipient roles based on compliance state.
 *
 * @module trust_verification_compliance
 */

export type InboxPriority = 'low' | 'medium' | 'high' | 'critical';

export interface InboxEvent {
  eventId: string; recipientRole: string; title: string; description?: string;
  sourceObjectId: string; priority: InboxPriority; projectId?: string;
  createdAt: string; acknowledged: boolean; acknowledgedBy?: string;
  acknowledgedAt?: string; eventType: InboxEventType; moduleKey: string;
}

export type InboxEventType =
  | 'verification_required' | 'document_expiring' | 'document_expired'
  | 'registration_renewal' | 'insurance_renewal' | 'compliance_check'
  | 'consent_required' | 'data_subject_request' | 'breach_notification'
  | 'risk_alert' | 'badge_expired'
  | 'document_readiness' | 'drawing_revision_required';

let eventSeq = 1;
const inboxEvents: InboxEvent[] = [];
const MODULE_KEY = 'trust_verification_compliance';

export function buildComplianceInboxEvent(input: {
  recipientRole: string; title: string; sourceObjectId: string;
  priority: InboxPriority; eventType: InboxEventType;
  description?: string; projectId?: string;
}): InboxEvent {
  const event: InboxEvent = {
    eventId: `inbox-trust-${String(eventSeq++).padStart(6, '0')}`,
    recipientRole: input.recipientRole, title: input.title,
    description: input.description, sourceObjectId: input.sourceObjectId,
    priority: input.priority, projectId: input.projectId,
    createdAt: new Date().toISOString(), acknowledged: false,
    eventType: input.eventType, moduleKey: MODULE_KEY,
  };
  inboxEvents.push(event);
  return event;
}

export function buildVerificationRequiredEvent(
  recipientRole: string, entityId: string, entityType: string,
  priority: InboxPriority = 'medium',
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title: `Verification Required: ${entityType}`,
    description: `${entityType} ${entityId} requires verification.`,
    sourceObjectId: entityId, priority, eventType: 'verification_required',
  });
}

export function buildDocumentExpiringEvent(
  recipientRole: string, documentTitle: string, documentId: string,
  daysUntilExpiry: number, projectId?: string,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title: `Document Expiring: ${documentTitle}`,
    description: `"${documentTitle}" expires in ${daysUntilExpiry} days.`,
    sourceObjectId: documentId,
    priority: daysUntilExpiry <= 7 ? 'critical' : daysUntilExpiry <= 30 ? 'high' : 'medium',
    eventType: 'document_expiring', projectId,
  });
}

export function buildDocumentExpiredEvent(
  recipientRole: string, documentTitle: string, documentId: string, projectId?: string,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title: `Document Expired: ${documentTitle}`,
    description: `"${documentTitle}" has expired. Renew immediately.`,
    sourceObjectId: documentId, priority: 'critical', eventType: 'document_expired', projectId,
  });
}

export function buildRegistrationRenewalEvent(
  recipientRole: string, body: string, registrationNumber: string, daysUntilExpiry: number,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title: `Registration Renewal: ${body}`,
    description: `${body} registration ${registrationNumber} expires in ${daysUntilExpiry} days.`,
    sourceObjectId: registrationNumber,
    priority: daysUntilExpiry <= 14 ? 'critical' : daysUntilExpiry <= 30 ? 'high' : 'medium',
    eventType: 'registration_renewal',
  });
}

export function buildInsuranceExpiringEvent(
  recipientRole: string, provider: string, policyNumber: string, daysUntilExpiry: number,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title: `PI Insurance Expiring: ${provider}`,
    description: `PI insurance ${policyNumber} expires in ${daysUntilExpiry} days.`,
    sourceObjectId: policyNumber,
    priority: daysUntilExpiry <= 14 ? 'critical' : 'high',
    eventType: 'insurance_renewal',
  });
}

export function buildComplianceCheckFailedEvent(
  recipientRole: string, entityId: string, checkType: string, projectId?: string,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title: `Compliance Check Failed: ${checkType}`,
    description: `${checkType} check failed for ${entityId}.`,
    sourceObjectId: entityId, priority: 'high', eventType: 'compliance_check', projectId,
  });
}

export function buildRiskAlertEvent(
  recipientRole: string, entityId: string, riskLevel: string, triggerCount: number,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title: `${riskLevel.toUpperCase()} Risk Alert (${triggerCount} triggers)`,
    description: `${entityId} has ${triggerCount} active risk triggers.`,
    sourceObjectId: entityId,
    priority: riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : 'medium',
    eventType: 'risk_alert',
  });
}

export function buildConsentRequiredEvent(
  recipientRole: string, userId: string, purpose: string,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title: `POPIA Consent Required: ${purpose}`,
    description: `Consent for "${purpose}" is required.`,
    sourceObjectId: userId, priority: 'high', eventType: 'consent_required',
  });
}

// â”€â”€ Backwards-compatible exports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function inbox(
  recipientRole: string, title: string, sourceObjectId: string,
  priority: InboxPriority,
  options?: { description?: string; projectId?: string },
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole, title, sourceObjectId, priority,
    description: options?.description, projectId: options?.projectId,
    eventType: 'verification_required',
  });
}

// â”€â”€ Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getInboxEvents(options?: {
  recipientRole?: string; projectId?: string; unacknowledgedOnly?: boolean;
  priority?: InboxPriority; eventType?: InboxEventType; limit?: number;
}): InboxEvent[] {
  let filtered = [...inboxEvents];
  if (options?.recipientRole) filtered = filtered.filter((e) => e.recipientRole === options.recipientRole);
  if (options?.projectId) filtered = filtered.filter((e) => e.projectId === options.projectId);
  if (options?.unacknowledgedOnly) filtered = filtered.filter((e) => !e.acknowledged);
  if (options?.priority) filtered = filtered.filter((e) => e.priority === options.priority);
  if (options?.eventType) filtered = filtered.filter((e) => e.eventType === options.eventType);
  if (options?.limit) filtered = filtered.slice(0, options.limit);
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function acknowledgeInboxEvent(eventId: string, acknowledgedBy: string): InboxEvent | undefined {
  const event = inboxEvents.find((e) => e.eventId === eventId);
  if (!event) return undefined;
  event.acknowledged = true; event.acknowledgedBy = acknowledgedBy;
  event.acknowledgedAt = new Date().toISOString();
  return event;
}

export function getInboxEventCount(options?: { recipientRole?: string; unacknowledgedOnly?: boolean }): number {
  return getInboxEvents(options).length;
}

export function workflowEventsFromReadiness(
  projectId: string,
  readinessReports: Array<{ checkName: string; ready: boolean; findings: Array<{ code: string; message: string; priority: InboxPriority }> }>,
): InboxEvent[] {
  const events: InboxEvent[] = [];
  for (const report of readinessReports) {
    for (const finding of report.findings) {
      events.push({
        eventId: `inbox-${eventSeq++}`,
        eventType: 'document_readiness',
        recipientRole: 'architect',
        title: `${report.checkName}: ${finding.code}`,
        description: finding.message,
        sourceObjectId: report.checkName,
        priority: finding.priority,
        projectId,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        moduleKey: MODULE_KEY,
      });
    }
  }
  inboxEvents.push(...events);
  return events;
}


export function subscribeToInboxEvents(_projectId: string, _callback?: (evts: InboxEvent[]) => void): () => void { if (_callback) _callback(getInboxEvents({ projectId: _projectId })); return () => {}; }

export function createInboxEvent(input: {
  recipientRole: string; title: string; sourceObjectId: string;
  priority: InboxPriority; eventType?: InboxEventType;
  description?: string; projectId?: string;
}): string {
  const event = buildComplianceInboxEvent({
    recipientRole: input.recipientRole,
    title: input.title,
    sourceObjectId: input.sourceObjectId,
    priority: input.priority,
    eventType: input.eventType ?? 'verification_required',
    description: input.description,
    projectId: input.projectId,
  });
  return event.eventId;
}
export function resetInboxState(): void { inboxEvents.length = 0; eventSeq = 1; }
