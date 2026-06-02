import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { Discipline, UserRole } from '@/types';

export type DrawingChecklistStatus = 'open' | 'in_progress' | 'complete';

export interface DrawingChecklistItem {
  id: string;
  projectId: string;
  title: string;
  discipline?: Discipline | string;
  status: DrawingChecklistStatus;
  requiredForSubmission: boolean;
  linkedDrawingIds: string[];
  notes?: string;
  createdBy: string;
  createdByRole?: UserRole | string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export interface CreateDrawingChecklistInput {
  title: string;
  discipline?: Discipline | string;
  requiredForSubmission?: boolean;
  linkedDrawingIds?: string[];
  notes?: string;
  createdBy: string;
  createdByRole?: UserRole | string;
}

export interface DrawingChecklistSummary {
  total: number;
  open: number;
  inProgress: number;
  complete: number;
  requiredOpen: number;
  linkedDrawings: number;
}

const PROJECTS_COL = 'projects';
const DRAWING_CHECKLISTS_COL = 'drawing_checklists';

type FirestoreUnsubscribe = () => void;

function projectChecklistCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, DRAWING_CHECKLISTS_COL);
}

function projectChecklistDocument(projectId: string, itemId: string) {
  if (!itemId) throw new Error('itemId is required');
  return doc(db, PROJECTS_COL, projectId, DRAWING_CHECKLISTS_COL, itemId);
}

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).getTime();
  }
  if (typeof value === 'object' && 'seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  return 0;
}

export function sortDrawingChecklistItems(items: DrawingChecklistItem[]): DrawingChecklistItem[] {
  return [...items].sort((a, b) => timestampMs(b.updatedAt ?? b.createdAt) - timestampMs(a.updatedAt ?? a.createdAt));
}

export function summariseDrawingChecklistItems(items: DrawingChecklistItem[]): DrawingChecklistSummary {
  return {
    total: items.length,
    open: items.filter((item) => item.status === 'open').length,
    inProgress: items.filter((item) => item.status === 'in_progress').length,
    complete: items.filter((item) => item.status === 'complete').length,
    requiredOpen: items.filter((item) => item.requiredForSubmission && item.status !== 'complete').length,
    linkedDrawings: new Set(items.flatMap((item) => item.linkedDrawingIds ?? [])).size,
  };
}

function cleanStringList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).slice(0, 40);
}

export function subscribeToDrawingChecklists(projectId: string, cb: (items: DrawingChecklistItem[]) => void): FirestoreUnsubscribe {
  return onSnapshot(projectChecklistCollection(projectId), (snapshot) => {
    const items = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() } as DrawingChecklistItem));
    cb(sortDrawingChecklistItems(items));
  }, (error) => {
    console.error('Failed to subscribe to drawing checklist items:', error);
    cb([]);
  });
}

export async function createDrawingChecklistItem(projectId: string, input: CreateDrawingChecklistInput): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error('Checklist title is required');
  try {
    const now = new Date().toISOString();
    const checklistItem: Omit<DrawingChecklistItem, 'id'> = {
      projectId,
      title,
      status: 'open',
      requiredForSubmission: input.requiredForSubmission ?? true,
      linkedDrawingIds: cleanStringList(input.linkedDrawingIds),
      notes: input.notes?.trim() || '',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    if (input.discipline) checklistItem.discipline = input.discipline;
    if (input.createdByRole) checklistItem.createdByRole = input.createdByRole;

    const ref = await addDoc(projectChecklistCollection(projectId), {
      ...checklistItem,
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${DRAWING_CHECKLISTS_COL}`);
  }
}

export async function updateDrawingChecklistStatus(projectId: string, itemId: string, status: DrawingChecklistStatus): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(projectChecklistDocument(projectId, itemId), {
      status,
      updatedAt: now,
      completedAt: status === 'complete' ? now : null,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${DRAWING_CHECKLISTS_COL}/${itemId}`);
  }
}
