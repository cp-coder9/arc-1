/**
 * Daily Log Service Tests
 *
 * Tests the enhanced daily log with rich field data (labour, plant,
 * deliveries, visitors, safety/delay notes, evidence linking).
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

describe('dailyLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    docMock.mockImplementation((_dbOrRef: any, ...path: string[]) => {
      if (_dbOrRef?.type === 'collection') return { type: 'doc', path: [..._dbOrRef.path, 'generated-id'], id: 'generated-id' };
      return { type: 'doc', path, id: path[path.length - 1] };
    });
    addDocMock.mockResolvedValue({ id: 'log-new-001' });
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((f: string, d: string) => ({ field: f, direction: d }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));
  });

  it('creates rich site log with labour, plant, deliveries, visitors, safety/delay notes', async () => {
    const { createRichSiteLog } = await import('../dailyLogService');

    const id = await createRichSiteLog({
      projectId: 'proj-1',
      date: '2026-06-09',
      weather: 'clear_morning_rain_afternoon',
      weatherDetail: 'Clear morning, light rain afternoon',
      temperature: 28,
      workDescription: 'Brickwork and services first fix',
      labourOnSite: { main_contractor: 12, brickwork_subcontractor: 6 },
      plantOnSite: ['mobile crane', 'concrete mixer'],
      deliveries: ['face bricks', 'electrical conduit'],
      visitors: ['architect', 'client representative'],
      safetyNotes: ['Toolbox talk completed'],
      delayNotes: ['Rain affected afternoon brickwork'],
      evidenceIds: ['ev-1', 'ev-2'],
      createdBy: 'user-1',
    });

    expect(id).toBe('log-new-001');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        labourOnSite: { main_contractor: 12, brickwork_subcontractor: 6 },
        labourCount: 18,
        plantOnSite: ['mobile crane', 'concrete mixer'],
        deliveries: ['face bricks', 'electrical conduit'],
        visitors: ['architect', 'client representative'],
        safetyNotes: ['Toolbox talk completed'],
        delayNotes: ['Rain affected afternoon brickwork'],
        evidenceIds: ['ev-1', 'ev-2'],
        status: 'submitted',
      }),
    );
  });

  it('computes site log coverage statistics correctly', async () => {
    const { getSiteLogCoverage } = await import('../dailyLogService');

    const logs = [
      { date: '2026-06-01', issues: ['Issue A'] },
      { date: '2026-06-02', issues: [] },
      { date: '2026-06-03', issues: ['Issue B', 'Issue C'] },
    ] as any;

    const workingDays = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];

    const coverage = getSiteLogCoverage(logs, workingDays);

    expect(coverage.expectedDays).toBe(5);
    expect(coverage.loggedDays).toBe(3);
    expect(coverage.missingDays).toEqual(['2026-06-04', '2026-06-05']);
    expect(coverage.coveragePercent).toBe(60);
    expect(coverage.issueCount).toBe(3);
  });

  it('computes 100% coverage when all days are logged', async () => {
    const { getSiteLogCoverage } = await import('../dailyLogService');

    const logs = [
      { date: '2026-06-01', issues: [] },
      { date: '2026-06-02', issues: [] },
    ] as any;

    const workingDays = ['2026-06-01', '2026-06-02'];

    const coverage = getSiteLogCoverage(logs, workingDays);
    expect(coverage.coveragePercent).toBe(100);
    expect(coverage.missingDays).toEqual([]);
  });
});
