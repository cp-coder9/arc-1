// ─── Form Integration Service ───────────────────────────────────────────────
// Handles platform module integrations triggered by form lifecycle events:
// - Document Register writes on PDF export
// - Municipal Readiness updates on municipal form export
// - Project Passport records on PDF export
// - Action Centre inbox items on status transitions
// - Retry queue for failed integration operations
// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6

import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IntegrationOperation {
  id: string;
  type: 'document_register' | 'municipal_readiness' | 'project_passport' | 'action_centre';
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: Timestamp;
  lastAttemptAt: Timestamp;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INTEGRATION_QUEUE_COL = 'integration_queue';
const MAX_RETRIES = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────

function integrationQueueRef() {
  return collection(db, INTEGRATION_QUEUE_COL);
}

function integrationDocRef(id: string) {
  return doc(db, INTEGRATION_QUEUE_COL, id);
}

function generateId(): string {
  return doc(integrationQueueRef()).id;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Writes a form export record to the Document Register.
 * Stores in `projects/{projectId}/documents` with form metadata.
 *
 * Requirement 11.1: On PDF export, create a corresponding entry in the Document_Register
 * with form type, template version, export date, exporter identity, and project association.
 */
export async function writeToDocumentRegister(
  instanceId: string,
  formType: string,
  templateVersion: number,
  exportDate: Timestamp,
  exporterId: string,
  projectId: string
): Promise<void> {
  const documentId = generateId();
  const documentRef = doc(db, 'projects', projectId, 'documents', documentId);

  const documentEntry = {
    id: documentId,
    instanceId,
    formType,
    templateVersion,
    exportDate,
    exporterId,
    projectId,
    source: 'form_system',
    createdAt: Timestamp.now(),
  };

  try {
    await setDoc(documentRef, documentEntry);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/documents/${documentId}`);
    throw error;
  }
}

/**
 * Updates the Municipal Readiness workspace submission tracking status.
 * Writes to `projects/{projectId}/municipal_readiness` with form readiness status.
 *
 * Requirement 11.2: When a municipal submission form is exported as PDF with all required
 * fields populated and all required signatures applied, update Municipal Readiness workspace
 * to reflect the form as ready for submission.
 */
export async function updateMunicipalReadiness(
  projectId: string,
  formType: string,
  status: 'ready_for_submission'
): Promise<void> {
  const readinessRef = doc(db, 'projects', projectId, 'municipal_readiness', formType);

  const readinessEntry = {
    formType,
    status,
    projectId,
    updatedAt: Timestamp.now(),
  };

  try {
    await setDoc(readinessRef, readinessEntry, { merge: true });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `projects/${projectId}/municipal_readiness/${formType}`
    );
    throw error;
  }
}

/**
 * Writes a project record to the Project Passport with form completion info.
 * Stores in `projects/{projectId}/records`.
 *
 * Requirement 11.3: On PDF export, write a project record to the Project_Passport
 * containing form type, form title, export date, and associated project stage.
 */
export async function writeToProjectPassport(
  projectId: string,
  formType: string,
  formTitle: string,
  exportDate: Timestamp,
  projectStage: string
): Promise<void> {
  const recordId = generateId();
  const recordRef = doc(db, 'projects', projectId, 'records', recordId);

  const passportRecord = {
    id: recordId,
    formType,
    formTitle,
    exportDate,
    projectStage,
    source: 'form_system',
    createdAt: Timestamp.now(),
  };

  try {
    await setDoc(recordRef, passportRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/records/${recordId}`);
    throw error;
  }
}

/**
 * Creates an action item in the user's Action Centre inbox.
 * Writes to `users/{userId}/inbox` with action item data.
 * Must be created within 60 seconds of status change.
 *
 * Requirement 11.5: On status transition (incomplete draft, awaiting approval,
 * or ready for export), create a corresponding action item in the Action Centre
 * inbox for the form owner within 60 seconds of the status change.
 */
export async function createActionCentreItem(
  userId: string,
  instanceId: string,
  actionType: 'draft_incomplete' | 'awaiting_approval' | 'ready_for_export',
  formTitle: string
): Promise<void> {
  const actionId = generateId();
  const actionRef = doc(db, 'users', userId, 'inbox', actionId);

  const actionItem = {
    id: actionId,
    instanceId,
    actionType,
    formTitle,
    source: 'form_system',
    read: false,
    createdAt: Timestamp.now(),
  };

  try {
    await setDoc(actionRef, actionItem);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${userId}/inbox/${actionId}`);
    throw error;
  }
}

/**
 * Queues a failed integration operation for later retry.
 * Stores in `integration_queue` collection.
 *
 * Requirement 11.6: If an integration target is unavailable, queue the write
 * operation, notify the user that the integration update is pending,
 * and retry the operation within 5 minutes.
 */
export async function queueFailedIntegration(
  operation: IntegrationOperation
): Promise<void> {
  const operationRef = integrationDocRef(operation.id);

  try {
    await setDoc(operationRef, {
      ...operation,
      lastAttemptAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${INTEGRATION_QUEUE_COL}/${operation.id}`);
    throw error;
  }
}

/**
 * Processes queued integration operations.
 * Retries failed ops — max 3 retries, operations retried within 5 minutes.
 * Successfully retried operations are removed from the queue.
 * Operations exceeding max retries remain in the queue for manual review.
 *
 * Requirement 11.6: Retry the operation within 5 minutes, max 3 retries.
 */
export async function retryFailedIntegrations(): Promise<void> {
  try {
    const q = query(
      integrationQueueRef(),
      where('retryCount', '<', MAX_RETRIES)
    );
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      const operation = docSnap.data() as IntegrationOperation;

      try {
        await executeIntegrationOperation(operation);
        // Success — remove from queue
        await deleteDoc(integrationDocRef(operation.id));
      } catch {
        // Increment retry count and update last attempt timestamp
        await updateDoc(integrationDocRef(operation.id), {
          retryCount: operation.retryCount + 1,
          lastAttemptAt: Timestamp.now(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, INTEGRATION_QUEUE_COL);
    throw error;
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Dispatches and executes a queued integration operation based on its type.
 */
async function executeIntegrationOperation(operation: IntegrationOperation): Promise<void> {
  const { type, payload } = operation;

  switch (type) {
    case 'document_register':
      await writeToDocumentRegister(
        payload.instanceId as string,
        payload.formType as string,
        payload.templateVersion as number,
        payload.exportDate as Timestamp,
        payload.exporterId as string,
        payload.projectId as string
      );
      break;

    case 'municipal_readiness':
      await updateMunicipalReadiness(
        payload.projectId as string,
        payload.formType as string,
        payload.status as 'ready_for_submission'
      );
      break;

    case 'project_passport':
      await writeToProjectPassport(
        payload.projectId as string,
        payload.formType as string,
        payload.formTitle as string,
        payload.exportDate as Timestamp,
        payload.projectStage as string
      );
      break;

    case 'action_centre':
      await createActionCentreItem(
        payload.userId as string,
        payload.instanceId as string,
        payload.actionType as 'draft_incomplete' | 'awaiting_approval' | 'ready_for_export',
        payload.formTitle as string
      );
      break;

    default:
      throw new Error(`Unknown integration operation type: ${type}`);
  }
}
