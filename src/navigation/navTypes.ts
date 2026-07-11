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
  | 'analytics'
  | 'messages'
  | 'settings'
  | 'user_settings'
  | 'verification_queue'
  | 'ai_review_queue'
  | 'system_health';

/**
 * The Architex 8-stage project lifecycle. Field-capture entry points are
 * stage-gated against these stages (Requirement 8.2–8.4). Build and Close-out
 * are the only stages that unlock stage-specific capture capabilities.
 */
export type LifecycleStage =
  | 'brief'
  | 'appoint'
  | 'design'
  | 'comply'
  | 'procure'
  | 'build'
  | 'pay'
  | 'closeout';

/**
 * Stage-specific field-capture entry points surfaced through the Toolboxes
 * `construction_admin` (Build) and `closeout` (Close-out) sections.
 */
export type FieldCaptureCapability =
  | 'field_capture'
  | 'checklists'
  | 'field_reporting'
  | 'snag_rectification'
  | 'handover_reporting';

/**
 * Whether the field tools expose stage-specific capture entry points or only
 * the read-and-report Issue Dashboard for the active lifecycle stage.
 */
export type FieldCaptureMode = 'capture' | 'read_reporting';

export type WorkspaceSection = {
  key: string;
  label: string;
  description: string;
  roles?: UserRole[];
  projectScoped?: boolean;
  phaseAware?: boolean;
  supportsContextualMessaging?: boolean;
  /**
   * Primary component mounted when this section is opened, referenced by its
   * stable component name (resolved by the consuming surface). Config stays
   * declarative — it carries the binding, not the React import.
   */
  component?: string;
  /**
   * Components whose existing functionality is preserved alongside the primary
   * `component` (e.g. legacy managers retained for backwards compatibility).
   */
  preservesComponents?: string[];
  /**
   * Lifecycle stage that unlocks this section's `captureCapabilities`. The
   * capabilities are enabled only when the active stage equals `captureStage`;
   * in every other stage the section falls back to read-and-report mode.
   */
  captureStage?: LifecycleStage;
  /**
   * Field-capture entry points this section surfaces while its `captureStage`
   * is active (Requirement 8.2, 8.3).
   */
  captureCapabilities?: FieldCaptureCapability[];
};

export type NavigationItem = {
  key: ArchitexNavKey;
  label: string;
  description: string;
  roles?: UserRole[];
  sections: WorkspaceSection[];
  /** When true, the navigation item is only visible in demo mode (VITE_DEMO_MODE=true). */
  demoOnly?: boolean;
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
