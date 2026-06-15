import { collection, doc, addDoc, getDocs, getDoc, onSnapshot, query, orderBy, updateDoc, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SnagResolution, SnagResolutionStatus } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const SNAG_RESOLUTIONS_COL = 'snag_resolutions';

type FirestoreUnsubscribe = () => void;

function resolutionsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, SNAG_RESOLUTIONS_COL);
}

function resolutionDocument(projectId: string, resolutionId: string) {
  if (!resolutionId) throw new Error('resolutionId is required');
  return getDemoDoc( PROJECTS_COL, projectId, SNAG_RESOLUTIONS_COL, resolutionId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

/** Snag resolution state machine */
const RESOLUTION_TRANSITIONS: Record<SnagResolutionStatus, SnagResolutionStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['resolved', 'pending'],
  resolved: ['verified_closed', 'rejected'],
  verified_closed: [],
  rejected: ['in_progress', 'pending'],
};

export function isValidResolutionTransition(from: SnagResolutionStatus, to: SnagResolutionStatus): boolean {
  return RESOLUTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createResolution(input: {
  projectId: string;
  snagId: string;
  resolution: string;
  resolvedBy: string;
  evidenceIds?: string[];
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const resolution: Omit<SnagResolution, 'id'> = {
      projectId: input.projectId,
      snagId: input.snagId,
      resolution: input.resolution,
      resolvedBy: input.resolvedBy,
      resolvedAt: now,
      evidenceIds: input.evidenceIds ?? [],
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(resolutionsCollection(input.projectId), resolution);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${SNAG_RESOLUTIONS_COL}`);
  }
}

export async function markInProgress(
  projectId: string,
  resolutionId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(resolutionDocument(projectId, resolutionId));
      if (!snap.exists()) throw new Error(`Resolution ${resolutionId} not found`);
      const current = snap.data() as SnagResolution;
      if (!isValidResolutionTransition(current.status, 'in_progress')) {
        throw new Error(`Invalid transition from ${current.status} to in_progress`);
      }
      transaction.update(resolutionDocument(projectId, resolutionId), {
        status: 'in_progress',
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAG_RESOLUTIONS_COL}/${resolutionId}`);
  }
}

export async function markResolved(
  projectId: string,
  resolutionId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(resolutionDocument(projectId, resolutionId));
      if (!snap.exists()) throw new Error(`Resolution ${resolutionId} not found`);
      const current = snap.data() as SnagResolution;
      if (!isValidResolutionTransition(current.status, 'resolved')) {
        throw new Error(`Invalid transition from ${current.status} to resolved`);
      }
      transaction.update(resolutionDocument(projectId, resolutionId), {
        status: 'resolved',
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAG_RESOLUTIONS_COL}/${resolutionId}`);
  }
}

export async function verifyResolution(
  projectId: string,
  resolutionId: string,
  verifiedBy: string,
  verificationNotes?: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(resolutionDocument(projectId, resolutionId));
      if (!snap.exists()) throw new Error(`Resolution ${resolutionId} not found`);
      const current = snap.data() as SnagResolution;
      if (!isValidResolutionTransition(current.status, 'verified_closed')) {
        throw new Error(`Invalid transition from ${current.status} to verified_closed`);
      }
      transaction.update(resolutionDocument(projectId, resolutionId), {
        status: 'verified_closed',
        verifiedBy,
        verifiedAt: now,
        verificationNotes,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAG_RESOLUTIONS_COL}/${resolutionId}`);
  }
}

export async function rejectResolution(
  projectId: string,
  resolutionId: string,
  verifiedBy: string,
  verificationNotes?: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(resolutionDocument(projectId, resolutionId));
      if (!snap.exists()) throw new Error(`Resolution ${resolutionId} not found`);
      const current = snap.data() as SnagResolution;
      if (!isValidResolutionTransition(current.status, 'rejected')) {
        throw new Error(`Invalid transition from ${current.status} to rejected`);
      }
      transaction.update(resolutionDocument(projectId, resolutionId), {
        status: 'rejected',
        verifiedBy,
        verifiedAt: now,
        verificationNotes,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAG_RESOLUTIONS_COL}/${resolutionId}`);
  }
}

export async function updateResolution(
  projectId: string,
  resolutionId: string,
  updates: Partial<Pick<SnagResolution, 'resolution' | 'evidenceIds'>>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(resolutionDocument(projectId, resolutionId), { ...updates, updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAG_RESOLUTIONS_COL}/${resolutionId}`);
  }
}

export async function getResolutions(projectId: string): Promise<SnagResolution[]> {
  try {
    const snap = await getDocs(query(resolutionsCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<SnagResolution>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SNAG_RESOLUTIONS_COL}`);
  }
}

export async function getResolutionsBySnag(projectId: string, snagId: string): Promise<SnagResolution[]> {
  try {
    const all = await getResolutions(projectId);
    return all.filter((r) => r.snagId === snagId);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SNAG_RESOLUTIONS_COL}`);
  }
}

export async function getResolution(projectId: string, resolutionId: string): Promise<SnagResolution | null> {
  try {
    const snap = await getDoc(resolutionDocument(projectId, resolutionId));
    if (!snap.exists()) return null;
    return withId<SnagResolution>(snap);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SNAG_RESOLUTIONS_COL}/${resolutionId}`);
  }
}

export function subscribeToResolutions(
  projectId: string,
  cb: (resolutions: SnagResolution[]) => void,
): FirestoreUnsubscribe {
  const q = query(resolutionsCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SnagResolution>(d))), (error) => {
    console.error('Failed to subscribe to snag resolutions:', error);
    cb([]);
  });
}

export const snagResolutionService = {
  createResolution,
  markInProgress,
  markResolved,
  verifyResolution,
  rejectResolution,
  updateResolution,
  getResolutions,
  getResolutionsBySnag,
  getResolution,
  subscribeToResolutions,
  isValidResolutionTransition,
};

export default snagResolutionService;
