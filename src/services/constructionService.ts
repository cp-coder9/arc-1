import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';
import type { GanttTask, RFI, SiteInspection, SiteLog } from '@/types';

const PROJECTS_COL = 'projects';
const GANTT_TASKS_COL = 'gantt_tasks';
const SITE_LOGS_COL = 'site_logs';
const RFIS_COL = 'rfis';
const INSPECTIONS_COL = 'inspections';

type FirestoreUnsubscribe = () => void;
type NewGanttTask = Omit<GanttTask, 'id' | 'createdAt' | 'updatedAt'>;
type NewSiteLog = Omit<SiteLog, 'id' | 'createdAt'>;
type NewRFI = Omit<RFI, 'id' | 'number' | 'status' | 'response' | 'responseAttachments' | 'respondedBy' | 'respondedAt' | 'createdAt' | 'updatedAt'>;
type NewInspection = Omit<SiteInspection, 'id' | 'createdAt'>;

function projectSubcollection(projectId: string, subcollection: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, subcollection);
}

function projectDocument(projectId: string, subcollection: string, documentId: string) {
  if (!documentId) throw new Error('documentId is required');
  return doc(db, PROJECTS_COL, projectId, subcollection, documentId);
}

function withId<T extends { id: string }>(documentSnapshot: { id: string; data: () => Record<string, unknown> }): T {
  return { id: documentSnapshot.id, ...documentSnapshot.data() } as T;
}

function activeRFIStatus(rfi: RFI): RFI['status'] {
  if (rfi.status === 'open' && new Date(rfi.dueDate).getTime() < Date.now()) return 'overdue';
  return rfi.status;
}

function normalizeRFI(rfi: RFI): RFI {
  return { ...rfi, status: activeRFIStatus(rfi) };
}

export async function createGanttTask(data: NewGanttTask): Promise<string> {
  try {
    const now = new Date().toISOString();
    const task: Omit<GanttTask, 'id'> = {
      ...data,
      progress: Math.min(100, Math.max(0, data.progress)),
      dependsOn: data.dependsOn ?? [],
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(projectSubcollection(data.projectId, GANTT_TASKS_COL), task);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${data.projectId}/${GANTT_TASKS_COL}`);
  }
}

export async function updateGanttTask(taskId: string, updates: Partial<Omit<GanttTask, 'id' | 'projectId' | 'createdAt'>> & { projectId: string }): Promise<void> {
  try {
    const { projectId, ...taskUpdates } = updates;
    const sanitized = 'progress' in taskUpdates && typeof taskUpdates.progress === 'number'
      ? { ...taskUpdates, progress: Math.min(100, Math.max(0, taskUpdates.progress)) }
      : taskUpdates;
    await updateDoc(projectDocument(projectId, GANTT_TASKS_COL, taskId), {
      ...sanitized,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${updates.projectId}/${GANTT_TASKS_COL}/${taskId}`);
  }
}

export async function getGanttTasks(projectId: string): Promise<GanttTask[]> {
  try {
    const snap = await getDocs(query(projectSubcollection(projectId, GANTT_TASKS_COL), orderBy('startDate', 'asc')));
    return snap.docs.map((documentSnapshot) => withId<GanttTask>(documentSnapshot));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${GANTT_TASKS_COL}`);
  }
}

export function subscribeToGanttTasks(projectId: string, cb: (tasks: GanttTask[]) => void): FirestoreUnsubscribe {
  const q = query(projectSubcollection(projectId, GANTT_TASKS_COL), orderBy('startDate', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((documentSnapshot) => withId<GanttTask>(documentSnapshot))), (error) => {
    console.error('Failed to subscribe to gantt tasks:', error);
    cb([]);
  });
}

export async function createSiteLog(data: NewSiteLog): Promise<string> {
  try {
    const log: Omit<SiteLog, 'id'> = {
      ...data,
      photos: data.photos ?? [],
      materialsUsed: data.materialsUsed ?? [],
      issues: data.issues ?? [],
      createdAt: new Date().toISOString(),
    };
    const ref = await addDoc(projectSubcollection(data.projectId, SITE_LOGS_COL), log);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${data.projectId}/${SITE_LOGS_COL}`);
  }
}

