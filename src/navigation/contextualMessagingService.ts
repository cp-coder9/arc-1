import type { MessagingContext, ContextualMessageDraft } from './navTypes';

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
      context.sourceObjectType === 'site_instruction' ||
      context.sourceObjectType === 'variation'
    );
  }
}

export const contextualMessagingService = new ContextualMessagingService();
