import { vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });
const addDocMock = vi.mocked(firestore.addDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocMock = vi.mocked(firestore.getDoc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const setDocMock = vi.mocked(firestore.setDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const writeBatchMock = vi.mocked(firestore.writeBatch) as any;
const runTransactionMock = vi.mocked(firestore.runTransaction) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;

vi.mock('@/lib/firebase', () => ({
  db: {},
  OperationType: { CREATE: 'create', UPDATE: 'update', GET: 'get' },
  handleFirestoreError: handleFirestoreErrorMock,
}));

describe('tenderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }));
    docMock.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/'), id: segments.at(-1) }));
    addDocMock.mockResolvedValue({ id: 'new-id' });
    updateDocMock.mockResolvedValue(undefined);
    getDocMock.mockResolvedValue({ exists: () => true, id: 'tender-1', data: () => ({ status: 'published', contractorId: 'contractor-1' }) });
    getDocsMock.mockResolvedValue({ docs: [{ id: 'tender-1', data: () => ({ projectId: 'project-1', createdAt: '2026-01-01T00:00:00.000Z' }) }] });
    setDocMock?.mockResolvedValue?.(undefined);
    writeBatchMock.mockReturnValue({ update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (transaction: any) => Promise<void>) => callback({ get: getDocMock, set: vi.fn(), update: vi.fn() }));
  });

  it('creates tender packages as drafts by default', async () => {
    const { createTenderPackage } = await import('../tenderService');
    const id = await createTenderPackage({ projectId: 'project-1', jobId: 'job-1', title: 'Tender', description: 'Desc', scope: ['Works'], documents: [], deadline: '2026-02-01', requiredDisciplines: ['nhbrc'], createdBy: 'arch-1' });
    expect(id).toBe('new-id');
    expect(addDocMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages' }), expect.objectContaining({ status: 'draft', title: 'Tender' }));
  });

  it('publishes and closes tenders', async () => {
    const { publishTender, closeTender } = await import('../tenderService');
    await publishTender('tender-1');
    await closeTender('tender-1');
    expect(updateDocMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ path: 'tender_packages/tender-1' }), expect.objectContaining({ status: 'published' }));
    expect(updateDocMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ path: 'tender_packages/tender-1' }), expect.objectContaining({ status: 'closed' }));
  });

  it('submits bids with deterministic contractor ids under published tenders and calculates totals', async () => {
    const transaction = { get: vi.fn(), set: vi.fn(), update: vi.fn() };
    transaction.get
      .mockResolvedValueOnce({ exists: () => true, id: 'tender-1', data: () => ({ status: 'published' }) })
      .mockResolvedValueOnce({ exists: () => false });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<void>) => callback(transaction));
    const { submitBid } = await import('../tenderService');
    const id = await submitBid('tender-1', { contractorId: 'contractor-1', contractorName: 'Builder', lineItems: [{ description: 'Walling', quantity: 2, unitPrice: 50, total: 0 }], proposedTimeline: '2 weeks', proposedStartDate: '2026-02-10', methodology: 'Build', qualifications: 'NHBRC', attachments: [] });
    expect(id).toBe('contractor_contractor-1');
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages/tender-1/bids/contractor_contractor-1' }), expect.objectContaining({ totalAmount: 100, status: 'submitted' }));
    expect(addDocMock).not.toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages/tender-1/bids' }), expect.anything());
  });

  it('rejects duplicate active bids for a contractor and tender', async () => {
    const transaction = { get: vi.fn(), set: vi.fn(), update: vi.fn() };
    transaction.get
      .mockResolvedValueOnce({ exists: () => true, id: 'tender-1', data: () => ({ status: 'published' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'contractor_contractor-1', data: () => ({ status: 'submitted' }) });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<void>) => callback(transaction));
    const { submitBid } = await import('../tenderService');
    await expect(submitBid('tender-1', { contractorId: 'contractor-1', contractorName: 'Builder', lineItems: [{ description: 'Walling', quantity: 2, unitPrice: 50, total: 0 }], proposedTimeline: '2 weeks', proposedStartDate: '2026-02-10', methodology: 'Build', qualifications: 'NHBRC', attachments: [] })).rejects.toThrow('You already have an active bid for this tender');
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('awards eligible bids transactionally and rejects competing submitted or shortlisted bids', async () => {
    const transaction = { get: vi.fn(), update: vi.fn() };
    transaction.get
      .mockResolvedValueOnce({ exists: () => true, id: 'tender-1', data: () => ({ status: 'evaluating' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'bid-1', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-1', status: 'submitted' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'bid-1', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-1', status: 'submitted' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'bid-2', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-2', status: 'shortlisted' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'bid-3', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-3', status: 'withdrawn' }) });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<void>) => callback(transaction));
    getDocsMock.mockResolvedValue({ docs: [
      { id: 'bid-1', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-1', status: 'submitted' }) },
      { id: 'bid-2', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-2', status: 'shortlisted' }) },
      { id: 'bid-3', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-3', status: 'withdrawn' }) },
    ] });
    const { awardBid } = await import('../tenderService');
    await awardBid('tender-1', 'bid-1');
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages/tender-1' }), expect.objectContaining({ status: 'awarded', awardedBidId: 'bid-1', awardedContractorId: 'contractor-1' }));
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages/tender-1/bids/bid-1' }), expect.objectContaining({ status: 'awarded' }));
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages/tender-1/bids/bid-2' }), expect.objectContaining({ status: 'rejected' }));
    expect(transaction.update).not.toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages/tender-1/bids/bid-3' }), expect.anything());
  });

  it.each(['awarded', 'cancelled'])('rejects award when tender is already %s', async (status) => {
    const transaction = { get: vi.fn(), update: vi.fn() };
    transaction.get
      .mockResolvedValueOnce({ exists: () => true, id: 'tender-1', data: () => ({ status }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'bid-1', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-1', status: 'submitted' }) });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<void>) => callback(transaction));
    const { awardBid } = await import('../tenderService');
    await expect(awardBid('tender-1', 'bid-1')).rejects.toThrow(`Tender tender-1 is already ${status}`);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it.each(['withdrawn', 'rejected', 'awarded'])('rejects award for %s bids', async (status) => {
    const transaction = { get: vi.fn(), update: vi.fn() };
    transaction.get
      .mockResolvedValueOnce({ exists: () => true, id: 'tender-1', data: () => ({ status: 'evaluating' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'bid-1', data: () => ({ tenderPackageId: 'tender-1', contractorId: 'contractor-1', status }) });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<void>) => callback(transaction));
    const { awardBid } = await import('../tenderService');
    await expect(awardBid('tender-1', 'bid-1')).rejects.toThrow('Bid bid-1 is not eligible for award');
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('rejects bid/tender mismatches', async () => {
    const transaction = { get: vi.fn(), update: vi.fn() };
    transaction.get
      .mockResolvedValueOnce({ exists: () => true, id: 'tender-1', data: () => ({ status: 'evaluating' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'bid-1', data: () => ({ tenderPackageId: 'other-tender', contractorId: 'contractor-1', status: 'submitted' }) });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<void>) => callback(transaction));
    const { awardBid } = await import('../tenderService');
    await expect(awardBid('tender-1', 'bid-1')).rejects.toThrow('Bid bid-1 does not belong to tender tender-1');
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('subscribes to bid snapshots', async () => {
    const unsubscribe = vi.fn();
    onSnapshotMock.mockImplementation((_ref: unknown, next: (snapshot: any) => void) => { next({ docs: [{ id: 'bid-1', data: () => ({ contractorId: 'contractor-1' }) }] }); return unsubscribe; });
    const callback = vi.fn();
    const { subscribeToBids } = await import('../tenderService');
    expect(subscribeToBids('tender-1', callback)).toBe(unsubscribe);
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'bid-1' })]);
  });
});
