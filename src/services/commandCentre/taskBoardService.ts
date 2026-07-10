/**
 * Project Command Centre — Task Board Service
 *
 * Manages Kanban-style task board items with CRUD operations,
 * status transitions, filtering, and audit trail integration.
 * Persists to Firestore `projects/{projectId}/tasks/`.
 *
 * @module commandCentre/taskBoardService
 */

import {
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import { createTaskSchema } from '@/services/commandCentre/schemas';
import type { TaskBoardItem } from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const TASKS_COL = 'tasks';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function tasksCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, TASKS_COL);
}

function taskDocument(projectId: string, taskId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!taskId) throw new Error('taskId is required');
  return getDemoDoc(PROJECTS_COL, projectId, TASKS_COL, taskId);
}

// ── Filter Interface ─────────────────────────────────────────────────────────

export interface TaskFilters {
  assigneeId?: string;
  priority?: string;
  dueDateStart?: string;
  dueDateEnd?: string;
  linkedSubsystem?: 'specforge' | 'programme' | 'procurement';
}

// ── Create Task Input (extended beyond schema) ───────────────────────────────

export interface CreateTaskData {
  title: string;
  description?: string;
  assigneeId: string;
  assigneeName: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate: string;
  linkedSpecForgeItemId?: string;
  linkedActivityId?: string;
  linkedProcurementOrderId?: string;
  createdBy: string;
}

// ── Update Task Input ────────────────────────────────────────────────────────

export interface UpdateTaskData {
  title?: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: string;
  linkedSpecForgeItemId?: string;
  linkedActivityId?: string;
  linkedProcurementOrderId?: string;
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Creates a new task on the board. Validates required fields with Zod schema.
 * New tasks start in 'todo' status with auto-generated timestamps.
 */
export async function createTask(
  projectId: string,
  data: CreateTaskData,
): Promise<TaskBoardItem> {
  // Validate required fields via Zod
  const validation = createTaskSchema.safeParse({
    title: data.title,
    assigneeId: data.assigneeId,
    priority: data.priority,
    dueDate: data.dueDate,
  });

  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`);
  }

  const now = new Date().toISOString();
  const id = generateId();

  const task: TaskBoardItem = {
    id,
    projectId,
    title: data.title,
    description: data.description,
    status: 'todo',
    assigneeId: data.assigneeId,
    assigneeName: data.assigneeName,
    priority: data.priority,
    dueDate: data.dueDate,
    linkedSpecForgeItemId: data.linkedSpecForgeItemId,
    linkedActivityId: data.linkedActivityId,
    linkedProcurementOrderId: data.linkedProcurementOrderId,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await addDoc(tasksCollection(projectId), task);

    // Record audit entry for task creation
    void recordAudit({
      projectId,
      actorId: data.createdBy,
      actorName: data.assigneeName,
      actionType: 'create',
      entityType: 'task',
      entityId: id,
      after: { title: task.title, status: task.status, priority: task.priority },
      timestamp: now,
    });

    return task;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${TASKS_COL}`);
    throw error; // handleFirestoreError already throws, this satisfies TS
  }
}

/**
 * Updates a task's fields (not status — use moveTask for status transitions).
 * Records audit entry with before/after changes.
 */
export async function updateTask(
  projectId: string,
  taskId: string,
  data: UpdateTaskData,
): Promise<TaskBoardItem> {
  const docRef = taskDocument(projectId, taskId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Task ${taskId} not found in project ${projectId}`);
    }

    const existing = snap.data() as TaskBoardItem;
    const now = new Date().toISOString();

    const updates: Partial<TaskBoardItem> & { updatedAt: string } = {
      ...data,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    const updatedTask: TaskBoardItem = { ...existing, ...updates };

    // Record audit entry for task update
    void recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.assigneeName,
      actionType: 'update',
      entityType: 'task',
      entityId: taskId,
      before: data as Record<string, unknown>,
      after: updates as Record<string, unknown>,
      timestamp: now,
    });

    return updatedTask;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${TASKS_COL}/${taskId}`);
    throw error;
  }
}

