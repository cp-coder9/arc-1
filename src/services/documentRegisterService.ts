// ─── Pack 3: Document-specific types (not in lifecycleTypes) ───────────────

import type { ArchitexRole, ProjectPhase, Priority } from '@/services/lifecycleTypes';

// ─── Document-specific type aliases ────────────────────────────────────────

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

export type Discipline = 'architectural' | 'structural' | 'civil' | 'electrical' | 'mechanical' | 'fire' | 'quantity_surveying' | 'general';

export type DocumentStatus = 'draft' | 'pending_review' | 'approved' | 'issued' | 'superseded' | 'rejected';

export type IssuePurpose = 'for_review' | 'for_information' | 'for_municipal_submission' | 'for_tender' | 'for_construction' | 'as_built' | 'closeout';

export type SheetType = 'site_plan' | 'floor_plan' | 'section' | 'elevation' | 'detail' | 'schedule' | 'cover' | 'general';

// ─── Document & Drawing record types ──────────────────────────────────────

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
  authorRole: ArchitexRole;
  reviewerRole?: ArchitexRole;
  currentRevisionId: string;
  linkedProjectRecordId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingRecord {
  drawingId: string;
  documentId: string;
  drawingNumber: string;
  title: string;
  discipline: Discipline;
  sheetType: SheetType;
  scale?: string;
  currentRevision: string;
  status: DocumentStatus;
  issuePurpose: IssuePurpose;
  supersededByDrawingId?: string;
  linkedProjectRecordId?: string;
}

export interface DocumentRevision {
  revisionId: string;
  documentId: string;
  revisionCode: string;
  status: DocumentStatus;
  issuePurpose: IssuePurpose;
  issuedAt?: string;
  supersedesRevisionId?: string;
  supersededByRevisionId?: string;
  authorUserId: string;
  reviewerUserId?: string;
  notes: string;
}

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

export interface ReadinessFinding {
  code: string;
  priority: Priority;
  message: string;
  assignedRoles: ArchitexRole[];
  relatedDocumentId?: string;
  relatedDrawingId?: string;
}

export interface ReadinessReport {
  checkName: 'municipal_submission' | 'tender_pack' | 'construction_issue' | 'closeout_pack';
  ready: boolean;
  findings: ReadinessFinding[];
}

// ─── Document register functions ──────────────────────────────────────────

export function documentsByType(documents: DocumentRecord[], type: DocumentType): DocumentRecord[] {
  return documents.filter((document) => document.documentType === type);
}

export function currentIssuedDocuments(documents: DocumentRecord[]): DocumentRecord[] {
  return documents.filter((document) => document.status === 'issued');
}

export function drawingsByDiscipline(drawings: DrawingRecord[], discipline: Discipline): DrawingRecord[] {
  return drawings.filter((drawing) => drawing.discipline === discipline && drawing.status !== 'superseded');
}

export function drawingsForIssuePurpose(drawings: DrawingRecord[], issuePurpose: IssuePurpose): DrawingRecord[] {
  return drawings.filter((drawing) => drawing.issuePurpose === issuePurpose && drawing.status === 'issued');
}

export function registerSummary(documents: DocumentRecord[], drawings: DrawingRecord[]): string {
  return `documents=${documents.length}; drawings=${drawings.length}; issued=${currentIssuedDocuments(documents).length}; supersededDrawings=${drawings.filter((drawing) => drawing.status === 'superseded').length}`;
}
