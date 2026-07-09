/**
 * Leave Persistence Service
 *
 * Firestore CRUD operations for practice_leave_requests and practice_leave_balances collections.
 * All queries scoped by firmId for multi-tenant isolation.
 * Uses transactions for approval workflows (atomic status + balance updates).
 * Implements optimistic locking via updatedAt field.
 *
 * @module practiceManagement/persistence/leavePersistence
 */

import { adminDb } from '@/lib/firebase-admin';
import type { LeaveRequest, LeaveBalance, LeaveStatus, LeaveType } from '../types';

const REQUESTS_COLLECTION = 'practice_leave_requests';
const BALANCES_COLLECTION = 'practice_leave_balances';

function getRequestsCollection() {
  return adminDb.collection(REQUESTS_COLLECTION);
}

function getBalancesCollection() {
  return adminDb.collection(BALANCES_COLLECTION);
}

// ─── Leave Requests ──────────────────────────────────────────────────────────

/**
 * Create a new leave request document.
 */
export async function createLeaveRequest(request: LeaveRequest): Promise<LeaveRequest> {
  const now = new Date().toISOString();
  const doc: LeaveRequest = {
    ...request,
    createdAt: request.createdAt || now,
    updatedAt: now,
  };
  await getRequestsCollection().doc(doc.id).set(doc);
  return doc;
}

/**
 * Retrieve a single leave request by ID.
 */
export async function getLeaveRequest(requestId: string): Promise<LeaveRequest | null> {
  const snap = await getRequestsCollection().doc(requestId).get();
  if (!snap.exists) return null;
  return snap.data() as LeaveRequest;
}

/**
 * List leave requests for a firm within a date range.
 */
export async function getLeaveRequestsByFirm(
  firmId: string,
  options?: { status?: LeaveStatus; dateFrom?: string; dateTo?: string; limit?: number }
): Promise<LeaveRequest[]> {
  let query = getRequestsCollection().where('firmId', '==', firmId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  if (options?.dateFrom) {
    query = query.where('startDate', '>=', options.dateFrom);
  }
  if (options?.dateTo) {
    query = query.where('startDate', '<=', options.dateTo);
  }
  const limit = options?.limit ?? 200;
  const snap = await query.orderBy('startDate', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as LeaveRequest);
}

/**
 * List leave requests for a specific user.
 */
export async function getLeaveRequestsByUser(
  firmId: string,
  userId: string,
  options?: { status?: LeaveStatus; limit?: number }
): Promise<LeaveRequest[]> {
  let query = getRequestsCollection()
    .where('firmId', '==', firmId)
    .where('userId', '==', userId);
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  const limit = options?.limit ?? 100;
  const snap = await query.orderBy('startDate', 'desc').limit(limit).get();
  return snap.docs.map((doc) => doc.data() as LeaveRequest);
}

/**
 * Approve a leave request using a Firestore transaction.
 * Atomically updates the request status and adjusts the leave balance.
 */
export async function approveLeaveRequest(
  requestId: string,
  approverId: string,
  expectedUpdatedAt: string
): Promise<LeaveRequest> {
  const requestRef = getRequestsCollection().doc(requestId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(requestRef);
    if (!snap.exists) {
      throw new Error(`Leave request ${requestId} not found`);
    }
    const current = snap.data() as LeaveRequest;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: leave request ${requestId} was modified since last read`
      );
    }

    if (current.status !== 'pending') {
      throw new Error(
        `Cannot approve leave request in status '${current.status}'; must be 'pending'`
      );
    }

    const now = new Date().toISOString();
    const updated: Partial<LeaveRequest> = {
      status: 'approved',
      approvedBy: approverId,
      approvedAt: now,
      updatedAt: now,
    };

    txn.update(requestRef, updated);

    // Update balance: move days from pending to used
    const year = current.startDate.slice(0, 4);
    const balanceId = `${current.userId}_${current.leaveType}_${year}`;
    const balanceRef = getBalancesCollection().doc(balanceId);
    const balanceSnap = await txn.get(balanceRef);

    if (balanceSnap.exists) {
      const balance = balanceSnap.data() as LeaveBalance;
      txn.update(balanceRef, {
        pending: Math.max(0, balance.pending - current.workingDays),
        used: balance.used + current.workingDays,
        available: Math.max(0, balance.available),
      });
    }

    return { ...current, ...updated } as LeaveRequest;
  });
}

/**
 * Reject a leave request using a Firestore transaction.
 * Atomically updates the request status and releases pending balance.
 */
export async function rejectLeaveRequest(
  requestId: string,
  rejectedBy: string,
  rejectionReason: string,
  expectedUpdatedAt: string
): Promise<LeaveRequest> {
  const requestRef = getRequestsCollection().doc(requestId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(requestRef);
    if (!snap.exists) {
      throw new Error(`Leave request ${requestId} not found`);
    }
    const current = snap.data() as LeaveRequest;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: leave request ${requestId} was modified since last read`
      );
    }

    if (current.status !== 'pending') {
      throw new Error(
        `Cannot reject leave request in status '${current.status}'; must be 'pending'`
      );
    }

    const now = new Date().toISOString();
    const updated: Partial<LeaveRequest> = {
      status: 'rejected',
      rejectedBy,
      rejectedAt: now,
      rejectionReason,
      updatedAt: now,
    };

    txn.update(requestRef, updated);

    // Release pending balance
    const year = current.startDate.slice(0, 4);
    const balanceId = `${current.userId}_${current.leaveType}_${year}`;
    const balanceRef = getBalancesCollection().doc(balanceId);
    const balanceSnap = await txn.get(balanceRef);

    if (balanceSnap.exists) {
      const balance = balanceSnap.data() as LeaveBalance;
      const newPending = Math.max(0, balance.pending - current.workingDays);
      txn.update(balanceRef, {
        pending: newPending,
        available: balance.entitlement - balance.used - newPending,
      });
    }

    return { ...current, ...updated } as LeaveRequest;
  });
}

