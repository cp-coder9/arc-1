import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SiteProjectRecord, SiteExecutionPhase } from '@/types';

const PROJECTS_COL = 'projects';
const PROJECT_RECORDS_COL = 'project_records';

type FirestoreUnsubscribe = () => void;

function recordsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, PROJECT_RECORDS_COL);
}

function recordDocument(projectId: string, recordId: string) {
  if (!recordId) throw new Error('recordId is required');
  return doc(db, PROJECTS_COL, projectId, PROJECT_RECORDS_COL, recordId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

const MODULE_KEY = 'site_execution_field_control';

export async function createProjectRecord(input: {
  projectId: string;
  tenantId: string;
  phase: SiteExecutionPhase;
  recordType: string;
  title: string;
  status: string;
  payload: unknown;
  linkedRecordIds?: string[];
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const record: Omit<SiteProjectRecord, 'id'> = {
      projectId: input.projectId,
      tenantId: input.tenantId,
      phase: input.phase,
      moduleKey: MODULE_KEY,
      recordType: input.recordType,
      title: input.title,
      status: input.status,
      payload: input.payload,
      linkedRecordIds: input.linkedRecordIds ?? [],
      createdBy: input.createdBy,
      createdAt: now,
    };
    const ref = await addDoc(recordsCollection(input.projectId), record);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${PROJECT_RECORDS_COL}`);
  }
}

export async function getProjectRecords(projectId: string): Promise<SiteProjectRecord[]> {
  try {
    const snap = await getDocs(query(recordsCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<SiteProjectRecord>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${PROJECT_RECORDS_COL}`);
  }
}

export function subscribeToProjectRecords(
  projectId: string,
  cb: (records: SiteProjectRecord[]) => void,
): FirestoreUnsubscribe {
  const q = query(recordsCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SiteProjectRecord>(d))), (error) => {
    console.error('Failed to subscribe to project records:', error);
    cb([]);
  });
}

export async function getRecordsByType(
  projectId: string,
  recordType: string,
): Promise<SiteProjectRecord[]> {
  const records = await getProjectRecords(projectId);
  return records.filter((r) => r.recordType === recordType);
}

export const projectRecordAdapter = {
  createProjectRecord,
  getProjectRecords,
  subscribeToProjectRecords,
  getRecordsByType,
  MODULE_KEY,
};

export default projectRecordAdapter;
