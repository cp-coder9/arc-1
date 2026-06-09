/**
 * NCR Service State Machine Tests
 *
 * Tests the Non-Conformance Report state machine:
 *   open → corrective_action_submitted → verified_closed → (terminal)
 *   open → rejected → open (reopen)
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

describe('ncrService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    docMock.mockImplementation((_dbOrRef: any, ...path: string[]) => {
      if (_dbOrRef?.type === 'collection') return { type: 'doc', path: [..._dbOrRef.path, 'generated-ncr-id'], id: 'generated-ncr-id' };
      return { type: 'doc', path, id: path[path.length - 1] };
    });
    addDocMock.mockResolvedValue({ id: 'ncr-new-001' });
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((field: string, direction: string) => ({ field, direction }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('creates NCR with severity-based payment blocking (high/critical only)', async () => {
    const { createNcr, ncrBlocksPayment } = await import('../ncrService');

    // High severity → blocks payment
    const highId = await createNcr({
      projectId: 'proj-1',
      title: 'Unapproved beam chase',
      severity: 'high',
      responsiblePartyId: 'sub-1',
      createdBy: 'user-1',
    });
    expect(highId).toBe('ncr-new-001');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'open', blocksPayment: true, severity: 'high' }),
    );

    // Low severity → does not block payment
    await createNcr({
      projectId: 'proj-1',
      title: 'Minor finishing defect',
      severity: 'low',
      responsiblePartyId: 'sub-2',
      createdBy: 'user-1',
    });
    expect(addDocMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'open', blocksPayment: false, severity: 'low' }),
    );

    expect(ncrBlocksPayment('critical')).toBe(true);
    expect(ncrBlocksPayment('high')).toBe(true);
    expect(ncrBlocksPayment('medium')).toBe(false);
    expect(ncrBlocksPayment('low')).toBe(false);
  });

  it('validates state machine transitions', async () => {
    const { isValidNcrTransition } = await import('../ncrService');

    // Valid transitions
    expect(isValidNcrTransition('open', 'corrective_action_submitted')).toBe(true);
    expect(isValidNcrTransition('open', 'rejected')).toBe(true);
    expect(isValidNcrTransition('corrective_action_submitted', 'verified_closed')).toBe(true);
    expect(isValidNcrTransition('corrective_action_submitted', 'open')).toBe(true);
    expect(isValidNcrTransition('rejected', 'open')).toBe(true);

    // Invalid transitions
    expect(isValidNcrTransition('open', 'verified_closed')).toBe(false);
    expect(isValidNcrTransition('verified_closed', 'open')).toBe(false);
    expect(isValidNcrTransition('corrective_action_submitted', 'open')).toBe(true);
    expect(isValidNcrTransition('rejected', 'corrective_action_submitted')).toBe(false);
  });

  it('submits corrective action via transaction with transition validation', async () => {
    runTransactionMock.mockImplementation(async (_db: unknown, runner: (tx: any) => Promise<void>) => {
      const tx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: 'open', projectId: 'proj-1' }),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      };
      await runner(tx);
      expect(tx.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ncr-1' }),
        expect.objectContaining({ correctiveAction: 'Fixed', status: 'corrective_action_submitted' }),
      );
    });

    const { submitCorrectiveAction } = await import('../ncrService');
    await submitCorrectiveAction('proj-1', 'ncr-1', 'Fixed');
  });

  it('rejects NCR when corrective action is insufficient', async () => {
    const { rejectNcr } = await import('../ncrService');
    await rejectNcr('proj-1', 'ncr-1', 'Insufficient evidence');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ncr-1' }),
      expect.objectContaining({ status: 'rejected', rejectedReason: 'Insufficient evidence' }),
    );
  });

  it('verifies NCR closed and clears payment blocker', async () => {
    runTransactionMock.mockImplementation(async (_db: unknown, runner: (tx: any) => Promise<void>) => {
      const tx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: 'corrective_action_submitted', blocksPayment: true }),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      };
      await runner(tx);
      expect(tx.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ncr-1' }),
        expect.objectContaining({ status: 'verified_closed', blocksPayment: false }),
      );
    });

    const { verifyNcrClosed } = await import('../ncrService');
    await verifyNcrClosed('proj-1', 'ncr-1', 'verifier-1');
  });

  it('subscribes to NCRs and returns unsubscribe', async () => {
    const unsubscribe = vi.fn();
    const callback = vi.fn();
    onSnapshotMock.mockImplementation((_q: unknown, next: (snap: any) => void) => {
      next({ docs: [{ id: 'ncr-1', data: () => ({ projectId: 'proj-1', title: 'Test NCR', status: 'open', severity: 'high' }) }] });
      return unsubscribe;
    });

    const { subscribeToNcrs } = await import('../ncrService');
    expect(subscribeToNcrs('proj-1', callback)).toBe(unsubscribe);
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'ncr-1', severity: 'high' })]);
  });
});
