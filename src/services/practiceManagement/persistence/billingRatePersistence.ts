/**
 * Billing Rate Persistence Service
 *
 * Firestore CRUD operations for practice_billing_rates collection.
 * All queries scoped by firmId for multi-tenant isolation.
 * Implements optimistic locking via updatedAt field.
 *
 * @module practiceManagement/persistence/billingRatePersistence
 */

import { adminDb } from '@/lib/firebase-admin';
import type { BillingRate, BillingRateRole } from '../types';

const COLLECTION = 'practice_billing_rates';

function getCollection() {
  return adminDb.collection(COLLECTION);
}

/**
 * Create a new billing rate document.
 */
export async function createBillingRate(rate: BillingRate): Promise<BillingRate> {
  const now = new Date().toISOString();
  const doc: BillingRate = {
    ...rate,
    createdAt: rate.createdAt || now,
    updatedAt: now,
  };
  await getCollection().doc(doc.id).set(doc);
  return doc;
}

/**
 * Retrieve a single billing rate by ID.
 */
export async function getBillingRate(rateId: string): Promise<BillingRate | null> {
  const snap = await getCollection().doc(rateId).get();
  if (!snap.exists) return null;
  return snap.data() as BillingRate;
}

/**
 * List all billing rates for a firm.
 */
export async function getBillingRatesByFirm(
  firmId: string,
  options?: { role?: BillingRateRole; limit?: number }
): Promise<BillingRate[]> {
  let query = getCollection().where('firmId', '==', firmId);
  if (options?.role) {
    query = query.where('role', '==', options.role);
  }
  const limit = options?.limit ?? 200;
  const snap = await query.orderBy('effectiveDate', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as BillingRate);
}

/**
 * Get rates for a specific role in a firm, ordered by effective date descending.
 * Used for temporal lookup — the first result is the most recently effective rate.
 */
export async function getBillingRatesByRole(
  firmId: string,
  role: BillingRateRole
): Promise<BillingRate[]> {
  const snap = await getCollection()
    .where('firmId', '==', firmId)
    .where('role', '==', role)
    .orderBy('effectiveDate', 'desc')
    .get();
  return snap.docs.map((doc) => doc.data() as BillingRate);
}

/**
 * Find the applicable billing rate for a role on a given date.
 * Returns the most recent rate whose effectiveDate is on or before the query date.
 */
export async function getApplicableBillingRate(
  firmId: string,
  role: BillingRateRole,
  date: string
): Promise<BillingRate | null> {
  const snap = await getCollection()
    .where('firmId', '==', firmId)
    .where('role', '==', role)
    .where('effectiveDate', '<=', date)
    .orderBy('effectiveDate', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as BillingRate;
}

/**
 * Update a billing rate with optimistic locking.
 */
export async function updateBillingRate(
  rateId: string,
  updates: Partial<Omit<BillingRate, 'id' | 'firmId' | 'createdAt' | 'createdBy'>>,
  expectedUpdatedAt: string
): Promise<BillingRate> {
  const ref = getCollection().doc(rateId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Billing rate ${rateId} not found`);
    }
    const current = snap.data() as BillingRate;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: billing rate ${rateId} was modified since last read`
      );
    }

    const now = new Date().toISOString();
    const merged = { ...updates, updatedAt: now };
    txn.update(ref, merged);
    return { ...current, ...merged } as BillingRate;
  });
}

/**
 * Delete a billing rate by ID.
 */
export async function deleteBillingRate(rateId: string): Promise<void> {
  await getCollection().doc(rateId).delete();
}