export async function getSiteLogs(projectId: string): Promise<SiteLog[]> {
  try {
    const snap = await getDocs(query(projectSubcollection(projectId, SITE_LOGS_COL), orderBy('date', 'desc')));
    return snap.docs.map((documentSnapshot) => withId<SiteLog>(documentSnapshot));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SITE_LOGS_COL}`);
  }
}

export function subscribeToSiteLogs(projectId: string, cb: (logs: SiteLog[]) => void, pageSize = 25): FirestoreUnsubscribe {
  const q = query(projectSubcollection(projectId, SITE_LOGS_COL), orderBy('date', 'desc'), limit(pageSize));
  return onSnapshot(q, (snap) => cb(snap.docs.map((documentSnapshot) => withId<SiteLog>(documentSnapshot))), (error) => {
    console.error('Failed to subscribe to site logs:', error);
    cb([]);
  });
}

export async function createRFI(data: NewRFI): Promise<string> {
  try {
    const now = new Date().toISOString();
    const rfiRef = doc(projectSubcollection(data.projectId, RFIS_COL));
    const counterRef = doc(db, PROJECTS_COL, data.projectId, '_meta', 'rfi_counter');

    await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const nextNumber = ((counterSnap.exists() ? Number(counterSnap.data().lastNumber) : 0) || 0) + 1;
      const rfi: Omit<RFI, 'id'> = {
        ...data,
        number: nextNumber,
        attachments: data.attachments ?? [],
        status: 'open',
        createdAt: now,
        updatedAt: now,
      };
      transaction.set(rfiRef, rfi);
      transaction.set(counterRef, { lastNumber: nextNumber, updatedAt: now }, { merge: true });
    });

    return rfiRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${data.projectId}/${RFIS_COL}`);
  }
}

export async function respondToRFI(
  projectId: string,
  rfiId: string,
  response: string,
  responderId: string,
  responseAttachments: RFI['responseAttachments'] = []
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(projectDocument(projectId, RFIS_COL, rfiId), {
      response,
      responseAttachments,
      respondedBy: responderId,
      respondedAt: now,
      status: 'responded',
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RFIS_COL}/${rfiId}`);
  }
}

export async function closeRFI(projectId: string, rfiId: string): Promise<void> {
  try {
    await updateDoc(projectDocument(projectId, RFIS_COL, rfiId), {
      status: 'closed',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RFIS_COL}/${rfiId}`);
  }
}

export async function getRFIs(projectId: string): Promise<RFI[]> {
  try {
    const snap = await getDocs(query(projectSubcollection(projectId, RFIS_COL), orderBy('number', 'desc')));
    return snap.docs.map((documentSnapshot) => normalizeRFI(withId<RFI>(documentSnapshot)));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${RFIS_COL}`);
  }
}

export function subscribeToRFIs(projectId: string, cb: (rfis: RFI[]) => void): FirestoreUnsubscribe {
  const q = query(projectSubcollection(projectId, RFIS_COL), orderBy('number', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((documentSnapshot) => normalizeRFI(withId<RFI>(documentSnapshot)))), (error) => {
    console.error('Failed to subscribe to RFIs:', error);
    cb([]);
  });
}

export async function createInspection(data: NewInspection): Promise<string> {
  try {
    const inspection: Omit<SiteInspection, 'id'> = {
      ...data,
      photos: data.photos ?? [],
      createdAt: new Date().toISOString(),
    };
    const ref = await addDoc(projectSubcollection(data.projectId, INSPECTIONS_COL), inspection);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${data.projectId}/${INSPECTIONS_COL}`);
  }
}

export async function getInspections(projectId: string): Promise<SiteInspection[]> {
  try {
    const snap = await getDocs(query(projectSubcollection(projectId, INSPECTIONS_COL), orderBy('date', 'desc')));
    return snap.docs.map((documentSnapshot) => withId<SiteInspection>(documentSnapshot));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${INSPECTIONS_COL}`);
  }
}

export const constructionService = {
  createGanttTask,
  updateGanttTask,
  getGanttTasks,
  subscribeToGanttTasks,
  createSiteLog,
  getSiteLogs,
  subscribeToSiteLogs,
  createRFI,
  respondToRFI,
  closeRFI,
  getRFIs,
  subscribeToRFIs,
  createInspection,
  getInspections,
};

export default constructionService;
