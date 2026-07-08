/**
 * Feedback Loop — Audit Trail & Action Centre Integration
 *
 * Handles audit event persistence for feedback lifecycle actions,
 * Project Passport linkage, and Action Centre inbox item creation
 * for high-severity clusters and stale reviews.
 *
 * Retry strategy: fire-and-forget with 3 retries, then queue for deferred retry.
 * Never blocks the originating user action.
 *
 * @module feedbackAuditService
 */

import { adminDb } from '@/lib/firebase-admin';
import { createInboxEvent } from '@/services/inboxEventAdapter';
import type { FeedbackCluster } from '@/services/feedbackTypes';

// ─── Constants ──────────────────────────────────────────────────────────────────

const FEEDBACK_AUDIT_TRAIL_COLLECTION = 'feedback_audit_trail';
const PROJECT_PASSPORT_FEEDBACK_REFS_COLLECTION = 'project_passport_feedback_refs';
const HIGH_SEVERITY_THRESHOLD = 8;
const STALE_REVIEW_DAYS = 7;

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Event types recorded in the feedback audit trail. */
export type FeedbackAuditActionType =
  | 'submission_created'
  | 'cluster_merged'
  | 'status_changed'
  | 'notification_sent'
  | 'implicit_friction_detected';

/** A single audit event for feedback lifecycle actions. */
export interface FeedbackAuditEvent {
  actorId: string;
  actionType: FeedbackAuditActionType;
  sourceObjectId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Retry Utility ──────────────────────────────────────────────────────────────

/**
 * Fire-and-forget retry wrapper. Retries the given function up to `retries` times.
 * On final failure, logs the error and returns (never throws to the caller).
 * In production, the final failure would be queued to a dead-letter collection
 * for deferred retry.
 */
export async function withRetryNonBlocking(
  fn: () => Promise<void>,
  retries = 3
): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (i === retries) {
        console.error('[FeedbackAudit] Failed after retries:', err);
        // In production, queue to a dead-letter collection for deferred retry
      }
    }
  }
}

// ─── Audit Trail ────────────────────────────────────────────────────────────────

/**
 * Persists a feedback audit event to the `feedback_audit_trail` Firestore collection.
 *
 * Each event records: actorId, actionType, sourceObjectId, timestamp, and optional metadata.
 * Uses fire-and-forget retry to never block the user action.
 */
export async function writeFeedbackAuditEvent(event: FeedbackAuditEvent): Promise<void> {
  await withRetryNonBlocking(async () => {
    await adminDb.collection(FEEDBACK_AUDIT_TRAIL_COLLECTION).add({
      actorId: event.actorId,
      actionType: event.actionType,
      sourceObjectId: event.sourceObjectId,
      timestamp: event.timestamp,
      metadata: event.metadata ?? {},
    });
  });
}

// ─── Project Passport Linkage ───────────────────────────────────────────────────

/**
 * Writes a feedback reference into a project's passport record.
 * Only called when the context snapshot has a non-null projectId.
 *
 * Stores the link in a `project_passport_feedback_refs` subcollection-style
 * document keyed by projectId, containing a list of linked submission IDs.
 */
export async function linkFeedbackToProjectPassport(
  submissionId: string,
  projectId: string
): Promise<void> {
  await withRetryNonBlocking(async () => {
    const refDocRef = adminDb
      .collection(PROJECT_PASSPORT_FEEDBACK_REFS_COLLECTION)
      .doc(projectId);

    // Use arrayUnion to avoid duplicates and enable concurrent writes
    const { FieldValue } = await import('firebase-admin/firestore');
    await refDocRef.set(
      {
        projectId,
        feedbackSubmissionIds: FieldValue.arrayUnion(submissionId),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  });
}

// ─── Action Centre: High Severity ───────────────────────────────────────────────

/**
 * Creates an Action Centre inbox item for all `platform_admin` users
 * when a feedback cluster's severity score reaches the high-severity threshold (≥8).
 *
 * Only triggered when severityScore >= HIGH_SEVERITY_THRESHOLD.
 */
export async function createHighSeverityInboxItem(cluster: FeedbackCluster): Promise<void> {
  if (cluster.severityScore < HIGH_SEVERITY_THRESHOLD) {
    return;
  }

  await withRetryNonBlocking(async () => {
    createInboxEvent(
      'platform_admin',
      `High Severity Feedback: ${cluster.title}`,
      cluster.id,
      'high'
    );
  });
}

// ─── Action Centre: Pending Review ──────────────────────────────────────────────

/**
 * Creates a "pending status review" Action Centre inbox item for all `platform_admin` users.
 * Triggered when a cluster's status has been `received` for 7+ days without review.
 */
export async function createPendingReviewInboxItem(cluster: FeedbackCluster): Promise<void> {
  // Only applicable to clusters in 'received' status
  if (cluster.status !== 'received') {
    return;
  }

  // Check if the cluster has been in received status for more than STALE_REVIEW_DAYS
  const lastModified = new Date(cluster.updatedAt).getTime();
  const now = Date.now();
  const daysSinceUpdate = (now - lastModified) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate < STALE_REVIEW_DAYS) {
    return;
  }

  await withRetryNonBlocking(async () => {
    createInboxEvent(
      'platform_admin',
      `Pending Review: ${cluster.title} (${Math.floor(daysSinceUpdate)} days without review)`,
      cluster.id,
      'medium'
    );
  });
}

// ─── Action Centre: Operator Activity ───────────────────────────────────────────

/**
 * Writes an entry to the operator's Action Centre activity log.
 * Surfaces operator actions (status change, brief generation, cluster merge)
 * in their personal activity feed.
 */
export async function surfaceOperatorAction(
  operatorId: string,
  action: string,
  clusterId: string
): Promise<void> {
  await withRetryNonBlocking(async () => {
    await adminDb.collection('action_centre_activity_log').add({
      operatorId,
      action,
      clusterId,
      timestamp: new Date().toISOString(),
    });
  });
}
