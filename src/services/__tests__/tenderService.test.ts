import { vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;
const queryMock = vi.mocked(firestore.query) as any;
const setDocMock = vi.mocked(firestore.setDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const whereMock = vi.mocked(firestore.where) as any;

vi.mock('@/lib/firebase', () => ({ db: { name: 'mock-db' } }));

describe('tenderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    docMock.mockImplementation((dbOrCollection: any, ...path: string[]) => {
      const segments = path.length === 1 && path[0].includes('/') ? path[0].split('/') : path;
      if (segments.length === 0) {
        const ref = dbOrCollection?.type === 'collection' ? dbOrCollection : { path: [] };
        return { type: 'doc', path: [...ref.path, 'generated-id'], id: 'generated-id' };
      }
      if (dbOrCollection?.type === 'collection') return { type: 'doc', path: [...dbOrCollection.path, segments[segments.length - 1]], id: segments[segments.length - 1] };
      return { type: 'doc', path: segments, id: segments[segments.length - 1] };
    });
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
    whereMock.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }));
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockResolvedValue(undefined);
  });

  it('creates tender packages with generated id and timestamps', async () => {
    const { createTenderPackage } = await import('../tenderService');

    const id = await createTenderPackage({
      projectId: 'project-1',
      jobId: 'job-1',
      title: 'Main Works',
      description: 'Build main works',
      scope: ['Foundations'],
      documents: [],
      deadline: '2026-06-30',
      requiredDisciplines: ['architecture'],
      createdBy: 'architect-1',
    });

    expect(id).toBe('generated-id');
    expect(setDocMock).toHaveBeenCalledWith(expect.objectContaining({ path: ['tender_packages', 'generated-id'] }), expect.objectContaining({ id: 'generated-id', status: 'draft', createdAt: expect.any(String), updatedAt: expect.any(String) }));
  });

  it('submits bids under deterministic contractor document after verifying contractor credentials', async () => {
    const { submitBid } = await import('../tenderService');
    getDocsMock.mockResolvedValueOnce({
      docs: [{
        id: 'contractor-1_contractor_CIDB_CIDB-5GB',
        data: () => ({ userId: 'contractor-1', subjectType: 'contractor', statutoryBody: 'CIDB', status: 'verified' }),
      }],
    });

    const bidId = await submitBid('tender-1', {
      contractorId: 'contractor-1',
      contractorName: 'Build Co',
      totalAmount: 100000,
      lineItems: [{ description: 'Works', quantity: 1, unitPrice: 100000, total: 100000 }],
      proposedTimeline: '10 weeks',
      proposedStartDate: '2026-07-01',
      methodology: 'Standard construction',
      qualifications: 'CIDB 5GB',
      attachments: [],
    });

    expect(bidId).toBe('contractor_contractor-1');
    expect(whereMock).toHaveBeenCalledWith('subjectType', '==', 'contractor');
    expect(setDocMock).toHaveBeenCalledWith(expect.objectContaining({ path: ['tender_packages', 'tender-1', 'bids', 'contractor_contractor-1'] }), expect.objectContaining({ tenderPackageId: 'tender-1', status: 'submitted', verificationId: 'contractor-1_contractor_CIDB_CIDB-5GB' }));
  });

  it('blocks tender bids when no active contractor verification exists', async () => {
    const { submitBid } = await import('../tenderService');
    getDocsMock.mockResolvedValue({ docs: [] });

    await expect(submitBid('tender-1', {
      contractorId: 'contractor-1',
      contractorName: 'Build Co',
      totalAmount: 100000,
      lineItems: [],
      proposedTimeline: '10 weeks',
      proposedStartDate: '2026-07-01',
      methodology: 'Standard construction',
      qualifications: 'CIDB 5GB',
      attachments: [],
    })).rejects.toThrow('Active contractor verification is required');
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('awards tender and awarded bid', async () => {
    const { awardBid } = await import('../tenderService');

    await awardBid('tender-1', {
      id: 'bid-1',
      tenderPackageId: 'tender-1',
      contractorId: 'contractor-1',
      contractorName: 'Build Co',
      totalAmount: 100000,
      lineItems: [],
      proposedTimeline: '10 weeks',
      proposedStartDate: '2026-07-01',
      methodology: 'Standard construction',
      qualifications: 'CIDB 5GB',
      attachments: [],
      verificationId: 'contractor-1_contractor_CIDB_CIDB-5GB',
      status: 'submitted',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(updateDocMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ path: ['tender_packages', 'tender-1'] }), expect.objectContaining({ status: 'awarded', awardedBidId: 'bid-1', awardedContractorId: 'contractor-1' }));
    expect(updateDocMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ path: ['tender_packages', 'tender-1', 'bids', 'bid-1'] }), expect.objectContaining({ status: 'awarded' }));
  });

  it('reads and subscribes to tender bids', async () => {
    const unsubscribe = vi.fn();
    const callback = vi.fn();
    getDocsMock.mockResolvedValue({ docs: [{ id: 'bid-1', data: () => ({ contractorName: 'Build Co' }) }] });
    onSnapshotMock.mockImplementation((_ref: unknown, next: (snapshot: any) => void) => {
      next({ docs: [{ id: 'bid-2', data: () => ({ contractorName: 'Trade Co' }) }] });
      return unsubscribe;
    });
    const { getBidsForTender, subscribeToBids, getTendersByProject } = await import('../tenderService');

    await expect(getBidsForTender('tender-1')).resolves.toEqual([expect.objectContaining({ id: 'bid-1', contractorName: 'Build Co' })]);
    expect(subscribeToBids('tender-1', callback)).toBe(unsubscribe);
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'bid-2', contractorName: 'Trade Co' })]);
    await getTendersByProject('project-1');
    expect(whereMock).toHaveBeenCalledWith('projectId', '==', 'project-1');
  });
});
