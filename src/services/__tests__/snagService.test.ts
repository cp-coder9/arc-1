/**
 * Snag Service State Machine Tests
 *
 * Tests the Snag state machine:
 *   open → allocated → ready_for_reinspection → closed → (terminal)
 *   allocated → rejected
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });
const addDocMock = vi.mocked(firestore.addDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;
const orderByMock = vi.mocked(firestore.orderBy) as any;
const queryMock = vi.mocked(firestore.query) as any;
const runTransactionMock = vi.mocked(firestore.runTransaction) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;

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

describe('snagService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    docMock.mockImplementation((_dbOrRef: any, ...path: string[]) => {
      const segments = path.length === 1 && path[0].includes('/') ? path[0].split('/') : path;
      if (_dbOrRef?.type === 'collection') return { type: 'doc', path: [..._dbOrRef.path, segments[segments.length - 1]], id: segments[segments.length - 1] };
      return { type: 'doc', path: segments, id: segments[segments.length - 1] };
    });
    addDocMock.mockResolvedValue({ id: 'snag-new-001' });
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((field: string, direction: string) => ({ field, direction }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('creates snag with priority-based payment blocking and correct initial status', async () => {
    const { createSnag, snagBlocksPayment } = await import('../snagService');

    // Critical snag → allocated, blocks payment
    const critId = await createSnag({
      projectId: 'proj-1',
      location: 'Level 3 slab edge',
      description: 'Exposed rebar at slab edge',
      priority: 'critical',
      responsiblePartyId: 'sub-1',
      dueDate: '2026-06-20',
      createdBy: 'user-1',
    });
    expect(critId).toBe('snag-new-001');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'allocated', blocksPayment: true, priority: 'critical' }),
    );

    expect(snagBlocksPayment('critical')).toBe(true);
    expect(snagBlocksPayment('high')).toBe(true);
    expect(snagBlocksPayment('medium')).toBe(false);
    expect(snagBlocksPayment('low')).toBe(false);
  });

  it('validates snag state machine transitions', async () => {
    const { isValidSnagTransition } = await import('../snagService');

    expect(isValidSnagTransition('open', 'allocated')).toBe(true);
    expect(isValidSnagTransition('allocated', 'ready_for_reinspection')).toBe(true);
    expect(isValidSnagTransition('ready_for_reinspection', 'closed')).toBe(true);
    expect(isValidSnagTransition('allocated', 'rejected')).toBe(true);
    expect(isValidSnagTransition('rejected', 'open')).toBe(true);

    // Invalid
    expect(isValidSnagTransition('closed', 'open')).toBe(false);
    expect(isValidSnagTransition('open', 'closed')).toBe(false);
    expect(isValidSnagTransition('rejected', 'closed')).toBe(false);
  });

  it('marks snag ready for reinspection via transaction with validation', async () => {
    runTransactionMock.mockImplementation(async (_db: unknown, runner: (tx: any) => Promise<void>) => {
      const tx = {
        get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ status: 'allocated' }) }),
        update: vi.fn().mockResolvedValue(undefined),
      };
      await runner(tx);
      expect(tx.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'snag-1' }),
        expect.objectContaining({ status: 'ready_for_reinspection' }),
      );
    });

    const { markSnagReadyForReinspection } = await import('../snagService');
    await markSnagReadyForReinspection('proj-1', 'snag-1');
  });

  it('closes snag after reinspection, clearing payment blocker', async () => {
    runTransactionMock.mockImplementation(async (_db: unknown, runner: (tx: any) => Promise<void>) => {
      const tx = {
        get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ status: 'ready_for_reinspection', blocksPayment: true }) }),
        update: vi.fn().mockResolvedValue(undefined),
      };
      await runner(tx);
      expect(tx.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'snag-1' }),
        expect.objectContaining({ status: 'closed', blocksPayment: false }),
      );
    });

    const { closeSnagAfterReinspection } = await import('../snagService');
    await closeSnagAfterReinspection('proj-1', 'snag-1', 'inspector-1');
  });

  it('rejects snag with reason', async () => {
    const { rejectSnag } = await import('../snagService');
    await rejectSnag('proj-1', 'snag-1', 'Not valid snag item');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'snag-1' }),
      expect.objectContaining({ status: 'rejected', rejectedReason: 'Not valid snag item' }),
    );
  });
});
