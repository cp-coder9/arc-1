/**
 * Architex Navigation Framework — Shared Types
 *
 * Defines the top-level sidebar keys, workspace section structure,
 * and the contextual messaging context/draft model.
 *
 * @see ARCHITEX_NAVIGATION_FRAMEWORK.md
 * @see CONTEXTUAL_MESSAGING_LAYER.md
 */

import type { UserRole } from '@/types';

// ── Sidebar & Workspace ----------------------------------------------------

/** The ten primary platform zones shown in the top-level sidebar. */
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

/** A section within a workspace — rendered as sub-navigation. */
export interface WorkspaceSection {
  key: string;
  label: string;
  description: string;
  /** Roles that can see this section. When omitted, visible to all. */
  roles?: UserRole[];
  /** Whether this section is scoped to the active project. */
  projectScoped?: boolean;
  /** Whether the section content changes per project phase. */
  phaseAware?: boolean;
  /** Whether contextual messaging actions should be surfaced. */
  supportsContextualMessaging?: boolean;
}

/** A top-level sidebar item with its workspace sections. */
export interface NavigationItem {
  key: ArchitexNavKey;
  label: string;
  description: string;
  /** Lucide icon hint string for rendering. */
  iconHint: string;
  /** Whether this item is visible when no role filter is active. */
  defaultVisible: boolean;
  /** Roles that can see this item. When omitted, visible to all. */
  roles?: UserRole[];
  /** The sections rendered under this workspace. */
  sections: WorkspaceSection[];
}

// ── Contextual Messaging ---------------------------------------------------

/** The workflow object that triggered a contextual message. */
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

/** How a contextual message is persisted and tracked. */
export type MessagingPersistencePolicy =
  | 'conversation_only'
  | 'project_record'
  | 'source_object_record'
  | 'audit_required'
  | 'agent_action_required';

/** The suggested communication channel for a source object. */
export type SuggestedChannel =
  | 'direct_message'
  | 'project_group'
  | 'project_phase_channel'
  | 'responsible_person_thread'
  | 'cpd_support_thread'
  | 'finance_thread'
  | 'procurement_thread'
  | 'agent_thread';

/** The full context payload attached to every contextual message. */
export interface MessagingContext {
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
}

/** A pre-filled message draft created from a context. */
export interface ContextualMessageDraft {
  context: MessagingContext;
  subject: string;
  body: string;
  targetChannel: SuggestedChannel;
  recipientIds: string[];
  requiresUserApproval: boolean;
}
