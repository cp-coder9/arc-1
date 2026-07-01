/**
 * XA Completion Sync Service
 *
 * Manages the synchronisation of XA-tagged CPD module completions
 * with the XA Compliance Hub. Updates the user's XA compliance status
 * in Firestore and triggers Project Command Centre notifications
 * when education requirements are met.
 *
 * Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4
 */

import {
  getDoc,
  setDoc,
  arrayUnion,
} from 'firebase/firestore';
import { getDemoDoc } from '@/demo-seed/demoFirestore';
import { notificationService } from '@/services/notificationService';

export interface XACompletionStatus {
  userId: string;
  completedModules: string[];
  totalRequired: 3;
  educationComplete: boolean;
  lastSyncedAt: string;
}

const TOTAL_REQUIRED_MODULES = 3;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 30_000;

/**
 * Called when a user completes an XA-tagged CPD module.
 * Updates the XA Compliance Hub status document in Firestore.
 * Triggers a Project Command Centre notification on education completion.
 * Retries on failure (max 3 attempts, 30s interval).
 * Never blocks the user's assessment completion.
 */
export async function syncXACompletion(
  userId: string,
  courseId: string,
  courseTitle: string
): Promise<{ success: boolean; educationComplete: boolean }> {
  let attempt = 0;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    attempt++;
    try {
      const docRef = getDemoDoc('users', userId, 'xa_compliance', 'status');
      const snapshot = await getDoc(docRef);
      const existing = snapshot.data() as Partial<XACompletionStatus> | undefined;

      const completedModules = existing?.completedModules || [];
      const updatedModules = completedModules.includes(courseId)
        ? completedModules
        : [...completedModules, courseId];
      const educationComplete = updatedModules.length >= TOTAL_REQUIRED_MODULES;
      const now = new Date().toISOString();

      await setDoc(
        docRef,
        {
          userId,
          completedModules: arrayUnion(courseId),
          totalRequired: TOTAL_REQUIRED_MODULES,
          educationComplete,
          lastSyncedAt: now,
        },
        { merge: true }
      );

      // Trigger Project Command Centre notification when education is complete
      if (educationComplete && !existing?.educationComplete) {
        triggerCompletionNotification(userId, courseTitle);
      }

      return { success: true, educationComplete };
    } catch (error) {
      console.error(
        `[XA Sync] Attempt ${attempt}/${MAX_RETRY_ATTEMPTS} failed for user ${userId}:`,
        error
      );

      if (attempt < MAX_RETRY_ATTEMPTS) {
        await delay(RETRY_INTERVAL_MS);
      }
    }
  }

  // All retries exhausted — log permanent failure but do not block user
  console.error(
    `[XA Sync] All ${MAX_RETRY_ATTEMPTS} retries exhausted for user ${userId}, course ${courseId}. Sync abandoned.`
  );
  return { success: false, educationComplete: false };
}

/**
 * Reads the current XA completion status for display in the learning path UI.
 */
export async function getXACompletionStatus(userId: string): Promise<XACompletionStatus> {
  const docRef = getDemoDoc('users', userId, 'xa_compliance', 'status');
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return {
      userId,
      completedModules: [],
      totalRequired: TOTAL_REQUIRED_MODULES as 3,
      educationComplete: false,
      lastSyncedAt: '',
    };
  }

  const data = snapshot.data() as Partial<XACompletionStatus>;
  return {
    userId,
    completedModules: data.completedModules || [],
    totalRequired: TOTAL_REQUIRED_MODULES as 3,
    educationComplete: (data.completedModules || []).length >= TOTAL_REQUIRED_MODULES,
    lastSyncedAt: data.lastSyncedAt || '',
  };
}

/**
 * Triggers a Project Command Centre notification when XA education is complete.
 * Notification delivery failure is logged but not retried (non-critical).
 */
function triggerCompletionNotification(userId: string, courseTitle: string): void {
  notificationService
    .sendNotification(
      userId,
      'cpd_certificate_issued',
      `XA Compliance Education Complete — all ${TOTAL_REQUIRED_MODULES} required modules finished. Full XA checklist is now unlocked.`,
      { courseId: courseTitle }
    )
    .catch((error) => {
      console.error(
        '[XA Sync] Notification delivery failed (non-critical):',
        error
      );
    });
}

/**
 * Utility: promise-based delay for retry scheduling.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
