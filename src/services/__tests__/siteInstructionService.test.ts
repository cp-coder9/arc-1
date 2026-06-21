/**
 * Site Instruction Service State Machine Tests
 *
 * Tests the instruction state machine:
 *   draft → issued → acknowledged → (terminal)
 *   issued → superseded
 *   acknowledged → superseded
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

describe('siteInstructionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    docMock.mockImplementation((_dbOrRef: any, ...path: string[]) => {
      const segments = path.length === 1 && path[0].includes('/') ? path[0].split('/') : path;
      if (_dbOrRef?.type === 'collection') return { type: 'doc', path: [..._dbOrRef.path, segments[segments.length - 1]], id: segments[segments.length - 1] };
      return { type: 'doc', path: segments, id: segments[segments.length - 1] };
    });
    addDocMock.mockResolvedValue({ id: 'instr-new-001' });
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((field: string, direction: string) => ({ field, direction }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('issues instruction as "issued" for authorised roles, "draft" for others', async () => {
    const { issueSiteInstruction, isAuthorisedRole } = await import('../siteInstructionService');

    expect(isAuthorisedRole('architect')).toBe(true);
    expect(isAuthorisedRole('admin')).toBe(true);
    expect(isAuthorisedRole('contractor')).toBe(false);
    expect(isAuthorisedRole('subcontractor')).toBe(false);
    expect(isAuthorisedRole('supplier')).toBe(false);

    // Authorised → issued
    const issuedId = await issueSiteInstruction({
      projectId: 'proj-1',
      title: 'Reroute conduit',
      instruction: 'Proceed with reroute subject to engineer confirmation.',
      issuedBy: 'arch-1',
      issuedByRole: 'architect',
      costImpact: 'possible',
      timeImpact: 'possible',
    });
    expect(issuedId).toBe('instr-new-001');
    expect(addDocMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ authorised: true, status: 'issued' }),
    );

    // Non-authorised → draft
    await issueSiteInstruction({
      projectId: 'proj-1',
      title: 'Site instruction draft',
      instruction: 'Pending authorisation.',
      issuedBy: 'contractor-1',
      issuedByRole: 'contractor',
      costImpact: 'none',
      timeImpact: 'none',
    });
    expect(addDocMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ authorised: false, status: 'draft' }),
    );
  });

  it('validates instruction state machine transitions', async () => {
    const { isValidInstructionTransition } = await import('../siteInstructionService');

    expect(isValidInstructionTransition('draft', 'issued')).toBe(true);
    expect(isValidInstructionTransition('issued', 'acknowledged')).toBe(true);
    expect(isValidInstructionTransition('issued', 'superseded')).toBe(true);
    expect(isValidInstructionTransition('acknowledged', 'superseded')).toBe(true);

    // Invalid
    expect(isValidInstructionTransition('draft', 'acknowledged')).toBe(false);
    expect(isValidInstructionTransition('acknowledged', 'issued')).toBe(false);
    expect(isValidInstructionTransition('superseded', 'issued')).toBe(false);
  });

  it('authorises a draft instruction via transaction', async () => {
    runTransactionMock.mockImplementation(async (_db: unknown, runner: (tx: any) => Promise<void>) => {
      const tx = {
        get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ authorised: false, status: 'draft' }) }),
        update: vi.fn().mockResolvedValue(undefined),
      };
      await runner(tx);
      expect(tx.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'instr-1' }),
        expect.objectContaining({ authorised: true, status: 'issued' }),
      );
    });

    const { authoriseInstruction } = await import('../siteInstructionService');
    await authoriseInstruction('proj-1', 'instr-1', 'principal-agent-1');
  });

  it('acknowledges an authorised instruction via transaction', async () => {
    runTransactionMock.mockImplementation(async (_db: unknown, runner: (tx: any) => Promise<void>) => {
      const tx = {
        get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ authorised: true, status: 'issued' }) }),
        update: vi.fn().mockResolvedValue(undefined),
      };
      await runner(tx);
      expect(tx.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'instr-1' }),
        expect.objectContaining({ status: 'acknowledged' }),
      );
    });

    const { acknowledgeInstruction } = await import('../siteInstructionService');
    await acknowledgeInstruction('proj-1', 'instr-1', 'contractor-1');
  });

  it('supersedes an instruction', async () => {
    const { supersedeInstruction } = await import('../siteInstructionService');
    await supersedeInstruction('proj-1', 'instr-1', 'instr-2-new');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'instr-1' }),
      expect.objectContaining({ status: 'superseded', supersededById: 'instr-2-new' }),
    );
  });
});
