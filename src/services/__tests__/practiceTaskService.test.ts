import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  handleFirestoreError: handleFirestoreErrorMock,
}));

vi.mock('../notificationService', () => ({
  notificationService: {
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocMock = vi.mocked(firestore.getDoc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const setDocMock = vi.mocked(firestore.setDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const writeBatchMock = vi.mocked(firestore.writeBatch) as any;
const queryMock = vi.mocked(firestore.query) as any;
const whereMock = vi.mocked(firestore.where) as any;
const orderByMock = vi.mocked(firestore.orderBy) as any;

const snap = (id: string, data: Record<string, unknown> | null) => ({
  id, exists: () => data !== null, data: () => data,
});

describe('practiceTaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }));
    docMock.mockImplementation((dbOrCollection: { path?: string } | unknown, ...segments: string[]) => {
      if (segments.length === 0) return { path: 'practice_tasks', id: 'generated-task-id' };
      return { path: segments.join('/'), id: segments[segments.length - 1] };
    });
    queryMock.mockImplementation((base: unknown, ...c: unknown[]) => ({ base, constraints: c }));
    whereMock.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }));
    orderByMock.mockImplementation((field: string, dir: string) => ({ field, dir }));
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockResolvedValue(undefined);
    getDocsMock.mockResolvedValue({ docs: [] });
    getDocMock.mockResolvedValue(snap('test-id', null));
    writeBatchMock.mockReturnValue({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) });
  });

  it('creates a task with required fields', async () => {
    const { createTask } = await import('../practiceTaskService');
    const task = await createTask({
      firmId: 'firm-1', title: 'Review drawings', assignedBy: 'user-1',
    });
    expect(task).toEqual(expect.objectContaining({
      firmId: 'firm-1', title: 'Review drawings', status: 'todo', priority: 'medium',
    }));
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('throws for missing required fields', async () => {
    const { createTask } = await import('../practiceTaskService');
    await expect(createTask({ firmId: '', title: '', assignedBy: '' })).rejects.toThrow();
  });

  it('assigns task to a user', async () => {
    const { assignTask } = await import('../practiceTaskService');
    getDocMock.mockResolvedValueOnce(snap('task-1', { firmId: 'firm-1', title: 'Test', status: 'todo' }));
    await assignTask('task-1', 'user-2', 'user-1');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });

  it('throws when assigning to non-existent task', async () => {
    const { assignTask } = await import('../practiceTaskService');
    getDocMock.mockResolvedValueOnce(snap('bad-id', null));
    await expect(assignTask('bad-id', 'user-2', 'user-1')).rejects.toThrow('Task not found');
  });

  it('updates task status to completed', async () => {
    const { updateTaskStatus } = await import('../practiceTaskService');
    await updateTaskStatus('task-1', 'completed', 'user-1');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const updates = updateDocMock.mock.calls[0][1];
    expect(updates.status).toBe('completed');
    expect(updates.completedAt).toBeDefined();
  });

  it('throws for invalid status', async () => {
    const { updateTaskStatus } = await import('../practiceTaskService');
    await expect(updateTaskStatus('task-1', 'invalid' as any, 'user-1')).rejects.toThrow();
  });

  it('gets firm tasks with filters', async () => {
    const { getFirmTasks } = await import('../practiceTaskService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('t1', { firmId: 'firm-1', title: 'Task 1', status: 'todo', priority: 'high', assigneeId: 'u1', assignedBy: 'u2', createdAt: '2024-01-01' }),
      ],
    });
    const tasks = await getFirmTasks('firm-1', { status: 'todo' });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Task 1');
  });

  it('computes workload summary', async () => {
    const { getWorkloadSummary } = await import('../practiceTaskService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('t1', { firmId: 'firm-1', title: 'T1', status: 'completed', assigneeId: 'u1', estimatedHours: 5, actualHours: 4, createdAt: '2024-01-01' }),
        snap('t2', { firmId: 'firm-1', title: 'T2', status: 'todo', assigneeId: 'u1', estimatedHours: 3, actualHours: 0, dueDate: '2020-01-01', createdAt: '2024-01-02' }),
      ],
    });
    const summary = await getWorkloadSummary('firm-1');
    expect(summary).toHaveLength(1); // one user
    expect(summary[0].totalTasks).toBe(2);
    expect(summary[0].completedTasks).toBe(1);
    expect(summary[0].overdueTasks).toBe(1);
    expect(summary[0].totalEstimatedHours).toBe(8);
  });

  it('updates task fields', async () => {
    const { updateTask } = await import('../practiceTaskService');
    await updateTask('task-1', { title: 'Updated', priority: 'urgent', estimatedHours: 10 });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });

  it('deletes a task', async () => {
    const { deleteTask } = await import('../practiceTaskService');
    await deleteTask('task-1');
    expect(writeBatchMock).toHaveBeenCalled();
  });
});
