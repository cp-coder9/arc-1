/**
 * Task Delivery Service
 *
 * Handles task deliverable submission, AI Review routing, Professional sign-off,
 * escrow payment release, resubmission lifecycle, and failure handling.
 * Integrates with the Documents service (with retry on unavailability),
 * AI Review Queue, Escrow Service, Audit Trail, and Action Centre.
 *
 * Validates: Requirements 5.5, 5.6, 5.7, 5.8, 10.7, 10.8
 */

import type {
  TaskPosting,
  TaskPostingStatus,
  TaskDeliverable,
  DeliverableFile,
  DeliverableFormat,
  MarketplaceError,
} from '../types';

import { logMarketplaceAction } from './marketplaceAuditService';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum total submissions: initial (1) + 3 resubmissions = 4 */
const MAX_SUBMISSION_NUMBER = 4;

/** Maximum retry duration for Documents service unavailability (24 hours) */
const DOCUMENT_RETRY_MAX_MS = 24 * 60 * 60 * 1000;

/** Escrow release deadline after both conditions met (48 hours) */
const ESCROW_RELEASE_WINDOW_MS = 48 * 60 * 60 * 1000;

// ─── External Dependency Stubs ────────────────────────────────────────────────

/**
 * Routes a deliverable to the AI Review Queue for compliance checking.
 * Stub: In production, publishes deliverable to the AI compliance pipeline.
 */
export async function routeToAiReview(
  deliverableId: string
): Promise<void> {
  // Stub: fire-and-forget — AI review result arrives asynchronously
  void deliverableId;
}

/**
 * Stores deliverable files in the project document vault via the Documents service.
 * Returns { stored: true, documentId } on success.
 * Returns { stored: false } when the Documents service is unavailable.
 *
 * Stub: In production, integrates with the Documents service / Vercel Blob.
 */
export async function storeInDocumentVault(
  taskId: string,
  deliverableId: string,
  files: DeliverableFile[]
): Promise<{ stored: boolean; documentId?: string }> {
  // Stub: assumes storage succeeds unless overridden in tests
  void taskId;
  void files;
  return { stored: true, documentId: `doc-vault-${deliverableId}` };
}

/**
 * Notifies a user via the Action Centre.
 * Stub: In production, creates an inbox notification entry.
 */
export async function notifyUser(
  userId: string,
  notification: { type: string; title: string; message: string; entityId: string; entityType: string }
): Promise<void> {
  // Stub: no-op
  void userId;
  void notification;
}

/**
 * Triggers escrow release for a completed task within 48 hours.
 * Stub: In production, transitions escrow from funded_held → release_requested → released.
 */
export async function triggerEscrowRelease(data: {
  taskId: string;
  freelancerId: string;
  deliverableId: string;
  escrowId?: string;
}): Promise<{ released: boolean; scheduledAt: string }> {
  // Stub: schedules release unless overridden in tests
  void data;
  return { released: true, scheduledAt: new Date().toISOString() };
}

/**
 * Queues a deliverable for document vault storage retry.
 * Retries with exponential backoff up to 24 hours.
 * Stub: In production, writes to a retry queue (Firestore or message queue).
 */
export async function queueDocumentStorageRetry(
  taskId: string,
  deliverableId: string,
  files: DeliverableFile[]
): Promise<{ queued: boolean; retryUntil: string }> {
  // Stub: creates a retry entry
  void taskId;
  void files;
  const retryUntil = new Date(Date.now() + DOCUMENT_RETRY_MAX_MS).toISOString();
  return { queued: true, retryUntil };
}

// ─── Pure Functions (exported for property testing) ───────────────────────────

/**
 * Validates that at least one submitted file matches the task's specified deliverable format.
 *
 * Pure function — no side effects.
 *
 * @param files - Array of files submitted by the freelancer
 * @param requiredFormat - The deliverable format specified in the task posting
 * @returns true if at least one file matches the required format
 */
export function validateDeliverableFormat(
  files: DeliverableFile[],
  requiredFormat: DeliverableFormat
): boolean {
  if (!files || files.length === 0) {
    return false;
  }
  return files.some((file) => file.format === requiredFormat);
}

