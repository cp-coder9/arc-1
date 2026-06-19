/**
 * Payment Blocker Service Tests
 *
 * Tests blocker creation, lifecycle, and derivation from field items.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });
const addDocMock = vi.mocked(firestore.addDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;
const orderByMock = vi.mocked(firestore.orderBy) as any;
const queryMock = vi.mocked(firestore.query) as any;

vi.mock('@/lib/firebase', () => ({
  db: { name: 'mock-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: handleFirestoreErrorMock,
}));

describe('paymentBlockerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path: path.flatMap(p => p.split('/')) }));
    docMock.mockImplementation((_dbOrRef: any, ...path: string[]) => {
      if (_dbOrRef?.type === 'collection') {
        const segments = _dbOrRef.path.flatMap((p: string) => p.split('/'));
        return { type: 'doc', path: [...segments, 'generated-id'], id: 'generated-id' };
      }
      const segments = path.flatMap(p => p.split('/'));
      return { type: 'doc', path: segments, id: segments[segments.length - 1] };
    });
    addDocMock.mockResolvedValue({ id: 'blocker-new-001' });
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((f: string, d: string) => ({ field: f, direction: d }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('creates payment blocker with active status', async () => {
    const { createPaymentBlocker } = await import('../paymentBlockerService');

    const id = await createPaymentBlocker({
      projectId: 'proj-1',
      sourceObjectId: 'ncr-1',
      sourceType: 'ncr',
      reason: 'Unresolved NCR: beam chase',
      severity: 'high',
      createdBy: 'user-1',
    });

    expect(id).toBe('blocker-new-001');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'active', sourceType: 'ncr', severity: 'high' }),
    );
  });

  it('clears payment blocker', async () => {
    const { clearPaymentBlocker } = await import('../paymentBlockerService');

    await clearPaymentBlocker('proj-1', 'blocker-1', 'admin-1');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'blocker-1' }),
      expect.objectContaining({ status: 'cleared', clearedBy: 'admin-1' }),
    );
  });

  it('derives blockers from field-control items that block payment', async () => {
    const { blockersFromFieldItems } = await import('../paymentBlockerService');

    const ncrWithBlocker = {
      id: 'ncr-1',
      title: 'High severity NCR',
      severity: 'high',
      responsiblePartyId: 'sub-1',
      blocksPayment: true,
      projectId: 'proj-1',
    } as any;

    const ncrWithoutBlocker = {
      id: 'ncr-2',
      title: 'Low severity NCR',
      severity: 'low',
      responsiblePartyId: 'sub-2',
      blocksPayment: false,
      projectId: 'proj-1',
    } as any;

    const snagWithBlocker = {
      id: 'snag-1',
      description: 'Critical snag',
      priority: 'critical',
      location: 'Level 3',
      blocksPayment: true,
      projectId: 'proj-1',
    } as any;

    const blockers = blockersFromFieldItems(
      [ncrWithBlocker, ncrWithoutBlocker, snagWithBlocker],
      'proj-1',
      'user-1',
    );

    expect(blockers).toHaveLength(2);
    expect(blockers[0].sourceType).toBe('ncr');
    expect(blockers[0].status).toBe('active');
    expect(blockers[1].sourceType).toBe('snag');
    expect(blockers.every((b: any) => b.projectId === 'proj-1')).toBe(true);
  });
});