/**
 * Moves a task to a new status column. Records audit entry with previous and
 * new status, timestamp, and actor info. Task data (title, assignee, priority,
 * due date) remains unchanged.
 */
export async function moveTask(
  projectId: string,
  taskId: string,
  targetStatus: TaskBoardItem['status'],
  actorId: string,
  actorName: string,
): Promise<TaskBoardItem> {
  const validStatuses: TaskBoardItem['status'][] = ['todo', 'in_progress', 'in_review', 'done'];
  if (!validStatuses.includes(targetStatus)) {
    throw new Error(`Invalid target status: ${targetStatus}. Must be one of: ${validStatuses.join(', ')}`);
  }

  const docRef = taskDocument(projectId, taskId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Task ${taskId} not found in project ${projectId}`);
    }

    const existing = snap.data() as TaskBoardItem;
    const previousStatus = existing.status;
    const now = new Date().toISOString();

    if (previousStatus === targetStatus) {
      return existing; // No-op if same status
    }

    const updates = {
      status: targetStatus,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    const updatedTask: TaskBoardItem = { ...existing, ...updates };

    // Record audit entry for status transition
    void recordAudit({
      projectId,
      actorId,
      actorName,
      actionType: 'status_change',
      entityType: 'task',
      entityId: taskId,
      before: { status: previousStatus },
      after: { status: targetStatus },
      timestamp: now,
    });

    return updatedTask;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${TASKS_COL}/${taskId}`);
    throw error;
  }
}

/**
 * Deletes a task from the board. Records audit entry for deletion.
 */
export async function deleteTask(
  projectId: string,
  taskId: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  const docRef = taskDocument(projectId, taskId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Task ${taskId} not found in project ${projectId}`);
    }

    const existing = snap.data() as TaskBoardItem;
    const now = new Date().toISOString();

    await deleteDoc(docRef);

    // Record audit entry for deletion
    void recordAudit({
      projectId,
      actorId,
      actorName,
      actionType: 'delete',
      entityType: 'task',
      entityId: taskId,
      before: { title: existing.title, status: existing.status },
      timestamp: now,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, `${PROJECTS_COL}/${projectId}/${TASKS_COL}/${taskId}`);
    throw error;
  }
}

// ── Query Operations ─────────────────────────────────────────────────────────

/**
 * Retrieves tasks for a project with optional filtering by assignee, priority,
 * due date range, and linked subsystem.
 */
export async function getTasks(
  projectId: string,
  filters?: TaskFilters,
): Promise<TaskBoardItem[]> {
  try {
    const constraints: Parameters<typeof query>[1][] = [];

    if (filters?.assigneeId) {
      constraints.push(where('assigneeId', '==', filters.assigneeId));
    }
    if (filters?.priority) {
      constraints.push(where('priority', '==', filters.priority));
    }

    // Firestore compound queries are limited, so we apply date range and linked
    // subsystem filters in memory after fetching
    const q = constraints.length > 0
      ? query(tasksCollection(projectId), ...constraints)
      : query(tasksCollection(projectId));

    const snap = await getDocs(q);
    let tasks = snap.docs.map((d) => ({ ...d.data(), id: d.id } as TaskBoardItem));

    // Apply in-memory filters for date range and linked subsystem
    if (filters?.dueDateStart) {
      tasks = tasks.filter((t) => t.dueDate >= filters.dueDateStart!);
    }
    if (filters?.dueDateEnd) {
      tasks = tasks.filter((t) => t.dueDate <= filters.dueDateEnd!);
    }
    if (filters?.linkedSubsystem) {
      tasks = tasks.filter((t) => {
        switch (filters.linkedSubsystem) {
          case 'specforge':
            return !!t.linkedSpecForgeItemId;
          case 'programme':
            return !!t.linkedActivityId;
          case 'procurement':
            return !!t.linkedProcurementOrderId;
          default:
            return true;
        }
      });
    }

    return tasks;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${TASKS_COL}`);
    throw error;
  }
}

// ── Service Export ───────────────────────────────────────────────────────────

export const taskBoardService = {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  getTasks,
};

export default taskBoardService;
