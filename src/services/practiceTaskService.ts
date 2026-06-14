import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import type { PracticeTask, PracticeTaskPriority, PracticeTaskStatus, WorkloadSummary } from '@/types';
import { notificationService } from './notificationService';

const TASKS_COL = 'practice_tasks';

const VALID_PRIORITIES: PracticeTaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES: PracticeTaskStatus[] = ['todo', 'in_progress', 'review', 'completed', 'cancelled'];

function assertValidPriority(priority: PracticeTaskPriority): void {
  if (!VALID_PRIORITIES.includes(priority)) throw new Error(`Invalid priority: ${priority}`);
}

function assertValidStatus(status: PracticeTaskStatus): void {
  if (!VALID_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
}

export async function createTask(input: {
  firmId: string;
  projectId?: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assignedBy: string;
  priority?: PracticeTaskPriority;
  dueDate?: string;
  slaDeadline?: string;
  estimatedHours?: number;
  tags?: string[];
}): Promise<PracticeTask> {
  try {
    if (!input.firmId || !input.title || !input.assignedBy) {
      throw new Error('firmId, title, and assignedBy are required.');
    }
    if (input.priority) assertValidPriority(input.priority);
    if (input.estimatedHours !== undefined && input.estimatedHours < 0) {
      throw new Error('estimatedHours cannot be negative.');
    }

    const now = new Date().toISOString();
    const ref = doc(collection(db, TASKS_COL));
    const task: PracticeTask = {
      id: ref.id,
      firmId: input.firmId,
      projectId: input.projectId,
      title: input.title.trim(),
      description: input.description?.trim(),
      assigneeId: input.assigneeId,
      assignedBy: input.assignedBy,
      priority: input.priority || 'medium',
      status: 'todo',
      dueDate: input.dueDate,
      slaDeadline: input.slaDeadline,
      estimatedHours: input.estimatedHours,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, task);

    if (input.assigneeId) {
      await notificationService.sendNotification(
        input.assigneeId,
        'message',
        `New task assigned: ${task.title}`,
        { firmId: input.firmId, projectId: input.projectId, senderId: input.assignedBy }
      );
    }

    return task;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, TASKS_COL);
  }
}

export async function assignTask(taskId: string, assigneeId: string, assignedBy: string): Promise<void> {
  try {
    const taskRef = doc(db, TASKS_COL, taskId);
    const taskSnap = await getDoc(taskRef);
    if (!taskSnap.exists()) throw new Error('Task not found.');

    const now = new Date().toISOString();
    await updateDoc(taskRef, { assigneeId, assignedBy, updatedAt: now });

    const task = { id: taskSnap.id, ...taskSnap.data() } as PracticeTask;
    await notificationService.sendNotification(
      assigneeId,
      'message',
      `You have been assigned: ${task.title}`,
      { firmId: task.firmId, projectId: task.projectId, senderId: assignedBy }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COL}/${taskId}`);
  }
}

export async function updateTaskStatus(taskId: string, status: PracticeTaskStatus, actorId: string): Promise<void> {
  try {
    assertValidStatus(status);
    const now = new Date().toISOString();
    const data: Record<string, unknown> = { status, updatedAt: now };
    if (status === 'completed') data.completedAt = now;

    await updateDoc(doc(db, TASKS_COL, taskId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COL}/${taskId}`);
  }
}

