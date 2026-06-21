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

describe('drawingChecklistService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path: path.flatMap(p => p.split('/')) }));
    docMock.mockImplementation((_db: unknown, ...path: string[]) => {
      const segments = path.flatMap(p => p.split('/'));
      return { type: 'doc', path: segments, id: segments[segments.length - 1] };
    });
    addDocMock.mockResolvedValue({ id: 'checklist-1' });
    updateDocMock.mockResolvedValue(undefined);
  });

  it('summarises and sorts drawing checklist items deterministically', async () => {
    const { sortDrawingChecklistItems, summariseDrawingChecklistItems } = await import('../drawingChecklistService');
    const items = [
      { id: 'old', projectId: 'project-1', title: 'Old', status: 'open', requiredForSubmission: true, linkedDrawingIds: ['A-100'], createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', projectId: 'project-1', title: 'New', status: 'complete', requiredForSubmission: true, linkedDrawingIds: ['A-100', 'S-200'], createdBy: 'user-1', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' },
      { id: 'progress', projectId: 'project-1', title: 'Progress', status: 'in_progress', requiredForSubmission: false, linkedDrawingIds: [], createdBy: 'user-1', createdAt: '2026-01-02T00:00:00.000Z' },
    ] as any[];

    expect(sortDrawingChecklistItems(items).map((item) => item.id)).toEqual(['new', 'progress', 'old']);
    expect(summariseDrawingChecklistItems(items as any)).toEqual({ total: 3, open: 1, inProgress: 1, complete: 1, requiredOpen: 1, linkedDrawings: 2 });
  });

  it('subscribes to the allowed project drawing_checklists subcollection without orderBy/index requirements', async () => {
    const unsubscribe = vi.fn();
    const callback = vi.fn();
    onSnapshotMock.mockImplementation((_ref: unknown, next: (snapshot: any) => void) => {
      next({ docs: [{ id: 'item-1', data: () => ({ projectId: 'project-1', title: 'Site plan', status: 'open', requiredForSubmission: true, linkedDrawingIds: [], createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z' }) }] });
      return unsubscribe;
    });
    const { subscribeToDrawingChecklists } = await import('../drawingChecklistService');

    expect(subscribeToDrawingChecklists('project-1', callback)).toBe(unsubscribe);
    expect(collectionMock).toHaveBeenCalledWith(expect.anything(), 'projects/project-1/drawing_checklists');
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'item-1', title: 'Site plan' })]);
  });

  it('creates project-scoped checklist items with sanitized drawing links and timestamps', async () => {
    const { createDrawingChecklistItem } = await import('../drawingChecklistService');

    await expect(createDrawingChecklistItem('project-1', {
      title: '  Confirm fire notes  ',
      discipline: 'fire',
      linkedDrawingIds: [' A-100 ', 'A-100', '', ' F-001 '],
      notes: '  Required before municipal submission ',
      createdBy: 'bep-1',
      createdByRole: 'bep',
    })).resolves.toBe('checklist-1');

    expect(addDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['projects', 'project-1', 'drawing_checklists'] }),
      expect.objectContaining({
        projectId: 'project-1',
        title: 'Confirm fire notes',
        discipline: 'fire',
        status: 'open',
        requiredForSubmission: true,
        linkedDrawingIds: ['A-100', 'F-001'],
        notes: 'Required before municipal submission',
        createdBy: 'bep-1',
        createdByRole: 'bep',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    );
  });

  it('updates only status and timestamps for existing checklist records', async () => {
    const { updateDrawingChecklistStatus } = await import('../drawingChecklistService');

    await updateDrawingChecklistStatus('project-1', 'item-1', 'complete');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['projects', 'project-1', 'drawing_checklists', 'item-1'] }),
      expect.objectContaining({ status: 'complete', updatedAt: expect.any(String), completedAt: expect.any(String) })
    );
  });
});
