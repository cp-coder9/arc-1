/**
 * Contextual Messaging Service
 *
 * Pure computation service that builds MessagingContext and
 * ContextualMessageDraft objects for workflow-linked communication.
 *
 * Works alongside the existing messagingService (Firestore transport)
 * — this service handles context construction; messagingService handles
 * persistence and real-time delivery.
 *
 * @see CONTEXTUAL_MESSAGING_LAYER.md
 */

import type {
  ContextualMessageDraft,
  MessagingContext,
  MessagingContextSourceType,
  MessagingPersistencePolicy,
  SuggestedChannel,
} from '@/types/navigation';

// ── Public API -------------------------------------------------------------

/**
 * Build a structured messaging context from a workflow source object.
 * Call this before opening a contextual message drawer or sending a message.
 */
export function buildMessagingContext(input: {
  projectId?: string;
  projectName?: string;
  phaseId?: string;
  phaseName?: string;
  moduleKey: string;
  sourceObjectType: MessagingContextSourceType;
  sourceObjectId: string;
  title: string;
  status?: string;
  suggestedRecipients?: string[];
  linkedFileIds?: string[];
  summary?: string;
}): MessagingContext {
  const suggestedChannel = inferSuggestedChannel(input.sourceObjectType);

  return {
    contextId: `${input.sourceObjectType}:${input.sourceObjectId}`,
    projectId: input.projectId,
    projectName: input.projectName,
    phaseId: input.phaseId,
    phaseName: input.phaseName,
    moduleKey: input.moduleKey,
    sourceObjectType: input.sourceObjectType,
    sourceObjectId: input.sourceObjectId,
    title: input.title,
    status: input.status,
    suggestedRecipients: input.suggestedRecipients ?? [],
    suggestedChannel,
    summary: input.summary ?? defaultSummary(input.sourceObjectType, input.title, input.status),
    linkedFileIds: input.linkedFileIds ?? [],
    persistencePolicy: inferPersistencePolicy(input.sourceObjectType),
    auditPolicy: inferAuditPolicy(input.sourceObjectType),
  };
}

/**
 * Create a user-facing message draft from a context object.
 * The draft is pre-populated with context metadata and ready for user review.
 */
export function createContextualMessageDraft(
  context: MessagingContext,
  userPrompt?: string,
): ContextualMessageDraft {
  const subject = `${labelForSource(context.sourceObjectType)}: ${context.title}`;
  const projectPrefix = context.projectName ? `Project: ${context.projectName}\n` : '';
  const phasePrefix = context.phaseName ? `Phase: ${context.phaseName}\n` : '';
  const statusLine = context.status ? `Status: ${context.status}\n` : '';
  const promptLine = userPrompt
    ? `\nQuestion / message:\n${userPrompt}\n`
    : '\nQuestion / message:\n[Type your message here]\n';

  return {
    context,
    subject,
    body: `${projectPrefix}${phasePrefix}${statusLine}Context: ${context.summary}${promptLine}\nLinked item: ${context.sourceObjectType} ${context.sourceObjectId}`,
    targetChannel: context.suggestedChannel,
    recipientIds: context.suggestedRecipients,
    requiresUserApproval: true,
  };
}

// ── Inference Helpers ------------------------------------------------------

/** Derive the best communication channel from the source object type. */
export function inferSuggestedChannel(sourceType: MessagingContextSourceType): SuggestedChannel {
  switch (sourceType) {
    case 'snag_item':
    case 'rfi':
    case 'site_instruction':
    case 'variation':
    case 'drawing_compliance_issue':
    case 'council_submission_item':
      return 'project_group';

    case 'payment_certificate':
    case 'drawdown_request':
      return 'finance_thread';

    case 'quote_comparison':
    case 'marketplace_quote_request':
      return 'procurement_thread';

    case 'cpd_assessment':
    case 'cpd_certificate':
    case 'cpd_manual_submission':
    case 'cpd_course':
      return 'cpd_support_thread';

    case 'agent_inbox_action_card':
      return 'agent_thread';

    default:
      return 'project_group';
  }
}

/** Derive the persistence / record-keeping policy from the source type. */
export function inferPersistencePolicy(sourceType: MessagingContextSourceType): MessagingPersistencePolicy {
  switch (sourceType) {
    case 'snag_item':
    case 'rfi':
    case 'site_instruction':
    case 'variation':
    case 'payment_certificate':
    case 'drawdown_request':
    case 'cpd_manual_submission':
      return 'source_object_record';

    case 'drawing_compliance_issue':
    case 'council_submission_item':
      return 'project_record';

    case 'agent_inbox_action_card':
      return 'agent_action_required';

    default:
      return 'conversation_only';
  }
}

// ── Internal Helpers -------------------------------------------------------

function inferAuditPolicy(sourceType: MessagingContextSourceType): MessagingContext['auditPolicy'] {
  switch (sourceType) {
    case 'site_instruction':
    case 'variation':
    case 'payment_certificate':
    case 'drawdown_request':
      return 'approval_required';

    case 'rfi':
    case 'snag_item':
    case 'cpd_manual_submission':
      return 'record_summary';

    default:
      return 'none';
  }
}

function defaultSummary(
  sourceType: MessagingContextSourceType,
  title: string,
  status?: string,
): string {
  return `${labelForSource(sourceType)} requiring communication: ${title}${status ? ` (${status})` : ''}.`;
}

function labelForSource(sourceType: MessagingContextSourceType): string {
  return sourceType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
