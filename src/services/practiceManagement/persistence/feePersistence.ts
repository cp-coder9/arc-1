/**
 * Fee Structure Persistence Service
 *
 * Firestore CRUD operations for practice_fee_structures collection.
 * All queries scoped by firmId for multi-tenant isolation.
 * Implements optimistic locking via updatedAt field.
 *
 * @module practiceManagement/persistence/feePersistence
 */

import { adminDb } from '@/lib/firebase-admin';
import type { ProjectFeeStructure } from '../types';

const COLLECTION = 'practice_fee_structures';

function getCollection() {
  return adminDb.collection(COLLECTION);
}

/**
 * Create or overwrite a project fee structure document.
 * Document ID is the projectId (one fee structure per project).
 */
export async function createFeeStructure(
  feeStructure: ProjectFeeStructure
): Promise<ProjectFeeStructure> {
  const now = new Date().toISOString();
  const doc: ProjectFeeStructure = {
    ...feeStructure,
    createdAt: feeStructure.createdAt || now,
    updatedAt: now,
  };
  await getCollection().doc(doc.id).set(doc);
  return doc;
}

/**
 * Retrieve a fee structure by its ID.
 */
export async function getFeeStructure(
  feeStructureId: string
): Promise<ProjectFeeStructure | null> {
  const snap = await getCollection().doc(feeStructureId).get();
  if (!snap.exists) return null;
  return snap.data() as ProjectFeeStructure;
}

/**
 * Retrieve a fee structure by project ID within a firm.
 */
export async function getFeeStructureByProject(
  firmId: string,
  projectId: string
): Promise<ProjectFeeStructure | null> {
  const snap = await getCollection()
    .where('firmId', '==', firmId)
    .where('projectId', '==', projectId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as ProjectFeeStructure;
}

/**
 * List all fee structures for a firm.
 */
export async function getFeeStructuresByFirm(
  firmId: string,
  options?: { limit?: number }
): Promise<ProjectFeeStructure[]> {
  const limit = options?.limit ?? 200;
  const snap = await getCollection()
    .where('firmId', '==', firmId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((doc) => doc.data() as ProjectFeeStructure);
}

/**
 * Update a fee structure with optimistic locking.
 */
export async function updateFeeStructure(
  feeStructureId: string,
  updates: Partial<Omit<ProjectFeeStructure, 'id' | 'firmId' | 'projectId' | 'createdAt' | 'createdBy'>>,
  expectedUpdatedAt: string
): Promise<ProjectFeeStructure> {
  const ref = getCollection().doc(feeStructureId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Fee structure ${feeStructureId} not found`);
    }
    const current = snap.data() as ProjectFeeStructure;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: fee structure ${feeStructureId} was modified since last read`
      );
    }

    const now = new Date().toISOString();
    const merged = { ...updates, updatedAt: now };
    txn.update(ref, merged);
    return { ...current, ...merged } as ProjectFeeStructure;
  });
}

/**
 * Delete a fee structure by ID.
 */
export async function deleteFeeStructure(feeStructureId: string): Promise<void> {
  await getCollection().doc(feeStructureId).delete();
}
