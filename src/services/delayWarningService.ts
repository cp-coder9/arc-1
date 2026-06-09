import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { DelayEarlyWarning, DelayWarningCause, DelayWarningStatus } from '@/types';

const PROJECTS_COL = 'projects';
const DELAY_WARNINGS_COL = 'delay_warnings';

type FirestoreUnsubscribe = () => void;

function warningsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, DELAY_WARNINGS_COL);
}

function warningDocument(projectId: string, warningId: string) {
  if (!warningId) throw new Error('warningId is required');
  return doc(db, PROJECTS_COL, projectId, DELAY_WARNINGS_COL, warningId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

/** Delay warning state machine */
const WARNING_TRANSITIONS: Record<DelayWarningStatus, DelayWarningStatus[]> = {
  recorded: ['notice_required', 'closed'],
  notice_required: ['under_review', 'closed'],
  under_review: ['closed'],
  closed: [],
};

export function isValidWarningTransition(from: DelayWarningStatus, to: DelayWarningStatus): boolean {
  return WARNING_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createDelayEarlyWarning(input: {
  projectId: string;
  cause: DelayWarningCause;
  description: string;
  noticeDeadline: string;
  likelyProgrammeImpactDays: number;
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const warning: Omit<DelayEarlyWarning, 'id'> = {
      projectId: input.projectId,
      cause: input.cause,
      description: input.description,
      noticeDeadline: input.noticeDeadline,
      likelyProgrammeImpactDays: input.likelyProgrammeImpactDays,
      status: input.likelyProgrammeImpactDays > 0 ? 'notice_required' : 'recorded',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(warningsCollection(input.projectId), warning);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${DELAY_WARNINGS_COL}`);
  }
}

export async function escalateToNotice(
  projectId: string,
  warningId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(warningDocument(projectId, warningId), {
      status: 'notice_required',
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${DELAY_WARNINGS_COL}/${warningId}`);
  }
}

export async function submitForReview(
  projectId: string,
  warningId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(warningDocument(projectId, warningId), {
      status: 'under_review',
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${DELAY_WARNINGS_COL}/${warningId}`);
  }
}

export async function closeWarning(
  projectId: string,
  warningId: string,
  reviewedBy?: string,
  reviewNotes?: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: 'closed',
      updatedAt: now,
    };
    if (reviewedBy) {
      update.reviewedBy = reviewedBy;
      update.reviewedAt = now;
    }
    if (reviewNotes) update.reviewNotes = reviewNotes;
    await updateDoc(warningDocument(projectId, warningId), update);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${DELAY_WARNINGS_COL}/${warningId}`);
  }
}

export async function getDelayWarnings(projectId: string): Promise<DelayEarlyWarning[]> {
  try {
    const snap = await getDocs(query(warningsCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<DelayEarlyWarning>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${DELAY_WARNINGS_COL}`);
  }
}

export function subscribeToDelayWarnings(
  projectId: string,
  cb: (warnings: DelayEarlyWarning[]) => void,
): FirestoreUnsubscribe {
  const q = query(warningsCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<DelayEarlyWarning>(d))), (error) => {
    console.error('Failed to subscribe to delay warnings:', error);
    cb([]);
  });
}

export async function getActiveWarnings(projectId: string): Promise<DelayEarlyWarning[]> {
  const warnings = await getDelayWarnings(projectId);
  return warnings.filter((w) => w.status !== 'closed');
}

export const delayWarningService = {
  createDelayEarlyWarning,
  escalateToNotice,
  submitForReview,
  closeWarning,
  getDelayWarnings,
  subscribeToDelayWarnings,
  getActiveWarnings,
  isValidWarningTransition,
};

export default delayWarningService;
