import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';
import { archiveProject, CLOSEOUT_ARTIFACTS_REQUIRED_ERROR, getProjectSummary, summaryHasPersistedCloseoutArtifacts } from '../closeoutService';

vi.mock('@/lib/firebase', () => ({ db: { name: 'mock-db' } }));
vi.mock('@/lib/uploadService', () => ({ uploadAndTrackFile: vi.fn() }));
vi.mock('../financialLedgerService', () => ({ getLedgerForProject: vi.fn() }));
vi.mock('../projectLifecycleService', () => ({ transitionStage: vi.fn() }));

const docMock = vi.mocked(firestore.doc) as any;
const getDocMock = vi.mocked(firestore.getDoc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const runTransactionMock = vi.mocked(firestore.runTransaction) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const setDocMock = vi.mocked(firestore.setDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;
const queryMock = vi.mocked(firestore.query) as any;
const whereMock = vi.mocked(firestore.where) as any;

describe('closeoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'doc', path }));
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
    whereMock.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }));
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockResolvedValue(undefined);
  });

  it('recognises summaries only when closeout artifacts are persisted and non-empty', () => {
    expect(summaryHasPersistedCloseoutArtifacts(null)).toBe(false);
    expect(summaryHasPersistedCloseoutArtifacts({ artifacts: { completionCertificateUrl: ' ', finalReport: 'Report' } } as any)).toBe(false);
    expect(summaryHasPersistedCloseoutArtifacts({ artifacts: { completionCertificateUrl: 'https://files/cert.pdf', finalReport: 'Final report' } } as any)).toBe(true);
  });

  it('builds project summaries with tenders, ledger rollups, clamped escrow, and artifacts', async () => {
    const { getLedgerForProject } = await import('../financialLedgerService');
    vi.mocked(getLedgerForProject).mockResolvedValue([
      { id: 'deposit', type: 'escrow_deposit', amount: 1000 },
      { id: 'release', type: 'milestone_release', amount: 700 },
      { id: 'refund', type: 'refund', amount: 500 },
    ] as any);
    getDocMock
      .mockResolvedValueOnce({ exists: () => true, id: 'project-1', data: () => ({ jobId: 'job-1', currentStage: 'payments', createdAt: '2026-01-01T00:00:00.000Z', teamMembers: [{ userId: 'architect-1' }], closeoutArtifacts: { completionCertificateUrl: 'cert-url' } }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'job-1', data: () => ({ title: 'House', budget: 2500 }) });
    getDocsMock.mockResolvedValue({ docs: [{ id: 'tender-1', data: () => ({ projectId: 'project-1', title: 'Tender' }) }] });

    const summary = await getProjectSummary('project-1');

    expect(summary.job).toEqual(expect.objectContaining({ id: 'job-1', title: 'House' }));
    expect(summary.tenders).toEqual([expect.objectContaining({ id: 'tender-1', projectId: 'project-1' })]);
    expect(summary.budget).toEqual({ planned: 2500, actualReleased: 700, escrowHeld: 0 });
    expect(summary.artifacts).toEqual({ completionCertificateUrl: 'cert-url' });
    expect(whereMock).toHaveBeenCalledWith('projectId', '==', 'project-1');
  });

  it('rejects archive attempts until both project fields and artifact documents are persisted', async () => {
    runTransactionMock.mockImplementation(async (_db: unknown, callback: any) => callback({
      get: vi.fn()
        .mockResolvedValueOnce({ exists: () => true, id: 'project-1', data: () => ({ jobId: 'job-1', currentStage: 'payments', stageHistory: [], closeoutArtifacts: { completionCertificateUrl: 'cert-url', finalReport: 'Final report' } }) })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ url: 'cert-url', type: 'completion_certificate' }) })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ report: '', type: 'final_report' }) }),
      update: vi.fn(),
    }));

    await expect(archiveProject('project-1')).rejects.toThrow(CLOSEOUT_ARTIFACTS_REQUIRED_ERROR);
  });

  it('archives persisted closeout artifacts and transitions non-closeout projects inside one transaction', async () => {
    const transactionUpdate = vi.fn();
    runTransactionMock.mockImplementation(async (_db: unknown, callback: any) => callback({
      get: vi.fn()
        .mockResolvedValueOnce({ exists: () => true, id: 'project-1', data: () => ({ jobId: 'job-1', currentStage: 'payments', clientId: 'client-1', stageHistory: [{ stage: 'payments', enteredAt: '2026-01-01T00:00:00.000Z' }], closeoutArtifacts: { completionCertificateUrl: 'cert-url', finalReport: 'Final report' } }) })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ url: 'cert-url', type: 'completion_certificate' }) })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ report: 'Final report', type: 'final_report' }) }),
      update: transactionUpdate,
    }));

    await archiveProject('project-1');

    expect(transactionUpdate).toHaveBeenCalledWith(
      { type: 'doc', path: ['projects', 'project-1'] },
      expect.objectContaining({ archived: true, currentStage: 'closeout', stageHistory: expect.arrayContaining([expect.objectContaining({ stage: 'closeout', actorId: 'client-1' })]) })
    );
    expect(transactionUpdate).toHaveBeenCalledWith(
      { type: 'doc', path: ['jobs', 'job-1'] },
      expect.objectContaining({ status: 'completed' })
    );
  });
});
