import { vi } from 'vitest';
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

describe('constructionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    docMock.mockImplementation((_dbOrCollection: any, ...path: string[]) => ({ type: 'doc', path, id: path[path.length - 1] || 'generated-id' }));
    addDocMock.mockResolvedValue({ id: 'new-doc-id' });
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((field: string, direction: string) => ({ field, direction }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('creates gantt tasks with timestamps and clamped progress', async () => {
    const { createGanttTask } = await import('../constructionService');

    const id = await createGanttTask({
      projectId: 'project-1',
      title: 'Foundations',
      startDate: '2026-06-01',
      endDate: '2026-06-15',
      progress: 150,
      phase: 'Foundation',
      status: 'in_progress',
    });

    expect(id).toBe('new-doc-id');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['projects', 'project-1', 'gantt_tasks'] }),
      expect.objectContaining({ progress: 100, dependsOn: [], createdAt: expect.any(String), updatedAt: expect.any(String) })
    );
  });

  it('updates gantt tasks by project subcollection document', async () => {
    const { updateGanttTask } = await import('../constructionService');

    await updateGanttTask('task-1', { projectId: 'project-1', progress: -5, status: 'delayed' });

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['projects', 'project-1', 'gantt_tasks', 'task-1'] }),
      expect.objectContaining({ progress: 0, status: 'delayed', updatedAt: expect.any(String) })
    );
  });

  it('subscribes to site logs with reverse chronological ordering and returns unsubscribe', async () => {
    const unsubscribe = vi.fn();
    const callback = vi.fn();
    onSnapshotMock.mockImplementation((_query: unknown, next: (snapshot: any) => void) => {
      next({ docs: [{ id: 'log-1', data: () => ({ projectId: 'project-1', date: '2026-06-10' }) }] });
      return unsubscribe;
    });
    const { subscribeToSiteLogs } = await import('../constructionService');

    expect(subscribeToSiteLogs('project-1', callback)).toBe(unsubscribe);
    expect(orderByMock).toHaveBeenCalledWith('date', 'desc');
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'log-1', projectId: 'project-1' })]);
  });

  it('creates RFIs with transaction-backed sequential numbering', async () => {
    docMock.mockImplementation((dbOrCollection: any, ...path: string[]) => {
      if (dbOrCollection?.type === 'collection') return { type: 'doc', path: [...dbOrCollection.path, 'generated-rfi-id'], id: 'generated-rfi-id' };
      return { type: 'doc', path, id: path[path.length - 1] };
    });
    runTransactionMock.mockImplementation(async (_db: unknown, runner: (tx: any) => Promise<void>) => {
      const tx = {
        get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ lastNumber: 7 }) }),
        set: vi.fn(),
      };
      await runner(tx);
      expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ id: 'generated-rfi-id' }), expect.objectContaining({ number: 8, status: 'open' }));
      expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ path: ['projects', 'project-1', '_meta', 'rfi_counter'] }), expect.objectContaining({ lastNumber: 8 }), { merge: true });
    });
    const { createRFI } = await import('../constructionService');

    const id = await createRFI({
      projectId: 'project-1',
      subject: 'Beam detail',
      question: 'Confirm beam size.',
      attachments: [],
      requestedBy: 'contractor-1',
      assignedTo: 'architect-1',
      priority: 'high',
      dueDate: '2026-06-20',
    });

    expect(id).toBe('generated-rfi-id');
  });

  it('responds to and closes RFIs with timestamps', async () => {
    const { respondToRFI, closeRFI } = await import('../constructionService');

    await respondToRFI('project-1', 'rfi-1', 'Use detail S-204.', 'engineer-1');
    await closeRFI('project-1', 'rfi-1');

    expect(updateDocMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: ['projects', 'project-1', 'rfis', 'rfi-1'] }),
      expect.objectContaining({ response: 'Use detail S-204.', respondedBy: 'engineer-1', status: 'responded', updatedAt: expect.any(String) })
    );
    expect(updateDocMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: ['projects', 'project-1', 'rfis', 'rfi-1'] }),
      expect.objectContaining({ status: 'closed', updatedAt: expect.any(String) })
    );
  });

  it('normalizes overdue open RFIs on read', async () => {
    getDocsMock.mockResolvedValue({
      docs: [{ id: 'rfi-1', data: () => ({ projectId: 'project-1', number: 1, status: 'open', dueDate: '2000-01-01' }) }],
    });
    const { getRFIs } = await import('../constructionService');

    await expect(getRFIs('project-1')).resolves.toEqual([expect.objectContaining({ id: 'rfi-1', status: 'overdue' })]);
  });
});
