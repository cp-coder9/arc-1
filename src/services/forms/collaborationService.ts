// ─── Collaboration Service ───────────────────────────────────────────────────
// Real-time field locking and form sharing for collaborative form editing.
// Subcollection path: form_instances/{instanceId}/locks/{fieldId}
// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5

import {
  collection,
  doc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  runTransaction,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { FieldLock } from '@/services/forms/formTypes';

// ─── Constants ──────────────────────────────────────────────────────────────

const FORM_INSTANCES_COL = 'form_instances';
const LOCKS_COL = 'locks';

/** Lock expiry duration: 5 minutes in milliseconds. */
const LOCK_EXPIRY_MS = 5 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function locksCollection(instanceId: string) {
  if (!instanceId) throw new Error('instanceId is required');
  return collection(db, FORM_INSTANCES_COL, instanceId, LOCKS_COL);
}

function lockDocRef(instanceId: string, fieldId: string) {
  if (!instanceId) throw new Error('instanceId is required');
  if (!fieldId) throw new Error('fieldId is required');
  return doc(db, FORM_INSTANCES_COL, instanceId, LOCKS_COL, fieldId);
}

function instanceDocRef(instanceId: string) {
  if (!instanceId) throw new Error('instanceId is required');
  return doc(db, FORM_INSTANCES_COL, instanceId);
}

// ─── Field Locking ──────────────────────────────────────────────────────────

/**
 * Acquires a field lock for a user using a Firestore transaction.
 *
 * - If the field is not locked or the existing lock has expired, the lock is granted.
 * - If the field is locked by the same user, the lock is refreshed.
 * - If the field is locked by another user and the lock has not expired, returns false.
 *
 * Requirement 8.2: prevent conflicting edits by locking fields focused by another user.
 *
 * @returns true if the lock was acquired, false if locked by another active user.
 */
export async function acquireFieldLock(
  instanceId: string,
  fieldId: string,
  userId: string,
  userName: string
): Promise<boolean> {
  const lockRef = lockDocRef(instanceId, fieldId);

  try {
    return await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(lockRef);

      if (existing.exists()) {
        const lock = existing.data() as FieldLock;

        // If locked by a different user and not expired, deny acquisition
        if (lock.lockedBy !== userId && lock.expiresAt.toMillis() > Date.now()) {
          return false;
        }
      }

      // Grant or refresh the lock
      const now = Timestamp.now();
      const lockData: FieldLock = {
        fieldId,
        lockedBy: userId,
        lockedByName: userName,
        lockedAt: now,
        expiresAt: Timestamp.fromMillis(Date.now() + LOCK_EXPIRY_MS),
      };

      transaction.set(lockRef, lockData);
      return true;
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${FORM_INSTANCES_COL}/${instanceId}/${LOCKS_COL}/${fieldId}`
    );
    throw error;
  }
}

/**
 * Releases a field lock by deleting the lock document.
 *
 * Called when a user blurs a field or navigates away.
 *
 * Requirement 8.2: automatically release locks.
 */
export async function releaseFieldLock(
  instanceId: string,
  fieldId: string
): Promise<void> {
  const lockRef = lockDocRef(instanceId, fieldId);

  try {
    await deleteDoc(lockRef);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${FORM_INSTANCES_COL}/${instanceId}/${LOCKS_COL}/${fieldId}`
    );
    throw error;
  }
}

/**
 * Subscribes to real-time field lock state for a form instance.
 *
 * Filters out expired locks (>5 minutes from lockedAt) so only active locks
 * are passed to the callback.
 *
 * Requirement 8.5: display active collaborators and their locked fields in real-time.
 *
 * @returns Unsubscribe function to stop listening.
 */
export function subscribeToFieldLocks(
  instanceId: string,
  onUpdate: (locks: FieldLock[]) => void
): () => void {
  const locksRef = locksCollection(instanceId);

  const unsubscribe = onSnapshot(locksRef, (snapshot) => {
    const allLocks = snapshot.docs.map((d) => d.data() as FieldLock);

    // Filter expired locks — only active locks (expiresAt > now) are passed through
    const now = Date.now();
    const activeLocks = allLocks.filter((lock) => lock.expiresAt.toMillis() > now);

    onUpdate(activeLocks);
  });

  return unsubscribe;
}

// ─── Sharing ────────────────────────────────────────────────────────────────

/**
 * Shares a form instance with a collaborator by adding their userId
 * to the instance's collaborators array.
 *
 * Requirement 8.1: form owner grants edit access to team members.
 * Requirement 8.4: sharing restricted to same project team members
 *   (enforced at the API/permission layer, not duplicated here).
 */
export async function shareForm(
  instanceId: string,
  collaboratorId: string
): Promise<void> {
  const ref = instanceDocRef(instanceId);

  try {
    await updateDoc(ref, {
      collaborators: arrayUnion(collaboratorId),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${FORM_INSTANCES_COL}/${instanceId}`
    );
    throw error;
  }
}

/**
 * Revokes a collaborator's access by removing their userId
 * from the instance's collaborators array.
 *
 * Requirement 8.1: form owner can revoke sharing, immediately removing edit access.
 */
export async function revokeShare(
  instanceId: string,
  collaboratorId: string
): Promise<void> {
  const ref = instanceDocRef(instanceId);

  try {
    await updateDoc(ref, {
      collaborators: arrayRemove(collaboratorId),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${FORM_INSTANCES_COL}/${instanceId}`
    );
    throw error;
  }
}
