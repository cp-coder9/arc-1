/**
 * Feedback Loop — FeedbackService
 *
 * Server-side service responsible for persisting, retrieving, and managing
 * feedback submissions and clusters in Firestore. Handles rate limiting,
 * soft-delete (POPIA), and status transitions.
 *
 * @module feedbackService
 */

import { adminDb } from '@/lib/firebase-admin';
import { del } from '@vercel/blob';
import type {
  FeedbackSubmission,
  FeedbackCluster,
  FeedbackStatus,
  FeedbackCategory,
  ContextSnapshot,
  StatusHistoryEntry,
} from '@/services/feedbackTypes';
import type { FeedbackSubmissionInput } from '@/services/feedbackValidation';
import {
  validateStatusTransition,
  validateActionDescription,
  validateDeclineReason,
} from '@/services/feedbackValidation';
import { processSubmission } from '@/services/feedbackIntelligenceEngine';
import { createCluster } from '@/services/feedbackClusterManager';

// ─── Constants ──────────────────────────────────────────────────────────────────

const FEEDBACK_SUBMISSIONS_COLLECTION = 'feedback_submissions';
const FEEDBACK_CLUSTERS_COLLECTION = 'feedback_clusters';
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_USER_SUBMISSIONS_LIMIT = 20;
const DEFAULT_CLUSTER_PAGE_SIZE = 25;
const DEFAULT_CLUSTER_DETAIL_PAGE_SIZE = 50;

// ─── Filter Types ───────────────────────────────────────────────────────────────

export interface ClusterFilters {
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  dateFrom?: string; // ISO-8601
  dateTo?: string;   // ISO-8601
}

// ─── Submit Feedback ────────────────────────────────────────────────────────────

/**
 * Persists a new feedback submission to Firestore.
 * Includes Context_Snapshot, UTC ISO-8601 timestamp, user UID, and initial status `received`.
 */
export async function submitFeedback(
  input: FeedbackSubmissionInput,
  userId: string,
  implicit?: boolean,
  implicitMetadata?: { frictionType: string; targetIdentifier: string; signalCount: number }
): Promise<FeedbackSubmission> {
  const now = new Date().toISOString();

  const submissionData: Omit<FeedbackSubmission, 'id'> = {
    userId,
    category: input.category,
    description: input.description,
    contextSnapshot: input.contextSnapshot as ContextSnapshot,
    attachmentUrls: input.attachmentUrls ?? [],
    status: 'received',
    implicit: implicit ?? false,
    ...(implicitMetadata ? { implicitMetadata } : {}),
    clusterId: null,
    aiCategory: null,
    sentiment: null,
    categoryMismatch: false,
    createdAt: now,
    updatedAt: now,
    softDeleted: false,
  };

  const docRef = await adminDb
    .collection(FEEDBACK_SUBMISSIONS_COLLECTION)
    .add(submissionData);

  const persistedSubmission: FeedbackSubmission = {
    id: docRef.id,
    ...submissionData,
  };

  // ─── Intelligence Engine Trigger ────────────────────────────────────────────
  // After successful persistence, trigger AI processing with 30s timeout.
  // Submission is already persisted — graceful degradation on failure.
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Intelligence Engine timeout')), 30000)
    );
    await Promise.race([processSubmission(persistedSubmission), timeoutPromise]);
  } catch (err) {
    // Fallback: create new cluster with neutral sentiment, queue for reprocessing
    await createCluster(
      { ...persistedSubmission, sentiment: 'neutral' },
      persistedSubmission.description.slice(0, 50)
    );
    console.warn('[FeedbackService] Intelligence Engine fallback triggered:', err);
  }

  return persistedSubmission;
}

// ─── Get User Submissions ───────────────────────────────────────────────────────

/**
 * Lists a user's submissions (default max 20), sorted by createdAt descending.
 * Only returns non-soft-deleted submissions.
 */
