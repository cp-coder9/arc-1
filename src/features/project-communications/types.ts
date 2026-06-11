/**
 * Architex Project Communication Engine — Feature Types
 *
 * Complements the existing project communication types in src/types.ts with
 * human-readable capture-item labels and phase-aware configuration shapes
 * specified in the Architex Project Communication Engine package.
 */

import type { ProjectStage, UserRole } from '@/types';

// ── Human-readable capture item labels (one set per phase) ──────────────
// These are the UI-facing labels that appear on capture buttons.
// The underlying capture-type identifiers remain in src/types.ts.

export type IntakeCaptureItem =
  | 'New enquiry'
  | 'Property address'
  | 'Client requirement'
  | 'Budget range'
  | 'Timeline target'
  | 'Existing document'
  | 'Site photo'
  | 'Contact detail';

export type ScopingCaptureItem =
  | 'Brief requirement'
  | 'Client preference'
  | 'Feasibility constraint'
  | 'Zoning/planning flag'
  | 'Existing condition'
  | 'Concept option'
  | 'Budget risk'
  | 'Approval needed';

export type AppointmentCaptureItem =
  | 'Fee item'
  | 'Appointment document'
  | 'Scope clarification'
  | 'Professional team invite'
  | 'Access/permission item'
  | 'Contract query';

export type CoordinationCaptureItem =
  | 'Design decision'
  | 'Consultant query'
  | 'Drawing markup'
  | 'Coordination clash'
  | 'Client comment'
  | 'Option approval'
  | 'Information required';

export type ComplianceCaptureItem =
  | 'SANS/NBR risk'
  | 'Municipal checklist item'
  | 'Council comment'
  | 'Missing signature'
  | 'Fire/access/energy item'
  | 'Resubmission item'
  | 'Approval status';

export type TenderCaptureItem =
  | 'Tender clarification'
  | 'Contractor query'
  | 'Addendum'
  | 'Pricing exclusion'
  | 'Alternative product'
  | 'Contractor comparison'
  | 'Appointment decision';

export type DeliveryCaptureItem =
  | 'Site photo'
  | 'Progress photo'
  | 'RFI'
  | 'Site instruction'
  | 'Variation'
  | 'Snag / defect'
  | 'Safety item'
  | 'Delivery / material'
  | 'Inspection note'
  | 'Site visit summary'
  | 'Time/cost impact';

export type PaymentsCaptureItem =
  | 'Invoice query'
  | 'Payment approval'
  | 'Escrow milestone'
  | 'Variation cost'
  | 'Retention item'
  | 'Final account query';

export type CloseoutCaptureItem =
  | 'Snag closeout'
  | 'Practical completion'
  | 'Certificate'
  | 'Warranty'
  | 'As-built drawing'
  | 'Occupation document'
  | 'Maintenance note'
  | 'Final handover item';

/** Union of all human-readable capture-item labels. */
export type ProjectCaptureItem =
  | IntakeCaptureItem
  | ScopingCaptureItem
  | AppointmentCaptureItem
  | CoordinationCaptureItem
  | ComplianceCaptureItem
  | TenderCaptureItem
  | DeliveryCaptureItem
  | PaymentsCaptureItem
  | CloseoutCaptureItem;

// ── Phase-aware configuration shape ─────────────────────────────────────
// Used by the UI to render phase-specific tools, prompts, actions, and files.

export interface PhaseCommunicationUIConfig {
  /** Project stage this config applies to. */
  stage: ProjectStage;
  /** Human-readable phase label. */
  label: string;
  /** Short description of the phase context. */
  description: string;
  /** Human-readable capture-item labels shown as buttons in the Capture tab. */
  captureItems: string[];
  /** AI-suggested prompts shown under "Suggested prompts" in the AI tab. */
  suggestedPrompts: string[];
  /** Next-action labels shown in the Actions tab. */
  nextActions: string[];
  /** File/record focus categories shown in the Files tab. */
  fileFocus: string[];
}

// ── Project communication record (complements Message in src/types.ts) ─

export interface ProjectCommunicationRecord {
  id: string;
  jobId: string;
  projectId?: string;
  senderId: string;
  senderRole: UserRole;
  content: string;
  phase?: ProjectStage;
  captureItem?: string;
  attachments?: { name: string; url: string; type: string; size?: number }[];
  actionIds?: string[];
  recordLinks?: { type: string; id: string; label?: string }[];
  aiTags?: string[];
  structuredStatus?: 'raw' | 'converted' | 'linked' | 'archived';
  visibility?: 'project_team' | 'client_visible' | 'internal_team' | 'admin_only';
  transcribedText?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

// ── Project action ──────────────────────────────────────────────────────

export interface ProjectActionRecord {
  id: string;
  jobId: string;
  projectId?: string;
  sourceMessageId?: string;
  phase: ProjectStage;
  title: string;
  ownerId?: string;
  status: 'open' | 'in_progress' | 'waiting' | 'done' | 'cancelled';
  dueAt?: string;
  createdAt: string;
}