/**
 * Determines whether a freelancer can resubmit a deliverable.
 *
 * Resubmission is allowed when:
 * 1. The current submission number is less than MAX_SUBMISSION_NUMBER (4)
 * 2. The task deadline has not passed
 *
 * Pure function — no side effects.
 *
 * @param submissionNumber - Current submission number (1–4)
 * @param deadline - Task deadline as ISO-8601 string
 * @param now - Current time (defaults to Date.now for testability)
 * @returns true if resubmission is allowed
 */
export function canResubmit(
  submissionNumber: number,
  deadline: string,
  now?: Date
): boolean {
  const currentTime = now || new Date();
  const deadlineDate = new Date(deadline);

  // Already at max submissions (4 = initial + 3 resubmissions)
  if (submissionNumber >= MAX_SUBMISSION_NUMBER) {
    return false;
  }

  // Deadline has passed
  if (currentTime.getTime() >= deadlineDate.getTime()) {
    return false;
  }

  return true;
}

/**
 * Determines whether escrow payment can be released for a deliverable.
 *
 * Payment release requires BOTH conditions:
 * 1. Professional has signed off (professionalSignOff === true)
 * 2. AI Review has returned "passed" (aiReviewStatus === 'passed')
 *
 * Pure function — no side effects.
 *
 * @param professionalSignOff - Whether the professional has signed off
 * @param aiReviewStatus - The AI review status for the deliverable
 * @returns true if both conditions are met for payment release
 */
export function isPaymentReleasable(
  professionalSignOff: boolean,
  aiReviewStatus: 'pending' | 'passed' | 'rejected'
): boolean {
  return professionalSignOff === true && aiReviewStatus === 'passed';
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let deliverableCounter = 0;

function generateDeliverableId(): string {
  deliverableCounter += 1;
  return `task-del-${Date.now()}-${deliverableCounter}`;
}

// ─── Helper: Fetch Task Posting ───────────────────────────────────────────────

async function fetchTaskPosting(taskId: string): Promise<TaskPosting | MarketplaceError> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Task posting not found',
        details: { reason: `Task posting ${taskId} does not exist` },
      };
    }

    const data = doc.data()!;
    return {
      id: doc.id,
      professionalId: data.professionalId,
      title: data.title,
      description: data.description,
      estimatedHours: data.estimatedHours,
      paymentAmount: data.paymentAmount,
      requiredTools: data.requiredTools,
      deliverableFormat: data.deliverableFormat as DeliverableFormat,
      deadline: data.deadline,
      status: data.status as TaskPostingStatus,
      assignedFreelancerId: data.assignedFreelancerId || undefined,
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('[TaskDelivery] Failed to fetch task posting:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch task posting',
      details: { reason: 'Firestore read failed' },
    };
  }
}

function isMarketplaceError(result: TaskPosting | MarketplaceError): result is MarketplaceError {
  return 'code' in result && 'message' in result;
}

// ─── Helper: Fetch latest deliverable for a task ──────────────────────────────

async function fetchLatestDeliverable(
  taskId: string
): Promise<TaskDeliverable | null> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const snapshot = await adminDb
      .collection('marketplace_task_deliverables')
      .where('taskId', '==', taskId)
      .orderBy('submissionNumber', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      taskId: data.taskId,
      freelancerId: data.freelancerId,
      files: data.files,
      submissionNumber: data.submissionNumber,
      aiReviewStatus: data.aiReviewStatus,
      aiReviewReasons: data.aiReviewReasons || undefined,
      professionalSignOff: data.professionalSignOff,
      submittedAt: data.submittedAt,
    };
  } catch (error) {
    console.error('[TaskDelivery] Failed to fetch latest deliverable:', error);
    return null;
  }
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Submits a task deliverable from a freelancer.
 *
 * Workflow:
 * 1. Validate at least one file matches the task's specified deliverable format
 * 2. Route deliverable to AI_Review_Queue for compliance checking
 * 3. Notify Professional of submission
 * 4. Store deliverables in project document vault via Documents service
 * 5. Handle Documents service unavailability: queue with retry up to 24 hours
 * 6. Persist to Firestore marketplace_task_deliverables/{deliverableId}
 *
 * Validates: Requirements 5.5, 10.7, 10.8
 */
