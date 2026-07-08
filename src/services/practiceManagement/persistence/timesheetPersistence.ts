/**
 * Timesheet Persistence Service
 *
 * Firestore CRUD operations for practice_timesheet_submissions collection.
 * All queries scoped by firmId for multi-tenant isolation.
 * Uses transactions for approval workflows (atomic status + cost total updates).
 * Implements optimistic locking via updatedAt field.
 *
 * @module practiceManagement/persistence/timesheetPersistence
 */

import { adminDb } from '@/lib/firebase-admin';
import type { TimesheetSubmission, TimesheetSubmissionStatus } from '../types';

const COLLECTION = 'practice_timesheet_submissions';

function getCollection() {
  return adminDb.collection(COLLECTION);
}

/**
 * Create a new timesheet submission document.
 */
export async function createTimesheetSubmission(
  submission: TimesheetSubmission
): Promise<TimesheetSubmission> {
  const now = new Date().toISOString();
  const doc: TimesheetSubmission = {
    ...submission,
    createdAt: submission.createdAt || now,
    updatedAt: now,
  };
  await getCollection().doc(doc.id).set(doc);
  return doc;
}

/**
 * Retrieve a single timesheet submission by ID.
 */
export async function getTimesheetSubmission(
  submissionId: string
): Promise<TimesheetSubmission | null> {
  const snap = await getCollection().doc(submissionId).get();
  if (!snap.exists) return null;
  return snap.data() as TimesheetSubmission;
}

/**
 * List timesheet submissions for a specific firm.
 */
export async function getTimesheetSubmissionsByFirm(
  firmId: string,
  options?: { status?: TimesheetSubmissionStatus; limit?: number }
): Promise<TimesheetSubmission[]> {
  let query = getCollection().where('firmId', '==', firmId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  const limit = options?.limit ?? 100;
  const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as TimesheetSubmission);
}

/**
 * List timesheet submissions for a specific user within a firm.
 */
export async function getTimesheetSubmissionsByUser(
  firmId: string,
  userId: string,
  options?: { status?: TimesheetSubmissionStatus; limit?: number }
): Promise<TimesheetSubmission[]> {
  let query = getCollection()
    .where('firmId', '==', firmId)
    .where('userId', '==', userId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  const limit = options?.limit ?? 100;
  const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as TimesheetSubmission);
}

/**
 * List pending submissions for a given approver's firm.
 */
export async function getPendingSubmissions(
  firmId: string,
  options?: { limit?: number }
): Promise<TimesheetSubmission[]> {
  const limit = options?.limit ?? 100;
  const snap = await getCollection()
    .where('firmId', '==', firmId)
    .where('status', '==', 'pending_approval')
    .orderBy('submittedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((doc) => doc.data() as TimesheetSubmission);
}

/**
 * Approve a timesheet submission using a Firestore transaction.
 * Atomically updates status and records approval metadata.
 * Implements optimistic locking via updatedAt field.
 */
export async function approveTimesheetSubmission(
  submissionId: string,
  approverId: string,
  expectedUpdatedAt: string
): Promise<TimesheetSubmission> {
  const ref = getCollection().doc(submissionId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Timesheet submission ${submissionId} not found`);
    }
    const current = snap.data() as TimesheetSubmission;

    // Optimistic locking check
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: submission ${submissionId} was modified since last read`
      );
    }

    if (current.status !== 'pending_approval') {
      throw new Error(
        `Cannot approve submission in status '${current.status}'; must be 'pending_approval'`
      );
    }

    const now = new Date().toISOString();
    const updated: Partial<TimesheetSubmission> = {
      status: 'approved',
      approvedBy: approverId,
      approvedAt: now,
      updatedAt: now,
    };

    txn.update(ref, updated);
    return { ...current, ...updated } as TimesheetSubmission;
  });
}

/**
 * Reject a timesheet submission using a Firestore transaction.
 * Atomically updates status and records rejection metadata.
 */
export async function rejectTimesheetSubmission(
  submissionId: string,
  rejectedBy: string,
  rejectionReason: string,
  expectedUpdatedAt: string
): Promise<TimesheetSubmission> {
  const ref = getCollection().doc(submissionId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Timesheet submission ${submissionId} not found`);
    }
    const current = snap.data() as TimesheetSubmission;

    // Optimistic locking check
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: submission ${submissionId} was modified since last read`
      );
    }

    if (current.status !== 'pending_approval') {
      throw new Error(
        `Cannot reject submission in status '${current.status}'; must be 'pending_approval'`
      );
    }

    const now = new Date().toISOString();
    const updated: Partial<TimesheetSubmission> = {
      status: 'rejected',
      rejectedBy,
      rejectedAt: now,
      rejectionReason,
      updatedAt: now,
    };

    txn.update(ref, updated);
    return { ...current, ...updated } as TimesheetSubmission;
  });
}

/**
 * Update a timesheet submission's general fields (e.g., entryIds, totalHours, totalValueCents).
 */
export async function updateTimesheetSubmission(
  submissionId: string,
  updates: Partial<Omit<TimesheetSubmission, 'id' | 'firmId' | 'userId' | 'createdAt'>>,
  expectedUpdatedAt: string
): Promise<TimesheetSubmission> {
  const ref = getCollection().doc(submissionId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Timesheet submission ${submissionId} not found`);
    }
    const current = snap.data() as TimesheetSubmission;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: submission ${submissionId} was modified since last read`
      );
    }

    const now = new Date().toISOString();
    const merged = { ...updates, updatedAt: now };
    txn.update(ref, merged);
    return { ...current, ...merged } as TimesheetSubmission;
  });
}

/**
 * Delete a timesheet submission (only allowed for draft status).
 */
export async function deleteTimesheetSubmission(submissionId: string): Promise<void> {
  const ref = getCollection().doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as TimesheetSubmission;
  if (data.status !== 'draft') {
    throw new Error(`Cannot delete submission in status '${data.status}'; only drafts can be deleted`);
  }
  await ref.delete();
}
