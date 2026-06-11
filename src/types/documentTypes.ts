/**
 * Architex Documents & Drawing Intelligence — Core Types
 *
 * Defines the type system for document control, drawing register,
 * revision control, readiness checks, and agent workflows.
 *
 * @module documents_drawing_intelligence
 * @see ARCHITEX_DOCUMENTS_DRAWING_INTELLIGENCE_BRIEF.md
 */

// ── Enumerations ──────────────────────────────────────────────────────────────

/** All 13 document types covered by the document register. */
export type DocumentType =
  | 'drawing'
  | 'specification'
  | 'appointment'
  | 'approval_letter'
  | 'municipal_form'
  | 'submission_pack'
  | 'tender_pack'
  | 'rfi'
  | 'site_instruction'
  | 'payment_certificate'
  | 'closeout_certificate'
  | 'warranty'
  | 'closeout_pack';

/** Built-environment disciplines. */
export type Discipline =
  | 'architectural'
  | 'structural'
  | 'civil'
  | 'electrical'
  | 'mechanical'
  | 'fire'
  | 'quantity_surveying'
  | 'general';

/** Document lifecycle status. */
export type DocumentStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'issued'
  | 'superseded'
  | 'rejected';

/** Issue-purpose governs what a drawing or document is intended to be used for. */
export type IssuePurpose =
  | 'for_review'
  | 'for_information'
  | 'for_municipal_submission'
  | 'for_tender'
  | 'for_construction'
  | 'as_built'
  | 'closeout';

/** Sheet types for drawing register entries. */
export type SheetType =
  | 'site_plan'
  | 'floor_plan'
  | 'section'
  | 'elevation'
  | 'detail'
  | 'schedule'
  | 'cover'
  | 'general';

/** Priority levels for findings and events. */
export type Priority = 'low' | 'medium' | 'high' | 'critical';

/** Roles within the Architex document-control context. */
export type DocRole =
  | 'client_developer'
  | 'architect'
  | 'engineer'
  | 'quantity_surveyor'
  | 'contractor'
  | 'supplier'
  | 'candidate_professional'
  | 'admin';

/** Lifecycle phase — aligned with the master expansion ProjectPhase. */
export type ProjectPhase =
  | 'onboarding'
  | 'feasibility'
  | 'appointment'
  | 'concept_design'
  | 'design_development'
  | 'municipal_submission'
  | 'tender_procurement'
  | 'construction_execution'
  | 'closeout';

/** Revision codes follow a simple P01/C01 pattern. */
export type RevisionCode = string;

// ── Core Record Types ────────────────────────────────────────────────────────

