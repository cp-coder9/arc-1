/**
 * Project Command Centre — Programme Service
 *
 * Manages programme activities (Gantt chart items) with CRUD operations,
 * dependency management, critical path calculation, and SpecForge traceability.
 * Persists to Firestore `projects/{projectId}/phases/`.
 *
 * Exports pure functions for testability:
 * - calculateCriticalPath(activities, dependencies)
 * - computeEarliestDates(activities, dependencies)
 * - computeLatestDates(activities, dependencies, projectEndDate)
 * - getActivitiesOnCriticalPath(activities)
 *
 * @module commandCentre/programmeService
 */

import {
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import { createActivitySchema } from '@/services/commandCentre/schemas';

// ── Types ────────────────────────────────────────────────────────────────────

/** Dependency relationship type between two activities. */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/** A dependency link between two activities. */
export interface ActivityDependency {
  fromActivityId: string;
  toActivityId: string;
  type: DependencyType;
}

/** A programme activity (Gantt bar). */
export interface Activity {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  assigneeId: string;
  assigneeName: string;
  percentComplete: number;
  isCritical: boolean;
  linkedSpecForgeItemId?: string;
  dependencies?: ActivityDependency[];
}

/** Computed scheduling data for an activity (internal use in CPM). */
export interface ActivitySchedule {
  activityId: string;
  duration: number;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  totalFloat: number;
}

/** Alert generated when a critical path activity falls behind schedule. */
export interface ProgrammeAlert {
  activityId: string;
  activityName: string;
  type: 'critical_path_delay';
  message: string;
  timestamp: string;
}

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const PROGRAMME_ACTIVITIES_COL = 'programme_activities';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function programmeActivitiesCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, PROGRAMME_ACTIVITIES_COL);
}

function programmeActivityDocument(projectId: string, activityId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!activityId) throw new Error('activityId is required');
  return getDemoDoc(PROJECTS_COL, projectId, PROGRAMME_ACTIVITIES_COL, activityId);
}

// ── Date Utility ─────────────────────────────────────────────────────────────

/**
 * Computes the number of calendar days between two ISO date strings.
 * Returns 0 if dates are equal, positive if end > start.
 */
function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Adds days to an ISO date string and returns a new ISO date string.
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// ── Create Activity Input ────────────────────────────────────────────────────

export interface CreateActivityData {
  name: string;
  startDate: string;
  endDate: string;
  assigneeId: string;
  assigneeName: string;
  percentComplete?: number;
  linkedSpecForgeItemId?: string;
  dependencies?: ActivityDependency[];
  createdBy: string;
}

// ── Update Activity Input ────────────────────────────────────────────────────

export interface UpdateActivityData {
  name?: string;
  startDate?: string;
  endDate?: string;
  assigneeId?: string;
  assigneeName?: string;
  percentComplete?: number;
  linkedSpecForgeItemId?: string;
  dependencies?: ActivityDependency[];
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Creates a new programme activity. Validates required fields with Zod schema.
 * New activities default to 0% complete and isCritical = false (recalculated later).
 */
export async function createActivity(
  projectId: string,
  data: CreateActivityData,
): Promise<Activity> {
  const validation = createActivitySchema.safeParse({
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    assigneeId: data.assigneeId,
  });

  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`);
  }

  const now = new Date().toISOString();
  const id = generateId();

  const activity: Activity = {
    id,
    projectId,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    assigneeId: data.assigneeId,
    assigneeName: data.assigneeName,
    percentComplete: data.percentComplete ?? 0,
    isCritical: false,
    linkedSpecForgeItemId: data.linkedSpecForgeItemId,
    dependencies: data.dependencies ?? [],
  };

  try {
    await addDoc(programmeActivitiesCollection(projectId), activity);

    void recordAudit({
      projectId,
      actorId: data.createdBy,
      actorName: data.assigneeName,
      actionType: 'create',
      entityType: 'activity',
      entityId: id,
      after: { name: activity.name, startDate: activity.startDate, endDate: activity.endDate },
      timestamp: now,
    });

    return activity;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_ACTIVITIES_COL}`);
    throw error;
  }
}

/**
 * Updates an existing programme activity's fields.
 * Records audit entry with before/after changes.
 */
