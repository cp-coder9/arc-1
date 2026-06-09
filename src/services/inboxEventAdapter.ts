/**
 * Inbox Event Adapter — Trust, Verification & Compliance
 *
 * Creates inbox events for compliance actions requiring attention.
 * Routes events to appropriate recipient roles based on compliance state.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type InboxPriority = 'low' | 'medium' | 'high' | 'critical';

export interface InboxEvent {
  eventId: string;
  recipientRole: string;
  title: string;
  description?: string;
  sourceObjectId: string;
  priority: InboxPriority;
  projectId?: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  eventType: InboxEventType;
  moduleKey: string;
}

export type InboxEventType =
  | 'verification_required'
  | 'document_expiring'
  | 'document_expired'
  | 'registration_renewal'
  | 'insurance_renewal'
  | 'compliance_check'
  | 'consent_required'
  | 'data_subject_request'
  | 'breach_notification'
  | 'risk_alert'
  | 'badge_expired';

// ── State ──────────────────────────────────────────────────────────────────────

let eventSeq = 1;
const inboxEvents: InboxEvent[] = [];
const MODULE_KEY = 'trust_verification_compliance';

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildComplianceInboxEvent(input: {
  recipientRole: string;
  title: string;
  sourceObjectId: string;
  priority: InboxPriority;
  eventType: InboxEventType;
  description?: string;
  projectId?: string;
}): InboxEvent {
  const event: InboxEvent = {
    eventId: `inbox-trust-${String(eventSeq++).padStart(6, '0')}`,
    recipientRole: input.recipientRole,
    title: input.title,
    description: input.description,
    sourceObjectId: input.sourceObjectId,
    priority: input.priority,
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
    acknowledged: false,
    eventType: input.eventType,
    moduleKey: MODULE_KEY,
  };
  inboxEvents.push(event);
  return event;
}

// ── Event factory helpers ──────────────────────────────────────────────────────

export function buildVerificationRequiredEvent(
  recipientRole: string,
  entityId: string,
  entityType: string,
  priority: InboxPriority = 'medium',
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Verification Required: ${entityType}`,
    description: `${entityType} ${entityId} requires verification. Review documentation and take action.`,
    sourceObjectId: entityId,
    priority,
    eventType: 'verification_required',
  });
}

export function buildDocumentExpiringEvent(
  recipientRole: string,
  documentTitle: string,
  documentId: string,
  daysUntilExpiry: number,
  projectId?: string,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Document Expiring: ${documentTitle}`,
    description: `"${documentTitle}" expires in ${daysUntilExpiry} days. Renew before expiry to avoid compliance gaps.`,
    sourceObjectId: documentId,
    priority: daysUntilExpiry <= 7 ? 'critical' : daysUntilExpiry <= 30 ? 'high' : 'medium',
    eventType: 'document_expiring',
    projectId,
  });
}

export function buildDocumentExpiredEvent(
  recipientRole: string,
  documentTitle: string,
  documentId: string,
  projectId?: string,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Document Expired: ${documentTitle}`,
    description: `"${documentTitle}" has expired. Renew immediately to restore compliance status.`,
    sourceObjectId: documentId,
    priority: 'critical',
    eventType: 'document_expired',
    projectId,
  });
}

export function buildRegistrationRenewalEvent(
  recipientRole: string,
  body: string,
  registrationNumber: string,
  daysUntilExpiry: number,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Registration Renewal: ${body}`,
    description: `${body} registration ${registrationNumber} expires in ${daysUntilExpiry} days. Renew with the professional body.`,
    sourceObjectId: registrationNumber,
    priority: daysUntilExpiry <= 14 ? 'critical' : daysUntilExpiry <= 30 ? 'high' : 'medium',
    eventType: 'registration_renewal',
  });
}

export function buildInsuranceExpiringEvent(
  recipientRole: string,
  provider: string,
  policyNumber: string,
  daysUntilExpiry: number,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `PI Insurance Expiring: ${provider}`,
    description: `PI insurance policy ${policyNumber} expires in ${daysUntilExpiry} days. Renew to maintain coverage.`,
    sourceObjectId: policyNumber,
    priority: daysUntilExpiry <= 14 ? 'critical' : 'high',
    eventType: 'insurance_renewal',
  });
}

export function buildComplianceCheckFailedEvent(
  recipientRole: string,
  entityId: string,
  checkType: string,
  projectId?: string,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Compliance Check Failed: ${checkType}`,
    description: `${checkType} check failed for ${entityId}. Resolve the issue to proceed.${projectId ? ` (Project: ${projectId})` : ''}`,
    sourceObjectId: entityId,
    priority: 'high',
    eventType: 'compliance_check',
    projectId,
  });
}

export function buildRiskAlertEvent(
  recipientRole: string,
  entityId: string,
  riskLevel: string,
  triggerCount: number,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `Risk Alert: ${riskLevel.toUpperCase()} Risk (${triggerCount} triggers)`,
    description: `${entityId} has ${triggerCount} active risk triggers at ${riskLevel} level. Review and mitigate.`,
    sourceObjectId: entityId,
    priority: riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : 'medium',
    eventType: 'risk_alert',
  });
}

export function buildConsentRequiredEvent(
  recipientRole: string,
  userId: string,
  purpose: string,
): InboxEvent {
  return buildComplianceInboxEvent({
    recipientRole,
    title: `POPIA Consent Required: ${purpose}`,
    description: `Consent for "${purpose}" is required. Data processing cannot proceed without valid consent.`,
    sourceObjectId: userId,
    priority: 'high',
    eventType: 'consent_required',
  });
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function getInboxEvents(options?: {
  recipientRole?: string;
  projectId?: string;
  unacknowledgedOnly?: boolean;
  priority?: InboxPriority;
  eventType?: InboxEventType;
  limit?: number;
}): InboxEvent[] {
  let filtered = [...inboxEvents];

  if (options?.recipientRole) {
    filtered = filtered.filter((e) => e.recipientRole === options.recipientRole);
  }
  if (options?.projectId) {
    filtered = filtered.filter((e) => e.projectId === options.projectId);
  }
  if (options?.unacknowledgedOnly) {
    filtered = filtered.filter((e) => !e.acknowledged);
  }
  if (options?.priority) {
    filtered = filtered.filter((e) => e.priority === options.priority);
  }
  if (options?.eventType) {
    filtered = filtered.filter((e) => e.eventType === options.eventType);
  }
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function acknowledgeInboxEvent(eventId: string, acknowledgedBy: string): InboxEvent | undefined {
  const event = inboxEvents.find((e) => e.eventId === eventId);
  if (!event) return undefined;
  event.acknowledged = true;
  event.acknowledgedBy = acknowledgedBy;
  event.acknowledgedAt = new Date().toISOString();
  return event;
}

export function getInboxEventCount(options?: {
  recipientRole?: string;
  unacknowledgedOnly?: boolean;
}): number {
  return getInboxEvents(options).length;
}

// ── Reset (for testing) ────────────────────────────────────────────────────────

export function resetInboxState(): void {
  inboxEvents.length = 0;
  eventSeq = 1;
}
