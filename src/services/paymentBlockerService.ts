import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { PaymentBlocker, NonConformanceReport, SnagItem, InspectionRecord } from '@/types';

const PROJECTS_COL = 'projects';
const BLOCKERS_COL = 'payment_blockers';

type FirestoreUnsubscribe = () => void;

function blockersCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, BLOCKERS_COL);
}

function blockerDocument(projectId: string, blockerId: string) {
  if (!blockerId) throw new Error('blockerId is required');
  return doc(db, PROJECTS_COL, projectId, BLOCKERS_COL, blockerId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

/** Derive payment blockers from unresolved NCRs and snags */
export async function derivePaymentBlockers(
  projectId: string,
  ncrs: NonConformanceReport[],
  snags: SnagItem[],
  createdBy: string,
): Promise<PaymentBlocker[]> {
  const blockers: PaymentBlocker[] = [];
  const now = new Date().toISOString();

  for (const ncr of ncrs) {
    if (ncr.blocksPayment && ncr.status !== 'verified_closed' && ncr.status !== 'rejected') {
      blockers.push({
        id: '', // placeholder — Firestore will assign
        projectId,
        sourceObjectId: ncr.id,
        sourceType: 'ncr',
        reason: `Unresolved NCR: ${ncr.title}`,
        severity: ncr.severity,
        status: 'active',
        createdBy,
        createdAt: now,
      });
    }
  }

  for (const snag of snags) {
    if (snag.blocksPayment && snag.status !== 'closed' && snag.status !== 'rejected') {
      blockers.push({
        id: '',
        projectId,
        sourceObjectId: snag.id,
        sourceType: 'snag',
        reason: `Unresolved snag: ${snag.description}`,
        severity: snag.priority,
        status: 'active',
        createdBy,
        createdAt: now,
      });
    }
  }

  return blockers;
}

export async function createPaymentBlocker(input: {
  projectId: string;
  sourceObjectId: string;
  sourceType: PaymentBlocker['sourceType'];
  reason: string;
  severity: PaymentBlocker['severity'];
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const blocker: Omit<PaymentBlocker, 'id'> = {
      projectId: input.projectId,
      sourceObjectId: input.sourceObjectId,
      sourceType: input.sourceType,
      reason: input.reason,
      severity: input.severity,
      status: 'active',
      createdBy: input.createdBy,
      createdAt: now,
    };
    const ref = await addDoc(blockersCollection(input.projectId), blocker);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${BLOCKERS_COL}`);
  }
}

export async function clearPaymentBlocker(
  projectId: string,
  blockerId: string,
  clearedBy: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(blockerDocument(projectId, blockerId), {
      status: 'cleared',
      clearedBy,
      clearedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${BLOCKERS_COL}/${blockerId}`);
  }
}

export async function getPaymentBlockers(projectId: string): Promise<PaymentBlocker[]> {
  try {
    const snap = await getDocs(query(blockersCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<PaymentBlocker>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${BLOCKERS_COL}`);
  }
}

export function subscribeToPaymentBlockers(
  projectId: string,
  cb: (blockers: PaymentBlocker[]) => void,
): FirestoreUnsubscribe {
  const q = query(blockersCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<PaymentBlocker>(d))), (error) => {
    console.error('Failed to subscribe to payment blockers:', error);
    cb([]);
  });
}

export async function getActiveBlockers(projectId: string): Promise<PaymentBlocker[]> {
  const blockers = await getPaymentBlockers(projectId);
  return blockers.filter((b) => b.status === 'active');
}

export const paymentBlockerService = {
  derivePaymentBlockers,
  createPaymentBlocker,
  clearPaymentBlocker,
  getPaymentBlockers,
  subscribeToPaymentBlockers,
  getActiveBlockers,
};

export default paymentBlockerService;
