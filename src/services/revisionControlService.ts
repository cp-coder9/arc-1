import type { DocumentRecord, DocumentRevision, DrawingRecord, ReadinessFinding } from '@/services/documentRegisterService';

export function supersededConstructionDrawings(drawings: DrawingRecord[]): DrawingRecord[] {
  return drawings.filter((drawing) => drawing.issuePurpose === 'for_construction' && drawing.status === 'superseded');
}

export function revisionChainForDocument(documentId: string, revisions: DocumentRevision[]): DocumentRevision[] {
  return revisions.filter((revision) => revision.documentId === documentId).sort((a, b) => a.revisionCode.localeCompare(b.revisionCode));
}

export function canMutateDocument(document: DocumentRecord): boolean {
  return document.status === 'draft' || document.status === 'pending_review' || document.status === 'rejected';
}

export function allSupersededDrawings(drawings: DrawingRecord[]): DrawingRecord[] {
  return drawings.filter((drawing) => drawing.status === 'superseded');
}

export function mustReviseDocument(document: DocumentRecord): boolean {
  return !canMutateDocument(document);
}

export function mutationRuleForStatus(status: string): { canMutate: boolean; description: string } {
  const canMutate = ['draft', 'pending_review', 'rejected'].includes(status);
  return {
    canMutate,
    description: canMutate ? 'Document may be edited' : 'Document is immutable and must be revised',
  };
}

export function latestRevision(documentId: string, revisions: DocumentRevision[]): DocumentRevision | undefined {
  const chain = revisionChainForDocument(documentId, revisions);
  return chain.length > 0 ? chain[chain.length - 1] : undefined;
}

export function findSupersedingRevision(revisionId: string, revisions: DocumentRevision[]): DocumentRevision | undefined {
  return revisions.find((rev) => rev.supersedesRevisionId === revisionId);
}

export function supersessionChain(revisionId: string, revisions: DocumentRevision[]): DocumentRevision[] {
  const chain: DocumentRevision[] = [];
  const start = revisions.find((rev) => rev.revisionId === revisionId);
  if (!start) return chain;
  chain.push(start);
  let next = findSupersedingRevision(revisionId, revisions);
  while (next) {
    chain.push(next);
    next = findSupersedingRevision(next.revisionId, revisions);
  }
  return chain;
}

export function createRevision(params: {
  documentId: string;
  previousRevisionId?: string;
  revisionCode: string;
  issuePurpose: string;
  authorUserId: string;
  reviewerUserId?: string;
  notes: string;
}): DocumentRevision {
  return {
    revisionId: `rev-${params.documentId}-${params.revisionCode.toLowerCase()}`,
    documentId: params.documentId,
    revisionCode: params.revisionCode,
    status: 'pending_review',
    issuePurpose: params.issuePurpose as DocumentRevision['issuePurpose'],
    issuedAt: new Date().toISOString(),
    supersedesRevisionId: params.previousRevisionId,
    authorUserId: params.authorUserId,
    reviewerUserId: params.reviewerUserId,
    notes: params.notes,
  };
}

export function supersedeRevision(original: DocumentRevision, newRevisionId: string): DocumentRevision {
  return {
    ...original,
    status: 'superseded',
    supersededByRevisionId: newRevisionId,
  };
}

export function supersedeDocument(document: DocumentRecord, newRevisionId: string): DocumentRecord {
  return {
    ...document,
    status: 'superseded',
    currentRevisionId: newRevisionId,
  };
}

export function auditTrailFromRevisions(revisions: DocumentRevision[]): Array<{
  revisionId: string;
  revisionCode: string;
  action: string;
  timestamp: string;
  actor: string;
}> {
  return revisions.map((rev) => {
    const actions: string[] = [];
    if (rev.supersedesRevisionId) {
      actions.push(`Supersedes ${rev.supersedesRevisionId}`);
    }
    actions.push(`created as ${rev.status}`);
    return {
      revisionId: rev.revisionId,
      revisionCode: rev.revisionCode,
      action: actions.join('; '),
      timestamp: rev.issuedAt || new Date().toISOString(),
      actor: rev.authorUserId,
    };
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function shouldAlertConstructionUsers(drawings: DrawingRecord[]): boolean {
  return supersededConstructionDrawings(drawings).length > 0;
}

export function constructionAlertMessage(drawings: DrawingRecord[]): string | null {
  const superseded = supersededConstructionDrawings(drawings);
  if (superseded.length === 0) return null;
  const numbers = superseded.map((d) => d.drawingNumber).join(', ');
  return `${numbers} have been superseded and must not be used for construction.`;
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
