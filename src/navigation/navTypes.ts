import type { UserRole } from '../types';

export type ArchitexNavKey =
  | 'command_centre'
  | 'inbox'
  | 'projects'
  | 'toolboxes'
  | 'cpd_learning'
  | 'documents'
  | 'marketplace'
  | 'finance'
  | 'messages'
  | 'settings';

export type WorkspaceSection = {
  key: string;
  label: string;
  description: string;
  roles?: UserRole[];
  projectScoped?: boolean;
  phaseAware?: boolean;
  supportsContextualMessaging?: boolean;
};

export type NavigationItem = {
  key: ArchitexNavKey;
  label: string;
  description: string;
  iconHint: string;
  defaultVisible: boolean;
  roles?: UserRole[];
  sections: WorkspaceSection[];
};

export type MessagingContextSourceType =
  | 'project'
  | 'snag_item'
  | 'rfi'
  | 'site_instruction'
  | 'variation'
  | 'payment_certificate'
  | 'drawdown_request'
  | 'quote_comparison'
  | 'drawing_compliance_issue'
  | 'council_submission_item'
  | 'cpd_assessment'
  | 'cpd_certificate'
  | 'cpd_manual_submission'
  | 'cpd_course'
  | 'marketplace_quote_request'
  | 'document_review_item'
  | 'agent_inbox_action_card';

export type MessagingPersistencePolicy =
  | 'conversation_only'
  | 'project_record'
  | 'source_object_record'
  | 'audit_required'
  | 'agent_action_required';

export type SuggestedChannel =
  | 'direct_message'
  | 'project_group'
  | 'project_phase_channel'
  | 'responsible_person_thread'
  | 'cpd_support_thread'
  | 'finance_thread'
  | 'procurement_thread'
  | 'agent_thread';

export type MessagingContext = {
  contextId: string;
  projectId?: string;
  projectName?: string;
  phaseId?: string;
  phaseName?: string;
  moduleKey: string;
  sourceObjectType: MessagingContextSourceType;
  sourceObjectId: string;
  title: string;
  status?: string;
  suggestedRecipients: string[];
  suggestedChannel: SuggestedChannel;
  summary: string;
  linkedFileIds?: string[];
  persistencePolicy: MessagingPersistencePolicy;
  auditPolicy?: 'none' | 'record_summary' | 'record_full_thread' | 'approval_required';
};

export type ContextualMessageDraft = {
  context: MessagingContext;
  subject: string;
  body: string;
  targetChannel: SuggestedChannel;
  recipientIds: string[];
  requiresUserApproval: boolean;
};
