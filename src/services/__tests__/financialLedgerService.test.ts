import { vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const addDocMock = vi.mocked(firestore.addDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const limitMock = vi.mocked(firestore.limit) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;
const orderByMock = vi.mocked(firestore.orderBy) as any;
const queryMock = vi.mocked(firestore.query) as any;
const whereMock = vi.mocked(firestore.where) as any;

vi.mock('@/lib/firebase', () => ({ db: { name: 'mock-db' } }));

describe('financialLedgerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
    whereMock.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }));
    orderByMock.mockImplementation((field: string, direction?: string) => ({ field, direction }));
    limitMock.mockImplementation((count: number) => ({ count }));
    addDocMock.mockResolvedValue({ id: 'ledger-1' });
  });

  it('records transactions in Firestore ledger', async () => {
    const { recordTransaction } = await import('../financialLedgerService');
    const id = await recordTransaction({ projectId: 'project-1', jobId: 'job-1', type: 'escrow_deposit', amount: 1000, direction: 'credit', description: 'Deposit', payerId: 'client-1', payeeId: 'architect-1', createdAt: '2026-01-01T00:00:00.000Z' });

    expect(id).toBe('ledger-1');
    expect(addDocMock).toHaveBeenCalledWith(expect.objectContaining({ path: ['ledger'] }), expect.objectContaining({ projectId: 'project-1', amount: 1000 }));
  });

  it('queries project and user ledgers', async () => {
    getDocsMock.mockResolvedValue({ docs: [{ id: 'entry-1', data: () => ({ projectId: 'project-1', jobId: 'job-1', payerId: 'user-1', payeeId: 'user-2', createdAt: '2026-01-01T00:00:00.000Z' }) }] });
    const { getLedgerForProject, getLedgerForUser } = await import('../financialLedgerService');

    await expect(getLedgerForProject('project-1')).resolves.toEqual([expect.objectContaining({ id: 'entry-1', projectId: 'project-1' })]);
    await getLedgerForUser('user-1');
    expect(whereMock).toHaveBeenCalledWith('projectId', '==', 'project-1');
    expect(whereMock).toHaveBeenCalledWith('payerId', '==', 'user-1');
    expect(whereMock).toHaveBeenCalledWith('payeeId', '==', 'user-1');
  });

  it('summarises platform financials from ledger entries', async () => {
    getDocsMock.mockResolvedValue({ docs: [
      { id: 'fee', data: () => ({ type: 'platform_fee', amount: 50, createdAt: '2026-01-03T00:00:00.000Z' }) },
      { id: 'deposit', data: () => ({ type: 'escrow_deposit', amount: 1000, createdAt: '2026-01-02T00:00:00.000Z' }) },
      { id: 'release', data: () => ({ type: 'milestone_release', amount: 250, createdAt: '2026-01-01T00:00:00.000Z' }) },
      { id: 'refund', data: () => ({ type: 'refund', amount: 100, createdAt: '2026-01-01T00:00:00.000Z' }) },
    ] });
    const { getPlatformSummary } = await import('../financialLedgerService');

    await expect(getPlatformSummary()).resolves.toEqual({ totalRevenue: 50, totalEscrowHeld: 650, totalRefunded: 100, ledgerCount: 4 });
  });

  it('subscribes to project ledger updates', async () => {
    const unsubscribe = vi.fn();
    const callback = vi.fn();
    onSnapshotMock.mockImplementation((_query: unknown, next: (snapshot: any) => void) => {
      next({ docs: [{ id: 'entry-1', data: () => ({ projectId: 'project-1', createdAt: '2026-01-01T00:00:00.000Z' }) }] });
      return unsubscribe;
    });
    const { subscribeToLedger } = await import('../financialLedgerService');

    expect(subscribeToLedger('project-1', callback)).toBe(unsubscribe);
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'entry-1', projectId: 'project-1' })]);
  });
});