export async function updateTask(taskId: string, updates: {
  title?: string;
  description?: string;
  priority?: PracticeTaskPriority;
  dueDate?: string;
  slaDeadline?: string;
  estimatedHours?: number;
  actualHours?: number;
  tags?: string[];
  projectId?: string;
}): Promise<void> {
  try {
    if (updates.priority) assertValidPriority(updates.priority);
    if (updates.estimatedHours !== undefined && updates.estimatedHours < 0) throw new Error('estimatedHours cannot be negative.');
    if (updates.actualHours !== undefined && updates.actualHours < 0) throw new Error('actualHours cannot be negative.');

    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (updates.title !== undefined) data.title = updates.title.trim();
    if (updates.description !== undefined) data.description = updates.description.trim();
    if (updates.priority !== undefined) data.priority = updates.priority;
    if (updates.dueDate !== undefined) data.dueDate = updates.dueDate;
    if (updates.slaDeadline !== undefined) data.slaDeadline = updates.slaDeadline;
    if (updates.estimatedHours !== undefined) data.estimatedHours = updates.estimatedHours;
    if (updates.actualHours !== undefined) data.actualHours = updates.actualHours;
    if (updates.tags !== undefined) data.tags = updates.tags;
    if (updates.projectId !== undefined) data.projectId = updates.projectId;

    await updateDoc(doc(db, TASKS_COL, taskId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COL}/${taskId}`);
  }
}

export async function getFirmTasks(firmId: string, filters?: { status?: PracticeTaskStatus; assigneeId?: string; priority?: PracticeTaskPriority; projectId?: string }): Promise<PracticeTask[]> {
  try {
    const constraints = [where('firmId', '==', firmId), orderBy('createdAt', 'desc')];
    if (filters?.status) constraints.unshift(where('status', '==', filters.status));
    if (filters?.assigneeId) constraints.unshift(where('assigneeId', '==', filters.assigneeId));
    if (filters?.priority) constraints.unshift(where('priority', '==', filters.priority));
    if (filters?.projectId) constraints.unshift(where('projectId', '==', filters.projectId));

    const q = query(collection(db, TASKS_COL), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PracticeTask));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, TASKS_COL);
  }
}

export async function getUserTasks(userId: string, firmId: string): Promise<PracticeTask[]> {
  return getFirmTasks(firmId, { assigneeId: userId });
}

export async function getTask(taskId: string): Promise<PracticeTask | null> {
  try {
    const snap = await getDoc(doc(db, TASKS_COL, taskId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as PracticeTask) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TASKS_COL}/${taskId}`);
  }
}

export async function getWorkloadSummary(firmId: string): Promise<WorkloadSummary[]> {
  try {
    const tasks = await getFirmTasks(firmId);
    const byUser = new Map<string, { displayName?: string; total: number; completed: number; overdue: number; estHours: number; actualHours: number }>();

    const now = new Date().toISOString();
    for (const task of tasks) {
      const userId = task.assigneeId || 'unassigned';
      if (!byUser.has(userId)) byUser.set(userId, { total: 0, completed: 0, overdue: 0, estHours: 0, actualHours: 0 });
      const entry = byUser.get(userId)!;
      entry.total++;
      if (task.status === 'completed') entry.completed++;
      if (task.dueDate && task.dueDate < now && task.status !== 'completed' && task.status !== 'cancelled') entry.overdue++;
      entry.estHours += task.estimatedHours || 0;
      entry.actualHours += task.actualHours || 0;
    }

    return Array.from(byUser.entries()).map(([userId, data]) => ({
      userId,
      totalTasks: data.total,
      completedTasks: data.completed,
      overdueTasks: data.overdue,
      totalEstimatedHours: data.estHours,
      totalActualHours: data.actualHours,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TASKS_COL}/workload/${firmId}`);
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, TASKS_COL, taskId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${TASKS_COL}/${taskId}`);
  }
}

export function subscribeToFirmTasks(firmId: string, callback: (tasks: PracticeTask[]) => void): () => void {
  return onSnapshot(
    query(collection(db, TASKS_COL), where('firmId', '==', firmId), orderBy('createdAt', 'desc')),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PracticeTask))),
    (error) => {
      console.error('Failed to subscribe to tasks:', error);
      callback([]);
    }
  );
}

export function subscribeToUserTasks(userId: string, firmId: string, callback: (tasks: PracticeTask[]) => void): () => void {
  return onSnapshot(
    query(collection(db, TASKS_COL), where('firmId', '==', firmId), where('assigneeId', '==', userId), orderBy('priority'), orderBy('createdAt', 'desc')),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PracticeTask))),
    (error) => {
      console.error('Failed to subscribe to user tasks:', error);
      callback([]);
    }
  );
}

export const practiceTaskService = {
  createTask,
  assignTask,
  updateTaskStatus,
  updateTask,
  getFirmTasks,
  getUserTasks,
  getTask,
  getWorkloadSummary,
  deleteTask,
  subscribeToFirmTasks,
  subscribeToUserTasks,
};

export default practiceTaskService;
