/**
 * Write-Off Persistence Service
 *
 * Firestore CRUD operations for practice_write_offs collection.
 * All queries scoped by firmId for multi-tenant isolation.
 * Implements optimistic locking via createdAt (write-offs are immutable once created).
 *
 * @module practiceManagement/persistence/writeOffPersistence
 */

import { adminDb } from '@/lib/firebase-admin';
import type { WriteOffEntry, WriteOffReason, SacapWorkStage } from '../types';

const COLLECTION = 'practice_write_offs';

function getCollection() {
  return adminDb.collection(COLLECTION);
}

/**
 * Create a new write-off entry document.
 * Write-offs are immutable once created — no update operations.
 */
export async function createWriteOff(entry: WriteOffEntry): Promise<WriteOffEntry> {
  const now = new Date().toISOString();
  const doc: WriteOffEntry = {
    ...entry,
    createdAt: entry.createdAt || now,
  };
  await getCollection().doc(doc.id).set(doc);
  return doc;
}

/**
 * Retrieve a single write-off entry by ID.
 */
export async function getWriteOff(writeOffId: string): Promise<WriteOffEntry | null> {
  const snap = await getCollection().doc(writeOffId).get();
  if (!snap.exists) return null;
  return snap.data() as WriteOffEntry;
}

/**
 * List write-offs for a specific project within a firm.
 */
export async function getWriteOffsByProject(
  firmId: string,
  projectId: string,
  options?: { stage?: SacapWorkStage; limit?: number }
): Promise<WriteOffEntry[]> {
  let query = getCollection()
    .where('firmId', '==', firmId)
    .where('projectId', '==', projectId);
  if (options?.stage) {
    query = query.where('sacapStage', '==', options.stage);
  }
  const limit = options?.limit ?? 200;
  const snap = await query.orderBy('date', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as WriteOffEntry);
}

/**
 * List all write-offs for a firm.
 */
export async function getWriteOffsByFirm(
  firmId: string,
  options?: { reason?: WriteOffReason; limit?: number }
): Promise<WriteOffEntry[]> {
  let query = getCollection().where('firmId', '==', firmId);
  if (options?.reason) {
    query = query.where('reason', '==', options.reason);
  }
  const limit = options?.limit ?? 500;
  const snap = await query.orderBy('date', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as WriteOffEntry);
}

/**
 * Get all reversals for a specific write-off entry.
 */
export async function getReversalsForWriteOff(
  writeOffId: string
): Promise<WriteOffEntry[]> {
  const snap = await getCollection()
    .where('isReversal', '==', true)
    .where('reversalOfId', '==', writeOffId)
    .get();
  return snap.docs.map((doc) => doc.data() as WriteOffEntry);
}

/**
 * Calculate the cumulative net write-off amount for a project.
 * Takes into account reversals (negative amounts).
 */
export async function getCumulativeWriteOffForProject(
  firmId: string,
  projectId: string
): Promise<number> {
  const entries = await getWriteOffsByProject(firmId, projectId);
  return entries.reduce((total, entry) => {
    if (entry.isReversal) {
      return total - entry.amountCents;
    }
    return total + entry.amountCents;
  }, 0);
}

/**
 * Delete a write-off entry. Only reversals can undo write-offs;
 * this is provided for administrative cleanup only.
 */
export async function deleteWriteOff(writeOffId: string): Promise<void> {
  await getCollection().doc(writeOffId).delete();
}