export async function updateActivity(
  projectId: string,
  activityId: string,
  data: UpdateActivityData,
): Promise<Activity> {
  const docRef = programmeActivityDocument(projectId, activityId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Activity ${activityId} not found in project ${projectId}`);
    }

    const existing = snap.data() as Activity;
    const now = new Date().toISOString();

    const updated: Activity = {
      ...existing,
      ...data,
    };

    await updateDoc(docRef, { ...data });

    void recordAudit({
      projectId,
      actorId: existing.assigneeId,
      actorName: existing.assigneeName,
      actionType: 'update',
      entityType: 'activity',
      entityId: activityId,
      before: data as Record<string, unknown>,
      after: { ...data } as Record<string, unknown>,
      timestamp: now,
    });

    return updated;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_ACTIVITIES_COL}/${activityId}`);
    throw error;
  }
}

/**
 * Deletes a programme activity. Records audit entry for deletion.
 */
export async function deleteActivity(
  projectId: string,
  activityId: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  const docRef = programmeActivityDocument(projectId, activityId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Activity ${activityId} not found in project ${projectId}`);
    }

    const existing = snap.data() as Activity;
    const now = new Date().toISOString();

    await deleteDoc(docRef);

    void recordAudit({
      projectId,
      actorId,
      actorName,
      actionType: 'delete',
      entityType: 'activity',
      entityId: activityId,
      before: { name: existing.name, startDate: existing.startDate, endDate: existing.endDate },
      timestamp: now,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_ACTIVITIES_COL}/${activityId}`);
    throw error;
  }
}

/**
 * Retrieves all programme activities for a project.
 */
