import type { DocumentRecord, DrawingIntelligenceResult, DrawingRecord, ReadinessFinding } from '@/services/documentRegisterService';

export function analyseDocument(document: DocumentRecord, drawings: DrawingRecord[]): DrawingIntelligenceResult {
  const drawing = drawings.find((item) => item.documentId === document.documentId);
  const findings: ReadinessFinding[] = [];
  if (document.status === 'pending_review') {
    findings.push({ code: 'DOCUMENT_REVIEW_REQUIRED', priority: 'medium', message: `${document.title} requires review before issue.`, assignedRoles: [document.reviewerRole ?? 'architect'], relatedDocumentId: document.documentId, relatedDrawingId: drawing?.drawingId });
  }
  if (document.authorRole === 'candidate_professional' && document.status !== 'draft') {
    findings.push({ code: 'CANDIDATE_SUPERVISION_REQUIRED', priority: 'high', message: `${document.title} requires responsible professional supervision before formal issue.`, assignedRoles: ['candidate_professional', document.reviewerRole ?? 'architect', 'admin'], relatedDocumentId: document.documentId });
  }
  return {
    documentId: document.documentId,
    classification: document.documentType,
    detectedDiscipline: document.discipline,
    extractedDrawingNumber: drawing?.drawingNumber,
    extractedRevision: drawing?.currentRevision,
    detectedIssuePurpose: document.issuePurpose,
    confidence: 0.82,
    findings
  };
}

export function analyseDocuments(documents: DocumentRecord[], drawings: DrawingRecord[]): DrawingIntelligenceResult[] {
  return documents.map((document) => analyseDocument(document, drawings));
}
