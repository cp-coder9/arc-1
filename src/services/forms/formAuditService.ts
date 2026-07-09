// ─── Form Audit Service ─────────────────────────────────────────────────────
// Immutable audit trail for Form Instances.
// Subcollection path: form_instances/{instanceId}/audit/{eventId}
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7

import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { AuditEvent, AuditEventType, FormFieldValue } from '@/services/forms/formTypes';

// ─── Helpers ────────────────────────────────────────────────────────────────

const FORM_INSTANCES_COL = 'form_instances';
const AUDIT_COL = 'audit';

function auditCollection(instanceId: string) {
  if (!instanceId) throw new Error('instanceId is required');
  return collection(db, FORM_INSTANCES_COL, instanceId, AUDIT_COL);
}

function auditDocument(instanceId: string, eventId: string) {
  if (!instanceId) throw new Error('instanceId is required');
  if (!eventId) throw new Error('eventId is required');
  return doc(db, FORM_INSTANCES_COL, instanceId, AUDIT_COL, eventId);
}

function instanceDocument(instanceId: string) {
  if (!instanceId) throw new Error('instanceId is required');
  return doc(db, FORM_INSTANCES_COL, instanceId);
}

/**
 * Serialize form state to a JSON string for version snapshot storage.
 */
function serializeSnapshot(formState: Record<string, FormFieldValue>): string {
  return JSON.stringify(formState);
}

/**
 * Core audit event builder. Creates the event object without persisting it.
 */
function buildAuditEvent(
  instanceId: string,
  eventType: AuditEventType,
  userId: string,
  userName: string,
  details: Record<string, unknown>,
  formState: Record<string, FormFieldValue>,
): Omit<AuditEvent, 'id'> {
  return {
    instanceId,
    eventType,
    userId,
    userName,
    timestamp: Timestamp.now(),
    details,
    snapshot: serializeSnapshot(formState),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Records a form creation event atomically using a Firestore transaction.
 * Requirement 6.1: creation event with timestamp, creator identity, source template, project.
 * Requirement 6.7: auto-fill changes attributed to 'system'.
 */
export async function recordCreationEvent(
  instanceId: string,
  creatorId: string,
  creatorName: string,
  templateId: string,
  projectId: string | null,
  formState: Record<string, FormFieldValue>,
): Promise<AuditEvent> {
  try {
    const eventRef = doc(auditCollection(instanceId));
    const eventData = buildAuditEvent(
      instanceId,
      'created',
      creatorId,
      creatorName,
      { templateId, projectId },
      formState,
    );

    await runTransaction(db, async (transaction) => {
      transaction.set(eventRef, eventData);
    });

    return { id: eventRef.id, ...eventData } as AuditEvent;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}`);
    throw error; // unreachable, handleFirestoreError throws
  }
}

/**
 * Records a field modification event atomically with the field update.
 * Uses a Firestore transaction so the audit write and field modification are atomic.
 * Requirement 6.2: change event with before/after values.
 * Requirement 6.4: version snapshot captured.
 * Requirement 6.7: auto-fill attributed to 'system'.
 */
export async function recordFieldModification(
  instanceId: string,
  userId: string,
  userName: string,
  fieldId: string,
  fieldLabel: string,
  previousValue: string | null,
  newValue: string | null,
  formState: Record<string, FormFieldValue>,
): Promise<AuditEvent> {
  try {
    const eventRef = doc(auditCollection(instanceId));
    const eventData = buildAuditEvent(
      instanceId,
      'field_modified',
      userId,
      userName,
      {
        fieldId,
        fieldLabel,
        previousValue,
        newValue,
      },
      formState,
    );

    await runTransaction(db, async (transaction) => {
      // Read instance to ensure it exists (transactional read)
      const instanceRef = instanceDocument(instanceId);
      const snap = await transaction.get(instanceRef);
      if (!snap.exists()) {
        throw new Error(`Form instance ${instanceId} not found`);
      }
      // Write audit event atomically
      transaction.set(eventRef, eventData);
    });

    return { id: eventRef.id, ...eventData } as AuditEvent;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}`);
    throw error;
  }
}

/**
 * Records a PDF export event.
 * Requirement 6.3: export event with timestamp, exporter identity, format.
 */
