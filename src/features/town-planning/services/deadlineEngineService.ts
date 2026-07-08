import type {
  Deadline,
  DeadlineStatus,
  PlanningApplication,
  MunicipalityProfile,
  PlanningStage,
} from '../types';

import { SPLUMA_DEFAULT_TIMEFRAMES } from '../constants';
import type { Priority } from '../constants';

// ─── In-Memory Store ─────────────────────────────────────────────────────────

const deadlines: Deadline[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a simple unique ID for records.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Adds a number of calendar days to an ISO date string and returns the result
 * as an ISO date string (date only, YYYY-MM-DD).
 */
function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Returns the number of calendar days between an ISO due date and today.
 * Positive means future (days remaining), negative means overdue.
 */
function calculateDaysRemaining(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  // Normalize to start of day for consistent comparison
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Returns today's date as an ISO date string (YYYY-MM-DD).
 */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Deadline Management ─────────────────────────────────────────────────────

/**
 * Registers statutory deadlines for an application based on its current stage.
 * Called on application creation and stage transitions. Creates Deadline records
 * for the statutory timeframes relevant to the current stage.
 *
 * @param application - The planning application to register deadlines for
 * @param profile - Optional municipality profile with custom timeframes
 * @returns Array of newly created Deadline records
 */
export function registerStatutoryDeadlines(
  application: PlanningApplication,
  profile?: MunicipalityProfile
): Deadline[] {
  const created: Deadline[] = [];
  const stage = application.currentStage;
  const now = todayISO();

  // Resolve timeframes from municipality profile or use SPLUMA defaults
  const objectionDays = resolveTimeframe('objectionPeriodDays', profile);
  const appealDays = resolveTimeframe('appealPeriodDays', profile);
  const decisionDays = resolveTimeframe('decisionPeriodDays', profile);

  if (stage === 'circulation_advertising') {
    const deadline: Deadline = {
      id: generateId(),
      applicationId: application.id,
      type: 'statutory',
      label: 'Objection Period End',
      dueDate: addDays(now, objectionDays),
      status: 'pending',
      linkedStage: 'circulation_advertising',
      statutoryBasis: 'SPLUMA Section 53 — 28 calendar days for objections',
      daysRemaining: objectionDays,
      alertGenerated: false,
    };
    deadlines.push(deadline);
    created.push(deadline);
  }

  if (stage === 'appeal_period') {
    const deadline: Deadline = {
      id: generateId(),
      applicationId: application.id,
      type: 'statutory',
      label: 'Appeal Deadline',
      dueDate: addDays(now, appealDays),
      status: 'pending',
      linkedStage: 'appeal_period',
      statutoryBasis: 'SPLUMA Section 51 — 21 calendar days for appeal',
      daysRemaining: appealDays,
      alertGenerated: false,
    };
    deadlines.push(deadline);
    created.push(deadline);
  }

  if (stage === 'tribunal_decision') {
    const deadline: Deadline = {
      id: generateId(),
      applicationId: application.id,
      type: 'statutory',
      label: 'Decision Period End (Deemed Refusal)',
      dueDate: addDays(now, decisionDays),
      status: 'pending',
      linkedStage: 'tribunal_decision',
      statutoryBasis: 'SPLUMA Section 56 — 60 calendar days for decision',
      daysRemaining: decisionDays,
      alertGenerated: false,
    };
    deadlines.push(deadline);
    created.push(deadline);
  }

  return created;
}

/**
 * Recalculates deadlines when an application enters a new stage.
 * Adds new deadlines relevant to the new stage.
 *
 * @param applicationId - The application ID
 * @param newStage - The stage the application has just entered
 * @param profile - Optional municipality profile with custom timeframes
 * @returns Array of newly created Deadline records
 */
export function recalculateDeadlines(
  applicationId: string,
  newStage: PlanningStage,
  profile?: MunicipalityProfile
): Deadline[] {
  // Build a synthetic application object for registerStatutoryDeadlines
  const syntheticApp = { id: applicationId, currentStage: newStage } as PlanningApplication;
  return registerStatutoryDeadlines(syntheticApp, profile);
}

/**
 * Returns all deadlines for an application, sorted by due date (earliest first).
 * Recalculates daysRemaining dynamically.
 *
 * @param applicationId - The application ID
 * @returns Sorted array of Deadline records
 */
export function getDeadlineRegister(applicationId: string): Deadline[] {
  return deadlines
    .filter((d) => d.applicationId === applicationId)
    .map((d) => ({ ...d, daysRemaining: calculateDaysRemaining(d.dueDate) }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Returns deadlines approaching within the specified number of days for all
 * applications assigned to a planner.
 *
 * @param townPlannerId - Not stored in Deadline — caller provides application IDs externally.
 *   For this in-memory implementation we accept an array of applicationIds.
 * @param withinDays - Number of days threshold
 * @param applicationIds - Application IDs assigned to the planner
 * @returns Array of approaching Deadline records
 */
export function getApproachingDeadlines(
  applicationIds: string[],
  withinDays: number
): Deadline[] {
  return deadlines
    .filter((d) => applicationIds.includes(d.applicationId))
    .map((d) => ({ ...d, daysRemaining: calculateDaysRemaining(d.dueDate) }))
    .filter(
      (d) => d.status !== 'met' && d.status !== 'waived' && d.daysRemaining > 0 && d.daysRemaining <= withinDays
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Returns all overdue deadlines for a planner's applications.
 *
 * @param applicationIds - Application IDs assigned to the planner
 * @returns Array of overdue Deadline records
 */
export function getOverdueDeadlines(applicationIds: string[]): Deadline[] {
  return deadlines
    .filter((d) => applicationIds.includes(d.applicationId))
    .map((d) => ({ ...d, daysRemaining: calculateDaysRemaining(d.dueDate) }))
    .filter((d) => d.status !== 'met' && d.status !== 'waived' && d.daysRemaining < 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ─── Alert Generation ────────────────────────────────────────────────────────

/** Alert object generated by evaluateDeadlineAlerts */
export interface DeadlineAlert {
  deadlineId: string;
  applicationId: string;
  label: string;
  dueDate: string;
  daysRemaining: number;
  priority: Priority;
  status: DeadlineStatus;
}

/**
 * Evaluates all deadlines for an application and generates alert objects.
 * Alert priority levels:
 * - 7 days remaining → approaching (medium priority)
 * - 2 days remaining → urgent (high priority)
 * - Past due → overdue (urgent priority)
 *
 * @param applicationId - The application ID
 * @returns Array of DeadlineAlert objects for deadlines requiring attention
 */
export function evaluateDeadlineAlerts(applicationId: string): DeadlineAlert[] {
  const alerts: DeadlineAlert[] = [];

  const appDeadlines = deadlines.filter(
    (d) => d.applicationId === applicationId && d.status !== 'met' && d.status !== 'waived'
  );

  for (const deadline of appDeadlines) {
    const daysRemaining = calculateDaysRemaining(deadline.dueDate);
    let priority: Priority | null = null;
    let status: DeadlineStatus = deadline.status;

    if (daysRemaining < 0) {
      priority = 'urgent';
      status = 'overdue';
    } else if (daysRemaining <= SPLUMA_DEFAULT_TIMEFRAMES.deadlineUrgentDays) {
      priority = 'high';
      status = 'approaching';
    } else if (daysRemaining <= SPLUMA_DEFAULT_TIMEFRAMES.deadlineApproachingDays) {
      priority = 'medium';
      status = 'approaching';
    }

    if (priority !== null) {
      // Update the stored deadline status
      deadline.status = status;
      deadline.alertGenerated = true;

      alerts.push({
        deadlineId: deadline.id,
        applicationId: deadline.applicationId,
        label: deadline.label,
        dueDate: deadline.dueDate,
        daysRemaining,
        priority,
        status,
      });
    }
  }

  return alerts;
}

/**
 * Marks a deadline as met.
 *
 * @param deadlineId - The deadline ID
 * @param _userId - The user who confirmed fulfilment (reserved for audit)
 */
export function markDeadlineMet(deadlineId: string, _userId: string): void {
  const deadline = deadlines.find((d) => d.id === deadlineId);
  if (!deadline) {
    throw new Error(`Deadline not found: ${deadlineId}`);
  }
  deadline.status = 'met';
  deadline.daysRemaining = calculateDaysRemaining(deadline.dueDate);
}

/**
 * Suspends all condition-type deadlines for an application (used during appeals).
 * Sets status to 'waived' temporarily.
 *
 * @param applicationId - The application ID
 * @param _reason - The reason for suspension (reserved for audit)
 */
export function suspendDeadlines(applicationId: string, _reason: string): void {
  const conditionDeadlines = deadlines.filter(
    (d) => d.applicationId === applicationId && d.type === 'condition' && d.status !== 'met'
  );
  for (const deadline of conditionDeadlines) {
    deadline.status = 'waived';
  }
}

/**
 * Resumes suspended deadlines (used when appeal resolved).
 * Resets 'waived' condition deadlines back to 'pending'.
 *
 * @param applicationId - The application ID
 */
export function resumeDeadlines(applicationId: string): void {
  const waivedDeadlines = deadlines.filter(
    (d) => d.applicationId === applicationId && d.type === 'condition' && d.status === 'waived'
  );
  for (const deadline of waivedDeadlines) {
    deadline.status = 'pending';
  }
}

// ─── Statutory Calculations ──────────────────────────────────────────────────

/**
 * Returns the date 28 days after advertising start (or municipality custom if provided).
 *
 * @param advertisingStartDate - ISO date string of advertising start
 * @param profile - Optional municipality profile for custom timeframes
 * @returns ISO date string (YYYY-MM-DD) of objection period end
 */
export function calculateObjectionPeriodEnd(
  advertisingStartDate: string,
  profile?: MunicipalityProfile
): string {
  const days = resolveTimeframe('objectionPeriodDays', profile);
  return addDays(advertisingStartDate, days);
}

/**
 * Returns the date 21 days after RoD issuance.
 *
 * @param rodIssuedDate - ISO date string of RoD issuance
 * @param profile - Optional municipality profile for custom timeframes
 * @returns ISO date string (YYYY-MM-DD) of appeal deadline
 */
export function calculateAppealDeadline(
  rodIssuedDate: string,
  profile?: MunicipalityProfile
): string {
  const days = resolveTimeframe('appealPeriodDays', profile);
  return addDays(rodIssuedDate, days);
}

/**
 * Returns the date 60 days after close of public comment (or municipality custom if provided).
 *
 * @param commentCloseDate - ISO date string of public comment closure
 * @param profile - Optional municipality profile for custom timeframes
 * @returns ISO date string (YYYY-MM-DD) of decision period end
 */
export function calculateDecisionPeriodEnd(
  commentCloseDate: string,
  profile?: MunicipalityProfile
): string {
  const days = resolveTimeframe('decisionPeriodDays', profile);
  return addDays(commentCloseDate, days);
}

/**
 * Checks if the 60-day decision period has expired without a decision.
 * Looks for a statutory decision deadline that is overdue.
 * Returns true if deemed-refused condition is met.
 *
 * @param applicationId - The application ID
 * @returns true if the decision period has expired (deemed refused)
 */
export function checkDeemedRefused(applicationId: string): boolean {
  const decisionDeadline = deadlines.find(
    (d) =>
      d.applicationId === applicationId &&
      d.linkedStage === 'tribunal_decision' &&
      d.type === 'statutory' &&
      d.status !== 'met' &&
      d.status !== 'waived'
  );

  if (!decisionDeadline) {
    return false;
  }

  const daysRemaining = calculateDaysRemaining(decisionDeadline.dueDate);
  return daysRemaining < 0;
}

// ─── Internal Utilities ──────────────────────────────────────────────────────

/**
 * Resolves a timeframe value from municipality profile custom timeframes,
 * falling back to SPLUMA default values.
 */
function resolveTimeframe(
  deadlineType: keyof typeof SPLUMA_DEFAULT_TIMEFRAMES,
  profile?: MunicipalityProfile
): number {
  if (profile && profile.customTimeframes) {
    const custom = profile.customTimeframes.find((ct) => ct.deadlineType === deadlineType);
    if (custom) {
      return custom.municipalityDays;
    }
  }
  return SPLUMA_DEFAULT_TIMEFRAMES[deadlineType];
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Resets the in-memory deadline store. Only intended for use in tests.
 */
export function _resetStore(): void {
  deadlines.length = 0;
}

/**
 * Returns raw access to the deadline store. Only intended for use in tests.
 */
export function _getStore(): Deadline[] {
  return deadlines;
}
