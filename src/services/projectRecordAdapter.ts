/**
 * Project Record Adapter
 *
 * Maps document and drawing records into ProjectRecord envelopes
 * compatible with the Project Passport + Lifecycle Engine.
 *
 * @module documents_drawing_intelligence
 */

import type { DocumentRecord, DrawingRecord, ProjectRecord } from '@/types/documentTypes';

/** Convert all documents (with their linked drawings) into ProjectRecord outputs. */
export function projectRecordsFromDocuments(
  documents: DocumentRecord[],
  drawings: DrawingRecord[],
): ProjectRecord[] {
  return documents.map((doc) => {
    const drawing = drawings.find((d) => d.documentId === doc.documentId);
    return buildProjectRecord(doc, drawing);
  });
}

/** Convert a single document + optional drawing into a ProjectRecord. */
export function buildProjectRecord(
  document: DocumentRecord,
  drawing?: DrawingRecord,
): ProjectRecord {
  return {
    id: `project-record-${document.documentId}`,
    tenantId: document.tenantId,
    projectId: document.projectId,
    phase: document.phase,
    moduleKey: 'documents',
    recordType: recordTypeForDocument(document, Boolean(drawing)),
    title: document.title,
    status: document.status,
    payload: buildPayload(document, drawing),
    approvals: {
      required: document.status === 'pending_review',
      approvedBy: document.status === 'approved' ? [document.authorRole] : undefined,
      pendingRoles: document.reviewerRole ? [document.reviewerRole] : undefined,
    },
    audit: {
      createdBy: document.authorRole,
      createdAt: document.createdAt,
    },
    linkedRecordIds: document.linkedProjectRecordId
      ? [document.linkedProjectRecordId]
      : drawing
        ? [drawing.drawingId]
        : [],
  };
}

/** Determine the correct ProjectRecord type for a document. */
export function recordTypeForDocument(
  document: DocumentRecord,
  hasDrawing: boolean,
): ProjectRecord['recordType'] {
  // Drawing-related records
  if (hasDrawing) {
    if (document.issuePurpose === 'for_construction') return 'technical_drawings';
    return 'drawing_revision';
  }

  // Document-type-based records
  switch (document.documentType) {
    case 'submission_pack':
      return 'municipal_submission_pack';
    case 'approval_letter':
      return 'municipal_approval_letter';
    case 'tender_pack':
      return 'tender_pack';
    case 'site_instruction':
      return 'site_instruction';
    case 'rfi':
      return 'rfi';
    case 'payment_certificate':
      return 'payment_certificate';
    case 'closeout_pack':
    case 'closeout_certificate':
      return 'closeout_pack';
    default:
      return 'drawing_revision';
  }
}

/** Build the payload object for a ProjectRecord. */
export function buildPayload(
  document: DocumentRecord,
  drawing?: DrawingRecord,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    documentId: document.documentId,
    documentType: document.documentType,
    issuePurpose: document.issuePurpose,
  };

  if (drawing) {
    payload.drawingNumber = drawing.drawingNumber;
    payload.revision = drawing.currentRevision;
    payload.sheetType = drawing.sheetType;
    payload.discipline = drawing.discipline;
  }

  // Type-specific payload fields
  switch (document.documentType) {
    case 'submission_pack':
      payload.submissionType = 'municipal';
      break;
    case 'tender_pack':
      payload.packType = 'tender';
      break;
    case 'payment_certificate':
      payload.certificateType = 'payment';
      break;
    case 'rfi':
      payload.rfiType = 'request_for_information';
      break;
    case 'site_instruction':
      payload.instructionType = 'site_direction';
      break;
  }

  return payload;
}

/** Group project records by their record type. */
export function groupRecordsByType(records: ProjectRecord[]): Record<string, ProjectRecord[]> {
  const groups: Record<string, ProjectRecord[]> = {};
  for (const record of records) {
    const key = record.recordType;
    if (!groups[key]) groups[key] = [];
    groups[key].push(record);
  }
  return groups;
}

/** Filter project records to only those requiring approval. */
export function recordsRequiringApproval(records: ProjectRecord[]): ProjectRecord[] {
  return records.filter((r) => r.approvals.required);
}

/** Get linked record IDs across all project records. */
export function linkedRecordIds(records: ProjectRecord[]): string[] {
  return [...new Set(records.flatMap((r) => r.linkedRecordIds))];
}
