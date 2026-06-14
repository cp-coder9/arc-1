import type { DocumentRecord, DrawingRecord } from '@/services/documentRegisterService';
import type { ProjectRecord } from '@/services/lifecycleTypes';

export function projectRecordsFromDocuments(documents: DocumentRecord[], drawings: DrawingRecord[]): ProjectRecord[] {
  return documents.map((document) => {
    const drawing = drawings.find((item) => item.documentId === document.documentId);
    return {
      id: `project-record-${document.documentId}`,
      tenantId: document.tenantId,
      projectId: document.projectId,
      phase: document.phase,
      moduleKey: 'documents',
      recordType: recordTypeForDocument(document, Boolean(drawing)),
      title: document.title,
      status: document.status,
      payload: { documentId: document.documentId, documentType: document.documentType, issuePurpose: document.issuePurpose, drawingNumber: drawing?.drawingNumber, revision: drawing?.currentRevision },
      approvals: { required: document.status === 'pending_review', pendingRoles: document.reviewerRole ? [document.reviewerRole] : undefined },
      audit: { createdBy: document.authorRole, createdAt: document.createdAt },
      linkedRecordIds: drawing ? [drawing.drawingId] : []
    };
  });
}

function recordTypeForDocument(document: DocumentRecord, hasDrawing: boolean): ProjectRecord['recordType'] {
  if (hasDrawing && document.issuePurpose === 'for_construction') return 'technical_drawings';
  if (hasDrawing) return 'drawing_revision';
  if (document.documentType === 'submission_pack') return 'municipal_submission_pack';
  if (document.documentType === 'approval_letter') return 'municipal_approval_letter';
  if (document.documentType === 'tender_pack') return 'tender_pack';
  if (document.documentType === 'site_instruction') return 'site_instruction';
  if (document.documentType === 'rfi') return 'rfi';
  if (document.documentType === 'payment_certificate') return 'payment_certificate';
  if (document.documentType === 'closeout_pack') return 'closeout_pack';
  return 'drawing_revision';
}

// ── Backward-compatible stubs for existing site execution consumers ────────

export function subscribeToProjectRecords(_projectId: string, _callback?: (recs: ProjectRecord[]) => void): () => void {
  if (_callback) _callback([]);
  return () => {};
}

export function createProjectRecord(input: {
  projectId: string; tenantId: string; recordType: string;
  title: string; status?: string; payload?: unknown;
  moduleKey?: string; createdBy?: string; linkedRecordIds?: string[];
  phase?: string;
}): string {
  return `pr-stub-${Date.now()}`;
}
