/**
 * Project Command Centre — Decision Inbox Utilities
 *
 * Provides urgency sorting and defer date validation for the Mobile Decision Inbox.
 *
 * - `sortByUrgency(cards)` — orders decision cards by urgency group
 *   (overdue > today > this_week > standard), then by deadline ascending within group.
 *
 * - `validateDeferDate(date, today)` — validates a proposed defer date is between
 *   1 and 30 calendar days after today (inclusive).
 *
 * @module commandCentre/decisionInboxUtils
 * @validates Requirements 14.4, 14.6
 */

// ── Decision Card Interface ──────────────────────────────────────────────────

export interface DecisionCard {
  id: string;
  title: string;
  requestingParty: string;
  projectReference: string;
  financialImpact?: number;
  deadline: string;
  urgency: 'overdue' | 'today' | 'this_week' | 'standard';
  supportingDocuments?: Array<{ id: string; title: string; url: string }>;
  actionType: string;
}

// ── Urgency Priority Map ─────────────────────────────────────────────────────

/**
 * Numeric priority for urgency levels. Lower = more urgent.
 */
const URGENCY_PRIORITY: Record<DecisionCard['urgency'], number> = {
  overdue: 0,
  today: 1,
  this_week: 2,
  standard: 3,
};

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sorts decision cards by urgency priority, then by deadline ascending within
 * each urgency group.
 *
 * Order: overdue → today → this_week → standard
 * Within each group: sorted by deadline ascending (earliest first).
 *
 * Returns a new sorted array — does NOT mutate the input.
 *
 * @param cards - Array of DecisionCard items to sort
 * @returns New array sorted by urgency then deadline
 *
 * @validates Requirement 14.4
 */
export function sortByUrgency(cards: DecisionCard[]): DecisionCard[] {
  return [...cards].sort((a, b) => {
    // Primary: sort by urgency group priority
    const urgencyDiff = URGENCY_PRIORITY[a.urgency] - URGENCY_PRIORITY[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;

    // Secondary: sort by deadline ascending within same urgency group
    return a.deadline.localeCompare(b.deadline);
  });
}

// ── Defer Date Validation ────────────────────────────────────────────────────

/**
 * Validates that a proposed defer date is between 1 and 30 calendar days
 * after today (inclusive on both bounds).
 *
 * @param date - The proposed defer date (ISO 8601 date string, e.g. "2025-03-15")
 * @param today - The current date (ISO 8601 date string, e.g. "2025-03-01")
 * @returns `true` if the date is valid (1–30 days after today), `false` otherwise
 *
 * @validates Requirement 14.6
 */
export function validateDeferDate(date: string, today: string): boolean {
  const deferDate = new Date(date);
  const todayDate = new Date(today);

  // Check for invalid date inputs
  if (isNaN(deferDate.getTime()) || isNaN(todayDate.getTime())) {
    return false;
  }

  // Normalize to start of day (strip time component)
  const deferDay = new Date(deferDate.getFullYear(), deferDate.getMonth(), deferDate.getDate());
  const todayDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());

  // Calculate difference in calendar days
  const diffMs = deferDay.getTime() - todayDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // Valid only when 1–30 calendar days after today
  return diffDays >= 1 && diffDays <= 30;
}

// ── Service Export ───────────────────────────────────────────────────────────

export const decisionInboxUtils = {
  sortByUrgency,
  validateDeferDate,
  URGENCY_PRIORITY,
};

export default decisionInboxUtils;
