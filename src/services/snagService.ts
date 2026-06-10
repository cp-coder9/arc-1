import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SnagItem, SnagStatus, Severity } from '@/types';

const PROJECTS_COL = 'projects';
const SNAGS_COL = 'snags';

type FirestoreUnsubscribe = () => void;

function snagsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, SNAGS_COL);
}

function snagDocument(projectId: string, snagId: string) {
  if (!snagId) throw new Error('snagId is required');
  return doc(db, PROJECTS_COL, projectId, SNAGS_COL, snagId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

/** Snag state machine: valid transitions */
const SNAG_TRANSITIONS: Record<SnagStatus, SnagStatus[]> = {
  open: ['allocated', 'rejected'],
  allocated: ['ready_for_reinspection', 'rejected'],
  ready_for_reinspection: ['closed', 'allocated'],
  closed: [],
  rejected: ['open'],
};

export function isValidSnagTransition(from: SnagStatus, to: SnagStatus): boolean {
  return SNAG_TRANSITIONS[from]?.includes(to) ?? false;
}

export function snagBlocksPayment(priority: Severity): boolean {
  return priority === 'high' || priority === 'critical';
}

export async function createSnag(input: {
  projectId: string;
  location: string;
  description: string;
  priority: Severity;
  responsiblePartyId: string;
  dueDate: string;
  evidenceIds?: string[];
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const snag: Omit<SnagItem, 'id'> = {
      projectId: input.projectId,
      location: input.location,
      description: input.description,
      priority: input.priority,
      responsiblePartyId: input.responsiblePartyId,
      dueDate: input.dueDate,
      evidenceIds: input.evidenceIds ?? [],
      status: 'allocated',
      blocksPayment: snagBlocksPayment(input.priority),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(snagsCollection(input.projectId), snag);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${SNAGS_COL}`);
  }
}

export async function markSnagReadyForReinspection(
  projectId: string,
  snagId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(snagDocument(projectId, snagId));
      if (!snap.exists()) throw new Error(`Snag ${snagId} not found`);
      const current = snap.data() as SnagItem;
      if (!isValidSnagTransition(current.status, 'ready_for_reinspection')) {
        throw new Error(`Invalid transition from ${current.status} to ready_for_reinspection`);
      }
      transaction.update(snagDocument(projectId, snagId), {
        status: 'ready_for_reinspection',
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}/${snagId}`);
  }
}

export async function closeSnagAfterReinspection(
  projectId: string,
  snagId: string,
  closedBy: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(snagDocument(projectId, snagId));
      if (!snap.exists()) throw new Error(`Snag ${snagId} not found`);
      const current = snap.data() as SnagItem;
      if (!isValidSnagTransition(current.status, 'closed')) {
        throw new Error(`Invalid transition from ${current.status} to closed`);
      }
      transaction.update(snagDocument(projectId, snagId), {
        status: 'closed',
        blocksPayment: false,
        closedBy,
        closedAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}/${snagId}`);
  }
}

export async function rejectSnag(
  projectId: string,
  snagId: string,
  reason: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(snagDocument(projectId, snagId), {
      status: 'rejected',
      rejectedReason: reason,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}/${snagId}`);
  }
}

export async function reopenSnag(projectId: string, snagId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(snagDocument(projectId, snagId), { status: 'open', updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}/${snagId}`);
  }
}

export async function getSnags(projectId: string): Promise<SnagItem[]> {
  try {
    const snap = await getDocs(query(snagsCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<SnagItem>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}`);
  }
}

export function subscribeToSnags(projectId: string, cb: (snags: SnagItem[]) => void): FirestoreUnsubscribe {
  const q = query(snagsCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SnagItem>(d))), (error) => {
    console.error('Failed to subscribe to snags:', error);
    cb([]);
  });
}

export async function getActivePaymentBlockerSnags(projectId: string): Promise<SnagItem[]> {
  const snags = await getSnags(projectId);
  return snags.filter((s) => s.blocksPayment && s.status !== 'closed' && s.status !== 'rejected');
}

export const snagService = {
  createSnag,
  markSnagReadyForReinspection,
  closeSnagAfterReinspection,
  rejectSnag,
  reopenSnag,
  getSnags,
  subscribeToSnags,
  getActivePaymentBlockerSnags,
  isValidSnagTransition,
  snagBlocksPayment,
};

export default snagService;
