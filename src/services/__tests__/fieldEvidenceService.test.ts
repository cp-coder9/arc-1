/**
 * Field Evidence Service Tests
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

describe('fieldEvidenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => { const segments = path.length === 1 && path[0].includes('/') ? path[0].split('/') : path; return { type: 'collection', path: segments }; });
    docMock.mockImplementation((_dbOrRef: any, ...path: string[]) => {
      const segments = path.length === 1 && path[0].includes('/') ? path[0].split('/') : path;
      if (_dbOrRef?.type === 'collection') return { type: 'doc', path: [..._dbOrRef.path, segments[segments.length - 1]], id: segments[segments.length - 1] };
      return { type: 'doc', path: segments, id: segments[segments.length - 1] };
    });
    addDocMock.mockResolvedValue({ id: 'evidence-new-001' });
    orderByMock.mockImplementation((f: string, d: string) => ({ field: f, direction: d }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('captures evidence with required metadata', async () => {
    const { captureEvidence } = await import('../fieldEvidenceService');

    const id = await captureEvidence({
      projectId: 'proj-1',
      type: 'photo',
      title: 'Slab conflict photo',
      uri: 'architex://files/slab.jpg',
      location: 'Level 1 grid B3',
      gps: { lat: -26.1076, lng: 28.0567 },
      capturedBy: 'user-1',
      linkedObjectId: 'ncr-1',
    });

    expect(id).toBe('evidence-new-001');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'photo',
        title: 'Slab conflict photo',
        uri: 'architex://files/slab.jpg',
        location: 'Level 1 grid B3',
        gps: { lat: -26.1076, lng: 28.0567 },
        capturedBy: 'user-1',
        linkedObjectId: 'ncr-1',
        capturedAt: expect.any(String),
      }),
    );
  });

  it('filters evidence by linked object', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        { id: 'e-1', data: () => ({ projectId: 'proj-1', type: 'photo', title: 'Photo A', uri: 'uri://a', capturedBy: 'u1', capturedAt: '2026-01-01', linkedObjectId: 'obj-1' }) },
        { id: 'e-2', data: () => ({ projectId: 'proj-1', type: 'file', title: 'File B', uri: 'uri://b', capturedBy: 'u1', capturedAt: '2026-01-02', linkedObjectId: 'obj-2' }) },
        { id: 'e-3', data: () => ({ projectId: 'proj-1', type: 'photo', title: 'Photo C', uri: 'uri://c', capturedBy: 'u1', capturedAt: '2026-01-03', linkedObjectId: 'obj-1' }) },
      ],
    });

    const { getEvidenceForObject } = await import('../fieldEvidenceService');
    const linked = await getEvidenceForObject('proj-1', 'obj-1');

    expect(linked).toHaveLength(2);
    expect(linked.map((e) => e.title)).toEqual(['Photo A', 'Photo C']);
  });
});