export async function submitDeliverable(
  freelancerId: string,
  taskId: string,
  files: DeliverableFile[]
): Promise<TaskDeliverable | MarketplaceError> {
  // 1. Fetch the task posting
  const postingResult = await fetchTaskPosting(taskId);
  if (isMarketplaceError(postingResult)) {
    return postingResult;
  }
  const posting = postingResult;

  // 2. Verify task is in progress
  if (posting.status !== 'in_progress' && posting.status !== 'delivered') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Cannot submit deliverable for a task that is not in progress',
      details: { reason: `Task status is "${posting.status}", expected "in_progress"` },
    };
  }

  // 3. Verify the freelancer is the assigned one
  if (posting.assignedFreelancerId !== freelancerId) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Only the assigned freelancer can submit deliverables',
      details: { reason: 'Freelancer ID does not match the assigned freelancer' },
    };
  }

  // 4. Validate deliverable format — at least one file matches required format
  if (!validateDeliverableFormat(files, posting.deliverableFormat)) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'No submitted file matches the required deliverable format',
      details: {
        field: 'files',
        reason: `At least one file must have format "${posting.deliverableFormat}"`,
      },
    };
  }

  // 5. Determine submission number
  const latestDeliverable = await fetchLatestDeliverable(taskId);
  const submissionNumber = latestDeliverable ? latestDeliverable.submissionNumber + 1 : 1;

  // 6. Check if resubmission is allowed (if this is a resubmission)
  if (submissionNumber > 1) {
    if (!canResubmit(latestDeliverable!.submissionNumber, posting.deadline)) {
      // Either exhausted resubmissions or deadline passed
      return {
        code: 'RESUBMISSION_NOT_ALLOWED',
        message: submissionNumber > MAX_SUBMISSION_NUMBER
          ? 'Maximum resubmission attempts exhausted'
          : 'Task deadline has passed — resubmission is no longer allowed',
        details: {
          reason: submissionNumber > MAX_SUBMISSION_NUMBER
            ? `Maximum ${MAX_SUBMISSION_NUMBER} submissions allowed (initial + 3 resubmissions)`
            : 'Deadline has passed',
        },
      };
    }
  }

  // 7. Build the deliverable record
  const deliverableId = generateDeliverableId();
  const now = new Date().toISOString();

  const deliverable: TaskDeliverable = {
    id: deliverableId,
    taskId,
    freelancerId,
    files: [...files],
    submissionNumber,
    aiReviewStatus: 'pending',
    professionalSignOff: false,
    submittedAt: now,
  };

  // 8. Persist to Firestore marketplace_task_deliverables/{deliverableId}
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .set({
        taskId: deliverable.taskId,
        freelancerId: deliverable.freelancerId,
        files: deliverable.files,
        submissionNumber: deliverable.submissionNumber,
        aiReviewStatus: deliverable.aiReviewStatus,
        professionalSignOff: deliverable.professionalSignOff,
        submittedAt: deliverable.submittedAt,
      });
  } catch (error) {
    console.error('[TaskDelivery] Failed to persist deliverable:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save deliverable',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 9. Update task status to "delivered"
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .update({ status: 'delivered', updatedAt: now });
  } catch (error) {
    console.error('[TaskDelivery] Failed to update task status:', error);
    // Non-fatal: deliverable is persisted
  }

  // 10. Route to AI Review Queue for compliance checking
  try {
    await routeToAiReview(deliverableId);
  } catch (error) {
    console.error('[TaskDelivery] Failed to route to AI review:', error);
    // Non-fatal: deliverable is persisted, AI review can be retried
  }

  // 11. Notify Professional of submission
  try {
    await notifyUser(posting.professionalId, {
      type: 'deliverable_submitted',
      title: 'Deliverable Submitted',
      message: `A deliverable has been submitted for task "${posting.title}" (submission #${submissionNumber})`,
      entityId: deliverableId,
      entityType: 'task_deliverable',
    });
  } catch (error) {
    console.error('[TaskDelivery] Failed to notify professional:', error);
    // Non-fatal
  }

  // 12. Store in project document vault via Documents service
  try {
    const storageResult = await storeInDocumentVault(taskId, deliverableId, files);
    if (!storageResult.stored) {
      // Documents service unavailable — queue for retry up to 24 hours
      await queueDocumentStorageRetry(taskId, deliverableId, files);
      // Notify freelancer of storage delay
      await notifyUser(freelancerId, {
        type: 'document_storage_delayed',
        title: 'Document Storage Delayed',
        message: 'Your deliverable files will be stored once the Documents service is available (retry up to 24 hours)',
        entityId: deliverableId,
        entityType: 'task_deliverable',
      });
    }
  } catch (error) {
    // Documents service unavailable — queue for retry
    console.error('[TaskDelivery] Documents service unavailable:', error);
    try {
      await queueDocumentStorageRetry(taskId, deliverableId, files);
      await notifyUser(freelancerId, {
        type: 'document_storage_delayed',
        title: 'Document Storage Delayed',
        message: 'Your deliverable files will be stored once the Documents service is available (retry up to 24 hours)',
        entityId: deliverableId,
        entityType: 'task_deliverable',
      });
    } catch (queueError) {
      console.error('[TaskDelivery] Failed to queue document storage retry:', queueError);
    }
  }

  // 13. Log action to audit trail
  await logMarketplaceAction({
    actorId: freelancerId,
    actionType: 'task_deliverable_submitted',
    entityId: deliverableId,
    entityType: 'task_deliverable',
    beforeStatus: posting.status,
    afterStatus: 'delivered',
    metadata: {
      taskId,
      submissionNumber,
      fileCount: files.length,
      deliverableFormat: posting.deliverableFormat,
    },
  });

  return deliverable;
}

