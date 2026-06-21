/**
 * Programme Impact Service Tests
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });
const addDocMock = vi.mocked(firestore.addDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
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

describe('programmeImpactService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => {
      const segments = path.length === 1 && path[0].includes('/') ? path[0].split('/') : path;
      return { type: 'collection', path: segments };
    });
    docMock.mockImplementation((_dbOrRef: any, ...path: string[]) => {
      const segments = path.length === 1 && path[0].includes('/') ? path[0].split('/') : path;
      if (_dbOrRef?.type === 'collection') return { type: 'doc', path: [..._dbOrRef.path, 'generated-id'], id: 'generated-id' };
      return { type: 'doc', path: segments, id: segments[segments.length - 1] };
    });
    addDocMock.mockResolvedValue({ id: 'impact-new-001' });
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((f: string, d: string) => ({ field: f, direction: d }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('flags planner review when estimated days > 0', async () => {
    const { assessProgrammeImpact } = await import('../programmeImpactService');

    const id = await assessProgrammeImpact({
      projectId: 'proj-1',
      sourceObjectId: 'warn-1',
      sourceType: 'delay_warning',
      estimatedDays: 2,
      createdBy: 'user-1',
    });

    expect(id).toBe('impact-new-001');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requiresPlannerReview: true, estimatedDays: 2 }),
    );
  });

  it('does not flag planner review when days is 0', async () => {
    const { assessProgrammeImpact } = await import('../programmeImpactService');

    await assessProgrammeImpact({
      projectId: 'proj-1',
      sourceObjectId: 'warn-2',
      sourceType: 'delay_warning',
      estimatedDays: 0,
      createdBy: 'user-1',
    });

    expect(addDocMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ requiresPlannerReview: false, estimatedDays: 0 }),
    );
  });

  it('reviews programme impact with reviewer metadata', async () => {
    const { reviewProgrammeImpact } = await import('../programmeImpactService');

    await reviewProgrammeImpact('proj-1', 'impact-1', 'reviewer-1', 'Accepted: 2-day weather delay');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'impact-1' }),
      expect.objectContaining({
        reviewedBy: 'reviewer-1',
        reviewNotes: 'Accepted: 2-day weather delay',
      }),
    );
  });

  it('filters impacts requiring review', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        { id: 'i-1', data: () => ({ projectId: 'proj-1', sourceObjectId: 'w-1', sourceType: 'delay_warning', estimatedDays: 3, requiresPlannerReview: true, createdBy: 'u1', createdAt: '2026-01-01' }) },
        { id: 'i-2', data: () => ({ projectId: 'proj-1', sourceObjectId: 'w-2', sourceType: 'ncr', estimatedDays: 0, requiresPlannerReview: false, createdBy: 'u1', createdAt: '2026-01-02' }) },
        { id: 'i-3', data: () => ({ projectId: 'proj-1', sourceObjectId: 'w-3', sourceType: 'delay_warning', estimatedDays: 5, requiresPlannerReview: true, reviewedBy: 'r1', createdBy: 'u1', createdAt: '2026-01-03' }) },
      ],
    });

    const { getImpactsRequiringReview } = await import('../programmeImpactService');
    const pending = await getImpactsRequiringReview('proj-1');

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('i-1');
  });
});
