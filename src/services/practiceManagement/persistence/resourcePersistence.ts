/**
 * Resource Allocation Persistence Service
 *
 * Firestore CRUD operations for practice_resource_allocations collection.
 * All queries scoped by firmId for multi-tenant isolation.
 * Implements optimistic locking via updatedAt field.
 *
 * Document ID format: {userId}_{projectId}
 *
 * @module practiceManagement/persistence/resourcePersistence
 */

import { adminDb } from '@/lib/firebase-admin';

const COLLECTION = 'practice_resource_allocations';

/**
 * Resource allocation record — maps a team member to a project with hours per week.
 */
export interface ResourceAllocationRecord {
  id: string;             // {userId}_{projectId}
  firmId: string;
  userId: string;
  projectId: string;
  role: string;
  allocatedHoursPerWeek: number;
  startDate: string;      // ISO date
  endDate?: string;       // ISO date (if known)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function getCollection() {
  return adminDb.collection(COLLECTION);
}

/**
 * Create a new resource allocation.
 */
export async function createResourceAllocation(
  allocation: ResourceAllocationRecord
): Promise<ResourceAllocationRecord> {
  const now = new Date().toISOString();
  const doc: ResourceAllocationRecord = {
    ...allocation,
    id: allocation.id || `${allocation.userId}_${allocation.projectId}`,
    createdAt: allocation.createdAt || now,
    updatedAt: now,
  };
  await getCollection().doc(doc.id).set(doc);
  return doc;
}

/**
 * Retrieve a single resource allocation by ID.
 */
export async function getResourceAllocation(
  allocationId: string
): Promise<ResourceAllocationRecord | null> {
  const snap = await getCollection().doc(allocationId).get();
  if (!snap.exists) return null;
  return snap.data() as ResourceAllocationRecord;
}

/**
 * Get a resource allocation by user and project.
 */
export async function getResourceAllocationByUserProject(
  firmId: string,
  userId: string,
  projectId: string
): Promise<ResourceAllocationRecord | null> {
  const allocationId = `${userId}_${projectId}`;
  const snap = await getCollection().doc(allocationId).get();
  if (!snap.exists) return null;
  const data = snap.data() as ResourceAllocationRecord;
  if (data.firmId !== firmId) return null;
  return data;
}

/**
 * List all active resource allocations for a firm.
 */
export async function getResourceAllocationsByFirm(
  firmId: string,
  options?: { activeOnly?: boolean; limit?: number }
): Promise<ResourceAllocationRecord[]> {
  let query = getCollection().where('firmId', '==', firmId);
  if (options?.activeOnly !== false) {
    query = query.where('isActive', '==', true);
  }
  const limit = options?.limit ?? 500;
  const snap = await query.limit(limit).get();
  return snap.docs.map((doc) => doc.data() as ResourceAllocationRecord);
}

/**
 * List all resource allocations for a specific user.
 */
export async function getResourceAllocationsByUser(
  firmId: string,
  userId: string,
  options?: { activeOnly?: boolean }
): Promise<ResourceAllocationRecord[]> {
  let query = getCollection()
    .where('firmId', '==', firmId)
    .where('userId', '==', userId);
  if (options?.activeOnly !== false) {
    query = query.where('isActive', '==', true);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as ResourceAllocationRecord);
}

/**
 * List all resource allocations for a specific project.
 */
export async function getResourceAllocationsByProject(
  firmId: string,
  projectId: string,
  options?: { activeOnly?: boolean }
): Promise<ResourceAllocationRecord[]> {
  let query = getCollection()
    .where('firmId', '==', firmId)
    .where('projectId', '==', projectId);
  if (options?.activeOnly !== false) {
    query = query.where('isActive', '==', true);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as ResourceAllocationRecord);
}

/**
 * Update a resource allocation with optimistic locking.
 */
export async function updateResourceAllocation(
  allocationId: string,
  updates: Partial<Omit<ResourceAllocationRecord, 'id' | 'firmId' | 'userId' | 'projectId' | 'createdAt'>>,
  expectedUpdatedAt: string
): Promise<ResourceAllocationRecord> {
  const ref = getCollection().doc(allocationId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new Error(`Resource allocation ${allocationId} not found`);
    }
    const current = snap.data() as ResourceAllocationRecord;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: allocation ${allocationId} was modified since last read`
      );
    }

    const now = new Date().toISOString();
    const merged = { ...updates, updatedAt: now };
    txn.update(ref, merged);
    return { ...current, ...merged } as ResourceAllocationRecord;
  });
}

/**
 * Deactivate a resource allocation (soft delete).
 */
export async function deactivateResourceAllocation(
  allocationId: string,
  expectedUpdatedAt: string
): Promise<ResourceAllocationRecord> {
  return updateResourceAllocation(
    allocationId,
    { isActive: false, endDate: new Date().toISOString().slice(0, 10) },
    expectedUpdatedAt
  );
}

/**
 * Delete a resource allocation (hard delete).
 */
export async function deleteResourceAllocation(allocationId: string): Promise<void> {
  await getCollection().doc(allocationId).delete();
}
