/**
 * Project Command Centre — Toolbox Real-time Listeners
 *
 * Provides Firestore onSnapshot real-time listeners for detecting toolbox-originated
 * writes on shared project collections and propagating updates to active Command Centre
 * views without polling. Covers snags, NCRs, site_instructions, budget_packages, and risks.
 *
 * On listener error/disconnection: logs error and invokes notification callback with
 * "live updates temporarily unavailable" message.
 *
 * @module commandCentre/toolboxRealtimeListeners
 * @validates Requirements 12.1, 12.2, 12.3, 12.5, 12.6
 */

import { onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import type {
  RiskItem,
  BudgetPackage,
} from '@/services/commandCentre/types';
import type { SnagItem, NonConformanceReport, SiteInstruction } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const LIVE_UPDATE_ERROR_MESSAGE = 'live updates temporarily unavailable';

// ── Types ────────────────────────────────────────────────────────────────────

export type Unsubscribe = () => void;

export type ToolboxDataCallback<T> = (data: T[]) => void;

export interface ToolboxListenerErrorInfo {
  collection: string;
  message: string;
  error: Error;
}

export type ToolboxErrorCallback = (info: ToolboxListenerErrorInfo) => void;

export interface ToolboxListenerHandles {
  unsubscribeAll: () => void;
  unsubscribers: Unsubscribe[];
}

// ── Individual Collection Listeners ──────────────────────────────────────────

/**
 * Subscribes to real-time snag updates from toolbox-originated writes.
 * Propagates updates to Command Centre QualityView within 30 seconds.
 *
 * @validates Requirement 12.1 (NCR via Toolbox NCR Manager)
 */
export function subscribeToolboxSnags(
  projectId: string,
  onData: ToolboxDataCallback<SnagItem>,
  onError?: ToolboxErrorCallback,
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
      console.error('[ToolboxRealtimeListeners] Snags listener error:', error.message);
      onError?.({
        collection: 'snags',
        message: LIVE_UPDATE_ERROR_MESSAGE,
        error,
      });
    },
  );
}

/**
 * Subscribes to real-time NCR updates from toolbox-originated writes.
 * Propagates updates to Command Centre QualityView within 30 seconds.
 *
 * @validates Requirement 12.1 (NCR via Toolbox NCR Manager)
 */
export function subscribeToolboxNcrs(
  projectId: string,
  onData: ToolboxDataCallback<NonConformanceReport>,
  onError?: ToolboxErrorCallback,
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
      console.error('[ToolboxRealtimeListeners] NCRs listener error:', error.message);
      onError?.({
        collection: 'ncrs',
        message: LIVE_UPDATE_ERROR_MESSAGE,
        error,
      });
    },
  );
}

/**
 * Subscribes to real-time site instruction updates from toolbox-originated writes.
 * Propagates updates to Command Centre RFIView within 30 seconds.
 *
 * @validates Requirement 12.2 (Site Instruction via Toolbox)
 */
export function subscribeToolboxSiteInstructions(
  projectId: string,
  onData: ToolboxDataCallback<SiteInstruction>,
  onError?: ToolboxErrorCallback,
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
      console.error('[ToolboxRealtimeListeners] Site Instructions listener error:', error.message);
      onError?.({
        collection: 'site_instructions',
        message: LIVE_UPDATE_ERROR_MESSAGE,
        error,
      });
    },
  );
}

/**
 * Subscribes to real-time budget package updates from toolbox-originated writes.
 * Propagates updates to Command Centre BudgetView within 30 seconds.
 *
 * @validates Requirement 12.3 (variation via Toolbox Contract Admin)
 */
export function subscribeToolboxBudgetPackages(
  projectId: string,
  onData: ToolboxDataCallback<BudgetPackage>,
  onError?: ToolboxErrorCallback,
): Unsubscribe {
  const col = getDemoCol(PROJECTS_COL, projectId, 'budget_packages');
  const q = query(col, orderBy('name', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const packages = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as BudgetPackage));
      onData(packages);
    },
    (error) => {
      console.error('[ToolboxRealtimeListeners] Budget Packages listener error:', error.message);
      onError?.({
        collection: 'budget_packages',
        message: LIVE_UPDATE_ERROR_MESSAGE,
        error,
      });
    },
  );
}

/**
 * Subscribes to real-time risk register updates from toolbox-originated writes.
 * Used to detect H&S incidents mapped to risk entries.
 *
 * @validates Requirement 12.5 (Firestore onSnapshot for shared collections)
 */
export function subscribeToolboxRisks(
  projectId: string,
  onData: ToolboxDataCallback<RiskItem>,
  onError?: ToolboxErrorCallback,
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
      console.error('[ToolboxRealtimeListeners] Risks listener error:', error.message);
      onError?.({
        collection: 'risks',
        message: LIVE_UPDATE_ERROR_MESSAGE,
        error,
      });
    },
  );
}

// ── Composite Listener ───────────────────────────────────────────────────────

/**
 * Subscribes to all shared project collections simultaneously for detecting
 * toolbox-originated writes. Returns a composite handle to unsubscribe all listeners.
 *
 * @param projectId - Active project ID
 * @param callbacks - Data callbacks per collection
 * @param onError - Shared error callback for non-blocking notification
 * @returns Handle with unsubscribeAll() and individual unsubscribers
 *
 * @validates Requirements 12.1, 12.2, 12.3, 12.5, 12.6
 */
export function subscribeAllToolboxCollections(
  projectId: string,
  callbacks: {
    onSnags?: ToolboxDataCallback<SnagItem>;
    onNcrs?: ToolboxDataCallback<NonConformanceReport>;
    onSiteInstructions?: ToolboxDataCallback<SiteInstruction>;
    onBudgetPackages?: ToolboxDataCallback<BudgetPackage>;
    onRisks?: ToolboxDataCallback<RiskItem>;
  },
  onError?: ToolboxErrorCallback,
): ToolboxListenerHandles {
  const unsubscribers: Unsubscribe[] = [];

  if (callbacks.onSnags) {
    unsubscribers.push(subscribeToolboxSnags(projectId, callbacks.onSnags, onError));
  }

  if (callbacks.onNcrs) {
    unsubscribers.push(subscribeToolboxNcrs(projectId, callbacks.onNcrs, onError));
  }

  if (callbacks.onSiteInstructions) {
    unsubscribers.push(subscribeToolboxSiteInstructions(projectId, callbacks.onSiteInstructions, onError));
  }

  if (callbacks.onBudgetPackages) {
    unsubscribers.push(subscribeToolboxBudgetPackages(projectId, callbacks.onBudgetPackages, onError));
  }

  if (callbacks.onRisks) {
    unsubscribers.push(subscribeToolboxRisks(projectId, callbacks.onRisks, onError));
  }

  return {
    unsubscribeAll: () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    },
    unsubscribers,
  };
}

// ── Service Export ───────────────────────────────────────────────────────────

export const toolboxRealtimeListeners = {
  subscribeToolboxSnags,
  subscribeToolboxNcrs,
  subscribeToolboxSiteInstructions,
  subscribeToolboxBudgetPackages,
  subscribeToolboxRisks,
  subscribeAllToolboxCollections,
  LIVE_UPDATE_ERROR_MESSAGE,
};

export default toolboxRealtimeListeners;