/**
 * Cancel a leave request (user-initiated).
 */
export async function cancelLeaveRequest(
  requestId: string,
  expectedUpdatedAt: string
): Promise<LeaveRequest> {
  const requestRef = getRequestsCollection().doc(requestId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(requestRef);
    if (!snap.exists) {
      throw new Error(`Leave request ${requestId} not found`);
    }
    const current = snap.data() as LeaveRequest;

    if (current.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Optimistic lock conflict: leave request ${requestId} was modified since last read`
      );
    }

    if (current.status !== 'pending' && current.status !== 'approved') {
      throw new Error(
        `Cannot cancel leave request in status '${current.status}'; must be 'pending' or 'approved'`
      );
    }

    const now = new Date().toISOString();
    const updated: Partial<LeaveRequest> = {
      status: 'cancelled',
      updatedAt: now,
    };

    txn.update(requestRef, updated);

    // Release balance
    const year = current.startDate.slice(0, 4);
    const balanceId = `${current.userId}_${current.leaveType}_${year}`;
    const balanceRef = getBalancesCollection().doc(balanceId);
    const balanceSnap = await txn.get(balanceRef);

    if (balanceSnap.exists) {
      const balance = balanceSnap.data() as LeaveBalance;
      if (current.status === 'pending') {
        const newPending = Math.max(0, balance.pending - current.workingDays);
        txn.update(balanceRef, {
          pending: newPending,
          available: balance.entitlement - balance.used - newPending,
        });
      } else if (current.status === 'approved') {
        const newUsed = Math.max(0, balance.used - current.workingDays);
        txn.update(balanceRef, {
          used: newUsed,
          available: balance.entitlement - newUsed - balance.pending,
        });
      }
    }

    return { ...current, ...updated } as LeaveRequest;
  });
}

// ─── Leave Balances ──────────────────────────────────────────────────────────

/**
 * Get or create a leave balance for a user.
 * Document ID format: {userId}_{leaveType}_{year}
 */
export async function getLeaveBalance(
  firmId: string,
  userId: string,
  leaveType: LeaveType,
  year: string
): Promise<LeaveBalance | null> {
  const balanceId = `${userId}_${leaveType}_${year}`;
  const snap = await getBalancesCollection().doc(balanceId).get();
  if (!snap.exists) return null;
  const balance = snap.data() as LeaveBalance;
  // Verify firm scoping
  if (balance.firmId !== firmId) return null;
  return balance;
}

/**
 * Create or update a leave balance.
 */
export async function upsertLeaveBalance(balance: LeaveBalance): Promise<LeaveBalance> {
  const balanceId = `${balance.userId}_${balance.leaveType}_${balance.annualCycle}`;
  await getBalancesCollection().doc(balanceId).set(balance, { merge: true });
  return balance;
}

/**
 * Get all leave balances for a user in a firm.
 */
export async function getLeaveBalancesByUser(
  firmId: string,
  userId: string,
  year?: string
): Promise<LeaveBalance[]> {
  let query = getBalancesCollection()
    .where('firmId', '==', firmId)
    .where('userId', '==', userId);
  if (year) {
    query = query.where('annualCycle', '==', year);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as LeaveBalance);
}
