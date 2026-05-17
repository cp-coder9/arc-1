import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });
const addDocMock = vi.mocked(firestore.addDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;

vi.mock('@/lib/firebase', () => ({
  db: { name: 'mock-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
  },
  handleFirestoreError: handleFirestoreErrorMock,
}));

describe('coordinationRegisterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    docMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'doc', path, id: path[path.length - 1] }));
    addDocMock.mockResolvedValue({ id: 'coordination-1' });
    updateDocMock.mockResolvedValue(undefined);
  });

  it('summarises and sorts coordination items deterministically', async () => {
    const { sortCoordinationItems, summariseCoordinationItems } = await import('../coordinationRegisterService');
    const now = new Date('2026-01-10T12:00:00.000Z').getTime();
    const items = [
      { id: 'closed', projectId: 'project-1', itemType: 'rfi', title: 'Closed', description: '', dependsOnIds: [], status: 'closed', createdBy: 'user-1', dueAt: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'blocked', projectId: 'project-1', itemType: 'dependency', title: 'Blocked', description: '', dependsOnIds: [], status: 'blocked', createdBy: 'user-1', dueAt: '2026-01-05', createdAt: '2026-01-03T00:00:00.000Z' },
      { id: 'open', projectId: 'project-1', itemType: 'deadline', title: 'Open', description: '', dependsOnIds: [], status: 'open', createdBy: 'user-1', dueAt: '2026-01-04', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'submitted', projectId: 'project-1', itemType: 'transmittal', title: 'Submitted', description: '', dependsOnIds: [], status: 'submitted', createdBy: 'user-1', dueAt: '2026-01-20', createdAt: '2026-01-04T00:00:00.000Z' },
    ] as any[];

    expect(sortCoordinationItems(items).map((item) => item.id)).toEqual(['blocked', 'open', 'submitted', 'closed']);
    expect(summariseCoordinationItems(items as any, now)).toEqual({ total: 4, open: 1, inProgress: 0, blocked: 1, submitted: 1, resolved: 0, closed: 1, overdue: 2 });
  });

  it('subscribes to project coordination_items without orderBy/index requirements', async () => {
    const unsubscribe = vi.fn();
    const callback = vi.fn();
    onSnapshotMock.mockImplementation((_ref: unknown, next: (snapshot: any) => void) => {
      next({ docs: [{ id: 'coordination-1', data: () => ({ projectId: 'project-1', itemType: 'rfi', title: 'Clarify slab edge', description: '', dependsOnIds: [], status: 'open', createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z' }) }] });
      return unsubscribe;
    });
    const { subscribeToCoordinationItems } = await import('../coordinationRegisterService');

    expect(subscribeToCoordinationItems('project-1', callback)).toBe(unsubscribe);
    expect(collectionMock).toHaveBeenCalledWith(expect.anything(), 'projects', 'project-1', 'coordination_items');
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'coordination-1', title: 'Clarify slab edge' })]);
  });

  it('creates sanitized project-scoped coordination items aligned to backend fields', async () => {
    const { createCoordinationItem } = await import('../coordinationRegisterService');

    await expect(createCoordinationItem('project-1', {
      jobId: 'job-1',
      itemType: 'transmittal',
      title: '  Issue fire markups  ',
      description: '  Send updated notes for review  ',
      discipline: 'fire',
      assigneeId: 'consultant-1',
      dueAt: '2026-01-15',
      dependsOnIds: [' A-100 ', 'A-100', '', ' FIRE-01 '],
      createdBy: 'bep-1',
      createdByRole: 'bep',
    })).resolves.toBe('coordination-1');

    expect(addDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['projects', 'project-1', 'coordination_items'] }),
      expect.objectContaining({
        projectId: 'project-1',
        jobId: 'job-1',
        itemType: 'transmittal',
        title: 'Issue fire markups',
        description: 'Send updated notes for review',
        discipline: 'fire',
        assigneeId: 'consultant-1',
        dueAt: '2026-01-15',
        dependsOnIds: ['A-100', 'FIRE-01'],
        status: 'open',
        createdBy: 'bep-1',
        createdByRole: 'bep',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    );
  });

  it('updates only status and updatedAt for existing coordination records', async () => {
    const { updateCoordinationItemStatus } = await import('../coordinationRegisterService');

    await updateCoordinationItemStatus('project-1', 'coordination-1', 'resolved');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['projects', 'project-1', 'coordination_items', 'coordination-1'] }),
      { status: 'resolved', updatedAt: expect.any(String) }
    );
  });
});
