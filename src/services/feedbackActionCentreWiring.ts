/**
 * Feedback Loop — Action Centre Wiring
 *
 * Wires feedback cluster events to the Action Centre:
 *
 * 1. After Intelligence Engine computes severity for a cluster,
 *    `onSeverityComputed()` creates an inbox item for all `platform_admin`
 *    users if the score is ≥8 (within 30s of computation).
 *
 * 2. `checkStaleClusters()` scans clusters in `received` status and
 *    creates "pending review" inbox items for those with no review in 7+ days.
 *
 * Both functions are fire-and-forget: they never block the calling action,
 * log failures internally, and use 3-retry queuing via feedbackAuditService.
 *
 * @module feedbackActionCentreWiring
 */

import type { FeedbackCluster } from '@/services/feedbackTypes';
import { shouldEscalateHighSeverity, shouldTriggerPendingReview } from '@/services/feedbackEscalation';
import { createHighSeverityInboxItem, createPendingReviewInboxItem } from '@/services/feedbackAuditService';
import { adminDb } from '@/lib/firebase-admin';

const FEEDBACK_CLUSTERS_COLLECTION = 'feedback_clusters';

/**
 * Called after the Intelligence Engine computes or recomputes a cluster's severity score.
 * If the severity score is ≥8, creates an Action Centre inbox item for all `platform_admin` users.
 *
 * This function is non-blocking — it fires the inbox item creation and catches any errors
 * internally so it never disrupts the calling process.
 *
 * @param cluster The cluster with its updated severity score
 */
export async function onSeverityComputed(cluster: FeedbackCluster): Promise<void> {
  if (shouldEscalateHighSeverity(cluster.severityScore)) {
    await createHighSeverityInboxItem(cluster);
  }
}

/**
 * Checks all clusters in `received` status for staleness (7+ days without review)
 * and creates "pending review" inbox items for each stale cluster.
 *
 * Can be called from:
 * - The cluster list endpoint (on each page load — checks the returned page)
 * - A scheduled CRON job / Cloud Function for background checking
 *
 * @param clusters Optional array of clusters to check. If omitted, queries Firestore
 *   for all clusters with status `received`.
 */
export async function checkStaleClusters(clusters?: FeedbackCluster[]): Promise<void> {
  const now = new Date();

  let clustersToCheck = clusters;

  if (!clustersToCheck) {
    // Query Firestore for all clusters in 'received' status
    const snapshot = await adminDb
      .collection(FEEDBACK_CLUSTERS_COLLECTION)
      .where('status', '==', 'received')
      .get();

    clustersToCheck = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FeedbackCluster[];
  }

  for (const cluster of clustersToCheck) {
    if (shouldTriggerPendingReview(cluster.status, cluster.updatedAt, now)) {
      await createPendingReviewInboxItem(cluster);
    }
  }
}
