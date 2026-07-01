/**
 * Task Board Service Tests
 *
 * Tests CRUD operations, status transitions with audit trail recording,
 * filtering by various criteria, and error handling.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: (...segments: string[]) => ({ path: segments.join('/'), type: 'doc' }),
  getDemoCol: (...segments: string[]) => ({ path: segments.join('/'), type: 'col' }),
}));

// Mock recordAudit
const recordAuditMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/commandCentre/commandCentreService', () => ({
  recordAudit: (...args: any[]) => recordAuditMock(...args),
}));

// Cast mocks for firebase/firestore functions
const getDocMock = vi.mocked(getDoc);
const getDocsMock = vi.mocked(getDocs);
const addDocMock = vi.mocked(addDoc);
const updateDocMock = vi.mocked(updateDoc);
const deleteDocMock = vi.mocked(deleteDoc);
const queryMock = vi.mocked(query);
const whereMock = vi.mocked(where);

describe('taskBoardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockImplementation((ref: any) => ref);
    whereMock.mockReturnValue({} as any);
    addDocMock.mockResolvedValue({ id: 'new-task-id' } as any);
    updateDocMock.mockResolvedValue(undefined as any);
    deleteDocMock.mockResolvedValue(undefined as any);
  });

  describe('createTask', () => {
    it('creates a task with valid data and records audit entry', async () => {
      const { createTask } = await import('./taskBoardService');

      const task = await createTask('proj-1', {
        title: 'Install plumbing rough-in',
        assigneeId: 'user-1',
        assigneeName: 'John Smith',
        priority: 'high',
        dueDate: '2026-07-15',
        createdBy: 'user-1',
      });

      expect(task.title).toBe('Install plumbing rough-in');
      expect(task.status).toBe('todo');
      expect(task.priority).toBe('high');
      expect(task.assigneeId).toBe('user-1');
      expect(task.assigneeName).toBe('John Smith');
      expect(task.projectId).toBe('proj-1');
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
      expect(task.id).toBeDefined();

      expect(addDocMock).toHaveBeenCalledOnce();
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          actorId: 'user-1',
          actionType: 'create',
          entityType: 'task',
        }),
      );
    });

    it('rejects task creation with missing title', async () => {
      const { createTask } = await import('./taskBoardService');

      await expect(
        createTask('proj-1', {
          title: '',
          assigneeId: 'user-1',
          assigneeName: 'John',
          priority: 'medium',
          dueDate: '2026-07-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');

      expect(addDocMock).not.toHaveBeenCalled();
    });

    it('rejects task creation with missing assigneeId', async () => {
      const { createTask } = await import('./taskBoardService');

      await expect(
        createTask('proj-1', {
          title: 'Valid title',
          assigneeId: '',
          assigneeName: 'John',
          priority: 'medium',
          dueDate: '2026-07-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');

      expect(addDocMock).not.toHaveBeenCalled();
    });

    it('rejects task creation with invalid priority', async () => {
      const { createTask } = await import('./taskBoardService');

      await expect(
        createTask('proj-1', {
          title: 'Valid title',
          assigneeId: 'user-1',
          assigneeName: 'John',
          priority: 'urgent' as any,
          dueDate: '2026-07-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');

      expect(addDocMock).not.toHaveBeenCalled();
    });

    it('rejects task creation with invalid due date format', async () => {
      const { createTask } = await import('./taskBoardService');

      await expect(
        createTask('proj-1', {
          title: 'Valid title',
          assigneeId: 'user-1',
          assigneeName: 'John',
          priority: 'medium',
          dueDate: '15/07/2026',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');

      expect(addDocMock).not.toHaveBeenCalled();
    });
  });

  describe('moveTask', () => {
    const existingTask = {
      id: 'task-1',
      projectId: 'proj-1',
      title: 'Brickwork first floor',
      status: 'todo' as const,
      assigneeId: 'user-1',
      assigneeName: 'Jane Doe',
      priority: 'high' as const,
      dueDate: '2026-07-20',
      createdBy: 'user-1',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    it('transitions task status and creates audit entry with before/after', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => existingTask,
      } as any);

      const { moveTask } = await import('./taskBoardService');

      const result = await moveTask('proj-1', 'task-1', 'in_progress', 'user-2', 'Bob Builder');

      expect(result.status).toBe('in_progress');
      expect(result.title).toBe('Brickwork first floor');
      expect(result.assigneeId).toBe('user-1');
      expect(result.priority).toBe('high');
      expect(result.dueDate).toBe('2026-07-20');

      expect(updateDocMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'in_progress' }),
      );

      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          actorId: 'user-2',
          actorName: 'Bob Builder',
          actionType: 'status_change',
          entityType: 'task',
          entityId: 'task-1',
          before: { status: 'todo' },
          after: { status: 'in_progress' },
        }),
      );
    });

    it('does not update if target status equals current status', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => existingTask,
      } as any);

      const { moveTask } = await import('./taskBoardService');

      const result = await moveTask('proj-1', 'task-1', 'todo', 'user-2', 'Bob');

      expect(result.status).toBe('todo');
      expect(updateDocMock).not.toHaveBeenCalled();
      expect(recordAuditMock).not.toHaveBeenCalled();
    });

    it('throws on invalid target status', async () => {
      const { moveTask } = await import('./taskBoardService');

      await expect(
        moveTask('proj-1', 'task-1', 'invalid_status' as any, 'user-2', 'Bob'),
      ).rejects.toThrow('Invalid target status');
    });

    it('throws when task is not found', async () => {
      getDocMock.mockResolvedValue({
        exists: () => false,
      } as any);

      const { moveTask } = await import('./taskBoardService');

      await expect(
        moveTask('proj-1', 'nonexistent', 'in_progress', 'user-2', 'Bob'),
      ).rejects.toThrow('not found');
    });

    it('preserves task data (title, assignee, priority, due date) on move', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => existingTask,
      } as any);

      const { moveTask } = await import('./taskBoardService');

      const result = await moveTask('proj-1', 'task-1', 'done', 'user-2', 'Bob');

      expect(result.title).toBe(existingTask.title);
      expect(result.assigneeId).toBe(existingTask.assigneeId);
      expect(result.assigneeName).toBe(existingTask.assigneeName);
      expect(result.priority).toBe(existingTask.priority);
      expect(result.dueDate).toBe(existingTask.dueDate);
      expect(result.createdBy).toBe(existingTask.createdBy);
    });
  });

  describe('getTasks with filters', () => {
    const tasksList = [
      {
        id: 'task-1',
        projectId: 'proj-1',
        title: 'Task A',
        status: 'todo',
        assigneeId: 'user-1',
        assigneeName: 'Alice',
        priority: 'high',
        dueDate: '2026-07-10',
        linkedSpecForgeItemId: 'sf-1',
        createdBy: 'user-1',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'task-2',
        projectId: 'proj-1',
        title: 'Task B',
        status: 'in_progress',
        assigneeId: 'user-2',
        assigneeName: 'Bob',
        priority: 'low',
        dueDate: '2026-07-20',
        linkedActivityId: 'act-1',
        createdBy: 'user-2',
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
      {
        id: 'task-3',
        projectId: 'proj-1',
        title: 'Task C',
        status: 'done',
        assigneeId: 'user-1',
        assigneeName: 'Alice',
        priority: 'critical',
        dueDate: '2026-07-05',
        linkedProcurementOrderId: 'po-1',
        createdBy: 'user-1',
        createdAt: '2026-07-03T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    ];

    beforeEach(() => {
      getDocsMock.mockResolvedValue({
        docs: tasksList.map((t) => ({
          id: t.id,
          data: () => t,
        })),
      } as any);
    });

    it('returns all tasks when no filters provided', async () => {
      const { getTasks } = await import('./taskBoardService');

      const tasks = await getTasks('proj-1');

      expect(tasks).toHaveLength(3);
    });

    it('filters by assigneeId via Firestore query', async () => {
      const { getTasks } = await import('./taskBoardService');

      await getTasks('proj-1', { assigneeId: 'user-1' });

      expect(whereMock).toHaveBeenCalledWith('assigneeId', '==', 'user-1');
    });

    it('filters by priority via Firestore query', async () => {
      const { getTasks } = await import('./taskBoardService');

      await getTasks('proj-1', { priority: 'high' });

      expect(whereMock).toHaveBeenCalledWith('priority', '==', 'high');
    });

    it('filters by due date range in memory', async () => {
      const { getTasks } = await import('./taskBoardService');

      const tasks = await getTasks('proj-1', {
        dueDateStart: '2026-07-06',
        dueDateEnd: '2026-07-15',
      });

      // Only task-1 (2026-07-10) falls in this range
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });

    it('filters by linked subsystem - specforge', async () => {
      const { getTasks } = await import('./taskBoardService');

      const tasks = await getTasks('proj-1', { linkedSubsystem: 'specforge' });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });

    it('filters by linked subsystem - programme', async () => {
      const { getTasks } = await import('./taskBoardService');

      const tasks = await getTasks('proj-1', { linkedSubsystem: 'programme' });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-2');
    });

    it('filters by linked subsystem - procurement', async () => {
      const { getTasks } = await import('./taskBoardService');

      const tasks = await getTasks('proj-1', { linkedSubsystem: 'procurement' });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-3');
    });

    it('combines assignee filter with due date range', async () => {
      const { getTasks } = await import('./taskBoardService');

      const tasks = await getTasks('proj-1', {
        assigneeId: 'user-1',
        dueDateStart: '2026-07-01',
        dueDateEnd: '2026-07-12',
      });

      // All 3 tasks returned by mock (where is stubbed); then date filter applied
      // task-1 (07-10) and task-3 (07-05) both fit range, task-2 (07-20) doesn't
      expect(tasks.every((t) => t.dueDate >= '2026-07-01' && t.dueDate <= '2026-07-12')).toBe(true);
    });
  });

  describe('updateTask', () => {
    const existingTask = {
      id: 'task-1',
      projectId: 'proj-1',
      title: 'Original Title',
      status: 'todo',
      assigneeId: 'user-1',
      assigneeName: 'Jane Doe',
      priority: 'medium',
      dueDate: '2026-07-20',
      createdBy: 'user-1',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    it('updates task fields and records audit entry', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => existingTask,
      } as any);

      const { updateTask } = await import('./taskBoardService');

      const result = await updateTask('proj-1', 'task-1', {
        title: 'Updated Title',
        priority: 'critical',
      });

      expect(result.title).toBe('Updated Title');
      expect(result.priority).toBe('critical');
      expect(result.updatedAt).not.toBe(existingTask.updatedAt);

      expect(updateDocMock).toHaveBeenCalledOnce();
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'update',
          entityType: 'task',
          entityId: 'task-1',
        }),
      );
    });

    it('throws when task is not found', async () => {
      getDocMock.mockResolvedValue({
        exists: () => false,
      } as any);

      const { updateTask } = await import('./taskBoardService');

      await expect(
        updateTask('proj-1', 'nonexistent', { title: 'New' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('deleteTask', () => {
    const existingTask = {
      id: 'task-1',
      projectId: 'proj-1',
      title: 'To be deleted',
      status: 'todo',
      assigneeId: 'user-1',
      assigneeName: 'Jane',
      priority: 'low',
      dueDate: '2026-07-20',
      createdBy: 'user-1',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    it('deletes task and records audit entry', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => existingTask,
      } as any);

      const { deleteTask } = await import('./taskBoardService');

      await deleteTask('proj-1', 'task-1', 'user-2', 'Admin User');

      expect(deleteDocMock).toHaveBeenCalledOnce();
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          actorId: 'user-2',
          actorName: 'Admin User',
          actionType: 'delete',
          entityType: 'task',
          entityId: 'task-1',
          before: { title: 'To be deleted', status: 'todo' },
        }),
      );
    });

    it('throws when task is not found', async () => {
      getDocMock.mockResolvedValue({
        exists: () => false,
      } as any);

      const { deleteTask } = await import('./taskBoardService');

      await expect(
        deleteTask('proj-1', 'nonexistent', 'user-2', 'Admin'),
      ).rejects.toThrow('not found');

      expect(deleteDocMock).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws when projectId is empty for createTask', async () => {
      const { createTask } = await import('./taskBoardService');

      await expect(
        createTask('', {
          title: 'Test',
          assigneeId: 'user-1',
          assigneeName: 'Jane',
          priority: 'medium',
          dueDate: '2026-07-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('projectId is required');
    });
  });
});
