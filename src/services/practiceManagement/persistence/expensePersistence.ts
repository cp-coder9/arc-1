/**
 * Expense Persistence Service
 *
 * Firestore CRUD operations for practice_expenses collection.
 * All queries scoped by firmId for multi-tenant isolation.
 * Uses transactions for approval workflows (atomic status updates).
 * Implements optimistic locking via updatedAt field.
 *
 * @module practiceManagement/persistence/expensePersistence
 */

import { adminDb } from '@/lib/firebase-admin';
import type { ExpenseClaim, ExpenseStatus } from '../types';

const COLLECTION = 'practice_expenses';

function getCollection() {
  return adminDb.collection(COLLECTION);
}

/**
 * Create a new expense claim document.
 */
export async function createExpense(expense: ExpenseClaim): Promise<ExpenseClaim> {
  const now = new Date().toISOString();
  const doc: ExpenseClaim = {
    ...expense,
    createdAt: expense.createdAt || now,
    updatedAt: now,
  };
  await getCollection().doc(doc.id).set(doc);
  return doc;
}

/**
 * Retrieve a single expense claim by ID.
 */
export async function getExpense(expenseId: string): Promise<ExpenseClaim | null> {
  const snap = await getCollection().doc(expenseId).get();
  if (!snap.exists) return null;
  return snap.data() as ExpenseClaim;
}

/**
 * List expenses for a specific firm.
 */
export async function getExpensesByFirm(
  firmId: string,
  options?: { status?: ExpenseStatus; projectId?: string; limit?: number }
): Promise<ExpenseClaim[]> {
  let query = getCollection().where('firmId', '==', firmId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  if (options?.projectId) {
    query = query.where('projectId', '==', options.projectId);
  }
  const limit = options?.limit ?? 100;
  const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as ExpenseClaim);
}

/**
 * List expenses submitted by a specific user.
 */
export async function getExpensesByUser(
  firmId: string,
  userId: string,
  options?: { status?: ExpenseStatus; limit?: number }
): Promise<ExpenseClaim[]> {
  let query = getCollection()
    .where('firmId', '==', firmId)
    .where('userId', '==', userId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  const limit = options?.limit ?? 100;
  const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as ExpenseClaim);
}

/**
 * Get expenses for a specific project within a firm.
 */
export async function getExpensesByProject(
  firmId: string,
  projectId: string,
  options?: { status?: ExpenseStatus; limit?: number }
): Promise<ExpenseClaim[]> {
  let query = getCollection()
    .where('firmId', '==', firmId)
    .where('projectId', '==', projectId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  const limit = options?.limit ?? 100;
  const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as ExpenseClaim);
}

/**
 * Approve an expense claim using a Firestore transaction.
 * Atomically updates status and records approval metadata.
 */
export async function approveExpense(
  expenseId: string,
  approverId: string,
  expectedUpdatedAt: string
): Promise<ExpenseClaim> {
  const ref = getCollection().doc(expenseId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Expense claim ${expenseId} not found`);
    }
    const current = snap.data() as ExpenseClaim;

    // Optimistic locking check
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: expense ${expenseId} was modified since last read`
      );
    }

    if (current.status !== 'pending_approval') {
      throw new Error(
        `Cannot approve expense in status '${current.status}'; must be 'pending_approval'`
      );
    }

    const now = new Date().toISOString();
    const updated: Partial<ExpenseClaim> = {
      status: 'approved',
      approvedBy: approverId,
      approvedAt: now,
      updatedAt: now,
    };

    txn.update(ref, updated);
    return { ...current, ...updated } as ExpenseClaim;
  });
}

/**
 * Reject an expense claim using a Firestore transaction.
 */
export async function rejectExpense(
  expenseId: string,
  rejectedBy: string,
  rejectionReason: string,
  expectedUpdatedAt: string
): Promise<ExpenseClaim> {
  const ref = getCollection().doc(expenseId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Expense claim ${expenseId} not found`);
    }
    const current = snap.data() as ExpenseClaim;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: expense ${expenseId} was modified since last read`
      );
    }

    if (current.status !== 'pending_approval') {
      throw new Error(
        `Cannot reject expense in status '${current.status}'; must be 'pending_approval'`
      );
    }

    const now = new Date().toISOString();
    const updated: Partial<ExpenseClaim> = {
      status: 'rejected',
      rejectedBy,
      rejectedAt: now,
      rejectionReason,
      updatedAt: now,
    };

    txn.update(ref, updated);
    return { ...current, ...updated } as ExpenseClaim;
  });
}

/**
 * Update an expense claim (e.g., mark as invoiced).
 */
export async function updateExpense(
  expenseId: string,
  updates: Partial<Omit<ExpenseClaim, 'id' | 'firmId' | 'userId' | 'createdAt'>>,
  expectedUpdatedAt: string
): Promise<ExpenseClaim> {
  const ref = getCollection().doc(expenseId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Expense claim ${expenseId} not found`);
    }
    const current = snap.data() as ExpenseClaim;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: expense ${expenseId} was modified since last read`
      );
    }

    const now = new Date().toISOString();
    const merged = { ...updates, updatedAt: now };
    txn.update(ref, merged);
    return { ...current, ...merged } as ExpenseClaim;
  });
}

/**
 * Delete an expense claim (only allowed for draft status).
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  const ref = getCollection().doc(expenseId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as ExpenseClaim;
  if (data.status !== 'draft') {
    throw new Error(`Cannot delete expense in status '${data.status}'; only drafts can be deleted`);
  }
  await ref.delete();
}