/** Document Register — one entry per controlled project document. */
export interface DocumentRecord {
  documentId: string;
  tenantId: string;
  projectId: string;
  title: string;
  documentType: DocumentType;
  discipline: Discipline;
  phase: ProjectPhase;
  status: DocumentStatus;
  issuePurpose: IssuePurpose;
  authorRole: DocRole;
  reviewerRole?: DocRole;
  currentRevisionId: string;
  linkedProjectRecordId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Drawing Register — one entry per drawing sheet. */
export interface DrawingRecord {
  drawingId: string;
  documentId: string;
  drawingNumber: string;
  title: string;
  discipline: Discipline;
  sheetType: SheetType;
  scale?: string;
  currentRevision: RevisionCode;
  status: DocumentStatus;
  issuePurpose: IssuePurpose;
  supersededByDrawingId?: string;
  linkedProjectRecordId?: string;
}

/** Document Revision — immutable version of a document. */
export interface DocumentRevision {
  revisionId: string;
  documentId: string;
  revisionCode: RevisionCode;
  status: DocumentStatus;
  issuePurpose: IssuePurpose;
  issuedAt?: string;
  supersedesRevisionId?: string;
  supersededByRevisionId?: string;
  authorUserId: string;
  reviewerUserId?: string;
  notes: string;
}

// ── Drawing Intelligence ─────────────────────────────────────────────────────

/** Simulated OCR/AI analysis result for a document or drawing. */
export interface DrawingIntelligenceResult {
  documentId: string;
  classification: DocumentType;
  detectedDiscipline: Discipline;
  extractedDrawingNumber?: string;
  extractedRevision?: string;
  detectedIssuePurpose: IssuePurpose;
  confidence: number;
  findings: ReadinessFinding[];
}

// ── Readiness ────────────────────────────────────────────────────────────────

/** A single readiness finding with priority and role assignment. */
export interface ReadinessFinding {
  code: string;
  priority: Priority;
  message: string;
  assignedRoles: DocRole[];
  relatedDocumentId?: string;
  relatedDrawingId?: string;
}

/** A readiness report for one of the four check types. */
export interface ReadinessReport {
  checkName:
    | 'municipal_submission'
    | 'tender_pack'
    | 'construction_issue'
    | 'closeout_pack'
    | 'approval_letter'
    | 'warranty';
  ready: boolean;
  findings: ReadinessFinding[];
}

// ── Project Record Adapter ───────────────────────────────────────────────────

/** ProjectRecord envelope compatible with the Project Passport + Lifecycle Engine. */
export interface ProjectRecord {
  id: string;
  tenantId: string;
  projectId: string;
  phase: ProjectPhase;
  moduleKey: 'documents';
  recordType:
    | 'drawing_revision'
    | 'technical_drawings'
    | 'municipal_submission_pack'
    | 'municipal_approval_letter'
    | 'tender_pack'
    | 'site_instruction'
    | 'rfi'
    | 'payment_certificate'
    | 'closeout_pack';
  title: string;
  status: DocumentStatus;
  payload: Record<string, unknown>;
  approvals: {
    required: boolean;
    approvedBy?: string[];
    pendingRoles?: DocRole[];
  };
  audit: {
    createdBy: string;
    createdAt: string;
    supersedesRecordId?: string;
  };
  linkedRecordIds: string[];
}

// ── Inbox Events ─────────────────────────────────────────────────────────────

/** Workflow event types emitted by the document-control module. */
export type WorkflowEventType =
  | 'document_review_required'
  | 'drawing_revision_uploaded'
  | 'superseded_construction_drawing'
  | 'municipal_submission_pack_incomplete'
  | 'tender_pack_incomplete'
  | 'closeout_pack_incomplete'
  | 'approval_letter_missing';

/** A Platform-Spine-compatible workflow event. */
export interface WorkflowEvent {
  id: string;
  type: WorkflowEventType;
  projectId: string;
  title: string;
  detail: string;
  priority: Priority;
  sourceModule: 'documents';
  assignedRoles: DocRole[];
  createdAt: string;
}

// ── Agent Recommendations ────────────────────────────────────────────────────

/** An agent-ready recommendation derived from document state. */
export interface AgentRecommendation {
  id: string;
  scope: 'user' | 'project';
  title: string;
  rationale: string;
  priority: Priority;
  recommendedActionLabel: string;
  relatedRoute: string;
  requiresHumanApproval: boolean;
}

// ── Status Transition Map ────────────────────────────────────────────────────

/**
 * Valid status transitions for each document status.
 * Draft documents may be updated freely; issued documents must be revised.
 */
export const VALID_STATUS_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  draft: ['draft', 'pending_review', 'rejected'],
  pending_review: ['pending_review', 'approved', 'rejected'],
  approved: ['approved', 'issued'],
  issued: ['superseded'],
  superseded: [],
  rejected: ['draft', 'pending_review'],
};

/** Document types that always require reviewer assignment. */
export const DOCUMENT_TYPES_REQUIRING_REVIEW: DocumentType[] = [
  'drawing',
  'specification',
  'submission_pack',
  'tender_pack',
  'closeout_pack',
  'payment_certificate',
];

/** Discipline-to-required-sheet-type mapping for submission readiness. */
export const DISCIPLINE_REQUIRED_SHEETS: Record<Discipline, SheetType[]> = {
  architectural: ['site_plan', 'floor_plan', 'section', 'elevation', 'detail', 'schedule'],
  structural: ['floor_plan', 'section', 'detail', 'schedule'],
  civil: ['site_plan', 'section', 'detail'],
  electrical: ['floor_plan', 'detail', 'schedule'],
  mechanical: ['floor_plan', 'section', 'detail', 'schedule'],
  fire: ['floor_plan', 'detail', 'schedule'],
  quantity_surveying: ['schedule'],
  general: ['cover', 'general'],
};

/** Metadata field requirements per document type. */
export const DOCUMENT_TYPE_METADATA_FIELDS: Record<DocumentType, string[]> = {
  drawing: ['drawingNumber', 'revision', 'discipline', 'sheetType', 'scale'],
  specification: ['specificationSection', 'revision'],
  appointment: ['appointmentDate', 'appointedParty', 'appointingParty'],
  approval_letter: ['approvalAuthority', 'approvalDate', 'referenceNumber'],
  municipal_form: ['municipality', 'formType', 'erfNumber'],
  submission_pack: ['municipality', 'submissionDate', 'includedDrawings'],
  tender_pack: ['tenderReference', 'closingDate', 'includedDocuments'],
  rfi: ['rfiNumber', 'requestedBy', 'responseDueDate'],
  site_instruction: ['instructionNumber', 'issuedBy', 'issuedDate'],
  payment_certificate: ['certificateNumber', 'amount', 'period'],
  closeout_certificate: ['certificateNumber', 'certificateDate'],
  warranty: ['warrantyStartDate', 'warrantyEndDate', 'warrantyProvider'],
  closeout_pack: ['closeoutDate', 'includedDocuments', 'handoverDate'],
};