export async function getActivities(projectId: string): Promise<Activity[]> {
  try {
    const q = query(programmeActivitiesCollection(projectId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Activity));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${PROGRAMME_ACTIVITIES_COL}`);
    throw error;
  }
}

// ── Critical Path Algorithm (Pure Functions) ─────────────────────────────────

/**
 * Performs a topological sort of activities based on dependencies.
 * Returns activity IDs in dependency order (predecessors before successors).
 */
function topologicalSort(
  activityIds: string[],
  dependencies: ActivityDependency[],
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of activityIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const dep of dependencies) {
    // For topological ordering, the "from" activity must be processed before "to"
    if (adjacency.has(dep.fromActivityId) && inDegree.has(dep.toActivityId)) {
      adjacency.get(dep.fromActivityId)!.push(dep.toActivityId);
      inDegree.set(dep.toActivityId, (inDegree.get(dep.toActivityId) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If sorted doesn't contain all activities, there's a cycle — include remaining
  if (sorted.length < activityIds.length) {
    for (const id of activityIds) {
      if (!sorted.includes(id)) {
        sorted.push(id);
      }
    }
  }

  return sorted;
}

/**
 * Computes the earliest start (ES) and earliest finish (EF) dates for all activities
 * using a forward pass through the dependency network.
 *
 * Dependency type semantics:
 * - FS (Finish-to-Start): successor ES = predecessor EF
 * - SS (Start-to-Start): successor ES = predecessor ES
 * - FF (Finish-to-Finish): successor EF = predecessor EF → successor ES = predecessor EF - successor duration
 * - SF (Start-to-Finish): successor EF = predecessor ES → successor ES = predecessor ES - successor duration
 *
 * All dates are expressed as day offsets from the project start (day 0).
 */
export function computeEarliestDates(
  activities: Activity[],
  dependencies: ActivityDependency[],
): Map<string, { earliestStart: number; earliestFinish: number; duration: number }> {
  const activityMap = new Map(activities.map((a) => [a.id, a]));
  const activityIds = activities.map((a) => a.id);
  const sorted = topologicalSort(activityIds, dependencies);

  // Find project start date (earliest start date of any activity)
  const projectStart = activities.reduce(
    (min, a) => (a.startDate < min ? a.startDate : min),
    activities[0]?.startDate ?? '9999-12-31',
  );

  // Compute durations
  const durations = new Map<string, number>();
  for (const a of activities) {
    durations.set(a.id, Math.max(1, daysBetween(a.startDate, a.endDate)));
  }

  // Compute earliest start relative to project start
  const earliest = new Map<string, { earliestStart: number; earliestFinish: number; duration: number }>();
  for (const id of activityIds) {
    const activity = activityMap.get(id)!;
    const offset = daysBetween(projectStart, activity.startDate);
    earliest.set(id, {
      earliestStart: offset,
      earliestFinish: offset + durations.get(id)!,
      duration: durations.get(id)!,
    });
  }

  // Forward pass — update earliest dates based on dependencies
  for (const id of sorted) {
    const duration = durations.get(id)!;

    // Find all dependencies where this activity is the successor (toActivityId)
    const incomingDeps = dependencies.filter((d) => d.toActivityId === id);

    if (incomingDeps.length > 0) {
      let maxES = 0;

      for (const dep of incomingDeps) {
        const pred = earliest.get(dep.fromActivityId);
        if (!pred) continue;

        let constrainedES: number;

        switch (dep.type) {
          case 'FS': // Finish-to-Start: successor starts after predecessor finishes
            constrainedES = pred.earliestFinish;
            break;
          case 'SS': // Start-to-Start: successor starts when predecessor starts
            constrainedES = pred.earliestStart;
            break;
          case 'FF': // Finish-to-Finish: successor finishes when predecessor finishes
            constrainedES = pred.earliestFinish - duration;
            break;
          case 'SF': // Start-to-Finish: successor finishes when predecessor starts
            constrainedES = pred.earliestStart - duration;
            break;
          default:
            constrainedES = pred.earliestFinish;
        }

        maxES = Math.max(maxES, constrainedES);
      }

      earliest.set(id, {
        earliestStart: maxES,
        earliestFinish: maxES + duration,
        duration,
      });
    }
  }

  return earliest;
}

/**
 * Computes the latest start (LS) and latest finish (LF) dates for all activities
 * using a backward pass from the project end date.
 *
 * The project end date is derived from the maximum earliest finish across all activities.
 */
export function computeLatestDates(
  activities: Activity[],
  dependencies: ActivityDependency[],
  projectEndDate: number,
): Map<string, { latestStart: number; latestFinish: number; duration: number }> {
  const activityIds = activities.map((a) => a.id);
  const sorted = topologicalSort(activityIds, dependencies);
  const reverseSorted = [...sorted].reverse();

  // Compute durations
  const durations = new Map<string, number>();
  for (const a of activities) {
    durations.set(a.id, Math.max(1, daysBetween(a.startDate, a.endDate)));
  }

  // Initialize latest dates — default to project end
  const latest = new Map<string, { latestStart: number; latestFinish: number; duration: number }>();
  for (const id of activityIds) {
    const duration = durations.get(id)!;
    latest.set(id, {
      latestStart: projectEndDate - duration,
      latestFinish: projectEndDate,
      duration,
    });
  }

  // Backward pass — update latest dates based on dependencies
  for (const id of reverseSorted) {
    const duration = durations.get(id)!;

    // Find all dependencies where this activity is the predecessor (fromActivityId)
    const outgoingDeps = dependencies.filter((d) => d.fromActivityId === id);

    if (outgoingDeps.length > 0) {
      let minLF = projectEndDate;

      for (const dep of outgoingDeps) {
        const succ = latest.get(dep.toActivityId);
        if (!succ) continue;

        let constrainedLF: number;

        switch (dep.type) {
          case 'FS': // Finish-to-Start: predecessor must finish before successor starts
            constrainedLF = succ.latestStart;
            break;
          case 'SS': // Start-to-Start: predecessor must start before/when successor starts
            constrainedLF = succ.latestStart + duration;
            break;
          case 'FF': // Finish-to-Finish: predecessor finishes when successor finishes
            constrainedLF = succ.latestFinish;
            break;
          case 'SF': // Start-to-Finish: predecessor starts when successor finishes
            constrainedLF = succ.latestFinish + duration;
            break;
          default:
            constrainedLF = succ.latestStart;
        }

        minLF = Math.min(minLF, constrainedLF);
      }

      latest.set(id, {
        latestStart: minLF - duration,
        latestFinish: minLF,
        duration,
      });
    }
  }

  return latest;
}

/**
 * Identifies activities on the critical path (zero total float).
 * Returns the subset of activities that are on the critical path.
 */
export function getActivitiesOnCriticalPath(
  activities: Activity[],
): Activity[] {
  return activities.filter((a) => a.isCritical);
}

/**
 * Calculates the critical path for a set of activities and dependencies.
 *
 * Algorithm:
 * 1. Forward pass: compute earliest start (ES) and earliest finish (EF) for each activity
 * 2. Determine project end date as max(EF) across all activities
 * 3. Backward pass: compute latest start (LS) and latest finish (LF) for each activity
 * 4. Calculate total float = LS - ES for each activity
 * 5. Activities with zero float form the critical path
 *
 * Returns activities with updated `isCritical` flag and schedule data.
 */
export function calculateCriticalPath(
  activities: Activity[],
  dependencies: ActivityDependency[],
): { activities: Activity[]; schedules: ActivitySchedule[]; criticalPathIds: string[] } {
  if (activities.length === 0) {
    return { activities: [], schedules: [], criticalPathIds: [] };
  }

  // Step 1: Forward pass
  const earliest = computeEarliestDates(activities, dependencies);

  // Step 2: Determine project end date
  let projectEndDate = 0;
  for (const [, data] of earliest) {
    projectEndDate = Math.max(projectEndDate, data.earliestFinish);
  }

  // Step 3: Backward pass
  const latest = computeLatestDates(activities, dependencies, projectEndDate);

  // Step 4 & 5: Calculate float and identify critical path
  const schedules: ActivitySchedule[] = [];
  const criticalPathIds: string[] = [];

  const updatedActivities = activities.map((activity) => {
    const earlyData = earliest.get(activity.id)!;
    const lateData = latest.get(activity.id)!;
    const totalFloat = lateData.latestStart - earlyData.earliestStart;
    const isCritical = totalFloat === 0;

    schedules.push({
      activityId: activity.id,
      duration: earlyData.duration,
      earliestStart: earlyData.earliestStart,
      earliestFinish: earlyData.earliestFinish,
      latestStart: lateData.latestStart,
      latestFinish: lateData.latestFinish,
      totalFloat,
    });

    if (isCritical) {
      criticalPathIds.push(activity.id);
    }

    return { ...activity, isCritical };
  });

  return { activities: updatedActivities, schedules, criticalPathIds };
}

// ── Alert Generation ─────────────────────────────────────────────────────────

/**
 * Checks critical path activities for schedule delays and generates alerts.
 * An activity is "behind schedule" when its percentComplete is less than the
 * expected progress given the elapsed time relative to its total duration.
 */
export function generateCriticalPathAlerts(
  activities: Activity[],
  currentDate: string,
): ProgrammeAlert[] {
  const alerts: ProgrammeAlert[] = [];

  for (const activity of activities) {
    if (!activity.isCritical) continue;

    const totalDuration = daysBetween(activity.startDate, activity.endDate);
    if (totalDuration <= 0) continue;

    const elapsed = daysBetween(activity.startDate, currentDate);
    if (elapsed <= 0) continue; // Activity hasn't started yet per calendar

    const expectedProgress = Math.min(100, (elapsed / totalDuration) * 100);
    const actualProgress = activity.percentComplete;

    // Activity is behind if actual progress is less than 80% of expected progress
    if (actualProgress < expectedProgress * 0.8) {
      alerts.push({
        activityId: activity.id,
        activityName: activity.name,
        type: 'critical_path_delay',
        message: `Critical path activity "${activity.name}" is behind schedule: ${actualProgress}% complete vs ${Math.round(expectedProgress)}% expected.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return alerts;
}

// ── SpecForge Linking ────────────────────────────────────────────────────────

/**
 * Links an activity to a SpecForge item for bidirectional traceability.
 */
export async function linkActivityToSpecForge(
  projectId: string,
  activityId: string,
  specForgeItemId: string,
): Promise<Activity> {
  return updateActivity(projectId, activityId, {
    linkedSpecForgeItemId: specForgeItemId,
  });
}

// ── Service Export ───────────────────────────────────────────────────────────

export const programmeService = {
  createActivity,
  updateActivity,
  deleteActivity,
  getActivities,
  calculateCriticalPath,
  computeEarliestDates,
  computeLatestDates,
  getActivitiesOnCriticalPath,
  generateCriticalPathAlerts,
  linkActivityToSpecForge,
  // Collection path constants (exported for Data Bridge consistency verification)
  PROGRAMME_ACTIVITIES_COLLECTION_PATH: PROGRAMME_ACTIVITIES_COL,
};

export default programmeService;
