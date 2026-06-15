import { collection, doc, addDoc, getDocs, getDoc, onSnapshot, query, orderBy, updateDoc, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SiteDiaryEntry, SiteDiaryStatus } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const SITE_DIARY_COL = 'site_diary';

type FirestoreUnsubscribe = () => void;

function diaryCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, SITE_DIARY_COL);
}

function diaryDocument(projectId: string, entryId: string) {
  if (!entryId) throw new Error('entryId is required');
  return getDemoDoc( PROJECTS_COL, projectId, SITE_DIARY_COL, entryId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

/** Site diary state machine */
const DIARY_TRANSITIONS: Record<SiteDiaryStatus, SiteDiaryStatus[]> = {
  draft: ['submitted'],
  submitted: ['reviewed', 'draft'],
  reviewed: ['approved', 'draft'],
  approved: [],
};

export function isValidDiaryTransition(from: SiteDiaryStatus, to: SiteDiaryStatus): boolean {
  return DIARY_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createDiaryEntry(input: {
  projectId: string;
  date: string;
  weather: SiteDiaryEntry['weather'];
  activities: string[];
  issues: string[];
  staff: SiteDiaryEntry['staff'];
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const entry: Omit<SiteDiaryEntry, 'id'> = {
      projectId: input.projectId,
      date: input.date,
      weather: input.weather,
      activities: input.activities,
      issues: input.issues,
      staff: input.staff,
      createdBy: input.createdBy,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(diaryCollection(input.projectId), entry);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${SITE_DIARY_COL}`);
  }
}

export async function submitDiaryEntry(projectId: string, entryId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(diaryDocument(projectId, entryId));
      if (!snap.exists()) throw new Error(`Diary entry ${entryId} not found`);
      const current = snap.data() as SiteDiaryEntry;
      if (!isValidDiaryTransition(current.status, 'submitted')) {
        throw new Error(`Invalid transition from ${current.status} to submitted`);
      }
      transaction.update(diaryDocument(projectId, entryId), {
        status: 'submitted',
        submittedAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SITE_DIARY_COL}/${entryId}`);
  }
}

export async function reviewDiaryEntry(
  projectId: string,
  entryId: string,
  reviewedBy: string,
  approved: boolean,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(diaryDocument(projectId, entryId));
      if (!snap.exists()) throw new Error(`Diary entry ${entryId} not found`);
      const current = snap.data() as SiteDiaryEntry;
      const targetStatus: SiteDiaryStatus = approved ? 'approved' : 'reviewed';
      if (!isValidDiaryTransition(current.status, targetStatus)) {
        throw new Error(`Invalid transition from ${current.status} to ${targetStatus}`);
      }
      transaction.update(diaryDocument(projectId, entryId), {
        status: targetStatus,
        reviewedBy,
        reviewedAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SITE_DIARY_COL}/${entryId}`);
  }
}

export async function sendBackToDraft(projectId: string, entryId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(diaryDocument(projectId, entryId));
      if (!snap.exists()) throw new Error(`Diary entry ${entryId} not found`);
      const current = snap.data() as SiteDiaryEntry;
      if (!isValidDiaryTransition(current.status, 'draft')) {
        throw new Error(`Invalid transition from ${current.status} to draft`);
      }
      transaction.update(diaryDocument(projectId, entryId), {
        status: 'draft',
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SITE_DIARY_COL}/${entryId}`);
  }
}

export async function updateDiaryEntry(
  projectId: string,
  entryId: string,
  updates: Partial<Pick<SiteDiaryEntry, 'weather' | 'activities' | 'issues' | 'staff'>>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(diaryDocument(projectId, entryId), {
      ...updates,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SITE_DIARY_COL}/${entryId}`);
  }
}

export async function getDiaryEntries(projectId: string): Promise<SiteDiaryEntry[]> {
  try {
    const snap = await getDocs(query(diaryCollection(projectId), orderBy('date', 'desc')));
    return snap.docs.map((d) => withId<SiteDiaryEntry>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SITE_DIARY_COL}`);
  }
}

export async function getDiaryEntry(projectId: string, entryId: string): Promise<SiteDiaryEntry | null> {
  try {
    const snap = await getDoc(diaryDocument(projectId, entryId));
    if (!snap.exists()) return null;
    return withId<SiteDiaryEntry>(snap);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SITE_DIARY_COL}/${entryId}`);
  }
}

export function subscribeToDiaryEntries(
  projectId: string,
  cb: (entries: SiteDiaryEntry[]) => void,
): FirestoreUnsubscribe {
  const q = query(diaryCollection(projectId), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SiteDiaryEntry>(d))), (error) => {
    console.error('Failed to subscribe to diary entries:', error);
    cb([]);
  });
}

export const siteDiaryService = {
  createDiaryEntry,
  submitDiaryEntry,
  reviewDiaryEntry,
  sendBackToDraft,
  updateDiaryEntry,
  getDiaryEntries,
  getDiaryEntry,
  subscribeToDiaryEntries,
  isValidDiaryTransition,
};

export default siteDiaryService;