/**
 * Professional signs off on a task deliverable.
 *
 * When Professional signs off AND AI Review returns "passed":
 * triggers escrow release to Freelancer within 48 hours.
 * Both conditions must be true for release.
 *
 * Validates: Requirement 5.6
 */
export async function signOffDeliverable(
  professionalId: string,
  taskId: string,
  deliverableId: string
): Promise<TaskDeliverable | MarketplaceError> {
  // 1. Fetch the task posting
  const postingResult = await fetchTaskPosting(taskId);
  if (isMarketplaceError(postingResult)) {
    return postingResult;
  }
  const posting = postingResult;

  // 2. Verify the professional owns this task
  if (posting.professionalId !== professionalId) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Only the task owner can sign off on deliverables',
      details: { reason: 'Professional ID does not match task owner' },
    };
  }

  // 3. Fetch the deliverable
  let deliverable: TaskDeliverable | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Deliverable not found',
        details: { reason: `Deliverable ${deliverableId} does not exist` },
      };
    }

    const data = doc.data()!;
    deliverable = {
      id: doc.id,
      taskId: data.taskId,
      freelancerId: data.freelancerId,
      files: data.files,
      submissionNumber: data.submissionNumber,
      aiReviewStatus: data.aiReviewStatus,
      aiReviewReasons: data.aiReviewReasons || undefined,
      professionalSignOff: data.professionalSignOff,
      submittedAt: data.submittedAt,
    };
  } catch (error) {
    console.error('[TaskDelivery] Failed to fetch deliverable:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch deliverable',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 4. Verify deliverable belongs to this task
  if (deliverable.taskId !== taskId) {
    return {
      code: 'INVALID_DELIVERABLE',
      message: 'Deliverable does not belong to this task',
      details: { reason: `Deliverable ${deliverableId} is for a different task` },
    };
  }

  // 5. Verify deliverable is not already rejected
  if (deliverable.aiReviewStatus === 'rejected') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Cannot sign off on a rejected deliverable',
      details: { reason: 'Deliverable has been rejected by AI Review' },
    };
  }

  // 6. Record the professional sign-off
  const now = new Date().toISOString();
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .update({
        professionalSignOff: true,
        signOffAt: now,
        signOffBy: professionalId,
      });
  } catch (error) {
    console.error('[TaskDelivery] Failed to update sign-off:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to record sign-off',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 7. Update the deliverable in memory
  deliverable = { ...deliverable, professionalSignOff: true };

  // 8. Check if both conditions are met for payment release
  if (isPaymentReleasable(deliverable.professionalSignOff, deliverable.aiReviewStatus)) {
    // Trigger escrow release within 48 hours
    try {
      await triggerEscrowRelease({
        taskId,
        freelancerId: deliverable.freelancerId,
        deliverableId,
      });
    } catch (error) {
      console.error('[TaskDelivery] Failed to trigger escrow release:', error);
      // Non-fatal: release can be retried
    }

    // Transition task to "completed"
    try {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb
        .collection('marketplace_task_postings')
        .doc(taskId)
        .update({ status: 'completed', updatedAt: now });
    } catch (error) {
      console.error('[TaskDelivery] Failed to update task to completed:', error);
    }
  }

  // 9. Log action to audit trail
  await logMarketplaceAction({
    actorId: professionalId,
    actionType: 'task_deliverable_signed_off',
    entityId: deliverableId,
    entityType: 'task_deliverable',
    metadata: {
      taskId,
      freelancerId: deliverable.freelancerId,
      submissionNumber: deliverable.submissionNumber,
      aiReviewStatus: deliverable.aiReviewStatus,
      paymentReleasable: isPaymentReleasable(deliverable.professionalSignOff, deliverable.aiReviewStatus),
    },
  });

  return deliverable;
}

/**
 * Handles AI Review rejection of a deliverable.
 *
 * Transitions deliverable to "rejected" with reasons.
 * Allows up to 3 resubmissions (submissionNumber 1–4: initial + 3 resubmissions).
 * Each resubmission must occur before task deadline.
 *
 * If resubmissions exhausted OR deadline passed without approved deliverable:
 * transitions task to "failed", notifies Professional, retains escrow pending decision.
 *
 * Validates: Requirements 5.7, 5.8
 */
export async function handleAiReviewRejection(
  deliverableId: string,
  reasons: string[]
): Promise<TaskDeliverable | MarketplaceError> {
  // 1. Fetch the deliverable
  let deliverable: TaskDeliverable | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Deliverable not found',
        details: { reason: `Deliverable ${deliverableId} does not exist` },
      };
    }

    const data = doc.data()!;
    deliverable = {
      id: doc.id,
      taskId: data.taskId,
      freelancerId: data.freelancerId,
      files: data.files,
      submissionNumber: data.submissionNumber,
      aiReviewStatus: data.aiReviewStatus,
      aiReviewReasons: data.aiReviewReasons || undefined,
      professionalSignOff: data.professionalSignOff,
      submittedAt: data.submittedAt,
    };
  } catch (error) {
    console.error('[TaskDelivery] Failed to fetch deliverable:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch deliverable',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Transition deliverable to "rejected" with reasons
  const now = new Date().toISOString();
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .update({
        aiReviewStatus: 'rejected',
        aiReviewReasons: reasons,
        rejectedAt: now,
      });
  } catch (error) {
    console.error('[TaskDelivery] Failed to update deliverable rejection:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update deliverable status',
      details: { reason: 'Firestore write failed' },
    };
  }

  // Update in-memory state
  deliverable = {
    ...deliverable,
    aiReviewStatus: 'rejected',
    aiReviewReasons: reasons,
  };

  // 3. Fetch the task posting to check deadline
  const postingResult = await fetchTaskPosting(deliverable.taskId);
  if (isMarketplaceError(postingResult)) {
    return postingResult;
  }
  const posting = postingResult;

  // 4. Determine if resubmission is possible
  const resubmissionAllowed = canResubmit(deliverable.submissionNumber, posting.deadline);

  if (!resubmissionAllowed) {
    // Resubmissions exhausted or deadline passed → fail the task
    await handleTaskFailure(deliverable.taskId, posting.professionalId, deliverable.freelancerId);
  } else {
    // Notify freelancer of rejection with reasons and that they can resubmit
    try {
      await notifyUser(deliverable.freelancerId, {
        type: 'deliverable_rejected',
        title: 'Deliverable Rejected',
        message: `Your deliverable was rejected by AI Review. Reasons: ${reasons.join('; ')}. You may resubmit (${MAX_SUBMISSION_NUMBER - deliverable.submissionNumber} attempt(s) remaining).`,
        entityId: deliverableId,
        entityType: 'task_deliverable',
      });
    } catch (error) {
      console.error('[TaskDelivery] Failed to notify freelancer:', error);
    }
  }

  // 5. Log action to audit trail
  await logMarketplaceAction({
    actorId: 'system:ai_review',
    actionType: 'task_deliverable_rejected',
    entityId: deliverableId,
    entityType: 'task_deliverable',
    beforeStatus: 'pending',
    afterStatus: 'rejected',
    metadata: {
      taskId: deliverable.taskId,
      freelancerId: deliverable.freelancerId,
      submissionNumber: deliverable.submissionNumber,
      reasons,
      resubmissionAllowed,
    },
  });

  return deliverable;
}

