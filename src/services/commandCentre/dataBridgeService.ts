/**
 * Project Command Centre — Data Bridge Service
 *
 * Central adapter that wires Command Centre services to real Firestore data.
 * Provides real-time subscriptions (onSnapshot) and CRUD operations for all
 * Command Centre subsystems, ensuring bidirectional data consistency with
 * standalone managers and toolbox tools.
 *
 * Collection paths match exactly those used by standalone managers:
 * - `projects/{projectId}/tasks/` → taskBoardService
 * - `projects/{projectId}/site_logs/` → siteDiaryService (via dailyLogService)
 * - `projects/{projectId}/snags/` → qualityTrackerService
 * - `projects/{projectId}/ncrs/` → qualityTrackerService
 * - `projects/{projectId}/site_instructions/` → rfiService
 * - `projects/{projectId}/rfis/` → rfiService
 * - `projects/{projectId}/programme_activities/` → programmeService
 * - `projects/{projectId}/budget_packages/` → budgetService
 *
 * @module commandCentre/dataBridgeService
 */

import { onSnapshot, query, orderBy, limit, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { getDemoCol, getDemoDoc } from '@/demo-seed/demoFirestore';
import type { TaskBoardItem, BudgetPackage } from '@/services/commandCentre/types';
import type { QualitySnagItem } from '@/services/commandCentre/qualityTrackerService';
import type { CommandCentreRFI, SiteInstructionItem } from '@/services/commandCentre/rfiService';
import type { Activity } from '@/services/commandCentre/programmeService';
import type { SiteLog } from '@/types';

// ── Types ────────────────────────────────────────────────────────────────────

export type Unsubscribe = () => void;
export type DataCallback<T> = (data: T[]) => void;
export type ErrorCallback = (error: Error) => void;

/** NCR item as stored in Firestore (shared with standalone NCRManager). */
export interface NCRItem {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  correctiveAction: string;
  evidenceIds: string[];
  blocksPayment: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Collection Path Constants ────────────────────────────────────────────────
// These MUST match the paths used by standalone managers (Property 12)

const PROJECTS_COL = 'projects';

/** Collection paths — canonical shared paths */
export const COLLECTION_PATHS = {
  tasks: 'tasks',
  siteLogs: 'site_logs',
  snags: 'snags',
  ncrs: 'ncrs',
  siteInstructions: 'site_instructions',
  rfis: 'rfis',
  programmeActivities: 'programme_activities',
  budgetPackages: 'budget_packages',
} as const;

// ── Firestore Collection Helpers ─────────────────────────────────────────────

function getCol(projectId: string, subcollection: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, subcollection);
}

function getDocRef(projectId: string, subcollection: string, docId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!docId) throw new Error('docId is required');
  return getDemoDoc(PROJECTS_COL, projectId, subcollection, docId);
}

// ── Task Board Data Bridge ───────────────────────────────────────────────────

/**
 * Subscribes to real-time task board updates.
 * Collection: projects/{projectId}/tasks/
 */
export function subscribeTasks(
  projectId: string,
  onData: DataCallback<TaskBoardItem>,
  onError?: ErrorCallback,
): Unsubscribe {
  const col = getCol(projectId, COLLECTION_PATHS.tasks);
  const q = query(col, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as TaskBoardItem));
      onData(items);
    },
    (error) => {
      console.error('[DataBridge] Tasks listener error:', error.message);
      onError?.(error);
    },
  );
}

// ── Site Diary Data Bridge ───────────────────────────────────────────────────

/**
 * Subscribes to real-time site diary (daily log) updates.
 * Collection: projects/{projectId}/site_logs/
 * Matches standalone dailyLogService and constructionService paths.
 */
