/**
 * Delay Warning Service State Machine Tests
 *
 * Tests the delay early warning state machine:
 *   recorded → notice_required → under_review → closed
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

describe('delayWarningService', () => {
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
    addDocMock.mockResolvedValue({ id: 'warn-new-001' });
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((f: string, d: string) => ({ field: f, direction: d }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('creates warning with notice_required when impact > 0, recorded otherwise', async () => {
    const { createDelayEarlyWarning } = await import('../delayWarningService');

    // Has impact → notice_required
    const wId = await createDelayEarlyWarning({
      projectId: 'proj-1',
      cause: 'weather',
      description: 'Rain and coordination hold affecting brickwork',
      noticeDeadline: '2026-06-10',
      likelyProgrammeImpactDays: 2,
      createdBy: 'user-1',
    });
    expect(wId).toBe('warn-new-001');
    expect(addDocMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'notice_required', likelyProgrammeImpactDays: 2 }),
    );

    // No impact → recorded
    await createDelayEarlyWarning({
      projectId: 'proj-1',
      cause: 'unknown',
      description: 'No measurable impact',
      noticeDeadline: '2026-06-10',
      likelyProgrammeImpactDays: 0,
      createdBy: 'user-1',
    });
    expect(addDocMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'recorded', likelyProgrammeImpactDays: 0 }),
    );
  });

  it('validates warning state machine transitions', async () => {
    const { isValidWarningTransition } = await import('../delayWarningService');

    expect(isValidWarningTransition('recorded', 'notice_required')).toBe(true);
    expect(isValidWarningTransition('notice_required', 'under_review')).toBe(true);
    expect(isValidWarningTransition('under_review', 'closed')).toBe(true);
    expect(isValidWarningTransition('recorded', 'closed')).toBe(true);
    expect(isValidWarningTransition('notice_required', 'closed')).toBe(true);

    // Invalid
    expect(isValidWarningTransition('closed', 'recorded')).toBe(false);
    expect(isValidWarningTransition('recorded', 'under_review')).toBe(false);
  });

  it('escalates to notice and submits for review', async () => {
    const { escalateToNotice, submitForReview } = await import('../delayWarningService');

    await escalateToNotice('proj-1', 'warn-1');
    expect(updateDocMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'warn-1' }),
      expect.objectContaining({ status: 'notice_required' }),
    );

    await submitForReview('proj-1', 'warn-1');
    expect(updateDocMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'warn-1' }),
      expect.objectContaining({ status: 'under_review' }),
    );
  });

  it('closes warning with reviewer metadata', async () => {
    const { closeWarning } = await import('../delayWarningService');

    await closeWarning('proj-1', 'warn-1', 'reviewer-1', 'Accepted as weather delay');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'warn-1' }),
      expect.objectContaining({
        status: 'closed',
        reviewedBy: 'reviewer-1',
        reviewNotes: 'Accepted as weather delay',
      }),
    );
  });

  it('filters active warnings (non-closed)', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        { id: 'w-1', data: () => ({ projectId: 'proj-1', status: 'notice_required', cause: 'weather', description: 'Rain', likelyProgrammeImpactDays: 2, createdBy: 'u1', createdAt: '2026-01-01', noticeDeadline: '2026-01-10' }) },
        { id: 'w-2', data: () => ({ projectId: 'proj-1', status: 'closed', cause: 'labour', description: 'Strike', likelyProgrammeImpactDays: 3, createdBy: 'u1', createdAt: '2026-01-02', noticeDeadline: '2026-01-10' }) },
      ],
    });

    const { getActiveWarnings } = await import('../delayWarningService');
    const active = await getActiveWarnings('proj-1');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('w-1');
  });
});
