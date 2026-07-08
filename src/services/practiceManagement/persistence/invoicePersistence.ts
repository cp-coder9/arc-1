/**
 * Invoice Persistence Service
 *
 * Firestore CRUD operations for practice_invoices collection.
 * All queries scoped by firmId for multi-tenant isolation.
 * Uses transactions for status transitions (atomic status + WIP updates).
 * Implements optimistic locking via updatedAt field.
 *
 * @module practiceManagement/persistence/invoicePersistence
 */

import { adminDb } from '@/lib/firebase-admin';
import type { PracticeInvoice, PracticeInvoiceStatus } from '../types';

const COLLECTION = 'practice_invoices';

function getCollection() {
  return adminDb.collection(COLLECTION);
}

/**
 * Create a new practice invoice document.
 */
export async function createInvoice(invoice: PracticeInvoice): Promise<PracticeInvoice> {
  const now = new Date().toISOString();
  const doc: PracticeInvoice = {
    ...invoice,
    createdAt: invoice.createdAt || now,
    updatedAt: now,
  };
  await getCollection().doc(doc.id).set(doc);
  return doc;
}

/**
 * Retrieve a single invoice by ID.
 */
export async function getInvoice(invoiceId: string): Promise<PracticeInvoice | null> {
  const snap = await getCollection().doc(invoiceId).get();
  if (!snap.exists) return null;
  return snap.data() as PracticeInvoice;
}

/**
 * List invoices for a specific firm.
 */
export async function getInvoicesByFirm(
  firmId: string,
  options?: { status?: PracticeInvoiceStatus; projectId?: string; limit?: number }
): Promise<PracticeInvoice[]> {
  let query = getCollection().where('firmId', '==', firmId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  if (options?.projectId) {
    query = query.where('projectId', '==', options.projectId);
  }
  const limit = options?.limit ?? 100;
  const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as PracticeInvoice);
}

/**
 * List invoices for a specific project.
 */
export async function getInvoicesByProject(
  firmId: string,
  projectId: string,
  options?: { status?: PracticeInvoiceStatus; limit?: number }
): Promise<PracticeInvoice[]> {
  let query = getCollection()
    .where('firmId', '==', firmId)
    .where('projectId', '==', projectId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  const limit = options?.limit ?? 100;
  const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as PracticeInvoice);
}

/**
 * Get overdue invoices for a firm.
 * An invoice is overdue if its status is 'sent_to_client' and its dueDate is past.
 */
export async function getOverdueInvoices(
  firmId: string,
  currentDate: string
): Promise<PracticeInvoice[]> {
  const snap = await getCollection()
    .where('firmId', '==', firmId)
    .where('status', '==', 'sent_to_client')
    .where('dueDate', '<', currentDate)
    .get();
  return snap.docs.map((doc) => doc.data() as PracticeInvoice);
}

/**
 * Update an invoice status using a Firestore transaction.
 * Atomically transitions status and updates metadata.
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  newStatus: PracticeInvoiceStatus,
  expectedUpdatedAt: string,
  metadata?: { issuedDate?: string; paidDate?: string }
): Promise<PracticeInvoice> {
  const ref = getCollection().doc(invoiceId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    const current = snap.data() as PracticeInvoice;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: invoice ${invoiceId} was modified since last read`
      );
    }

    const now = new Date().toISOString();
    const updated: Partial<PracticeInvoice> = {
      status: newStatus,
      updatedAt: now,
      ...(metadata?.issuedDate && { issuedDate: metadata.issuedDate }),
      ...(metadata?.paidDate && { paidDate: metadata.paidDate }),
    };

    txn.update(ref, updated);
    return { ...current, ...updated } as PracticeInvoice;
  });
}

/**
 * Update general invoice fields with optimistic locking.
 */
export async function updateInvoice(
  invoiceId: string,
  updates: Partial<Omit<PracticeInvoice, 'id' | 'firmId' | 'createdAt' | 'createdBy'>>,
  expectedUpdatedAt: string
): Promise<PracticeInvoice> {
  const ref = getCollection().doc(invoiceId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    const current = snap.data() as PracticeInvoice;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: invoice ${invoiceId} was modified since last read`
      );
    }

    const now = new Date().toISOString();
    const merged = { ...updates, updatedAt: now };
    txn.update(ref, merged);
    return { ...current, ...merged } as PracticeInvoice;
  });
}

/**
 * Delete a draft invoice.
 */
export async function deleteInvoice(invoiceId: string): Promise<void> {
  const ref = getCollection().doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as PracticeInvoice;
  if (data.status !== 'draft') {
    throw new Error(`Cannot delete invoice in status '${data.status}'; only drafts can be deleted`);
  }
  await ref.delete();
}
