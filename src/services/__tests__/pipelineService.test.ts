import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  handleFirestoreError: handleFirestoreErrorMock,
}));

const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocMock = vi.mocked(firestore.getDoc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const setDocMock = vi.mocked(firestore.setDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const writeBatchMock = vi.mocked(firestore.writeBatch) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;
const queryMock = vi.mocked(firestore.query) as any;
const whereMock = vi.mocked(firestore.where) as any;
const orderByMock = vi.mocked(firestore.orderBy) as any;

const snap = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

describe('pipelineService', () => {
  let batchSet: ReturnType<typeof vi.fn>;
  let batchUpdate: ReturnType<typeof vi.fn>;
  let batchDelete: ReturnType<typeof vi.fn>;
  let batchCommit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }));
    docMock.mockImplementation((dbOrCollection: { path?: string } | unknown, ...segments: string[]) => {
      if (segments.length === 0) {
        const path = typeof dbOrCollection === 'object' && dbOrCollection && 'path' in dbOrCollection ? String((dbOrCollection as { path?: string }).path) : 'pipelines';
        return { path, id: 'generated-id' };
      }
      return { path: segments.join('/'), id: segments[segments.length - 1] };
    });
    queryMock.mockImplementation((base: unknown, ...constraints: unknown[]) => ({ base, constraints }));
    whereMock.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }));
    orderByMock.mockImplementation((field: string, dir: string) => ({ field, dir }));
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockResolvedValue(undefined);
    getDocsMock.mockResolvedValue({ docs: [] });
    getDocMock.mockResolvedValue(snap('test-id', null));
    batchSet = vi.fn();
    batchUpdate = vi.fn();
    batchDelete = vi.fn();
    batchCommit = vi.fn().mockResolvedValue(undefined);
    writeBatchMock.mockReturnValue({ set: batchSet, update: batchUpdate, delete: batchDelete, commit: batchCommit });
  });

  it('adds a pipeline project with valid data', async () => {
    const { addPipelineProject } = await import('../pipelineService');
    const project = await addPipelineProject({
      firmId: 'firm-1',
      projectId: 'proj-1',
      title: 'Test Project',
      stage: 'intake',
      estimatedValueCents: 500000,
      probability: 75,
      createdBy: 'user-1',
    });

    expect(project).toEqual(expect.objectContaining({
      id: 'generated-id',
      firmId: 'firm-1',
      projectId: 'proj-1',
      title: 'Test Project',
      stage: 'intake',
      status: 'active',
      estimatedValueCents: 500000,
      probability: 75,
      createdBy: 'user-1',
    }));
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('throws for missing required fields', async () => {
    const { addPipelineProject } = await import('../pipelineService');
    await expect(addPipelineProject({ firmId: '', projectId: '', title: '', stage: '' as any, createdBy: '' })).rejects.toThrow();
  });

  it('throws for invalid probability', async () => {
    const { addPipelineProject } = await import('../pipelineService');
    await expect(addPipelineProject({
      firmId: 'firm-1', projectId: 'proj-1', title: 'Test', stage: 'intake',
      probability: 150, createdBy: 'user-1',
    })).rejects.toThrow('Probability must be between 0 and 100');
  });

  it('updates pipeline status to won with closedAt', async () => {
    const { updatePipelineStatus } = await import('../pipelineService');
    await updatePipelineStatus('pipe-1', 'won', { closedReason: 'Contract signed' });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const updates = updateDocMock.mock.calls[0][1];
    expect(updates.status).toBe('won');
    expect(updates.closedAt).toBeDefined();
    expect(updates.closedReason).toBe('Contract signed');
  });

  it('returns null for non-existent pipeline project', async () => {
    const { getPipelineProject } = await import('../pipelineService');
    getDocMock.mockResolvedValueOnce(snap('not-found', null));
    const result = await getPipelineProject('not-found');
    expect(result).toBeNull();
  });

  it('gets firm pipeline with stage filter', async () => {
    const { getFirmPipeline } = await import('../pipelineService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('p1', { firmId: 'firm-1', projectId: 'proj-1', title: 'P1', stage: 'intake', status: 'active', estimatedValueCents: 100000, probability: 80, createdBy: 'u1', createdAt: '2024-01-01' }),
      ],
    });
    const projects = await getFirmPipeline('firm-1', { stage: 'intake' });
    expect(projects).toHaveLength(1);
    expect(projects[0].title).toBe('P1');
  });

  it('computes pipeline forecast correctly', async () => {
    const { getPipelineForecast } = await import('../pipelineService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('p1', { firmId: 'firm-1', projectId: 'proj-1', title: 'P1', stage: 'intake', status: 'active', estimatedValueCents: 100000, probability: 80, createdBy: 'u1', createdAt: '2024-01-01' }),
        snap('p2', { firmId: 'firm-1', projectId: 'proj-2', title: 'P2', stage: 'intake', status: 'active', estimatedValueCents: 50000, probability: 50, createdBy: 'u1', createdAt: '2024-01-02' }),
      ],
    });
    const forecast = await getPipelineForecast('firm-1');
    expect(forecast.totalValueCents).toBe(150000);
    expect(forecast.weightedValueCents).toBe(80000 + 25000); // (100000*0.8) + (50000*0.5)
  });

  it('deletes a pipeline project', async () => {
    const { deletePipelineProject } = await import('../pipelineService');
    await deletePipelineProject('pipe-1');
    expect(batchDelete).toHaveBeenCalledTimes(1);
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('subscribes to pipeline updates', async () => {
    const { subscribeToPipeline } = await import('../pipelineService');
    const callback = vi.fn();
    onSnapshotMock.mockImplementation((_q: unknown, cb: any) => {
      cb({ docs: [snap('p1', { title: 'Live P1' })] });
      return vi.fn();
    });
    const unsub = subscribeToPipeline('firm-1', callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0][0].title).toBe('Live P1');
    expect(typeof unsub).toBe('function');
  });
});
