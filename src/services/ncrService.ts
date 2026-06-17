import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc, limit, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { NonConformanceReport, Severity, NCRStatus } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const NCR_COL = 'ncrs';

type FirestoreUnsubscribe = () => void;

function ncrCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, NCR_COL);
}

function ncrDocument(projectId: string, ncrId: string) {
  if (!ncrId) throw new Error('ncrId is required');
  return getDemoDoc( PROJECTS_COL, projectId, NCR_COL, ncrId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

/** NCR state machine: valid transitions */
const NCR_TRANSITIONS: Record<NCRStatus, NCRStatus[]> = {
  open: ['corrective_action_submitted', 'rejected'],
  corrective_action_submitted: ['verified_closed', 'open', 'rejected'],
  verified_closed: [],
  rejected: ['open'],
};

export function isValidNcrTransition(from: NCRStatus, to: NCRStatus): boolean {
  return NCR_TRANSITIONS[from]?.includes(to) ?? false;
}

export function ncrBlocksPayment(severity: Severity): boolean {
  return severity === 'high' || severity === 'critical';
}

export async function createNcr(input: {
  projectId: string;
  title: string;
  description?: string;
  severity: Severity;
  responsiblePartyId: string;
  correctiveAction?: string;
  evidenceIds?: string[];
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const ncr: Omit<NonConformanceReport, 'id'> = {
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? '',
      severity: input.severity,
      responsiblePartyId: input.responsiblePartyId,
      correctiveAction: input.correctiveAction ?? '',
      evidenceIds: input.evidenceIds ?? [],
      status: 'open',
      blocksPayment: ncrBlocksPayment(input.severity),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(ncrCollection(input.projectId), ncr);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${NCR_COL}`);
  }
}

export async function submitCorrectiveAction(
  projectId: string,
  ncrId: string,
  correctiveAction: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ncrDocument(projectId, ncrId));
      if (!snap.exists()) throw new Error(`NCR ${ncrId} not found`);
      const current = snap.data() as NonConformanceReport;
      if (!isValidNcrTransition(current.status, 'corrective_action_submitted')) {
        throw new Error(`Invalid transition from ${current.status} to corrective_action_submitted`);
      }
      transaction.update(ncrDocument(projectId, ncrId), {
        correctiveAction,
        status: 'corrective_action_submitted',
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${NCR_COL}/${ncrId}`);
  }
}

export async function verifyNcrClosed(
  projectId: string,
  ncrId: string,
  verifiedBy: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ncrDocument(projectId, ncrId));
      if (!snap.exists()) throw new Error(`NCR ${ncrId} not found`);
      const current = snap.data() as NonConformanceReport;
      if (!isValidNcrTransition(current.status, 'verified_closed')) {
        throw new Error(`Invalid transition from ${current.status} to verified_closed`);
      }
      transaction.update(ncrDocument(projectId, ncrId), {
        status: 'verified_closed',
        blocksPayment: false,
        verifiedBy,
        verifiedAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${NCR_COL}/${ncrId}`);
  }
}

export async function rejectNcr(
  projectId: string,
  ncrId: string,
  reason: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(ncrDocument(projectId, ncrId), {
      status: 'rejected',
      rejectedReason: reason,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${NCR_COL}/${ncrId}`);
  }
}

export async function reopenNcr(
  projectId: string,
  ncrId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(ncrDocument(projectId, ncrId), {
      status: 'open',
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${NCR_COL}/${ncrId}`);
  }
}

export async function getNcrs(projectId: string): Promise<NonConformanceReport[]> {
  try {
    const snap = await getDocs(query(ncrCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<NonConformanceReport>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${NCR_COL}`);
  }
}

export function subscribeToNcrs(projectId: string, cb: (ncrs: NonConformanceReport[]) => void): FirestoreUnsubscribe {
  const q = query(ncrCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<NonConformanceReport>(d))), (error) => {
    console.error('Failed to subscribe to NCRs:', error);
    cb([]);
  });
}

export async function getActivePaymentBlockerNcrs(projectId: string): Promise<NonConformanceReport[]> {
  const ncrs = await getNcrs(projectId);
  return ncrs.filter((ncr) => ncr.blocksPayment && ncr.status !== 'verified_closed' && ncr.status !== 'rejected');
}

export const ncrService = {
  createNcr,
  submitCorrectiveAction,
  verifyNcrClosed,
  rejectNcr,
  reopenNcr,
  getNcrs,
  subscribeToNcrs,
  getActivePaymentBlockerNcrs,
  isValidNcrTransition,
  ncrBlocksPayment,
};

export default ncrService;
