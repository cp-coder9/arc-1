import type { DocumentRecord, DocumentRevision, DrawingRecord, ReadinessFinding } from '@/services/documentRegisterService';

export function supersededConstructionDrawings(drawings: DrawingRecord[]): DrawingRecord[] {
  return drawings.filter((drawing) => drawing.issuePurpose === 'for_construction' && drawing.status === 'superseded');
}

export function revisionChainForDocument(documentId: string, revisions: DocumentRevision[]): DocumentRevision[] {
  return revisions.filter((revision) => revision.documentId === documentId).sort((a, b) => a.revisionCode.localeCompare(b.revisionCode));
}

export function canMutateDocument(document: DocumentRecord): boolean {
  return document.status === 'draft' || document.status === 'pending_review';
}

export function revisionFindings(drawings: DrawingRecord[]): ReadinessFinding[] {
  return supersededConstructionDrawings(drawings).map((drawing) => ({
    code: 'SUPERSEDED_CONSTRUCTION_DRAWING',
    priority: 'high' as const,
    message: `${drawing.drawingNumber} ${drawing.title} has been superseded and should not be used for construction.`,
    assignedRoles: ['architect', 'contractor', 'admin'],
    relatedDocumentId: drawing.documentId,
    relatedDrawingId: drawing.drawingId
  }));
}
