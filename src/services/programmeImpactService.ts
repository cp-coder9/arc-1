import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { ProgrammeImpact, ProgrammeImpactSourceType } from '@/types';

const PROJECTS_COL = 'projects';
const PROGRAMME_IMPACTS_COL = 'programme_impacts';

type FirestoreUnsubscribe = () => void;

function impactsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, PROGRAMME_IMPACTS_COL);
}

function impactDocument(projectId: string, impactId: string) {
  if (!impactId) throw new Error('impactId is required');
  return doc(db, PROJECTS_COL, projectId, PROGRAMME_IMPACTS_COL, impactId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

export async function assessProgrammeImpact(input: {
  projectId: string;
  sourceObjectId: string;
  sourceType: ProgrammeImpactSourceType;
  estimatedDays: number;
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const impact: Omit<ProgrammeImpact, 'id'> = {
      projectId: input.projectId,
      sourceObjectId: input.sourceObjectId,
      sourceType: input.sourceType,
      estimatedDays: input.estimatedDays,
      requiresPlannerReview: input.estimatedDays > 0,
      createdBy: input.createdBy,
      createdAt: now,
    };
    const ref = await addDoc(impactsCollection(input.projectId), impact);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${PROGRAMME_IMPACTS_COL}`);
  }
}

export async function reviewProgrammeImpact(
  projectId: string,
  impactId: string,
  reviewedBy: string,
  reviewNotes?: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(impactDocument(projectId, impactId), {
      reviewedBy,
      reviewedAt: now,
      reviewNotes: reviewNotes ?? '',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PROGRAMME_IMPACTS_COL}/${impactId}`);
  }
}

export async function getProgrammeImpacts(projectId: string): Promise<ProgrammeImpact[]> {
  try {
    const snap = await getDocs(query(impactsCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<ProgrammeImpact>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${PROGRAMME_IMPACTS_COL}`);
  }
}

export function subscribeToProgrammeImpacts(
  projectId: string,
  cb: (impacts: ProgrammeImpact[]) => void,
): FirestoreUnsubscribe {
  const q = query(impactsCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<ProgrammeImpact>(d))), (error) => {
    console.error('Failed to subscribe to programme impacts:', error);
    cb([]);
  });
}

export async function getImpactsRequiringReview(projectId: string): Promise<ProgrammeImpact[]> {
  const impacts = await getProgrammeImpacts(projectId);
  return impacts.filter((i) => i.requiresPlannerReview && !i.reviewedBy);
}

export const programmeImpactService = {
  assessProgrammeImpact,
  reviewProgrammeImpact,
  getProgrammeImpacts,
  subscribeToProgrammeImpacts,
  getImpactsRequiringReview,
};

export default programmeImpactService;
