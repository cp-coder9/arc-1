/**
 * Feedback Loop Closure Service
 *
 * Manages status transition notifications for the Intelligent Feedback Loop.
 * When a platform operator transitions a feedback cluster's status, this service
 * notifies all distinct submitters in the cluster via the existing NotificationService.
 *
 * @module feedbackLoopClosureService
 */

import { notificationService } from './notificationService';
import type { FeedbackCluster, FeedbackStatus } from './feedbackTypes';
import type { NotificationType } from '@/types';

// ─── Notification Types ─────────────────────────────────────────────────────────

/** Feedback-specific notification type subset */
export type FeedbackNotificationType =
  | 'feedback_status_changed'
  | 'feedback_shipped'
  | 'feedback_declined';

/** Structured payload for feedback notifications */
export interface FeedbackNotificationPayload {
  type: FeedbackNotificationType;
  clusterTitle: string;
  newStatus: FeedbackStatus;
  actionDescription: string;
  releaseNoteUrl?: string;
  declineReason?: string;
  clusterId: string;
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Determines the notification type based on the new status.
 */
function resolveNotificationType(newStatus: FeedbackStatus): FeedbackNotificationType {
  switch (newStatus) {
    case 'shipped':
      return 'feedback_shipped';
    case 'declined':
      return 'feedback_declined';
    default:
      return 'feedback_status_changed';
  }
}

/**
 * Builds a human-readable notification body message.
 */
function buildNotificationBody(
  clusterTitle: string,
  newStatus: FeedbackStatus,
  actionDescription: string,
  options?: { releaseNoteUrl?: string; declineReason?: string }
): string {
  let body = `Your feedback "${clusterTitle}" has been updated to "${newStatus}". ${actionDescription}`;

  if (newStatus === 'shipped' && options?.releaseNoteUrl) {
    body += ` Release notes: ${options.releaseNoteUrl}`;
  }

  if (newStatus === 'declined' && options?.declineReason) {
    body += ` Reason: ${options.declineReason}`;
  }

  return body;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Builds the notification payload for a feedback status transition.
 *
 * @param cluster - The feedback cluster being transitioned
 * @param newStatus - The new status being applied
 * @param actionDescription - Operator-provided action description
 * @param options - Optional fields for shipped/declined transitions
 * @returns The structured notification payload
 */
export function buildNotificationPayload(
  cluster: FeedbackCluster,
  newStatus: FeedbackStatus,
  actionDescription: string,
  options?: { releaseNoteUrl?: string; declineReason?: string }
): FeedbackNotificationPayload {
  return {
    type: resolveNotificationType(newStatus),
    clusterTitle: cluster.title,
    newStatus,
    actionDescription,
    releaseNoteUrl: options?.releaseNoteUrl,
    declineReason: options?.declineReason,
    clusterId: cluster.id,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Sends a notification to every distinct submitter in the cluster when
 * a status transition occurs.
 *
 * Uses the existing NotificationService with channels ['in_app', 'email'].
 * For shipped transitions, includes a release note URL if provided.
 * For declined transitions, includes the decline reason.
 *
 * Handles merged clusters: `distinctUserIds` already includes submitters
 * whose submissions were merged into this cluster.
 *
 * @param cluster - The feedback cluster being transitioned
 * @param newStatus - The new status being applied
 * @param actionDescription - Operator-provided description of the action taken
 * @param operatorId - UID of the platform operator performing the transition
 * @param options - Optional fields for shipped/declined transitions
 */
export async function notifyStatusTransition(
  cluster: FeedbackCluster,
  newStatus: FeedbackStatus,
  actionDescription: string,
  operatorId: string,
  options?: { releaseNoteUrl?: string; declineReason?: string }
): Promise<void> {
  const payload = buildNotificationPayload(cluster, newStatus, actionDescription, options);
  const notificationType: NotificationType = payload.type;

  const body = buildNotificationBody(
    cluster.title,
    newStatus,
    actionDescription,
    options
  );

  // Deduplicate user IDs (safety net — distinctUserIds should already be unique)
  const uniqueUserIds = [...new Set(cluster.distinctUserIds)];

  // Send notifications in parallel to all affected submitters
  const notificationPromises = uniqueUserIds.map((userId) =>
    notificationService.sendNotification(
      userId,
      notificationType,
      body,
      {
        clusterId: cluster.id,
        releaseNoteUrl: options?.releaseNoteUrl,
        declineReason: options?.declineReason,
      }
    )
  );

  await Promise.all(notificationPromises);
}