export async function getUserSubmissions(
  userId: string,
  limit?: number
): Promise<FeedbackSubmission[]> {
  const maxResults = Math.min(limit ?? DEFAULT_USER_SUBMISSIONS_LIMIT, DEFAULT_USER_SUBMISSIONS_LIMIT);

  const snapshot = await adminDb
    .collection(FEEDBACK_SUBMISSIONS_COLLECTION)
    .where('userId', '==', userId)
    .where('softDeleted', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(maxResults)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as FeedbackSubmission[];
}

// ─── Get Cluster List ───────────────────────────────────────────────────────────

/**
 * Returns paginated clusters sorted by severityScore descending.
 * Supports filtering by category, date range (createdAt), and status.
 */
export async function getClusterList(
  filters: ClusterFilters,
  page: number,
  pageSize?: number
): Promise<{ clusters: FeedbackCluster[]; total: number }> {
  const size = pageSize ?? DEFAULT_CLUSTER_PAGE_SIZE;
  const offset = (page - 1) * size;

  let query: FirebaseFirestore.Query = adminDb.collection(FEEDBACK_CLUSTERS_COLLECTION);

  // Apply filters
  if (filters.category) {
    query = query.where('category', '==', filters.category);
  }
  if (filters.status) {
    query = query.where('status', '==', filters.status);
  }
  if (filters.dateFrom) {
    query = query.where('createdAt', '>=', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.where('createdAt', '<=', filters.dateTo);
  }

  // Sort by severity descending
  query = query.orderBy('severityScore', 'desc');

  // Get total count for pagination metadata
  const countSnapshot = await query.count().get();
  const total = countSnapshot.data().count;

  // Apply pagination
  query = query.offset(offset).limit(size);

  const snapshot = await query.get();

  const clusters = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as FeedbackCluster[];

  return { clusters, total };
}

// ─── Get Cluster Detail ─────────────────────────────────────────────────────────

/**
 * Returns a cluster with its submissions, paginated at 50/page sorted by timestamp descending.
 */
export async function getClusterDetail(
  clusterId: string,
  page: number = 1,
  pageSize: number = DEFAULT_CLUSTER_DETAIL_PAGE_SIZE
): Promise<{ cluster: FeedbackCluster; submissions: FeedbackSubmission[]; total: number }> {
  // Get the cluster document
  const clusterDoc = await adminDb
    .collection(FEEDBACK_CLUSTERS_COLLECTION)
    .doc(clusterId)
    .get();

  if (!clusterDoc.exists) {
    throw new Error(`Cluster not found: ${clusterId}`);
  }

  const cluster = { id: clusterDoc.id, ...clusterDoc.data() } as FeedbackCluster;

  // Get paginated submissions for this cluster
  const offset = (page - 1) * pageSize;

  const submissionsQuery = adminDb
    .collection(FEEDBACK_SUBMISSIONS_COLLECTION)
    .where('clusterId', '==', clusterId)
    .orderBy('createdAt', 'desc')
    .offset(offset)
    .limit(pageSize);

  const submissionsSnapshot = await submissionsQuery.get();

  const submissions = submissionsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as FeedbackSubmission[];

  // Get total count of submissions in this cluster
  const totalSnapshot = await adminDb
    .collection(FEEDBACK_SUBMISSIONS_COLLECTION)
    .where('clusterId', '==', clusterId)
    .count()
    .get();
  const total = totalSnapshot.data().count;

  return { cluster, submissions, total };
}

// ─── Check Rate Limit ───────────────────────────────────────────────────────────

/**
 * Counts explicit (implicit=false) submissions in a rolling 24h window.
 * Limit: 10 per user per 24h. Returns remaining count and reset time.
 */
export async function checkRateLimit(
  userId: string
): Promise<{ allowed: boolean; remaining: number; resetsAt: string }> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const snapshot = await adminDb
    .collection(FEEDBACK_SUBMISSIONS_COLLECTION)
    .where('userId', '==', userId)
    .where('implicit', '==', false)
    .where('createdAt', '>=', windowStart)
    .get();

  const count = snapshot.size;
  const allowed = count < RATE_LIMIT_MAX;
  const remaining = Math.max(0, RATE_LIMIT_MAX - count);

  // Calculate reset time: earliest submission in window + 24h
  let resetsAt: string;
  if (count > 0) {
    // Find the oldest submission in the window to determine when the window rolls forward
    const submissions = snapshot.docs
      .map((doc) => doc.data().createdAt as string)
      .sort();
    const oldestInWindow = submissions[0];
    resetsAt = new Date(new Date(oldestInWindow).getTime() + RATE_LIMIT_WINDOW_MS).toISOString();
  } else {
    // No submissions in window, next reset doesn't matter
    resetsAt = new Date(Date.now() + RATE_LIMIT_WINDOW_MS).toISOString();
  }

  return { allowed, remaining, resetsAt };
}

// ─── Soft Delete User Data ──────────────────────────────────────────────────────

/**
 * Sets `softDeleted: true` on all user submissions, clears description fields,
 * deletes Vercel Blob attachments, and preserves cluster occurrence counts.
 */
export async function softDeleteUserData(userId: string): Promise<void> {
  const snapshot = await adminDb
    .collection(FEEDBACK_SUBMISSIONS_COLLECTION)
    .where('userId', '==', userId)
    .get();

  const batch = adminDb.batch();
  const blobUrlsToDelete: string[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Collect blob URLs for deletion
    if (data.attachmentUrls && data.attachmentUrls.length > 0) {
      blobUrlsToDelete.push(...data.attachmentUrls);
    }

    // Soft-delete: clear description, mark as deleted
    batch.update(doc.ref, {
      softDeleted: true,
      description: '',
      attachmentUrls: [],
      updatedAt: new Date().toISOString(),
    });
  }

  // Commit Firestore batch
  await batch.commit();

  // Delete Vercel Blob attachments (fire-and-forget style, but await for correctness)
  if (blobUrlsToDelete.length > 0) {
    await del(blobUrlsToDelete);
  }
}

// ─── Transition Cluster Status ──────────────────────────────────────────────────

/**
 * Validates and persists a cluster status transition.
 * Adds entry to statusHistory[], validates action description and decline reason.
 */
export async function transitionClusterStatus(
  clusterId: string,
  newStatus: FeedbackStatus,
  operatorId: string,
  actionDescription: string,
  options?: { declineReason?: string; releaseNoteUrl?: string }
): Promise<FeedbackCluster> {
  // Get current cluster state
  const clusterRef = adminDb.collection(FEEDBACK_CLUSTERS_COLLECTION).doc(clusterId);
  const clusterDoc = await clusterRef.get();

  if (!clusterDoc.exists) {
    throw new Error(`Cluster not found: ${clusterId}`);
  }

  const cluster = { id: clusterDoc.id, ...clusterDoc.data() } as FeedbackCluster;

  // Validate status transition
  const transitionResult = validateStatusTransition(cluster.status, newStatus);
  if (!transitionResult.valid) {
    throw new Error(transitionResult.error);
  }

  // Validate action description
  const actionResult = validateActionDescription(actionDescription);
  if (!actionResult.valid) {
    throw new Error(actionResult.error);
  }

  // If declining, validate decline reason
  if (newStatus === 'declined') {
    if (!options?.declineReason) {
      throw new Error('Decline reason is required when transitioning to declined status');
    }
    const declineResult = validateDeclineReason(options.declineReason);
    if (!declineResult.valid) {
      throw new Error(declineResult.error);
    }
  }

  // Build status history entry
  const historyEntry: StatusHistoryEntry = {
    from: cluster.status,
    to: newStatus,
    operatorId,
    actionDescription,
    ...(options?.declineReason ? { declineReason: options.declineReason } : {}),
    ...(options?.releaseNoteUrl ? { releaseNoteUrl: options.releaseNoteUrl } : {}),
    timestamp: new Date().toISOString(),
  };

  // Persist the update
  const updatedData = {
    status: newStatus,
    statusHistory: [...(cluster.statusHistory || []), historyEntry],
    updatedAt: new Date().toISOString(),
  };

  await clusterRef.update(updatedData);

  return {
    ...cluster,
    ...updatedData,
  };
}
