import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { PaymentBlocker, BlockerSourceType, Severity, NonConformanceReport, SnagItem, InspectionRecord } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const BLOCKERS_COL = 'payment_blockers';

type FirestoreUnsubscribe = () => void;

function blockersCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, BLOCKERS_COL);
}

function blockerDocument(projectId: string, blockerId: string) {
  if (!blockerId) throw new Error('blockerId is required');
  return getDemoDoc( PROJECTS_COL, projectId, BLOCKERS_COL, blockerId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

export async function createPaymentBlocker(input: {
  projectId: string;
  sourceObjectId: string;
  sourceType: BlockerSourceType;
  reason: string;
  severity: Severity;
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

export async function getActiveBlockers(projectId: string): Promise<PaymentBlocker[]> {
  const blockers = await getPaymentBlockers(projectId);
  return blockers.filter((b) => b.status === 'active');
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

/** Derive payment blockers from field-control items that block payment */
export function blockersFromFieldItems(
  items: Array<NonConformanceReport | SnagItem | InspectionRecord>,
  projectId: string,
  createdBy: string,
): Array<Omit<PaymentBlocker, 'id' | 'createdAt'>> {
  return items
    .filter((item) => {
      if ('blocksPayment' in item) return !!(item as any).blocksPayment;
      // Inspections with failed results block payment
      if ('overallResult' in item) return (item as any).overallResult === 'fail';
      return false;
    })
    .map((item) => {
      let sourceType: BlockerSourceType;
      let sourceObjectId: string;
      let reason: string;
      let severity: Severity;

      // Discriminate by distinguishing fields:
      // NCR: has severity + responsiblePartyId (and may have correctiveAction)
      // Snag: has location field
      // Inspection: has inspectionType or overallResult
      if (('severity' in item && 'responsiblePartyId' in item) || 'ncrId' in item) {
        // NCR
        const ncr = item as NonConformanceReport;
        sourceType = 'ncr';
        sourceObjectId = (item as any).ncrId || ncr.id;
        reason = `Unresolved NCR: ${ncr.title ?? (ncr as any).title}`;
        severity = ncr.severity;
      } else if ('location' in item || 'snagId' in item) {
        // Snag
        const snag = item as SnagItem;
        sourceType = 'snag';
        sourceObjectId = (item as any).snagId || snag.id;
        reason = `Unresolved snag: ${snag.description}`;
        severity = snag.priority;
      } else {
        // Inspection
        const inspection = item as InspectionRecord;
        sourceType = 'inspection';
        sourceObjectId = inspection.id;
        reason = `Failed inspection: ${(inspection as any).inspectionType ?? 'unknown'}`;
        severity = 'high';
      }

      return {
        projectId,
        sourceObjectId,
        sourceType,
        reason,
        severity,
        status: 'active' as const,
        createdBy,
      };
    });
}

export async function syncBlockersFromFieldState(
  projectId: string,
  ncrs: NonConformanceReport[],
  snags: SnagItem[],
  createdBy: string,
): Promise<number> {
  const items = [...ncrs, ...snags].filter(
    (item) => 'blocksPayment' in item && (item as NonConformanceReport | SnagItem).blocksPayment
  ) as Array<NonConformanceReport | SnagItem>;
  const newBlockers = blockersFromFieldItems(items, projectId, createdBy);
  let count = 0;
  for (const blocker of newBlockers) {
    try {
      const now = new Date().toISOString();
      await addDoc(blockersCollection(projectId), { ...blocker, createdAt: now });
      count++;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${BLOCKERS_COL}`);
    }
  }
  return count;
}

export const paymentBlockerService = {
  createPaymentBlocker,
  clearPaymentBlocker,
  getPaymentBlockers,
  getActiveBlockers,
  subscribeToPaymentBlockers,
  blockersFromFieldItems,
  syncBlockersFromFieldState,
};

export default paymentBlockerService;
