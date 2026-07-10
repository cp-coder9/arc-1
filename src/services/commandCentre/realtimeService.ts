/**
 * Project Command Centre — Real-time Service
 *
 * Provides Firestore real-time listeners for live data synchronisation
 * across Command Centre views. Uses onSnapshot for immediate UI updates.
 *
 * @module commandCentre/realtimeService
 */

import { onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import type {
  TaskBoardItem,
  CommandCentreMilestone,
  RiskItem,
  CommandCentreAction,
  AIRecommendation,
} from '@/services/commandCentre/types';
import type { SnagItem, NonConformanceReport, SiteInstruction } from '@/types';

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';

// ── Listener Types ───────────────────────────────────────────────────────────

export type Unsubscribe = () => void;

export type RealtimeCallback<T> = (data: T[]) => void;
export type RealtimeErrorCallback = (error: Error) => void;

// ── Real-time Listeners ──────────────────────────────────────────────────────

/**
 * Subscribes to real-time task board updates for a project.
 * Returns an unsubscribe function to clean up the listener.
 */
export function subscribeTasks(
  projectId: string,
  onData: RealtimeCallback<TaskBoardItem>,
  onError?: RealtimeErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'tasks');
  const q = query(col, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as TaskBoardItem));
      onData(tasks);
    },
    (error) => {
      console.error('[RealtimeService] Tasks listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Subscribes to real-time milestone updates for a project.
 */
export function subscribeMilestones(
  projectId: string,
  onData: RealtimeCallback<CommandCentreMilestone>,
  onError?: RealtimeErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'milestones');
  const q = query(col, orderBy('plannedDate', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const milestones = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as CommandCentreMilestone));
      onData(milestones);
    },
    (error) => {
      console.error('[RealtimeService] Milestones listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Subscribes to real-time risk register updates for a project.
 */
export function subscribeRisks(
  projectId: string,
  onData: RealtimeCallback<RiskItem>,
  onError?: RealtimeErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'risks');
  const q = query(col, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const risks = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as RiskItem));
      onData(risks);
    },
    (error) => {
      console.error('[RealtimeService] Risks listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Subscribes to real-time Action Centre updates (pending actions only).
 */
export function subscribeActions(
  projectId: string,
  onData: RealtimeCallback<CommandCentreAction>,
  onError?: RealtimeErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'actions');
  const q = query(col, where('status', '==', 'pending'));

  return onSnapshot(
    q,
    (snapshot) => {
      const actions = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as CommandCentreAction));
      onData(actions);
    },
    (error) => {
      console.error('[RealtimeService] Actions listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Subscribes to real-time AI recommendation updates (pending only).
 */
export function subscribeRecommendations(
  projectId: string,
  onData: RealtimeCallback<AIRecommendation>,
  onError?: RealtimeErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'ai_recommendations');
  const q = query(col, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const recommendations = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as AIRecommendation));
      onData(recommendations);
    },
    (error) => {
      console.error('[RealtimeService] Recommendations listener error:', error.message);
      onError?.(error);
    },
  );
}

// ── Quality & Site Listeners (Data Bridge — same paths as standalone managers) ──

/**
 * Subscribes to real-time snag updates for a project.
 * Uses the same collection path as standalone SnagManager: projects/{projectId}/snags/
 */
export function subscribeSnags(
  projectId: string,
  onData: RealtimeCallback<SnagItem>,
  onError?: RealtimeErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'snags');
  const q = query(col, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const snags = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as SnagItem));
      onData(snags);
    },
    (error) => {
      console.error('[RealtimeService] Snags listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Subscribes to real-time NCR updates for a project.
 * Uses the same collection path as standalone NCRManager: projects/{projectId}/ncrs/
 */
export function subscribeNcrs(
  projectId: string,
  onData: RealtimeCallback<NonConformanceReport>,
  onError?: RealtimeErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'ncrs');
  const q = query(col, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const ncrs = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as NonConformanceReport));
      onData(ncrs);
    },
    (error) => {
      console.error('[RealtimeService] NCRs listener error:', error.message);
      onError?.(error);
    },
  );
}

/**
 * Subscribes to real-time site instruction updates for a project.
 * Uses the same collection path as standalone SiteInstructionManager: projects/{projectId}/site_instructions/
 */
export function subscribeSiteInstructions(
  projectId: string,
  onData: RealtimeCallback<SiteInstruction>,
  onError?: RealtimeErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'site_instructions');
  const q = query(col, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const instructions = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as SiteInstruction));
      onData(instructions);
    },
    (error) => {
      console.error('[RealtimeService] Site Instructions listener error:', error.message);
      onError?.(error);
    },
  );
}

// ── Service Export ───────────────────────────────────────────────────────────

export const realtimeService = {
  subscribeTasks,
  subscribeMilestones,
  subscribeRisks,
  subscribeActions,
  subscribeRecommendations,
  subscribeSnags,
  subscribeNcrs,
  subscribeSiteInstructions,
};

export default realtimeService;
