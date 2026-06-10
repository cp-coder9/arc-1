import type { MessagingContext, ContextualMessageDraft, MessagingContextSourceType } from './navTypes';

/**
 * Source object types that always require user approval before sending.
 * Kept as a configurable set so it can be extended from config/database
 * without modifying service code.
 */
const ALWAYS_REQUIRE_APPROVAL: ReadonlySet<MessagingContextSourceType> = new Set([
  'site_instruction',
  'variation',
]);

/**
 * Contextual Messaging Service
 * Creates context-aware messaging drafts linked to workflow objects.
 */
export class ContextualMessagingService {
  createDraft(context: MessagingContext): ContextualMessageDraft {
    const subject = `${context.sourceObjectType.replace(/_/g, ' ')} — ${context.title}`;
    const body = this.buildDraftBody(context);
    return {
      context,
      subject,
      body,
      targetChannel: context.suggestedChannel,
      recipientIds: context.suggestedRecipients,
      requiresUserApproval: this.requiresApproval(context),
    };
  }

  private buildDraftBody(context: MessagingContext): string {
    return [
      `Context: ${context.title}`,
      context.projectName ? `Project: ${context.projectName}` : '',
      context.summary,
      context.linkedFileIds?.length ? `Linked files: ${context.linkedFileIds.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private requiresApproval(context: MessagingContext): boolean {
    return (
      context.auditPolicy === 'approval_required' ||
      context.persistencePolicy === 'audit_required' ||
      ALWAYS_REQUIRE_APPROVAL.has(context.sourceObjectType)
    );
  }
}

export const contextualMessagingService = new ContextualMessagingService();