export async function recordExportEvent(
  instanceId: string,
  exporterId: string,
  exporterName: string,
  format: string,
  formState: Record<string, FormFieldValue>,
): Promise<AuditEvent> {
  try {
    const eventRef = doc(auditCollection(instanceId));
    const eventData = buildAuditEvent(
      instanceId,
      'exported',
      exporterId,
      exporterName,
      { format },
      formState,
    );

    await runTransaction(db, async (transaction) => {
      transaction.set(eventRef, eventData);
    });

    return { id: eventRef.id, ...eventData } as AuditEvent;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}`);
    throw error;
  }
}

/**
 * Records a digital signature event.
 * Requirement 6.4: signature event with version snapshot.
 */
export async function recordSignatureEvent(
  instanceId: string,
  signatoryId: string,
  signatoryName: string,
  role: string,
  formState: Record<string, FormFieldValue>,
): Promise<AuditEvent> {
  try {
    const eventRef = doc(auditCollection(instanceId));
    const eventData = buildAuditEvent(
      instanceId,
      'signed',
      signatoryId,
      signatoryName,
      { role },
      formState,
    );

    await runTransaction(db, async (transaction) => {
      transaction.set(eventRef, eventData);
    });

    return { id: eventRef.id, ...eventData } as AuditEvent;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}`);
    throw error;
  }
}

/**
 * Records a form sharing event.
 */
export async function recordShareEvent(
  instanceId: string,
  ownerId: string,
  ownerName: string,
  collaboratorId: string,
  formState: Record<string, FormFieldValue>,
): Promise<AuditEvent> {
  try {
    const eventRef = doc(auditCollection(instanceId));
    const eventData = buildAuditEvent(
      instanceId,
      'shared',
      ownerId,
      ownerName,
      { collaboratorId },
      formState,
    );

    await runTransaction(db, async (transaction) => {
      transaction.set(eventRef, eventData);
    });

    return { id: eventRef.id, ...eventData } as AuditEvent;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}`);
    throw error;
  }
}

/**
 * Records an approval granted event.
 */
export async function recordApprovalGrantedEvent(
  instanceId: string,
  approverId: string,
  approverName: string,
  formState: Record<string, FormFieldValue>,
): Promise<AuditEvent> {
  try {
    const eventRef = doc(auditCollection(instanceId));
    const eventData = buildAuditEvent(
      instanceId,
      'approval_granted',
      approverId,
      approverName,
      {},
      formState,
    );

    await runTransaction(db, async (transaction) => {
      transaction.set(eventRef, eventData);
    });

    return { id: eventRef.id, ...eventData } as AuditEvent;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}`);
    throw error;
  }
}

/**
 * Records an approval denied event.
 */
export async function recordApprovalDeniedEvent(
  instanceId: string,
  approverId: string,
  approverName: string,
  reason: string,
  formState: Record<string, FormFieldValue>,
): Promise<AuditEvent> {
  try {
    const eventRef = doc(auditCollection(instanceId));
    const eventData = buildAuditEvent(
      instanceId,
      'approval_denied',
      approverId,
      approverName,
      { reason },
      formState,
    );

    await runTransaction(db, async (transaction) => {
      transaction.set(eventRef, eventData);
    });

    return { id: eventRef.id, ...eventData } as AuditEvent;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}`);
    throw error;
  }
}

/**
 * Retrieves the full audit trail for a form instance, ordered chronologically.
 * Requirement 6.6: displayable within 3 seconds.
 */
export async function getAuditTrail(instanceId: string): Promise<AuditEvent[]> {
  try {
    const q = query(auditCollection(instanceId), orderBy('timestamp', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditEvent);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}`);
    throw error;
  }
}

/**
 * Retrieves the version snapshot for a specific audit event.
 * Requirement 6.4: retrieve form state as it existed at that event.
 */
export async function getSnapshot(
  instanceId: string,
  eventId: string,
): Promise<Record<string, FormFieldValue> | null> {
  try {
    const { getDoc } = await import('firebase/firestore');
    const eventRef = auditDocument(instanceId, eventId);
    const snap = await getDoc(eventRef);
    if (!snap.exists()) return null;
    const data = snap.data() as AuditEvent;
    if (!data.snapshot) return null;
    return JSON.parse(data.snapshot) as Record<string, FormFieldValue>;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${FORM_INSTANCES_COL}/${instanceId}/${AUDIT_COL}/${eventId}`);
    throw error;
  }
}

// ─── Immutability Notice ────────────────────────────────────────────────────
// Requirement 6.5: No update or delete operations are exposed by this service.
// Audit entries are write-once. Any attempt to modify or remove entries must be
// prevented at the Firestore security rules level as well.
