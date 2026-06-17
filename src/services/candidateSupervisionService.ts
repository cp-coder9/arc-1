import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,

  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import type { CandidateSupervisionLog, SupervisionLogStatus } from '@/types';
import { notificationService } from './notificationService';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const SUPERVISION_COL = 'supervision_logs';

const VALID_STATUSES: SupervisionLogStatus[] = ['draft', 'submitted', 'reviewed', 'signed_off', 'rejected'];

function assertValidStatus(status: SupervisionLogStatus): void {
  if (!VALID_STATUSES.includes(status)) throw new Error(`Invalid supervision log status: ${status}`);
}

export async function createSupervisionLog(input: {
  candidateId: string;
  mentorId: string;
  firmId: string;
  projectId?: string;
  periodStart: string;
  periodEnd: string;
  hoursLogged: number;
  activities: string;
  category?: string;
  sacapCategory?: string;
}): Promise<CandidateSupervisionLog> {
  try {
    if (!input.candidateId || !input.mentorId || !input.firmId || !input.periodStart || !input.periodEnd || input.hoursLogged === undefined || !input.activities) {
      throw new Error('candidateId, mentorId, firmId, periodStart, periodEnd, hoursLogged, and activities are required.');
    }
    if (input.hoursLogged < 0) throw new Error('hoursLogged cannot be negative.');

    const now = new Date().toISOString();
    const ref = doc(getDemoCol( SUPERVISION_COL));
    const log: CandidateSupervisionLog = {
      id: ref.id,
      candidateId: input.candidateId,
      mentorId: input.mentorId,
      firmId: input.firmId,
      projectId: input.projectId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      hoursLogged: input.hoursLogged,
      activities: input.activities.trim(),
      category: input.category?.trim(),
      sacapCategory: input.sacapCategory?.trim(),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, log);

    await notificationService.sendNotification(
      input.mentorId,
      'supervision_log_required',
      `New supervision log created for candidate. ${input.hoursLogged}h logged.`,
      { entityId: ref.id, firmId: input.firmId }
    );

    return log;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, SUPERVISION_COL);
  }
}

export async function submitForReview(logId: string, actorId: string): Promise<void> {
  try {
    const logRef = getDemoDoc( SUPERVISION_COL, logId);
    const logSnap = await getDoc(logRef);
    if (!logSnap.exists()) throw new Error('Supervision log not found.');

    const log = { id: logSnap.id, ...logSnap.data() } as CandidateSupervisionLog;
    if (log.status !== 'draft' && log.status !== 'rejected') {
      throw new Error(`Cannot submit a log with status: ${log.status}`);
    }

    const now = new Date().toISOString();
    await updateDoc(logRef, { status: 'submitted', updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SUPERVISION_COL}/${logId}`);
  }
}

export async function reviewLog(logId: string, mentorId: string, mentorNotes?: string): Promise<void> {
  try {
    const logRef = getDemoDoc( SUPERVISION_COL, logId);
    const logSnap = await getDoc(logRef);
    if (!logSnap.exists()) throw new Error('Supervision log not found.');

    const log = { id: logSnap.id, ...logSnap.data() } as CandidateSupervisionLog;
    if (log.mentorId !== mentorId) throw new Error('Only the assigned mentor can review this log.');
    if (log.status !== 'submitted') throw new Error(`Cannot review a log with status: ${log.status}`);

    const now = new Date().toISOString();
    await updateDoc(logRef, { status: 'reviewed', mentorNotes: mentorNotes?.trim(), updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SUPERVISION_COL}/${logId}`);
  }
}

export async function signOffLog(logId: string, mentorId: string): Promise<void> {
  try {
    const logRef = getDemoDoc( SUPERVISION_COL, logId);
    const logSnap = await getDoc(logRef);
    if (!logSnap.exists()) throw new Error('Supervision log not found.');

    const log = { id: logSnap.id, ...logSnap.data() } as CandidateSupervisionLog;
    if (log.mentorId !== mentorId) throw new Error('Only the assigned mentor can sign off this log.');
    if (log.status !== 'reviewed') throw new Error(`Cannot sign off a log with status: ${log.status}`);

    const now = new Date().toISOString();
    await updateDoc(logRef, { status: 'signed_off', signedOffBy: mentorId, signedOffAt: now, updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SUPERVISION_COL}/${logId}`);
  }
}

export async function rejectLog(logId: string, mentorId: string, reason: string): Promise<void> {
  try {
    const logRef = getDemoDoc( SUPERVISION_COL, logId);
    const logSnap = await getDoc(logRef);
    if (!logSnap.exists()) throw new Error('Supervision log not found.');

    const log = { id: logSnap.id, ...logSnap.data() } as CandidateSupervisionLog;
    if (log.mentorId !== mentorId) throw new Error('Only the assigned mentor can reject this log.');

    const now = new Date().toISOString();
    await updateDoc(logRef, { status: 'rejected', rejectedReason: reason.trim(), updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SUPERVISION_COL}/${logId}`);
  }
}

export async function getSupervisionLog(id: string): Promise<CandidateSupervisionLog | null> {
  try {
    const snap = await getDoc(getDemoDoc( SUPERVISION_COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as CandidateSupervisionLog) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${SUPERVISION_COL}/${id}`);
  }
}

export async function getCandidateLogs(candidateId: string, firmId: string): Promise<CandidateSupervisionLog[]> {
  try {
    const q = query(
      getDemoCol( SUPERVISION_COL),
      where('candidateId', '==', candidateId),
      where('firmId', '==', firmId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CandidateSupervisionLog));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SUPERVISION_COL);
  }
}

export async function getMentorLogs(mentorId: string, firmId: string): Promise<CandidateSupervisionLog[]> {
  try {
    const q = query(
      getDemoCol( SUPERVISION_COL),
      where('mentorId', '==', mentorId),
      where('firmId', '==', firmId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CandidateSupervisionLog));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SUPERVISION_COL);
  }
}

export async function getFirmSupervisionLogs(firmId: string, filters?: { status?: SupervisionLogStatus }): Promise<CandidateSupervisionLog[]> {
  try {
    const constraints = [where('firmId', '==', firmId), orderBy('createdAt', 'desc')];
    if (filters?.status) constraints.unshift(where('status', '==', filters.status));

    const q = query(getDemoCol( SUPERVISION_COL), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CandidateSupervisionLog));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SUPERVISION_COL);
  }
}

export async function deleteSupervisionLog(id: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(getDemoDoc( SUPERVISION_COL, id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${SUPERVISION_COL}/${id}`);
  }
}

export function subscribeToCandidateLogs(candidateId: string, firmId: string, callback: (logs: CandidateSupervisionLog[]) => void): () => void {
  return onSnapshot(
    query(getDemoCol( SUPERVISION_COL), where('candidateId', '==', candidateId), where('firmId', '==', firmId), orderBy('createdAt', 'desc')),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CandidateSupervisionLog))),
    (error) => {
      console.error('Failed to subscribe to candidate logs:', error);
      callback([]);
    }
  );
}

export const candidateSupervisionService = {
  createSupervisionLog,
  submitForReview,
  reviewLog,
  signOffLog,
  rejectLog,
  getSupervisionLog,
  getCandidateLogs,
  getMentorLogs,
  getFirmSupervisionLogs,
  deleteSupervisionLog,
  subscribeToCandidateLogs,
};

export default candidateSupervisionService;
