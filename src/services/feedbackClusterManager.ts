/**
 * Feedback Loop — Cluster Management
 *
 * Manages feedback cluster lifecycle: merging submissions into existing clusters,
 * creating new clusters, marking stale clusters, and computing average sentiment.
 *
 * @module feedbackClusterManager
 */

import { adminDb } from '@/lib/firebase-admin';
import type {
  FeedbackSubmission,
  FeedbackCluster,
  FeedbackCategory,
  SentimentBreakdown,
  FeedbackSentiment,
} from '@/services/feedbackTypes';

// ─── Constants ──────────────────────────────────────────────────────────────────

const FEEDBACK_CLUSTERS_COLLECTION = 'feedback_clusters';
const FEEDBACK_SUBMISSIONS_COLLECTION = 'feedback_submissions';
const STALE_THRESHOLD_DAYS = 30;

// ─── Recalculate Average Sentiment ──────────────────────────────────────────────

/**
 * Returns the sentiment with the highest count from the breakdown.
 * On tie, prefers: negative > frustrated > neutral > positive.
 */
export function recalculateAverageSentiment(breakdown: SentimentBreakdown): string {
  const tieBreakerOrder: FeedbackSentiment[] = ['negative', 'frustrated', 'neutral', 'positive'];

  let maxCount = -1;
  let dominant: string = 'neutral';

  for (const sentiment of tieBreakerOrder) {
    const count = breakdown[sentiment];
    if (count > maxCount) {
      maxCount = count;
      dominant = sentiment;
    }
  }

  return dominant;
}

// ─── Merge Submission Into Cluster ──────────────────────────────────────────────

/**
 * Merges a feedback submission into an existing cluster:
 * - Increments occurrenceCount
 * - Adds submissionId to submissionIds[]
 * - Updates distinctUserIds[] and distinctUserCount (if user not already present)
 * - Updates sentimentBreakdown counts based on submission sentiment
 * - Recalculates averageSentiment (most common sentiment)
 * - Increments aiCategoryMismatchCount if submission.categoryMismatch is true
 * - Updates lastSubmissionAt to submission.createdAt
 * - Sets open: true
 * - Persists to Firestore
 * - Updates submission's clusterId field
 */
export async function mergeSubmissionIntoCluster(
  submission: FeedbackSubmission,
  clusterId: string
): Promise<FeedbackCluster> {
  const clusterRef = adminDb.collection(FEEDBACK_CLUSTERS_COLLECTION).doc(clusterId);
  const clusterDoc = await clusterRef.get();

  if (!clusterDoc.exists) {
    throw new Error(`Cluster not found: ${clusterId}`);
  }

  const cluster = { id: clusterDoc.id, ...clusterDoc.data() } as FeedbackCluster;

  // Increment occurrence count
  const occurrenceCount = cluster.occurrenceCount + 1;

  // Add submission ID
  const submissionIds = [...cluster.submissionIds, submission.id];

  // Update distinct users
  const distinctUserIds = [...cluster.distinctUserIds];
  if (!distinctUserIds.includes(submission.userId)) {
    distinctUserIds.push(submission.userId);
  }
  const distinctUserCount = distinctUserIds.length;

  // Update sentiment breakdown
  const sentimentBreakdown: SentimentBreakdown = { ...cluster.sentimentBreakdown };
  const sentiment = submission.sentiment || 'neutral';
  if (sentiment in sentimentBreakdown) {
    sentimentBreakdown[sentiment as keyof SentimentBreakdown] += 1;
  }

  // Recalculate average sentiment
  const averageSentiment = recalculateAverageSentiment(sentimentBreakdown);

  // Increment category mismatch count
  const aiCategoryMismatchCount = cluster.aiCategoryMismatchCount +
    (submission.categoryMismatch ? 1 : 0);

  const now = new Date().toISOString();

  const updatedData = {
    occurrenceCount,
    submissionIds,
    distinctUserIds,
    distinctUserCount,
    sentimentBreakdown,
    averageSentiment,
    aiCategoryMismatchCount,
    lastSubmissionAt: submission.createdAt,
    open: true,
    updatedAt: now,
  };

  // Persist cluster update
  await clusterRef.update(updatedData);

  // Update submission's clusterId
  const submissionRef = adminDb.collection(FEEDBACK_SUBMISSIONS_COLLECTION).doc(submission.id);
  await submissionRef.update({ clusterId, updatedAt: now });

  return {
    ...cluster,
    ...updatedData,
  };
}

// ─── Create Cluster ─────────────────────────────────────────────────────────────

/**
 * Creates a new feedback cluster seeded by a submission:
 * - occurrenceCount = 1
 * - distinctUserCount = 1, distinctUserIds = [submission.userId]
 * - sentimentBreakdown initialized with 1 in the appropriate sentiment bucket
 * - averageSentiment = submission.sentiment or 'neutral'
 * - submissionIds = [submission.id]
 * - open = true
 * - status = 'received'
 * - severityScore = 1 (initial)
 * - Updates submission's clusterId field
 */
export async function createCluster(
  submission: FeedbackSubmission,
  title: string
): Promise<FeedbackCluster> {
  const sentiment: FeedbackSentiment = submission.sentiment || 'neutral';
  const now = new Date().toISOString();

  const sentimentBreakdown: SentimentBreakdown = {
    positive: 0,
    neutral: 0,
    negative: 0,
    frustrated: 0,
  };
  sentimentBreakdown[sentiment] = 1;

  const clusterData: Omit<FeedbackCluster, 'id'> = {
    title,
    category: submission.category as FeedbackCategory,
    status: 'received',
    occurrenceCount: 1,
    distinctUserCount: 1,
    distinctUserIds: [submission.userId],
    severityScore: 1,
    sentimentBreakdown,
    averageSentiment: sentiment,
    submissionIds: [submission.id],
    aiCategoryMismatchCount: submission.categoryMismatch ? 1 : 0,
    open: true,
    lastSubmissionAt: submission.createdAt,
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await adminDb.collection(FEEDBACK_CLUSTERS_COLLECTION).add(clusterData);

  // Update submission's clusterId
  const submissionRef = adminDb.collection(FEEDBACK_SUBMISSIONS_COLLECTION).doc(submission.id);
  await submissionRef.update({ clusterId: docRef.id, updatedAt: now });

  return {
    id: docRef.id,
    ...clusterData,
  };
}

// ─── Mark Stale Clusters ────────────────────────────────────────────────────────

/**
 * Finds clusters where open=true and lastSubmissionAt is more than 30 days ago.
 * Sets open=false on each. Returns the count of clusters marked stale.
 */
export async function markStaleClusters(): Promise<number> {
  const threshold = new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const snapshot = await adminDb
    .collection(FEEDBACK_CLUSTERS_COLLECTION)
    .where('open', '==', true)
    .where('lastSubmissionAt', '<', threshold)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = adminDb.batch();
  const now = new Date().toISOString();

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { open: false, updatedAt: now });
  }

  await batch.commit();

  return snapshot.size;
}
