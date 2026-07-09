// ─── Public Participation Service ────────────────────────────────────────────
// Manages I&AP registration, notification tracking, comment period management,
// and completeness indicators for the EIA public participation process.
// All functions are pure and exported for testability.
//
// Requirements: 7.1–7.7

import type {
  IAPRecord,
  NotificationEvent,
  CommentRecord,
  PPCompletenessIndicator,
} from './eiaTypes';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Public comment period duration in calendar days (NEMA regulation). */
const COMMENT_PERIOD_DAYS = 30;

// ─── ID Generation ───────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ─── Comment Deadline Calculation ────────────────────────────────────────────

/**
 * Calculates the comment period deadline as 30 calendar days from the date issued.
 * Returns an ISO 8601 date string (YYYY-MM-DD).
 *
 * Requirement 7.4: Comment period deadline = dateIssued + 30 calendar days.
 */
export function calculateCommentDeadline(dateIssued: string): string {
  const issued = new Date(dateIssued);
  const deadline = new Date(issued);
  deadline.setDate(deadline.getDate() + COMMENT_PERIOD_DAYS);
  return deadline.toISOString().split('T')[0];
}

// ─── Comment Period Closure Check ────────────────────────────────────────────

/**
 * Determines if the comment period for a notification is closed.
 * The period is closed when the current date is past the commentDeadline.
 *
 * Requirement 7.5: Lock comment period when deadline passes.
 */
export function isCommentPeriodClosed(
  notification: NotificationEvent,
  now?: Date
): boolean {
  if (notification.isClosed) {
    return true;
  }
  const currentDate = now ?? new Date();
  const deadline = new Date(notification.commentDeadline);
  // Set deadline to end of day for inclusive comparison
  deadline.setHours(23, 59, 59, 999);
  return currentDate > deadline;
}

// ─── I&AP CRUD ───────────────────────────────────────────────────────────────

/**
 * Creates a new I&AP record with a generated ID.
 *
 * Requirement 7.1: Maintain an I&AP register with party name, organisation,
 * contact details, date registered, registration method, and interest category.
 */
export function createIAP(data: Omit<IAPRecord, 'id'>): IAPRecord {
  return {
    id: generateId('iap'),
    ...data,
  };
}

// ─── Notification CRUD ───────────────────────────────────────────────────────

/**
 * Creates a new notification event with calculated commentDeadline and initialized counters.
 *
 * Requirement 7.2: Track notification events with type, date issued, recipients, proof reference.
 * Requirement 7.4: Calculate comment period deadline as dateIssued + 30 days.
 */
export function createNotification(
  data: Omit<NotificationEvent, 'id' | 'commentDeadline' | 'isClosed' | 'totalComments' | 'commentsWithResponse'>
): NotificationEvent {
  return {
    id: generateId('notif'),
    ...data,
    commentDeadline: calculateCommentDeadline(data.dateIssued),
    isClosed: false,
    totalComments: 0,
    commentsWithResponse: 0,
  };
}

// ─── Comment Submission ──────────────────────────────────────────────────────

/**
 * Submits a comment against a notification.
 *
 * If the comment period is closed, returns an error object with a closure message.
 * Otherwise, creates the comment and returns the updated notification with incremented counters.
 *
 * Requirement 7.3: Record comments linked to notification and I&AP.
 * Requirement 7.5: Lock comment period when deadline passes, display total comments and responses.
 * Requirement 7.6: Reject comments after period closure with message indicating closure date.
 */
export function submitComment(
  notification: NotificationEvent,
  comment: Omit<CommentRecord, 'id'>,
  now?: Date
): { comment: CommentRecord; notification: NotificationEvent } | { error: string } {
  if (isCommentPeriodClosed(notification, now)) {
    return {
      error: `Comment period closed on ${notification.commentDeadline}. No new comments can be submitted for this notification.`,
    };
  }

  const newComment: CommentRecord = {
    id: generateId('comment'),
    ...comment,
  };

  const updatedNotification: NotificationEvent = {
    ...notification,
    totalComments: notification.totalComments + 1,
    commentsWithResponse: comment.eapResponse
      ? notification.commentsWithResponse + 1
      : notification.commentsWithResponse,
  };

  return {
    comment: newComment,
    notification: updatedNotification,
  };
}

// ─── Notified I&AP Lookup ────────────────────────────────────────────────────

/**
 * Finds I&APs that appear on at least one notification recipient list.
 *
 * Requirement 7.7: "total I&APs notified (those appearing on at least one notification recipient list)"
 */
export function findNotifiedIAPs(
  iaps: IAPRecord[],
  notifications: NotificationEvent[]
): IAPRecord[] {
  const notifiedIds = new Set<string>();
  for (const notification of notifications) {
    for (const recipientId of notification.recipientIds) {
      notifiedIds.add(recipientId);
    }
  }
  return iaps.filter((iap) => notifiedIds.has(iap.id));
}

// ─── Completeness Indicator ──────────────────────────────────────────────────

/**
 * Calculates the public participation completeness indicator.
 *
 * Requirement 7.7: Display total I&APs registered, total I&APs notified,
 * total comments received, total comments with recorded EAP responses,
 * with any count of zero highlighted as requiring attention.
 */
export function calculateCompletenessIndicator(
  iaps: IAPRecord[],
  notifications: NotificationEvent[],
  comments: CommentRecord[]
): PPCompletenessIndicator {
  const notifiedIAPs = findNotifiedIAPs(iaps, notifications);
  const commentsWithResponse = comments.filter(
    (c) => c.eapResponse !== undefined && c.eapResponse !== ''
  ).length;

  return {
    totalIAPs: iaps.length,
    notifiedIAPs: notifiedIAPs.length,
    totalComments: comments.length,
    commentsWithResponse,
  };
}
