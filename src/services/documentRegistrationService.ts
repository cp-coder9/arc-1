/**
 * Document Registration Service
 *
 * Document register queries, metadata extraction per document type,
 * status transition validation, and discipline coverage checks.
 *
 * @module documents_drawing_intelligence
 */

import type {
  Discipline,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  DrawingRecord,
  IssuePurpose,
} from '@/types/documentTypes';
import {
  DOCUMENT_TYPE_METADATA_FIELDS,
  DOCUMENT_TYPES_REQUIRING_REVIEW,
  DISCIPLINE_REQUIRED_SHEETS,
  VALID_STATUS_TRANSITIONS,
} from '@/types/documentTypes';

// ── Queries ──────────────────────────────────────────────────────────────────

/** Filter documents by type. */
export function documentsByType(documents: DocumentRecord[], type: DocumentType): DocumentRecord[] {
  return documents.filter((doc) => doc.documentType === type);
}

/** Get all currently issued documents. */
export function currentIssuedDocuments(documents: DocumentRecord[]): DocumentRecord[] {
  return documents.filter((doc) => doc.status === 'issued');
}

/** Get active (non-superseded) drawings for a discipline. */
export function drawingsByDiscipline(drawings: DrawingRecord[], discipline: Discipline): DrawingRecord[] {
  return drawings.filter((d) => d.discipline === discipline && d.status !== 'superseded');
}

/** Get issued drawings for a given issue-purpose. */
export function drawingsForIssuePurpose(drawings: DrawingRecord[], issuePurpose: IssuePurpose): DrawingRecord[] {
  return drawings.filter((d) => d.issuePurpose === issuePurpose && d.status === 'issued');
}

/** Aggregate register summary string. */
export function registerSummary(documents: DocumentRecord[], drawings: DrawingRecord[]): string {
  const issued = currentIssuedDocuments(documents).length;
  const superseded = drawings.filter((d) => d.status === 'superseded').length;
  return `documents=${documents.length}; drawings=${drawings.length}; issued=${issued}; supersededDrawings=${superseded}`;
}

/** Count documents by type. */
export function documentCountByType(documents: DocumentRecord[]): Record<DocumentType, number> {
  const counts: Record<string, number> = {};
  for (const doc of documents) {
    counts[doc.documentType] = (counts[doc.documentType] || 0) + 1;
  }
  return counts as Record<DocumentType, number>;
}

/** Count drawings by discipline. */
export function drawingCountByDiscipline(drawings: DrawingRecord[]): Record<Discipline, number> {
  const counts: Record<string, number> = {};
  for (const d of drawings) {
    counts[d.discipline] = (counts[d.discipline] || 0) + 1;
  }
  return counts as Record<Discipline, number>;
}

// ── Metadata Extraction ──────────────────────────────────────────────────────

/** Extract expected metadata keys for a document type. */
export function metadataFieldsForDocumentType(documentType: DocumentType): string[] {
  return DOCUMENT_TYPE_METADATA_FIELDS[documentType] || [];
}

/** Check which metadata fields are missing from a document's implied metadata. */
export function missingMetadataFields(doc: DocumentRecord): string[] {
  const expected = metadataFieldsForDocumentType(doc.documentType);
  // In a real implementation, metadata would come from the document's payload.
  // Here we report fields that would need population.
  return expected;
}

/** Build a metadata summary for a document (simulated extraction). */
export function extractMetadataSummary(doc: DocumentRecord): Record<string, string | undefined> {
  const fields = metadataFieldsForDocumentType(doc.documentType);
  const summary: Record<string, string | undefined> = {};
  for (const field of fields) {
    summary[field] = `[pending: ${field}]`;
  }
  summary.documentType = doc.documentType;
  summary.status = doc.status;
  summary.discipline = doc.discipline;
  summary.phase = doc.phase;
  return summary;
}

// ── Status Transitions ───────────────────────────────────────────────────────

/** Check if a status transition is valid. */
export function isValidStatusTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/** Get all allowed next statuses for a given status. */
export function allowedNextStatuses(status: DocumentStatus): DocumentStatus[] {
  return VALID_STATUS_TRANSITIONS[status] || [];
}

