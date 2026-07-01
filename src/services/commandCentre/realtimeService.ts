/**
 * Project Command Centre — Real-time Service
 *
 * Provides Firestore real-time listeners for live data synchronisation
 * across Command Centre views. Uses onSnapshot for immediate UI updates.
 *
 * @module commandCentre/realtimeService
 */

import { onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import type {
  TaskBoardItem,
  CommandCentreMilestone,
  RiskItem,
  CommandCentreAction,
  AIRecommendation,
} from '@/services/commandCentre/types';

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

// ── Service Export ───────────────────────────────────────────────────────────

export const realtimeService = {
  subscribeTasks,
  subscribeMilestones,
  subscribeRisks,
  subscribeActions,
  subscribeRecommendations,
};

export default realtimeService;
