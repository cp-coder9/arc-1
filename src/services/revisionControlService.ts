/**
 * Revision Control Service
 *
 * Manages document revisions, supersession, and the revision chain audit trail.
 * Core rule: issued documents are revised/superseded, never mutated in place.
 *
 * @module documents_drawing_intelligence
 */

import type {
  DocumentRecord,
  DocumentRevision,
  DocumentStatus,
  DrawingRecord,
  IssuePurpose,
  ReadinessFinding,
} from '@/types/documentTypes';

// ── Superseded Drawing Detection ─────────────────────────────────────────────

/** Return construction-issue drawings that have been superseded. */
export function supersededConstructionDrawings(drawings: DrawingRecord[]): DrawingRecord[] {
  return drawings.filter(
    (d) => d.issuePurpose === 'for_construction' && d.status === 'superseded',
  );
}

/** Return all superseded drawings regardless of purpose. */
export function allSupersededDrawings(drawings: DrawingRecord[]): DrawingRecord[] {
  return drawings.filter((d) => d.status === 'superseded');
}

// ── Revision Chain ───────────────────────────────────────────────────────────

/** Build an ordered revision chain for a document. */
export function revisionChainForDocument(
  documentId: string,
  revisions: DocumentRevision[],
): DocumentRevision[] {
  return revisions
    .filter((r) => r.documentId === documentId)
    .sort((a, b) => a.revisionCode.localeCompare(b.revisionCode));
}

/** Get the latest revision in a chain. */
export function latestRevision(
  documentId: string,
  revisions: DocumentRevision[],
): DocumentRevision | undefined {
  const chain = revisionChainForDocument(documentId, revisions);
  return chain[chain.length - 1];
}

/** Find a revision that supersedes a given revision. */
export function findSupersedingRevision(
  revisionId: string,
  revisions: DocumentRevision[],
): DocumentRevision | undefined {
  return revisions.find((r) => r.supersedesRevisionId === revisionId);
}

/** Build the full supersession chain (revision → superseded-by → ...). */
export function supersessionChain(
  startRevisionId: string,
  allRevisions: DocumentRevision[],
): DocumentRevision[] {
  const chain: DocumentRevision[] = [];
  let current = allRevisions.find((r) => r.revisionId === startRevisionId);
  while (current) {
    chain.push(current);
    if (!current.supersededByRevisionId) break;
    current = allRevisions.find((r) => r.revisionId === current!.supersededByRevisionId);
  }
  return chain;
}

// ── Mutation Guards ──────────────────────────────────────────────────────────

/** Determine if a document can be mutated (edited) directly. */
export function canMutateDocument(doc: DocumentRecord): boolean {
  return doc.status === 'draft' || doc.status === 'pending_review' || doc.status === 'rejected';
}

/** Determine if a document must be revised (new revision) instead of mutated. */
export function mustReviseDocument(doc: DocumentRecord): boolean {
  return !canMutateDocument(doc);
}

/** Get the mutation rule for a document status. */
export function mutationRuleForStatus(
  status: DocumentStatus,
): { canMutate: boolean; description: string } {
  switch (status) {
    case 'draft':
      return { canMutate: true, description: 'Draft documents may be updated freely.' };
    case 'pending_review':
      return { canMutate: true, description: 'Documents under review may be updated.' };
    case 'approved':
      return {
        canMutate: false,
        description: 'Approved documents must be issued or rejected; changes require a new revision.',
      };
    case 'issued':
      return {
        canMutate: false,
        description: 'Issued documents are immutable. Create a new revision to supersede.',
      };
    case 'superseded':
      return { canMutate: false, description: 'Superseded documents are read-only.' };
    case 'rejected':
      return { canMutate: true, description: 'Rejected documents may be revised and resubmitted.' };
  }
}

// ── Create / Supersede Revisions ─────────────────────────────────────────────

/** Create a new revision for an issued document, superseding the current. */
export function createRevision(params: {
  documentId: string;
  previousRevisionId: string;
  revisionCode: string;
  issuePurpose: IssuePurpose;
  authorUserId: string;
  reviewerUserId?: string;
  notes: string;
}): DocumentRevision {
  const now = new Date().toISOString();
  const revisionId = `rev-${params.documentId}-${params.revisionCode.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return {
    revisionId,
    documentId: params.documentId,
    revisionCode: params.revisionCode,
    status: 'pending_review',
    issuePurpose: params.issuePurpose,
    supersedesRevisionId: params.previousRevisionId,
    authorUserId: params.authorUserId,
    reviewerUserId: params.reviewerUserId,
    notes: params.notes,
    issuedAt: now,
  };
}

/** Mark a revision as superseded by a newer revision. */
export function supersedeRevision(
  revision: DocumentRevision,
  supersedingRevisionId: string,
): DocumentRevision {
  return {
    ...revision,
    status: 'superseded',
    supersededByRevisionId: supersedingRevisionId,
  };
}

/** Mark a document as superseded and link to the replacement. */
export function supersedeDocument(
  doc: DocumentRecord,
  newRevisionId: string,
): DocumentRecord {
  return {
    ...doc,
    status: 'superseded',
    currentRevisionId: newRevisionId,
    updatedAt: new Date().toISOString(),
  };
}

// ── Findings ─────────────────────────────────────────────────────────────────

/** Generate readiness findings from superseded construction drawings. */
export function revisionFindings(drawings: DrawingRecord[]): ReadinessFinding[] {
  return supersededConstructionDrawings(drawings).map((d) => ({
    code: 'SUPERSEDED_CONSTRUCTION_DRAWING',
    priority: 'high' as const,
    message: `${d.drawingNumber} ${d.title} has been superseded and should not be used for construction.`,
    assignedRoles: ['architect', 'contractor', 'admin'] as const,
    relatedDocumentId: d.documentId,
    relatedDrawingId: d.drawingId,
  }));
}

/** Generate audit trail entries from a revision chain. */
export function auditTrailFromRevisions(revisions: DocumentRevision[]): Array<{
  revisionId: string;
  revisionCode: string;
  status: DocumentStatus;
  action: string;
  timestamp: string;
}> {
  return revisions.map((r) => ({
    revisionId: r.revisionId,
    revisionCode: r.revisionCode,
    status: r.status,
    action: r.supersedesRevisionId
      ? `Supersedes ${r.supersedesRevisionId}`
      : 'Initial revision',
    timestamp: r.issuedAt || new Date().toISOString(),
  }));
}

/** Check if a drawing supersession alert should be shown to construction users. */
export function shouldAlertConstructionUsers(drawings: DrawingRecord[]): boolean {
  return supersededConstructionDrawings(drawings).length > 0;
}

/** Build a construction user alert message for superseded drawings. */
export function constructionAlertMessage(drawings: DrawingRecord[]): string | null {
  const superseded = supersededConstructionDrawings(drawings);
  if (superseded.length === 0) return null;

  const drawingList = superseded
    .map((d) => `${d.drawingNumber} (rev ${d.currentRevision})`)
    .join(', ');

  return `The following construction drawings have been superseded and must not be used for construction: ${drawingList}. Check the drawing register for current revisions.`;
}
