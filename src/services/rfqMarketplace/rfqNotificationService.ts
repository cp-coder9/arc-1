// ─── RFQ Notification Service ────────────────────────────────────────────────
// Handles notification dispatch for all RFQ lifecycle events.
// Integrates with the existing platform notificationService.
// Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7

import type { RfqStatus } from './types';
import { getDemoDoc, getDemoCol } from '../../demo-seed/demoFirestore';
import { addDoc } from 'firebase/firestore';
import { notificationService } from '../notificationService';

/** Notification payload for RFQ lifecycle events. */
export interface RfqNotificationPayload {
  recipientId: string;
  rfqId: string;
  rfqTitle: string;
  rfqReferenceNumber: string;
  rfqStatus: RfqStatus;
  navigationPath: string;
  message: string;
  deadline?: string;
  supplierName?: string;
  options?: string[];
}

/** Internal helper: build a navigation path to the RFQ detail view. */
function buildNavigationPath(projectId: string, rfqId: string): string {
  return `/projects/${projectId}/rfqs/${rfqId}`;
}

/**
 * Dispatches a single notification to a recipient's inbox in Firestore
 * and integrates with the platform notification service.
 * Persists to: notifications/{recipientId}/inbox/{notificationId}
 */
async function dispatchNotification(payload: RfqNotificationPayload): Promise<void> {
  const inboxCol = getDemoCol('notifications', payload.recipientId, 'inbox');

  await addDoc(inboxCol, {
    rfqId: payload.rfqId,
    rfqTitle: payload.rfqTitle,
    rfqReferenceNumber: payload.rfqReferenceNumber,
    rfqStatus: payload.rfqStatus,
    navigationPath: payload.navigationPath,
    message: payload.message,
    deadline: payload.deadline || null,
    supplierName: payload.supplierName || null,
    options: payload.options || null,
    read: false,
    createdAt: new Date().toISOString(),
  });

  // Integrate with existing platform notification service
  await notificationService.sendNotification(
    payload.recipientId,
    'procurement_order_updated',
    payload.message,
    { projectId: payload.rfqId }
  );
}

/**
 * Logs a notification failure to the RFQ audit trail.
 * Writes to: projects/{pid}/rfqs/{rfqId}/audit/{eventId}
 */
