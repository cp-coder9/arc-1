import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { Discipline, UserRole } from '@/types';

export const COORDINATION_ITEM_TYPES = [
  'deliverable',
  'dependency',
  'rfi',
  'comment_thread',
  'transmittal',
  'deadline',
  'compliance_status',
  'municipal_readiness',
] as const;

export const COORDINATION_STATUSES = ['open', 'in_progress', 'blocked', 'submitted', 'resolved', 'closed'] as const;

export type CoordinationItemType = typeof COORDINATION_ITEM_TYPES[number];
export type CoordinationStatus = typeof COORDINATION_STATUSES[number];

export interface CoordinationRegisterItem {
  id: string;
  projectId: string;
  jobId?: string | null;
  itemType: CoordinationItemType;
  title: string;
  description: string;
  discipline?: Discipline | string | null;
  assigneeId?: string | null;
  dependsOnIds: string[];
  dueAt?: string | null;
  status: CoordinationStatus;
  createdBy: string;
  createdByRole?: UserRole | string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCoordinationItemInput {
  jobId?: string;
  itemType: CoordinationItemType;
  title: string;
  description?: string;
  discipline?: Discipline | string;
  assigneeId?: string;
  dependsOnIds?: string[];
  dueAt?: string;
  status?: CoordinationStatus;
  createdBy: string;
  createdByRole?: UserRole | string;
}

export interface CoordinationRegisterSummary {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  submitted: number;
  resolved: number;
  closed: number;
  overdue: number;
}

const PROJECTS_COL = 'projects';
const COORDINATION_ITEMS_COL = 'coordination_items';

type FirestoreUnsubscribe = () => void;

const STATUS_RANK: Record<CoordinationStatus, number> = {
  blocked: 0,
  open: 1,
  in_progress: 2,
  submitted: 3,
  resolved: 4,
  closed: 5,
};

function projectCoordinationCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, COORDINATION_ITEMS_COL);
}

function projectCoordinationDocument(projectId: string, itemId: string) {
  if (!itemId) throw new Error('itemId is required');
  return doc(db, PROJECTS_COL, projectId, COORDINATION_ITEMS_COL, itemId);
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

function stringOrEmpty(value: string | undefined): string {
  return value?.trim() ?? '';
}

function cleanStringList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}

export function isCoordinationItemOverdue(item: Pick<CoordinationRegisterItem, 'dueAt' | 'status'>, now = Date.now()): boolean {
  if (!item.dueAt || ['resolved', 'closed'].includes(item.status)) return false;
  const dueMs = timestampMs(item.dueAt);
  return dueMs > 0 && dueMs < now;
}

export function sortCoordinationItems(items: CoordinationRegisterItem[]): CoordinationRegisterItem[] {
  return [...items].sort((a, b) => {
    const statusDelta = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (statusDelta !== 0) return statusDelta;
    const aDue = timestampMs(a.dueAt) || Number.MAX_SAFE_INTEGER;
    const bDue = timestampMs(b.dueAt) || Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return timestampMs(b.updatedAt ?? b.createdAt) - timestampMs(a.updatedAt ?? a.createdAt);
  });
}

export function summariseCoordinationItems(items: CoordinationRegisterItem[], now = Date.now()): CoordinationRegisterSummary {
  return {
    total: items.length,
    open: items.filter((item) => item.status === 'open').length,
    inProgress: items.filter((item) => item.status === 'in_progress').length,
    blocked: items.filter((item) => item.status === 'blocked').length,
    submitted: items.filter((item) => item.status === 'submitted').length,
    resolved: items.filter((item) => item.status === 'resolved').length,
    closed: items.filter((item) => item.status === 'closed').length,
    overdue: items.filter((item) => isCoordinationItemOverdue(item, now)).length,
  };
}

export function subscribeToCoordinationItems(projectId: string, cb: (items: CoordinationRegisterItem[]) => void): FirestoreUnsubscribe {
  return onSnapshot(projectCoordinationCollection(projectId), (snapshot) => {
    const items = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() } as CoordinationRegisterItem));
    cb(sortCoordinationItems(items));
  }, (error) => {
    console.error('Failed to subscribe to project coordination items:', error);
    cb([]);
  });
}

export async function createCoordinationItem(projectId: string, input: CreateCoordinationItemInput): Promise<string> {
  const title = stringOrEmpty(input.title);
  if (!title) throw new Error('Coordination item title is required');
  try {
    const now = new Date().toISOString();
    const item: Omit<CoordinationRegisterItem, 'id'> = {
      projectId,
      itemType: input.itemType,
      title,
      description: stringOrEmpty(input.description),
      dependsOnIds: cleanStringList(input.dependsOnIds),
      status: input.status ?? 'open',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    if (input.jobId) item.jobId = input.jobId;
    if (input.discipline) item.discipline = input.discipline;
    if (input.assigneeId) item.assigneeId = input.assigneeId;
    if (input.dueAt) item.dueAt = input.dueAt;
    if (input.createdByRole) item.createdByRole = input.createdByRole;

    const ref = await addDoc(projectCoordinationCollection(projectId), item);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${COORDINATION_ITEMS_COL}`);
  }
}

export async function updateCoordinationItemStatus(projectId: string, itemId: string, status: CoordinationStatus): Promise<void> {
  try {
    await updateDoc(projectCoordinationDocument(projectId, itemId), {
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${COORDINATION_ITEMS_COL}/${itemId}`);
  }
}