export function subscribeSiteDiary(
  projectId: string,
  onData: DataCallback<SiteLog>,
  onError?: ErrorCallback,
): Unsubscribe {
  const col = getCol(projectId, COLLECTION_PATHS.siteLogs);
  const q = query(col, orderBy('date', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const logs = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as SiteLog));
      onData(logs);
    },
    (error) => {
      console.error('[DataBridge] Site diary listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Writes a new site diary entry.
 * Collection: projects/{projectId}/site_logs/
 */
export async function addSiteDiaryEntry(
  projectId: string,
  entry: Omit<SiteLog, 'id'>,
): Promise<string> {
  const col = getCol(projectId, COLLECTION_PATHS.siteLogs);
  const docRef = await addDoc(col, entry);
  return docRef.id;
}

// ── Quality Tracker Data Bridge (Snags) ──────────────────────────────────────

/**
 * Subscribes to real-time snag updates.
 * Collection: projects/{projectId}/snags/
 * Matches standalone SnagManager path.
 */
export function subscribeSnags(
  projectId: string,
  onData: DataCallback<QualitySnagItem>,
  onError?: ErrorCallback,
): Unsubscribe {
  const col = getCol(projectId, COLLECTION_PATHS.snags);
  const q = query(col, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const snags = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as QualitySnagItem));
      onData(snags);
    },
    (error) => {
      console.error('[DataBridge] Snags listener error:', error.message);
      onError?.(error);
    },
  );
}

// ── Quality Tracker Data Bridge (NCRs) ───────────────────────────────────────

/**
 * Subscribes to real-time NCR updates.
 * Collection: projects/{projectId}/ncrs/
 * Matches standalone NCRManager path.
 */
export function subscribeNCRs(
  projectId: string,
  onData: DataCallback<NCRItem>,
  onError?: ErrorCallback,
): Unsubscribe {
  const col = getCol(projectId, COLLECTION_PATHS.ncrs);
  const q = query(col, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const ncrs = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as NCRItem));
      onData(ncrs);
    },
    (error) => {
      console.error('[DataBridge] NCRs listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Reads all NCRs for a project.
 * Collection: projects/{projectId}/ncrs/
 */
export async function getNCRs(projectId: string): Promise<NCRItem[]> {
  const col = getCol(projectId, COLLECTION_PATHS.ncrs);
  const q = query(col, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id } as NCRItem));
}

/**
 * Creates a new NCR.
 * Collection: projects/{projectId}/ncrs/
 */
export async function addNCR(
  projectId: string,
  ncr: Omit<NCRItem, 'id'>,
): Promise<string> {
  const col = getCol(projectId, COLLECTION_PATHS.ncrs);
  const docRef = await addDoc(col, ncr);
  return docRef.id;
}

/**
 * Updates an existing NCR.
 * Collection: projects/{projectId}/ncrs/
 */
export async function updateNCR(
  projectId: string,
  ncrId: string,
  data: Partial<NCRItem>,
): Promise<void> {
  const docRef = getDocRef(projectId, COLLECTION_PATHS.ncrs, ncrId);
  await updateDoc(docRef, data);
}

// ── RFI Data Bridge ──────────────────────────────────────────────────────────

/**
 * Subscribes to real-time RFI updates.
 * Collection: projects/{projectId}/rfis/
 */
export function subscribeRFIs(
  projectId: string,
  onData: DataCallback<CommandCentreRFI>,
  onError?: ErrorCallback,
): Unsubscribe {
  const col = getCol(projectId, COLLECTION_PATHS.rfis);
  const q = query(col, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const rfis = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as CommandCentreRFI));
      onData(rfis);
    },
    (error) => {
      console.error('[DataBridge] RFIs listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Subscribes to real-time site instruction updates.
 * Collection: projects/{projectId}/site_instructions/
 * Matches standalone SiteInstructionManager path.
 */
export function subscribeSiteInstructions(
  projectId: string,
  onData: DataCallback<SiteInstructionItem>,
  onError?: ErrorCallback,
): Unsubscribe {
  const col = getCol(projectId, COLLECTION_PATHS.siteInstructions);
  const q = query(col, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const instructions = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as SiteInstructionItem));
      onData(instructions);
    },
    (error) => {
      console.error('[DataBridge] Site instructions listener error:', error.message);
      onError?.(error);
    },
  );
}