async function logNotificationFailure(
  projectId: string,
  rfqId: string,
  payload: RfqNotificationPayload,
  error: unknown
): Promise<void> {
  const auditCol = getDemoCol('projects', projectId, 'rfqs', rfqId, 'audit');

  await addDoc(auditCol, {
    type: 'notification_failure',
    recipientId: payload.recipientId,
    rfqReferenceNumber: payload.rfqReferenceNumber,
    message: payload.message,
    error: error instanceof Error ? error.message : String(error),
    undelivered: true,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Notifies all suppliers on the invitation list when an RFQ is published.
 * Must deliver within 60 seconds of publication.
 * Requirement 9.1: RFQ title, reference number, and Quote_Deadline in notification content.
 * Requirement 9.7: Include RFQ status and direct navigation path.
 */
export async function notifyRfqPublished(params: {
  projectId: string;
  rfqId: string;
  rfqTitle: string;
  rfqReferenceNumber: string;
  quoteDeadline: string;
  supplierIds: string[];
}): Promise<{ success: boolean; failedRecipients: string[] }> {
  const { projectId, rfqId, rfqTitle, rfqReferenceNumber, quoteDeadline, supplierIds } = params;
  const navigationPath = buildNavigationPath(projectId, rfqId);
  const failedRecipients: string[] = [];

  const notifications = supplierIds.map(async (supplierId) => {
    const payload: RfqNotificationPayload = {
      recipientId: supplierId,
      rfqId,
      rfqTitle,
      rfqReferenceNumber,
      rfqStatus: 'published',
      navigationPath,
      message: `New RFQ "${rfqTitle}" (Ref: ${rfqReferenceNumber}) has been published. Quote deadline: ${quoteDeadline}. Submit your response now.`,
      deadline: quoteDeadline,
    };

    const result = await retryNotification(payload, 1, projectId);
    if (!result.delivered) {
      failedRecipients.push(supplierId);
    }
  });

  await Promise.all(notifications);

  return {
    success: failedRecipients.length === 0,
    failedRecipients,
  };
}

/**
 * Sends 24-hour deadline reminder to suppliers without a quote submission.
 * Requirement 9.2: Reminder to suppliers who have not yet submitted a Quote_Response.
 * Requirement 9.7: Include RFQ status and direct navigation path.
 */
export async function notifyDeadlineReminder(params: {
  projectId: string;
  rfqId: string;
  rfqReferenceNumber: string;
  quoteDeadline: string;
  supplierIdsWithoutQuote: string[];
}): Promise<{ success: boolean; failedRecipients: string[] }> {
  const { projectId, rfqId, rfqReferenceNumber, quoteDeadline, supplierIdsWithoutQuote } = params;
  const navigationPath = buildNavigationPath(projectId, rfqId);
  const failedRecipients: string[] = [];

  const notifications = supplierIdsWithoutQuote.map(async (supplierId) => {
    const payload: RfqNotificationPayload = {
      recipientId: supplierId,
      rfqId,
      rfqTitle: '',
      rfqReferenceNumber,
      rfqStatus: 'published',
      navigationPath,
      message: `Reminder: RFQ ${rfqReferenceNumber} deadline is in 24 hours (${quoteDeadline}). You have not yet submitted a quote.`,
      deadline: quoteDeadline,
    };

    const result = await retryNotification(payload, 1, projectId);
    if (!result.delivered) {
      failedRecipients.push(supplierId);
    }
  });

  await Promise.all(notifications);

  return {
    success: failedRecipients.length === 0,
    failedRecipients,
  };
}

/**
 * Notifies the RFQ issuer when a quote is submitted or revised.
 * Must deliver within 60 seconds of submission.
 * Requirement 9.3: Supplier name and RFQ reference number.
 * Requirement 9.7: Include RFQ status and direct navigation path.
 */
export async function notifyQuoteSubmitted(params: {
  projectId: string;
  rfqId: string;
  rfqReferenceNumber: string;
  supplierName: string;
  issuerId: string;
}): Promise<{ success: boolean }> {
  const { projectId, rfqId, rfqReferenceNumber, supplierName, issuerId } = params;
  const navigationPath = buildNavigationPath(projectId, rfqId);

  const payload: RfqNotificationPayload = {
    recipientId: issuerId,
    rfqId,
    rfqTitle: '',
    rfqReferenceNumber,
    rfqStatus: 'published',
    navigationPath,
    message: `${supplierName} has submitted a quote for RFQ ${rfqReferenceNumber}. Review their response.`,
    supplierName,
  };

  const result = await retryNotification(payload, 1, projectId);
  return { success: result.delivered };
}

/**
 * Notifies approvers when an award recommendation requires their action.
 * Must deliver within 60 seconds.
 * Requirement 9.4: RFQ reference number and a link to the approval action.
 * Requirement 9.7: Include RFQ status and direct navigation path.
 */
export async function notifyApprovalRequired(params: {
  projectId: string;
  rfqId: string;
  rfqReferenceNumber: string;
  approverIds: string[];
}): Promise<{ success: boolean; failedRecipients: string[] }> {
  const { projectId, rfqId, rfqReferenceNumber, approverIds } = params;
  const navigationPath = buildNavigationPath(projectId, rfqId);
  const approvalLink = `${navigationPath}/award/approve`;
  const failedRecipients: string[] = [];

  const notifications = approverIds.map(async (approverId) => {
    const payload: RfqNotificationPayload = {
      recipientId: approverId,
      rfqId,
      rfqTitle: '',
      rfqReferenceNumber,
      rfqStatus: 'evaluation',
      navigationPath: approvalLink,
      message: `Your approval is required for RFQ ${rfqReferenceNumber}. Review the award recommendation and approve or reject.`,
    };

    const result = await retryNotification(payload, 1, projectId);
    if (!result.delivered) {
      failedRecipients.push(approverId);
    }
  });

  await Promise.all(notifications);

  return {
    success: failedRecipients.length === 0,
    failedRecipients,
  };
}

/**
 * Notifies the issuer when zero quotes received by deadline.
 * Must deliver within 5 minutes. Offers options to extend or expand.
 * Requirement 9.5: Notify issuer with options to extend deadline or expand list.
 * Requirement 9.7: Include RFQ status and direct navigation path.
 */
export async function notifyZeroQuotes(params: {
  projectId: string;
  rfqId: string;
  rfqReferenceNumber: string;
  issuerId: string;
}): Promise<{ success: boolean }> {
  const { projectId, rfqId, rfqReferenceNumber, issuerId } = params;
  const navigationPath = buildNavigationPath(projectId, rfqId);

  const payload: RfqNotificationPayload = {
    recipientId: issuerId,
    rfqId,
    rfqTitle: '',
    rfqReferenceNumber,
    rfqStatus: 'published',
    navigationPath,
    message: `RFQ ${rfqReferenceNumber} deadline has passed with zero quotes received. You can extend the deadline or expand the supplier invitation list.`,
    options: ['extend_deadline', 'expand_invitation_list'],
  };

  const result = await retryNotification(payload, 1, projectId);
  return { success: result.delivered };
}

/**
 * Retries failed notification delivery (max 3 attempts within 5 minutes).
 * Uses 100ms delays between attempts for testing purposes.
 * Logs failure and displays undelivered indicator on final failure.
 * Requirement 9.6: 3 retries within 5 minutes, log failure, display undelivered indicator.
 */
export async function retryNotification(
  payload: RfqNotificationPayload,
  attempt: number = 1,
  projectId?: string
): Promise<{ delivered: boolean }> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 100; // 100ms for testing; in production this would scale up to ~5 minutes total

  try {
    await dispatchNotification(payload);
    return { delivered: true };
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return retryNotification(payload, attempt + 1, projectId);
    }

    // Final failure: log to audit trail and mark as undelivered
    if (projectId) {
      try {
        await logNotificationFailure(projectId, payload.rfqId, payload, error);
      } catch (logError) {
        // Best-effort audit logging — don't let logging failure mask the original error
        console.error('[RFQ Notification] Failed to log notification failure to audit trail:', logError);
      }
    }

    console.error(
      `[RFQ Notification] Failed to deliver notification to ${payload.recipientId} after ${MAX_RETRIES} attempts:`,
      error
    );

    return { delivered: false };
  }
}