/**
 * Handles AI Review passing a deliverable.
 *
 * When AI Review returns "passed" AND Professional has signed off:
 * triggers escrow release within 48 hours.
 *
 * Validates: Requirement 5.6
 */
export async function handleAiReviewPass(
  deliverableId: string
): Promise<TaskDeliverable | MarketplaceError> {
  // 1. Fetch the deliverable
  let deliverable: TaskDeliverable | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Deliverable not found',
        details: { reason: `Deliverable ${deliverableId} does not exist` },
      };
    }

    const data = doc.data()!;
    deliverable = {
      id: doc.id,
      taskId: data.taskId,
      freelancerId: data.freelancerId,
      files: data.files,
      submissionNumber: data.submissionNumber,
      aiReviewStatus: data.aiReviewStatus,
      aiReviewReasons: data.aiReviewReasons || undefined,
      professionalSignOff: data.professionalSignOff,
      submittedAt: data.submittedAt,
    };
  } catch (error) {
    console.error('[TaskDelivery] Failed to fetch deliverable:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch deliverable',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Update deliverable AI review status to "passed"
  const now = new Date().toISOString();
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .update({
        aiReviewStatus: 'passed',
        aiReviewPassedAt: now,
      });
  } catch (error) {
    console.error('[TaskDelivery] Failed to update AI review status:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update deliverable AI review status',
      details: { reason: 'Firestore write failed' },
    };
  }

  // Update in-memory state
  deliverable = { ...deliverable, aiReviewStatus: 'passed' };

  // 3. Check if both conditions are met for payment release
  if (isPaymentReleasable(deliverable.professionalSignOff, deliverable.aiReviewStatus)) {
    // Trigger escrow release within 48 hours
    try {
      await triggerEscrowRelease({
        taskId: deliverable.taskId,
        freelancerId: deliverable.freelancerId,
        deliverableId,
      });
    } catch (error) {
      console.error('[TaskDelivery] Failed to trigger escrow release:', error);
    }

    // Transition task to "completed"
    try {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb
        .collection('marketplace_task_postings')
        .doc(deliverable.taskId)
        .update({ status: 'completed', updatedAt: now });
    } catch (error) {
      console.error('[TaskDelivery] Failed to update task to completed:', error);
    }
  }

  // 4. Log action to audit trail
  await logMarketplaceAction({
    actorId: 'system:ai_review',
    actionType: 'task_deliverable_ai_passed',
    entityId: deliverableId,
    entityType: 'task_deliverable',
    beforeStatus: 'pending',
    afterStatus: 'passed',
    metadata: {
      taskId: deliverable.taskId,
      freelancerId: deliverable.freelancerId,
      submissionNumber: deliverable.submissionNumber,
      professionalSignOff: deliverable.professionalSignOff,
      paymentReleasable: isPaymentReleasable(deliverable.professionalSignOff, deliverable.aiReviewStatus),
    },
  });

  return deliverable;
}