// ── Programme Data Bridge ────────────────────────────────────────────────────

/**
 * Subscribes to real-time programme activity updates.
 * Collection: projects/{projectId}/programme_activities/
 */
export function subscribeProgrammeActivities(
  projectId: string,
  onData: DataCallback<Activity>,
  onError?: ErrorCallback,
): Unsubscribe {
  const col = getCol(projectId, COLLECTION_PATHS.programmeActivities);
  const q = query(col);

  return onSnapshot(
    q,
    (snapshot) => {
      const activities = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as Activity));
      onData(activities);
    },
    (error) => {
      console.error('[DataBridge] Programme activities listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Writes a new programme activity.
 * Collection: projects/{projectId}/programme_activities/
 */
export async function addProgrammeActivity(
  projectId: string,
  activity: Omit<Activity, 'id'>,
): Promise<string> {
  const col = getCol(projectId, COLLECTION_PATHS.programmeActivities);
  const docRef = await addDoc(col, activity);
  return docRef.id;
}

/**
 * Updates an existing programme activity.
 * Collection: projects/{projectId}/programme_activities/
 */
export async function updateProgrammeActivity(
  projectId: string,
  activityId: string,
  data: Partial<Activity>,
): Promise<void> {
  const docRef = getDocRef(projectId, COLLECTION_PATHS.programmeActivities, activityId);
  await updateDoc(docRef, data);
}

/**
 * Deletes a programme activity.
 * Collection: projects/{projectId}/programme_activities/
 */
export async function deleteProgrammeActivity(
  projectId: string,
  activityId: string,
): Promise<void> {
  const docRef = getDocRef(projectId, COLLECTION_PATHS.programmeActivities, activityId);
  await deleteDoc(docRef);
}

// ── Budget Data Bridge ───────────────────────────────────────────────────────

/**
 * Subscribes to real-time budget package updates.
 * Collection: projects/{projectId}/budget_packages/
 * Reads from existing Finance Module Firestore collections.
 */
export function subscribeBudgetPackages(
  projectId: string,
  onData: DataCallback<BudgetPackage>,
  onError?: ErrorCallback,
): Unsubscribe {
  const col = getCol(projectId, COLLECTION_PATHS.budgetPackages);
  const q = query(col);

  return onSnapshot(
    q,
    (snapshot) => {
      const packages = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as BudgetPackage));
      onData(packages);
    },
    (error) => {
      console.error('[DataBridge] Budget packages listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Reads all budget packages for a project.
 * Collection: projects/{projectId}/budget_packages/
 */
export async function getBudgetPackages(projectId: string): Promise<BudgetPackage[]> {
  const col = getCol(projectId, COLLECTION_PATHS.budgetPackages);
  const snap = await getDocs(col);
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id } as BudgetPackage));
}

// ── Exported Service Object ──────────────────────────────────────────────────

export const dataBridgeService = {
  // Collection paths (exported for Property 12 testing)
  COLLECTION_PATHS,

  // Task Board
  subscribeTasks,

  // Site Diary
  subscribeSiteDiary,
  addSiteDiaryEntry,

  // Quality — Snags
  subscribeSnags,

  // Quality — NCRs
  subscribeNCRs,
  getNCRs,
  addNCR,
  updateNCR,

  // RFIs & Site Instructions
  subscribeRFIs,
  subscribeSiteInstructions,

  // Programme
  subscribeProgrammeActivities,
  addProgrammeActivity,
  updateProgrammeActivity,
  deleteProgrammeActivity,

  // Budget
  subscribeBudgetPackages,
  getBudgetPackages,
};

export default dataBridgeService;
