import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SiteAuditRecord, UserRole, FieldActionType } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const AUDIT_COL = 'site_audit_trail';

type FirestoreUnsubscribe = () => void;

function auditCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, AUDIT_COL);
}

function auditDocument(projectId: string, auditId: string) {
  if (!auditId) throw new Error('auditId is required');
  return getDemoDoc( PROJECTS_COL, projectId, AUDIT_COL, auditId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

export async function recordAudit(input: {
  projectId: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  actionType?: FieldActionType;
  outcome?: 'permitted' | 'denied';
  sourceObjectId: string;
  sourceObjectType: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const auditRecord: Omit<SiteAuditRecord, 'id'> = {
      projectId: input.projectId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      actionType: input.actionType ?? 'create',
      outcome: input.outcome ?? 'permitted',
      sourceObjectId: input.sourceObjectId,
      sourceObjectType: input.sourceObjectType,
      createdAt: now,
    };
    const ref = await addDoc(auditCollection(input.projectId), auditRecord);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${AUDIT_COL}`);
  }
}

/** Bulk record audit entries for multiple source objects */
export async function recordBulkAudit(
  projectId: string,
  actorId: string,
  actorRole: UserRole,
  action: string,
  actionType: FieldActionType,
  outcome: 'permitted' | 'denied',
  items: Array<{ sourceObjectId: string; sourceObjectType: string }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const item of items) {
    const id = await recordAudit({
      projectId,
      actorId,
      actorRole,
      action,
      actionType,
      outcome,
      sourceObjectId: item.sourceObjectId,
      sourceObjectType: item.sourceObjectType,
    });
    ids.push(id);
  }
  return ids;
}

export async function getAuditTrail(projectId: string): Promise<SiteAuditRecord[]> {
  try {
    const snap = await getDocs(query(auditCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<SiteAuditRecord>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${AUDIT_COL}`);
  }
}

export function subscribeToAuditTrail(
  projectId: string,
  cb: (records: SiteAuditRecord[]) => void,
): FirestoreUnsubscribe {
  const q = query(auditCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SiteAuditRecord>(d))), (error) => {
    console.error('Failed to subscribe to audit trail:', error);
    cb([]);
  });
}

export async function getAuditForObject(
  projectId: string,
  sourceObjectId: string,
): Promise<SiteAuditRecord[]> {
  const records = await getAuditTrail(projectId);
  return records.filter((r) => r.sourceObjectId === sourceObjectId);
}

export const siteAuditTrailService = {
  recordAudit,
  recordBulkAudit,
  getAuditTrail,
  subscribeToAuditTrail,
  getAuditForObject,
};

export default siteAuditTrailService;
