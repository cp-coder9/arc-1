import { collection, doc, addDoc, getDocs, getDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { ProgrammePhase, Milestone, ProgrammeTask, ProgrammePhaseStatus, MilestoneStatus, TaskStatus } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const PROGRAMME_PHASES_COL = 'programme_phases';
const MILESTONES_COL = 'milestones';
const PROGRAMME_TASKS_COL = 'programme_tasks';

type FirestoreUnsubscribe = () => void;

// ─── Sub-collection helpers ──────────────────────────────────────────

function phasesCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, PROGRAMME_PHASES_COL);
}

function phaseDocument(projectId: string, phaseId: string) {
  if (!phaseId) throw new Error('phaseId is required');
  return getDemoDoc( PROJECTS_COL, projectId, PROGRAMME_PHASES_COL, phaseId);
}

function milestonesCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, MILESTONES_COL);
}

function milestoneDocument(projectId: string, milestoneId: string) {
  if (!milestoneId) throw new Error('milestoneId is required');
  return getDemoDoc( PROJECTS_COL, projectId, MILESTONES_COL, milestoneId);
}

function tasksCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, PROGRAMME_TASKS_COL);
}

function taskDocument(projectId: string, taskId: string) {
  if (!taskId) throw new Error('taskId is required');
  return getDemoDoc( PROJECTS_COL, projectId, PROGRAMME_TASKS_COL, taskId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

// ─── Phase state machine ──────────────────────────────────────────

const PHASE_TRANSITIONS: Record<ProgrammePhaseStatus, ProgrammePhaseStatus[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'delayed', 'cancelled'],
  completed: [],
  delayed: ['in_progress', 'cancelled'],
  cancelled: [],
};

export function isValidPhaseTransition(from: ProgrammePhaseStatus, to: ProgrammePhaseStatus): boolean {
  return PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Milestone state machine ──────────────────────────────────────

const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  pending: ['achieved', 'missed', 'revised'],
  achieved: [],
  missed: ['revised'],
  revised: ['pending', 'achieved', 'missed'],
};

export function isValidMilestoneTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return MILESTONE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Task state machine ───────────────────────────────────────────

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  not_started: ['in_progress', 'on_hold'],
  in_progress: ['completed', 'delayed', 'on_hold'],
  completed: [],
  delayed: ['in_progress', 'on_hold'],
  on_hold: ['not_started', 'in_progress'],
};

export function isValidTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Dependency resolution ────────────────────────────────────────

/**
 * Check whether all dependencies of a task are completed.
 * Returns the names of unfulfilled dependencies (empty = ready).
 */
export async function getUnfulfilledDependencies(projectId: string, task: Pick<ProgrammeTask, 'dependsOn'>): Promise<string[]> {
  if (!task.dependsOn || task.dependsOn.length === 0) return [];
  const unfulfilled: string[] = [];
  for (const depId of task.dependsOn) {
    try {
      const snap = await getDoc(taskDocument(projectId, depId));
      if (!snap.exists()) {
        unfulfilled.push(depId);
        continue;
      }
      const dep = snap.data() as ProgrammeTask;
      if (dep.status !== 'completed') {
        unfulfilled.push(dep.name || depId);
      }
    } catch {
      unfulfilled.push(depId);
    }
  }
  return unfulfilled;
}

export async function areDependenciesMet(projectId: string, task: Pick<ProgrammeTask, 'dependsOn'>): Promise<boolean> {
  const unfulfilled = await getUnfulfilledDependencies(projectId, task);
  return unfulfilled.length === 0;
}

// ─── CRUD: Phases ─────────────────────────────────────────────────

export async function createPhase(input: {
  projectId: string;
  name: string;
  description?: string;
  order: number;
  startDate: string;
  endDate: string;
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const phase: Omit<ProgrammePhase, 'id'> = {
      projectId: input.projectId,
      name: input.name,
      description: input.description,
      order: input.order,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'planned',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(phasesCollection(input.projectId), phase);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${PROGRAMME_PHASES_COL}`);
  }
}

export async function updatePhaseStatus(
  projectId: string,
  phaseId: string,
  status: ProgrammePhaseStatus,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(phaseDocument(projectId, phaseId));
      if (!snap.exists()) throw new Error(`Phase ${phaseId} not found`);
      const current = snap.data() as ProgrammePhase;
      if (!isValidPhaseTransition(current.status, status)) {
        throw new Error(`Invalid phase transition from ${current.status} to ${status}`);
      }
      transaction.update(phaseDocument(projectId, phaseId), { status, updatedAt: now });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_PHASES_COL}/${phaseId}`);
  }
}

