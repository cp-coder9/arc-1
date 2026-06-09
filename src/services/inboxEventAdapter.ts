import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SiteInboxEvent, UserRole, Severity } from '@/types';

const PROJECTS_COL = 'projects';
const INBOX_COL = 'site_inbox_events';

type FirestoreUnsubscribe = () => void;

function inboxCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, INBOX_COL);
}

function inboxDocument(projectId: string, eventId: string) {
  if (!eventId) throw new Error('eventId is required');
  return doc(db, PROJECTS_COL, projectId, INBOX_COL, eventId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

export async function createInboxEvent(input: {
  projectId: string;
  recipientRole: UserRole;
  title: string;
  description?: string;
  sourceObjectId: string;
  sourceObjectType: string;
  priority: Severity;
  dueDate?: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const event: Omit<SiteInboxEvent, 'id'> = {
      projectId: input.projectId,
      recipientRole: input.recipientRole,
      title: input.title,
      description: input.description,
      sourceObjectId: input.sourceObjectId,
      sourceObjectType: input.sourceObjectType,
      priority: input.priority,
      dueDate: input.dueDate,
      isRead: false,
      createdAt: now,
    };
    const ref = await addDoc(inboxCollection(input.projectId), event);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${INBOX_COL}`);
  }
}

export async function markInboxEventRead(
  projectId: string,
  eventId: string,
): Promise<void> {
  try {
    await updateDoc(inboxDocument(projectId, eventId), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${INBOX_COL}/${eventId}`);
  }
}

export async function getInboxEvents(projectId: string): Promise<SiteInboxEvent[]> {
  try {
    const snap = await getDocs(query(inboxCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<SiteInboxEvent>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${INBOX_COL}`);
  }
}

export function subscribeToInboxEvents(
  projectId: string,
  cb: (events: SiteInboxEvent[]) => void,
): FirestoreUnsubscribe {
  const q = query(inboxCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SiteInboxEvent>(d))), (error) => {
    console.error('Failed to subscribe to inbox events:', error);
    cb([]);
  });
}

export async function getUnreadInboxEvents(projectId: string): Promise<SiteInboxEvent[]> {
  const events = await getInboxEvents(projectId);
  return events.filter((e) => !e.isRead);
}

export async function getEventsForRole(
  projectId: string,
  role: UserRole,
): Promise<SiteInboxEvent[]> {
  const events = await getInboxEvents(projectId);
  return events.filter((e) => e.recipientRole === role);
}

export const inboxEventAdapter = {
  createInboxEvent,
  markInboxEventRead,
  getInboxEvents,
  subscribeToInboxEvents,
  getUnreadInboxEvents,
  getEventsForRole,
};

export default inboxEventAdapter;
