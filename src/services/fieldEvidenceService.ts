import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { FieldEvidence, EvidenceType } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const FIELD_EVIDENCE_COL = 'field_evidence';

type FirestoreUnsubscribe = () => void;

function evidenceCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, FIELD_EVIDENCE_COL);
}

function evidenceDocument(projectId: string, evidenceId: string) {
  if (!evidenceId) throw new Error('evidenceId is required');
  return getDemoDoc( PROJECTS_COL, projectId, FIELD_EVIDENCE_COL, evidenceId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

export async function captureEvidence(input: {
  projectId: string;
  type: EvidenceType;
  title: string;
  uri: string;
  location?: string;
  gps?: { lat: number; lng: number };
  capturedBy: string;
  linkedObjectId?: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const evidence: Omit<FieldEvidence, 'id'> = {
      projectId: input.projectId,
      type: input.type,
      title: input.title,
      uri: input.uri,
      location: input.location,
      gps: input.gps,
      capturedBy: input.capturedBy,
      capturedAt: now,
      linkedObjectId: input.linkedObjectId,
    };
    const ref = await addDoc(evidenceCollection(input.projectId), evidence);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${FIELD_EVIDENCE_COL}`);
  }
}

export async function getEvidence(projectId: string): Promise<FieldEvidence[]> {
  try {
    const snap = await getDocs(query(evidenceCollection(projectId), orderBy('capturedAt', 'desc')));
    return snap.docs.map((d) => withId<FieldEvidence>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${FIELD_EVIDENCE_COL}`);
  }
}

export function subscribeToEvidence(
  projectId: string,
  cb: (evidence: FieldEvidence[]) => void,
): FirestoreUnsubscribe {
  const q = query(evidenceCollection(projectId), orderBy('capturedAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<FieldEvidence>(d))), (error) => {
    console.error('Failed to subscribe to field evidence:', error);
    cb([]);
  });
}

export async function getEvidenceForObject(
  projectId: string,
  linkedObjectId: string,
): Promise<FieldEvidence[]> {
  const all = await getEvidence(projectId);
  return all.filter((e) => e.linkedObjectId === linkedObjectId);
}

export const fieldEvidenceService = {
  captureEvidence,
  getEvidence,
  subscribeToEvidence,
  getEvidenceForObject,
};

export default fieldEvidenceService;