export async function updatePhase(
  projectId: string,
  phaseId: string,
  updates: Partial<Pick<ProgrammePhase, 'name' | 'description' | 'order' | 'startDate' | 'endDate'>>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(phaseDocument(projectId, phaseId), { ...updates, updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_PHASES_COL}/${phaseId}`);
  }
}

export async function getPhases(projectId: string): Promise<ProgrammePhase[]> {
  try {
    const snap = await getDocs(query(phasesCollection(projectId), orderBy('order', 'asc')));
    return snap.docs.map((d) => withId<ProgrammePhase>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${PROGRAMME_PHASES_COL}`);
  }
}

export async function getPhase(projectId: string, phaseId: string): Promise<ProgrammePhase | null> {
  try {
    const snap = await getDoc(phaseDocument(projectId, phaseId));
    if (!snap.exists()) return null;
    return withId<ProgrammePhase>(snap);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${PROGRAMME_PHASES_COL}/${phaseId}`);
  }
}

export function subscribeToPhases(projectId: string, cb: (phases: ProgrammePhase[]) => void): FirestoreUnsubscribe {
  const q = query(phasesCollection(projectId), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<ProgrammePhase>(d))), (error) => {
    console.error('Failed to subscribe to phases:', error);
    cb([]);
  });
}

export async function deletePhase(projectId: string, phaseId: string): Promise<void> {
  try {
    await deleteDoc(phaseDocument(projectId, phaseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_PHASES_COL}/${phaseId}`);
  }
}

// ─── CRUD: Milestones ─────────────────────────────────────────────

export async function createMilestone(input: {
  projectId: string;
  phaseId: string;
  name: string;
  dueDate: string;
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const milestone: Omit<Milestone, 'id'> = {
      projectId: input.projectId,
      phaseId: input.phaseId,
      name: input.name,
      dueDate: input.dueDate,
      status: 'pending',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(milestonesCollection(input.projectId), milestone);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${MILESTONES_COL}`);
  }
}

export async function updateMilestoneStatus(
  projectId: string,
  milestoneId: string,
  status: MilestoneStatus,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(milestoneDocument(projectId, milestoneId));
      if (!snap.exists()) throw new Error(`Milestone ${milestoneId} not found`);
      const current = snap.data() as Milestone;
      if (!isValidMilestoneTransition(current.status, status)) {
        throw new Error(`Invalid milestone transition from ${current.status} to ${status}`);
      }
      const updates: Record<string, unknown> = { status, updatedAt: now };
      if (status === 'achieved') {
        updates.achievedDate = now;
      }
      transaction.update(milestoneDocument(projectId, milestoneId), updates);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}/${milestoneId}`);
  }
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  updates: Partial<Pick<Milestone, 'name' | 'dueDate' | 'notes'>>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(milestoneDocument(projectId, milestoneId), { ...updates, updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}/${milestoneId}`);
  }
}

export async function getMilestones(projectId: string): Promise<Milestone[]> {
  try {
    const snap = await getDocs(query(milestonesCollection(projectId), orderBy('dueDate', 'asc')));
    return snap.docs.map((d) => withId<Milestone>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}`);
  }
}

export async function getMilestonesByPhase(projectId: string, phaseId: string): Promise<Milestone[]> {
  try {
    const all = await getMilestones(projectId);
    return all.filter((m) => m.phaseId === phaseId);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}`);
  }
}

export function subscribeToMilestones(projectId: string, cb: (milestones: Milestone[]) => void): FirestoreUnsubscribe {
  const q = query(milestonesCollection(projectId), orderBy('dueDate', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<Milestone>(d))), (error) => {
    console.error('Failed to subscribe to milestones:', error);
    cb([]);
  });
}

export async function deleteMilestone(projectId: string, milestoneId: string): Promise<void> {
  try {
    await deleteDoc(milestoneDocument(projectId, milestoneId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}/${milestoneId}`);
  }
}

// ─── CRUD: Tasks ──────────────────────────────────────────────────

