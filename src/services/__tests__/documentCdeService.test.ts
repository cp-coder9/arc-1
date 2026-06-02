import { describe, expect, it } from 'vitest';
import { buildCdeApprovalRecord, buildCdeAuditInput, buildCdeDocumentRecord, buildCdeDocumentVersion, evaluateCdeExportReadiness } from '../documentCdeService';

describe('documentCdeService', () => {
  it('builds immutable submitted CDE document records with default revision metadata', () => {
    const doc = buildCdeDocumentRecord({
      projectId: ' project-1 ',
      uploadedBy: 'bep-1',
      name: ' Ground Floor Plan ',
      fileName: 'ground-floor.pdf',
      url: 'https://example.com/ground-floor.pdf',
      documentType: 'drawing',
      discipline: 'architecture',
    });

    expect(doc).toMatchObject({
      projectId: 'project-1',
      uploadedBy: 'bep-1',
      name: 'Ground Floor Plan',
      status: 'submitted',
      version: 1,
      currentVersionId: 'project-1:ground-floor-plan:v1',
      revision: 'P01',
      purposeOfIssue: 'information',
      immutable: true,
    });
  });

  it('creates new submitted versions without mutating the previous document', () => {
    const previous = buildCdeDocumentRecord({ projectId: 'project-1', uploadedBy: 'bep-1', name: 'Plan', fileName: 'plan-p01.pdf', url: 'https://example.com/p01.pdf' });
    const version = buildCdeDocumentVersion({
      ...previous,
      previousDocumentId: previous.currentVersionId,
      previousVersion: previous.version,
      uploadedBy: 'bep-2',
      fileName: 'plan-p02.pdf',
      url: 'https://example.com/p02.pdf',
    });

    expect(previous.version).toBe(1);
    expect(version).toMatchObject({
      version: 2,
      status: 'submitted',
      currentVersionId: 'project-1:plan:v2',
      revision: 'P01',
      metadata: { previousDocumentId: previous.currentVersionId },
    });
  });

  it('requires human approval decisions and comments for rejected or change-requested documents', () => {
    const approval = buildCdeApprovalRecord({ documentId: 'doc-1', projectId: 'project-1', reviewerId: 'bep-1', decision: 'approved' });
    const changes = buildCdeApprovalRecord({ documentId: 'doc-1', projectId: 'project-1', reviewerId: 'bep-1', decision: 'changes_requested', requiredChanges: ['Revise title block', ' '] });

    expect(approval).toMatchObject({ statusAfterDecision: 'approved', humanReviewRequired: true, autoApprovalProhibited: true });
    expect(changes).toMatchObject({ statusAfterDecision: 'submitted', requiredChanges: ['Revise title block'] });
    expect(() => buildCdeApprovalRecord({ documentId: 'doc-1', projectId: 'project-1', reviewerId: 'bep-1', decision: 'rejected' })).toThrow(/comments or requiredChanges/);
  });

  it('evaluates export readiness from approved document types and blocks unapproved documents', () => {
    const readiness = evaluateCdeExportReadiness({
      projectId: 'project-1',
      requiredDocumentTypes: ['drawing', 'certificate'],
      documents: [
        { name: 'Plan', status: 'approved', documentType: 'drawing', revision: 'C01' },
        { name: 'COC', status: 'submitted', documentType: 'certificate', revision: 'P01' },
      ],
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingDocumentTypes: ['certificate'],
      blockedDocuments: ['COC (submitted)'],
      approvedDocumentCount: 1,
    });
  });

  it('marks export ready only when required documents are approved and versioned', () => {
    const readiness = evaluateCdeExportReadiness({
      projectId: 'project-1',
      requiredDocumentTypes: ['drawing'],
      documents: [{ name: 'Plan', status: 'approved', documentType: 'drawing', revision: 'C01' }],
    });

    expect(readiness).toEqual({ ready: true, missingDocumentTypes: [], blockedDocuments: [], approvedDocumentCount: 1, warnings: [] });
  });

  it('builds audit input for document changes', () => {
    const doc = buildCdeDocumentRecord({ projectId: 'project-1', uploadedBy: 'bep-1', name: 'Plan', fileName: 'plan.pdf', url: 'https://example.com/plan.pdf' });
    expect(buildCdeAuditInput({ actorId: 'bep-1', action: 'cde.document.submitted', document: doc })).toMatchObject({
      actorId: 'bep-1',
      action: 'cde.document.submitted',
      resourceType: 'cde_document',
      resourceId: 'project-1:plan:v1',
      projectId: 'project-1',
      metadata: { immutable: true, version: 1 },
    });
  });
});
