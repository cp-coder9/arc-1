import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../types';
import {
  addMunicipalTrackerLink,
  appendMunicipalStatusHistory,
  buildMunicipalStatusSummary,
  canViewMunicipalVisibility,
  createMunicipalSubmissionRecord,
  visibleMunicipalLinksForRole,
} from '../municipalTrackerWorkflowService';

const bep: Pick<UserProfile, 'uid' | 'role' | 'displayName' | 'email'> = {
  uid: 'bep-1',
  role: 'bep',
  displayName: 'BEP Architect',
  email: 'bep@example.test',
};

const contractor: Pick<UserProfile, 'uid' | 'role' | 'displayName' | 'email'> = {
  uid: 'contractor-1',
  role: 'contractor',
  displayName: 'Main Contractor',
  email: 'contractor@example.test',
};

const admin: Pick<UserProfile, 'uid' | 'role' | 'displayName' | 'email'> = {
  uid: 'admin-1',
  role: 'admin',
  displayName: 'Admin User',
  email: 'admin@example.test',
};

describe('municipalTrackerWorkflowService', () => {
  it('creates municipal submission records with package documents, initial history and immutable audit metadata', () => {
    const record = createMunicipalSubmissionRecord({
      id: 'submission-1',
      jobId: 'job-1',
      projectId: 'project-1',
      municipalityName: 'City of Johannesburg',
      municipalReference: 'COJ-2026-001',
      submittedBy: bep,
      clientId: 'client-1',
      bepId: 'bep-1',
      contractorId: 'contractor-1',
      packageDocumentIds: ['doc-form', 'doc-drawings'],
      createdAt: '2026-05-20T10:00:00.000Z',
    });

    expect(record).toMatchObject({
      id: 'submission-1',
      jobId: 'job-1',
      municipalityName: 'City of Johannesburg',
      municipalReference: 'COJ-2026-001',
      status: 'preparing',
      submittedBy: 'bep-1',
      packageDocumentIds: ['doc-form', 'doc-drawings'],
      visibility: 'public_project',
      updatedAt: '2026-05-20T10:00:00.000Z',
    });
    expect(record.statusHistory).toHaveLength(1);
    expect(record.statusHistory[0]).toMatchObject({
      id: 'history-submission-1-created',
      toStatus: 'preparing',
      municipalReference: 'COJ-2026-001',
      audit: { actorId: 'bep-1', actorRole: 'bep', immutable: true, source: 'manual' },
    });
  });

  it('appends receipts, comments and evidence links without mutating the original record', () => {
    const base = createMunicipalSubmissionRecord({
      id: 'submission-2',
      jobId: 'job-2',
      municipalityName: 'City of Cape Town',
      submittedBy: bep,
      clientId: 'client-2',
    });

    const withReceipt = addMunicipalTrackerLink(base, {
      actor: bep,
      type: 'receipt',
      title: 'Portal receipt',
      url: 'https://municipal.example.test/receipt.pdf',
      source: 'municipal_portal',
      createdAt: '2026-05-20T11:00:00.000Z',
    });
    const withComment = addMunicipalTrackerLink(withReceipt, {
      actor: contractor,
      type: 'comment',
      title: 'Site readiness note',
      url: 'https://architex.example.test/comments/1',
      note: 'Contractor can see project team comments only.',
      createdAt: '2026-05-20T12:00:00.000Z',
    });
    const withEvidence = addMunicipalTrackerLink(withComment, {
      actor: bep,
      type: 'evidence',
      title: 'Stamped zoning certificate',
      url: 'https://architex.example.test/evidence/zoning.pdf',
      visibility: 'bep_admin',
      createdAt: '2026-05-20T13:00:00.000Z',
    });

    expect(base.links).toEqual([]);
    expect(withEvidence.links.map((link) => [link.type, link.visibility])).toEqual([
      ['receipt', 'public_project'],
      ['comment', 'project_team'],
      ['evidence', 'bep_admin'],
    ]);
    expect(withEvidence.links[0].audit).toMatchObject({ source: 'municipal_portal', immutable: true });
  });

  it('records status transitions with receipts, evidence link references, municipal reference and audit metadata', () => {
    const base = createMunicipalSubmissionRecord({
      id: 'submission-3',
      jobId: 'job-3',
      municipalityName: 'eThekwini Municipality',
      submittedBy: bep,
      clientId: 'client-3',
    });

    const submitted = appendMunicipalStatusHistory(base, {
      actor: bep,
      status: 'submitted',
      note: 'Uploaded to portal.',
      municipalReference: 'ETH-2026-778',
      receiptId: 'receipt-submission-3-1',
      evidenceLinkIds: ['evidence-submission-3-2'],
      source: 'api',
      createdAt: '2026-05-20T14:00:00.000Z',
    });
    const queried = appendMunicipalStatusHistory(submitted, {
      actor: admin,
      status: 'queries_raised',
      note: 'Municipality requested zoning certificate.',
      evidenceLinkIds: ['comment-submission-3-3'],
      createdAt: '2026-05-21T08:00:00.000Z',
    });

    expect(submitted.status).toBe('submitted');
    expect(submitted.municipalReference).toBe('ETH-2026-778');
    expect(queried.statusHistory).toHaveLength(3);
    expect(queried.statusHistory[1]).toMatchObject({
      fromStatus: 'preparing',
      toStatus: 'submitted',
      receiptId: 'receipt-submission-3-1',
      evidenceLinkIds: ['evidence-submission-3-2'],
      audit: { actorId: 'bep-1', source: 'api', immutable: true },
    });
    expect(queried.statusHistory[2]).toMatchObject({
      fromStatus: 'submitted',
      toStatus: 'queries_raised',
      municipalReference: 'ETH-2026-778',
      audit: { actorRole: 'admin' },
    });
  });

  it('enforces role visibility for clients, contractors, BEPs and admins', () => {
    expect(canViewMunicipalVisibility('client', 'public_project')).toBe(true);
    expect(canViewMunicipalVisibility('client', 'project_team')).toBe(false);
    expect(canViewMunicipalVisibility('contractor', 'project_team')).toBe(true);
    expect(canViewMunicipalVisibility('contractor', 'bep_admin')).toBe(false);
    expect(canViewMunicipalVisibility('bep', 'bep_admin')).toBe(true);
    expect(canViewMunicipalVisibility('admin', 'admin_only')).toBe(true);

    const record = [
      { type: 'receipt' as const, visibility: undefined, title: 'Receipt' },
      { type: 'comment' as const, visibility: undefined, title: 'Team comment' },
      { type: 'evidence' as const, visibility: 'bep_admin' as const, title: 'BEP evidence' },
      { type: 'comment' as const, visibility: 'admin_only' as const, title: 'Admin note' },
    ].reduce(
      (current, link) => addMunicipalTrackerLink(current, {
        actor: bep,
        type: link.type,
        title: link.title,
        url: `https://example.test/${link.title}`,
        visibility: link.visibility,
      }),
      createMunicipalSubmissionRecord({ id: 'submission-4', jobId: 'job-4', municipalityName: 'Mangaung', submittedBy: bep, clientId: 'client-4' })
    );

    expect(visibleMunicipalLinksForRole(record, 'client').map((link) => link.title)).toEqual(['Receipt']);
    expect(visibleMunicipalLinksForRole(record, 'contractor').map((link) => link.title)).toEqual(['Receipt', 'Team comment']);
    expect(visibleMunicipalLinksForRole(record, 'bep').map((link) => link.title)).toEqual(['Receipt', 'Team comment', 'BEP evidence']);
    expect(visibleMunicipalLinksForRole(record, 'admin').map((link) => link.title)).toEqual(['Receipt', 'Team comment', 'BEP evidence', 'Admin note']);
  });

  it('builds role-scoped summaries that keep client views read-only and hide project team query detail', () => {
    const base = createMunicipalSubmissionRecord({
      id: 'submission-5',
      jobId: 'job-5',
      municipalityName: 'Buffalo City Metropolitan',
      submittedBy: bep,
      clientId: 'client-5',
    });
    const withReceipt = addMunicipalTrackerLink(base, {
      actor: bep,
      type: 'receipt',
      title: 'Submission receipt',
      url: 'https://example.test/receipt.pdf',
    });
    const queried = appendMunicipalStatusHistory(withReceipt, {
      actor: bep,
      status: 'queries_raised',
      note: 'Internal detail about missing zoning evidence.',
      createdAt: '2026-05-22T09:00:00.000Z',
    });

    const clientSummary = buildMunicipalStatusSummary(queried, 'client');
    const contractorSummary = buildMunicipalStatusSummary(queried, 'contractor');

    expect(clientSummary).toMatchObject({ status: 'queries_raised', latestNote: 'Internal detail about missing zoning evidence.' });
    expect(clientSummary.visibleLinks.map((link) => link.title)).toEqual(['Submission receipt']);
    expect(clientSummary.statusHistory.map((entry) => entry.toStatus)).toEqual(['preparing']);
    expect(contractorSummary.statusHistory.map((entry) => entry.toStatus)).toEqual(['preparing', 'queries_raised']);
  });
});
