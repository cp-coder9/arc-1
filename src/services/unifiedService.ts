// ─── Pack 16: Unified Service — Inbox / Notification Orchestration ──────────
// Orchestrates unified project snapshots, mobile-friendly inbox items,
// and cross-module notification routing.

import { collection, doc, getDoc, getDocs, setDoc, addDoc, query, where, orderBy, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type {
  ProjectContext,

  ProjectDecision,
  ProjectInboxItem,
  ProjectRecordRef,
  UnifiedProjectOperatingSnapshot,
  Priority,
  HumanGate,
  SourceModule,
} from '@/services/lifecycleTypes';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Firestore Paths ─────────────────────────────────────────────────────────

const INBOX_COL = 'inbox_items';
const PROJECTS_COL = 'projects';

function projectInboxCollection(projectId: string) {
  return getDemoCol( PROJECTS_COL, projectId, INBOX_COL);
}

function inboxDoc(inboxItemId: string) {
  return getDemoDoc( INBOX_COL, inboxItemId);
}

// ─── Inbox Type Mapping ──────────────────────────────────────────────────────

function inboxTypeFor(sourceModule: SourceModule, humanGate: HumanGate): ProjectInboxItem['inboxType'] {
  if (sourceModule === 'messaging') return 'message_reply';
  if (sourceModule === 'municipal') return 'municipal_action';
  if (sourceModule === 'finance') return 'payment_review';
  if (sourceModule === 'site') return 'site_issue';
  if (sourceModule === 'closeout') return 'closeout_blocker';
  if (sourceModule === 'cpd') return 'cpd_reminder';
  if (sourceModule === 'deployment') return 'release_gate';
  if (sourceModule === 'agent') return 'agent_recommendation';
  if (humanGate !== 'none') return 'approval_required';
  return 'document_request';
}

// ─── Pure Business Logic ─────────────────────────────────────────────────────

/**
 * Create a unified project operating snapshot from context, records, and decisions.
 */
export function createUnifiedProjectSnapshot(input: {
  context: ProjectContext;
  records: ProjectRecordRef[];
  decisions: ProjectDecision[];
}): UnifiedProjectOperatingSnapshot {
  const normalizedDecisions = input.decisions.map((decision) => ({
    ...decision,
    aiMayExecute: false as const,
    linkedRecordIds: Array.from(new Set(decision.linkedRecordIds)),
  }));

  return {
    context: input.context,
    records: input.records,
    decisions: normalizedDecisions,
    inbox: [],
    risks: [],
  };
}

/**
 * Summarize the operating state of a project for dashboard display.
 */
export function summarizeOperatingState(snapshot: UnifiedProjectOperatingSnapshot) {
  const critical = snapshot.decisions.filter((item) => item.priority === 'critical').length;
  const humanGated = snapshot.decisions.filter((item) => item.humanGate !== 'none').length;
  return {
    projectId: snapshot.context.projectId,
    stage: snapshot.context.stage,
    decisionCount: snapshot.decisions.length,
    criticalDecisionCount: critical,
    humanGatedDecisionCount: humanGated,
    plainLanguageStatus: critical > 0
      ? 'Critical decisions are blocking progress.'
      : humanGated > 0
        ? 'Human review is required before the project can move safely.'
        : 'No critical decision blockers are visible in this snapshot.',
  };
}

/**
 * Build mobile-friendly inbox items from project decisions.
 */
export function buildMobileDecisionInbox(decisions: ProjectDecision[]): ProjectInboxItem[] {
  return decisions
    .map((decision) => ({
      ...decision,
      inboxType: inboxTypeFor(decision.sourceModule, decision.humanGate),
      mobileLabel: decision.title,
      mobileCta: decision.humanGate === 'none' ? 'Review' : 'Review and confirm',
    }))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

function priorityRank(priority: Priority): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[priority];
}

// ─── Firestore-backed Operations ─────────────────────────────────────────────

export interface InboxItemRecord {
  itemId: string;
  projectId: string;
  tenantId?: string;
  item: ProjectInboxItem;
  status: 'pending' | 'acknowledged' | 'completed' | 'dismissed';
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  completedBy?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Persist an inbox item for a project. */
export async function saveInboxItem(
  projectId: string,
  item: ProjectInboxItem,
  tenantId?: string,
): Promise<InboxItemRecord & { id: string }> {
  try {
    const now = new Date().toISOString();
    const record: Omit<InboxItemRecord, 'itemId'> = {
      projectId,
      tenantId,
      item,
      status: 'pending',
      createdAt: now,
    };
    const docRef = await addDoc(projectInboxCollection(projectId), record);
    return { itemId: docRef.id, ...record, id: docRef.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${INBOX_COL}`);
    throw error;
  }
}

/** Get pending inbox items for a project. */
export async function getPendingInboxItems(
  projectId: string,
): Promise<(InboxItemRecord & { id: string })[]> {
  try {
    const q = query(
      projectInboxCollection(projectId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      itemId: d.id,
      ...(d.data() as InboxItemRecord),
      id: d.id,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${INBOX_COL}`);
    return [];
  }
}

/** Acknowledge an inbox item (user has seen it). */
export async function acknowledgeInboxItem(itemId: string, userId: string): Promise<void> {
  try {
    await updateDoc(inboxDoc(itemId), {
      status: 'acknowledged',
      acknowledgedBy: userId,
      acknowledgedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${INBOX_COL}/${itemId}`);
  }
}

/** Complete an inbox item (action has been taken). */
export async function completeInboxItem(itemId: string, userId: string): Promise<void> {
  try {
    await updateDoc(inboxDoc(itemId), {
      status: 'completed',
      completedBy: userId,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${INBOX_COL}/${itemId}`);
  }
}

/** Dismiss an inbox item (not relevant / user chooses to ignore). */
export async function dismissInboxItem(itemId: string, userId: string): Promise<void> {
  try {
    await updateDoc(inboxDoc(itemId), {
      status: 'dismissed',
      acknowledgedBy: userId,
      acknowledgedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${INBOX_COL}/${itemId}`);
  }
}

/** Generate and persist inbox items from decisions for a project. */
export async function syncInboxFromDecisions(
  projectId: string,
  decisions: ProjectDecision[],
  tenantId?: string,
): Promise<(InboxItemRecord & { id: string })[]> {
  const items = buildMobileDecisionInbox(decisions);
  const results: (InboxItemRecord & { id: string })[] = [];
  for (const item of items) {
    const saved = await saveInboxItem(projectId, item, tenantId);
    results.push(saved);
  }
  return results;
}

/** Build a complete unified snapshot with inbox items and persist it. */
export async function buildAndPersistUnifiedSnapshot(input: {
  context: ProjectContext;
  records: ProjectRecordRef[];
  decisions: ProjectDecision[];
}): Promise<UnifiedProjectOperatingSnapshot> {
  const snapshot = createUnifiedProjectSnapshot(input);
  snapshot.inbox = buildMobileDecisionInbox(input.decisions);

  // Persist inbox items
  await syncInboxFromDecisions(input.context.projectId, input.decisions, input.context.tenantId);

  return snapshot;
}

/** Subscribe to real-time inbox items for a project. */
export function subscribeToInboxItems(
  projectId: string,
  cb: (items: (InboxItemRecord & { id: string })[]) => void,
): () => void {
  const q = query(
    projectInboxCollection(projectId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ itemId: d.id, ...(d.data() as InboxItemRecord), id: d.id }))),
    (error) => {
      console.error('Error subscribing to inbox items:', error);
      cb([]);
    },
  );
}

// ─── Aggregated Service Export ───────────────────────────────────────────────

export const unifiedService = {
  createUnifiedProjectSnapshot,
  summarizeOperatingState,
  buildMobileDecisionInbox,
  saveInboxItem,
  getPendingInboxItems,
  acknowledgeInboxItem,
  completeInboxItem,
  dismissInboxItem,
  syncInboxFromDecisions,
  buildAndPersistUnifiedSnapshot,
  subscribeToInboxItems,
};

export default unifiedService;