export async function createTask(input: {
  projectId: string;
  phaseId: string;
  name: string;
  description?: string;
  assignedTo?: string;
  dependsOn?: string[];
  startDate: string;
  endDate: string;
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const task: Omit<ProgrammeTask, 'id'> = {
      projectId: input.projectId,
      phaseId: input.phaseId,
      name: input.name,
      description: input.description,
      assignedTo: input.assignedTo,
      dependsOn: input.dependsOn ?? [],
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'not_started',
      progress: 0,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(tasksCollection(input.projectId), task);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${PROGRAMME_TASKS_COL}`);
  }
}

export async function updateTaskStatus(
  projectId: string,
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(taskDocument(projectId, taskId));
      if (!snap.exists()) throw new Error(`Task ${taskId} not found`);
      const current = snap.data() as ProgrammeTask;
      if (!isValidTaskTransition(current.status, status)) {
        throw new Error(`Invalid task transition from ${current.status} to ${status}`);
      }
      const updates: Record<string, unknown> = { status, updatedAt: now };
      if (status === 'in_progress' && !current.actualStartDate) {
        updates.actualStartDate = now;
      }
      if (status === 'completed') {
        updates.actualEndDate = now;
        updates.progress = 100;
      }
      transaction.update(taskDocument(projectId, taskId), updates);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_TASKS_COL}/${taskId}`);
  }
}

export async function updateTaskProgress(
  projectId: string,
  taskId: string,
  progress: number,
): Promise<void> {
  try {
    const clamped = Math.max(0, Math.min(100, progress));
    const now = new Date().toISOString();
    await updateDoc(taskDocument(projectId, taskId), { progress: clamped, updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_TASKS_COL}/${taskId}`);
  }
}

export async function updateTask(
  projectId: string,
  taskId: string,
  updates: Partial<Pick<ProgrammeTask, 'name' | 'description' | 'assignedTo' | 'dependsOn' | 'startDate' | 'endDate'>>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(taskDocument(projectId, taskId), { ...updates, updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_TASKS_COL}/${taskId}`);
  }
}

export async function getTasks(projectId: string): Promise<ProgrammeTask[]> {
  try {
    const snap = await getDocs(query(tasksCollection(projectId), orderBy('endDate', 'asc')));
    return snap.docs.map((d) => withId<ProgrammeTask>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${PROGRAMME_TASKS_COL}`);
  }
}

export async function getTasksByPhase(projectId: string, phaseId: string): Promise<ProgrammeTask[]> {
  try {
    const all = await getTasks(projectId);
    return all.filter((t) => t.phaseId === phaseId);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${PROGRAMME_TASKS_COL}`);
  }
}

export async function getTask(projectId: string, taskId: string): Promise<ProgrammeTask | null> {
  try {
    const snap = await getDoc(taskDocument(projectId, taskId));
    if (!snap.exists()) return null;
    return withId<ProgrammeTask>(snap);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${PROGRAMME_TASKS_COL}/${taskId}`);
  }
}

export function subscribeToTasks(projectId: string, cb: (tasks: ProgrammeTask[]) => void): FirestoreUnsubscribe {
  const q = query(tasksCollection(projectId), orderBy('endDate', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<ProgrammeTask>(d))), (error) => {
    console.error('Failed to subscribe to tasks:', error);
    cb([]);
  });
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  try {
    await deleteDoc(taskDocument(projectId, taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_TASKS_COL}/${taskId}`);
  }
}

export const programmeService = {
  // Phases
  createPhase,
  updatePhaseStatus,
  updatePhase,
  getPhases,
  getPhase,
  subscribeToPhases,
  deletePhase,
  isValidPhaseTransition,
  // Milestones
  createMilestone,
  updateMilestoneStatus,
  updateMilestone,
  getMilestones,
  getMilestonesByPhase,
  subscribeToMilestones,
  deleteMilestone,
  isValidMilestoneTransition,
  // Tasks
  createTask,
  updateTaskStatus,
  updateTaskProgress,
  updateTask,
  getTasks,
  getTasksByPhase,
  getTask,
  subscribeToTasks,
  deleteTask,
  isValidTaskTransition,
  // Dependency resolution
  getUnfulfilledDependencies,
  areDependenciesMet,
};

export default programmeService;