/**
 * Handles task failure.
 *
 * Called when:
 * - 3 resubmissions are exhausted (submissionNumber reaches 4 with rejection)
 * - Task deadline passes without an approved deliverable
 *
 * Actions:
 * - Transitions task to "failed"
 * - Notifies Professional
 * - Retains escrow pending Professional's decision (release or dispute)
 *
 * Validates: Requirement 5.8
 */
export async function handleTaskFailure(
  taskId: string,
  professionalId: string,
  freelancerId: string
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Transition task to "failed"
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .update({
        status: 'failed',
        updatedAt: now,
      });
  } catch (error) {
    console.error('[TaskDelivery] Failed to transition task to failed:', error);
  }

  // 2. Notify Professional — escrow retained pending their decision
  try {
    await notifyUser(professionalId, {
      type: 'task_failed',
      title: 'Task Failed',
      message: 'The task has failed due to exhausted resubmissions or deadline expiry. Escrow funds are retained pending your decision to release or initiate a dispute.',
      entityId: taskId,
      entityType: 'task_posting',
    });
  } catch (error) {
    console.error('[TaskDelivery] Failed to notify professional of task failure:', error);
  }

  // 3. Log action to audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'task_failed',
    entityId: taskId,
    entityType: 'task_posting',
    beforeStatus: 'in_progress',
    afterStatus: 'failed',
    metadata: {
      professionalId,
      freelancerId,
      reason: 'Resubmissions exhausted or deadline passed without approved deliverable',
    },
  });
}
