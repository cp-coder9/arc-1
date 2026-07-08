/**
 * Feedback Loop — Escalation Decision Functions
 *
 * Pure decision functions for determining when feedback clusters
 * should trigger Action Centre escalations (high-severity inbox items)
 * or pending review reminders (stale clusters).
 *
 * These are extracted as pure functions to enable property-based testing
 * independent of Firestore or inbox side effects.
 *
 * @module feedbackEscalation
 */

const HIGH_SEVERITY_THRESHOLD = 8;
const STALE_REVIEW_DAYS = 7;

/**
 * Determines if a cluster should trigger a high-severity Action Centre escalation.
 * Returns true iff severityScore >= 8.
 */
export function shouldEscalateHighSeverity(severityScore: number): boolean {
  return severityScore >= HIGH_SEVERITY_THRESHOLD;
}

/**
 * Determines if a cluster should trigger a "pending review" Action Centre item.
 * Returns true iff status is 'received' AND last updated more than 7 days ago.
 */
export function shouldTriggerPendingReview(status: string, updatedAt: string, now: Date): boolean {
  if (status !== 'received') return false;
  const daysSinceUpdate = (now.getTime() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceUpdate >= STALE_REVIEW_DAYS;
}