/** Validate that an issued document is being revised, not mutated. */
export function validateDocumentMutation(
  doc: DocumentRecord,
  proposedStatus: DocumentStatus,
): { allowed: boolean; reason?: string } {
  if (doc.status === 'issued' && proposedStatus !== 'superseded') {
    return {
      allowed: false,
      reason: `Document ${doc.documentId} is issued and cannot be mutated. Create a new revision instead.`,
    };
  }
  if (doc.status === 'superseded') {
    return {
      allowed: false,
      reason: `Document ${doc.documentId} is superseded and cannot be modified.`,
    };
  }
  if (!isValidStatusTransition(doc.status, proposedStatus)) {
    return {
      allowed: false,
      reason: `Invalid status transition from ${doc.status} to ${proposedStatus}.`,
    };
  }
  return { allowed: true };
}

// ── Document Review Checks ───────────────────────────────────────────────────

/** Check if a document type requires reviewer assignment. */
export function documentTypeRequiresReview(documentType: DocumentType): boolean {
  return DOCUMENT_TYPES_REQUIRING_REVIEW.includes(documentType);
}

/** Validate that a document has required fields before it can be issued. */
export function validateDocumentReadiness(doc: DocumentRecord): {
  ready: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!doc.title.trim()) issues.push('Title is required.');
  if (!doc.discipline) issues.push('Discipline is required.');
  if (!doc.issuePurpose) issues.push('Issue-purpose is required.');

  if (documentTypeRequiresReview(doc.documentType) && doc.status === 'pending_review' && !doc.reviewerRole) {
    issues.push(`Document type ${doc.documentType} requires a reviewer before issue.`);
  }

  if (doc.authorRole === 'candidate_professional' && ['approved', 'issued'].includes(doc.status)) {
    issues.push('Candidate professional output requires supervisor approval before formal issue.');
  }

  return { ready: issues.length === 0, issues };
}

// ── Discipline Coverage ──────────────────────────────────────────────────────

/** Check which required sheet types are missing for a given discipline. */
export function missingSheetsForDiscipline(
  drawings: DrawingRecord[],
  discipline: Discipline,
): { discipline: Discipline; required: string[]; present: string[]; missing: string[] } {
  const required = DISCIPLINE_REQUIRED_SHEETS[discipline] || [];
  const disciplineDrawings = drawings.filter(
    (d) => d.discipline === discipline && d.status !== 'superseded',
  );
  const presentSheets = new Set(disciplineDrawings.map((d) => d.sheetType));
  const present = required.filter((s) => presentSheets.has(s));
  const missing = required.filter((s) => !presentSheets.has(s));
  return { discipline, required, present, missing };
}

/** Check discipline coverage across all disciplines present in the drawing set. */
export function disciplineCoverageReport(drawings: DrawingRecord[]): Array<{
  discipline: Discipline;
  required: string[];
  present: string[];
  missing: string[];
  coverage: number;
}> {
  const disciplines = [...new Set(drawings.map((d) => d.discipline))] as Discipline[];
  return disciplines.map((discipline) => {
    const check = missingSheetsForDiscipline(drawings, discipline);
    const coverage = check.required.length > 0
      ? check.present.length / check.required.length
      : 1;
    return { ...check, coverage };
  });
}

// ── Issue-Purpose Validation ─────────────────────────────────────────────────

/** Check that all drawings for a given issue-purpose have the correct purpose assigned. */
export function validateIssuePurpose(
  drawings: DrawingRecord[],
  expectedPurpose: IssuePurpose,
): { valid: boolean; mismatched: DrawingRecord[] } {
  const mismatched = drawings.filter(
    (d) => d.issuePurpose !== expectedPurpose && d.status === 'issued',
  );
  return { valid: mismatched.length === 0, mismatched };
}

/** Check if any construction-issue drawings have been superseded. */
export function detectSupersededConstructionDrawings(drawings: DrawingRecord[]): DrawingRecord[] {
  return drawings.filter(
    (d) => d.issuePurpose === 'for_construction' && d.status === 'superseded',
  );
}
