/**
 * Contextual Message Draft Service — Pack 14: Agent Orchestration Core
 *
 * Generates context-aware messages from ProjectRecords.
 * Template-based + AI-generated hybrid approach.
 */

import type { ArchitexRole, ProjectRecord } from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MessageDraft {
  id: string;
  subject: string;
  body: string;
  suggestedRecipients: ArchitexRole[];
  sourceRecords: string[]; // Record IDs that informed this draft
  tone: 'formal' | 'informative' | 'urgent' | 'collaborative';
  requiresReview: boolean;
  generatedAt: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  triggerEvent: string;
  subjectTemplate: string;
  bodyTemplate: string;
  defaultTone: MessageDraft['tone'];
  recipientRoles: ArchitexRole[];
  vars: string[]; // Variable names expected in context
}

// ─── Message Templates ────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tpl-missing-approval',
    name: 'Missing Approval Notice',
    triggerEvent: 'approval_required',
    subjectTemplate: 'Action Required: Missing approval for {{projectName}}',
    bodyTemplate:
      'The following approval is required for project {{projectName}} (Phase: {{phase}}):\n\n' +
      '• {{recordType}}: {{reason}}\n\n' +
      'Please upload or confirm the required approval evidence at your earliest convenience.\n\n' +
      'This is an automated message from the Architex Platform.',
    defaultTone: 'urgent',
    recipientRoles: ['architect', 'client'],
    vars: ['projectName', 'phase', 'recordType', 'reason'],
  },
  {
    id: 'tpl-missing-record',
    name: 'Missing Record Reminder',
    triggerEvent: 'risk_detected',
    subjectTemplate: 'Reminder: Missing record for {{projectName}}',
    bodyTemplate:
      'The project {{projectName}} is missing the following required record for phase {{phase}}:\n\n' +
      '• {{recordType}}\n\n' +
      'This record is required before the project can advance. Please create it in the {{moduleName}} module.\n\n' +
      'Next best action: {{nextAction}}',
    defaultTone: 'informative',
    recipientRoles: ['architect'],
    vars: ['projectName', 'phase', 'recordType', 'moduleName', 'nextAction'],
  },
  {
    id: 'tpl-payment-review',
    name: 'Payment Review Required',
    triggerEvent: 'payment_due',
    subjectTemplate: 'Payment Review: {{projectName}} — {{amount}}',
    bodyTemplate:
      'A payment certificate for {{projectName}} requires review:\n\n' +
      '• Amount: {{amount}}\n' +
      '• Status: {{status}}\n' +
      '• Module: Finance\n\n' +
      'Please review and approve or return with comments.',
    defaultTone: 'formal',
    recipientRoles: ['quantity_surveyor', 'client'],
    vars: ['projectName', 'amount', 'status'],
  },
  {
    id: 'tpl-phase-advance',
    name: 'Phase Advance Notification',
    triggerEvent: 'project_phase_changed',
    subjectTemplate: 'Project Update: {{projectName}} advanced to {{newPhase}}',
    bodyTemplate:
      'Project {{projectName}} has advanced from {{previousPhase}} to {{newPhase}}.\n\n' +
      'Next steps:\n' +
      '• Review phase requirements\n' +
      '• Confirm team assignments are current\n' +
      '• Check for any new blockers\n\n' +
      'View the project passport for full details.',
    defaultTone: 'informative',
    recipientRoles: ['architect', 'client', 'contractor'],
    vars: ['projectName', 'previousPhase', 'newPhase'],
  },
];

// ─── Message Drafting ─────────────────────────────────────────────────────

export function getTemplateForEvent(
  eventType: string,
): MessageTemplate | undefined {
  return DEFAULT_TEMPLATES.find((t) => t.triggerEvent === eventType);
}

export function draftMessage(
  template: MessageTemplate,
  context: Record<string, string>,
): MessageDraft {
  let subject = template.subjectTemplate;
  let body = template.bodyTemplate;

  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    subject = subject.replaceAll(placeholder, value);
    body = body.replaceAll(placeholder, value);
  }

  return {
    id: `draft-${Date.now()}-${template.id}`,
    subject,
    body,
    suggestedRecipients: template.recipientRoles,
    sourceRecords: [],
    tone: template.defaultTone,
    requiresReview: template.defaultTone === 'urgent',
    generatedAt: new Date().toISOString(),
  };
}

// ─── Context Extraction ───────────────────────────────────────────────────

export function extractMessageContext(
  records: ProjectRecord<unknown>[],
  projectName: string,
  currentPhase: string,
): Record<string, string> {
  const context: Record<string, string> = {
    projectName,
    phase: currentPhase,
    newPhase: currentPhase,
    previousPhase: '',
  };

  // Extract payment info
  const paymentRecord = records.find(
    (r) => r.recordType === 'payment_certificate',
  );
  if (paymentRecord) {
    const payload = paymentRecord.payload as Record<string, unknown>;
    context.amount =
      payload?.amount != null
        ? `R${Number(payload.amount).toLocaleString()}`
        : 'TBC';
    context.status = String(payload?.status ?? paymentRecord.status);
  }

  // Extract module name from first missing record
  const missingRecords = records.filter(
    (r) => r.status === 'missing' || r.approval.status === 'pending_review',
  );
  if (missingRecords.length > 0) {
    context.recordType = missingRecords[0].recordType;
    context.moduleName = missingRecords[0].moduleKey;
    context.reason = `Missing or incomplete ${missingRecords[0].recordType}`;
    context.nextAction = `Create or complete the ${missingRecords[0].recordType} record`;
  }

  return context;
}

// ─── Batch Drafting ───────────────────────────────────────────────────────

export function draftMessagesForEvents(
  eventTypes: string[],
  context: Record<string, string>,
): MessageDraft[] {
  const drafts: MessageDraft[] = [];
  for (const eventType of eventTypes) {
    const template = getTemplateForEvent(eventType);
    if (template) {
      // Check all required vars are available
      const missingVars = template.vars.filter((v) => !(v in context));
      if (missingVars.length === 0) {
        drafts.push(draftMessage(template, context));
      }
    }
  }
  return drafts;
}
