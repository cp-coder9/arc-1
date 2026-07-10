/**
 * EMPr (Environmental Management Programme) Service
 *
 * Pure function service for managing EMPr commitments, audits, and compliance tracking.
 * Handles monitoring reminders, compliance calculations, and non-compliant item flagging.
 *
 * Requirements: 8.1–8.7
 */

import type {
  EMPrCommitment,
  EMPrAudit,
  EMPrComplianceResult,
  MonitoringFrequency,
  EMPrComplianceStatus,
  EMPrPhase,
} from './eiaTypes';

// ─── ID Generation ───────────────────────────────────────────────────────────

let commitmentCounter = 0;
let auditCounter = 0;

function generateCommitmentId(): string {
  commitmentCounter += 1;
  return `empr-commit-${Date.now()}-${commitmentCounter}`;
}

function generateAuditId(): string {
  auditCounter += 1;
  return `empr-audit-${Date.now()}-${auditCounter}`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Milliseconds in one hour */
const MS_PER_HOUR = 60 * 60 * 1000;

/** Reminder threshold: 24 hours before due */
const REMINDER_THRESHOLD_MS = 24 * MS_PER_HOUR;

/** Event-triggered reminder window: 48 hours from trigger */
const EVENT_TRIGGERED_WINDOW_MS = 48 * MS_PER_HOUR;

// ─── Commitment CRUD ─────────────────────────────────────────────────────────

/**
 * Creates a new EMPr commitment with a generated ID and calculated next due date.
 * Requirement 8.1
 */
export function createCommitment(data: Omit<EMPrCommitment, 'id'>): EMPrCommitment {
  const id = generateCommitmentId();
  const commitment: EMPrCommitment = { id, ...data };

  // Calculate nextDueDate if the commitment has a time-based frequency and a last monitored date
  if (
    commitment.monitoringFrequency !== 'event-triggered' &&
    commitment.lastMonitoredDate
  ) {
    commitment.nextDueDate = calculateNextDueDate(
      commitment.lastMonitoredDate,
      commitment.monitoringFrequency
    );
  }

  return commitment;
}

/**
 * Updates the compliance status of an existing commitment.
 * Returns a new commitment object (pure function, no mutation).
 * Requirement 8.1
 */
export function updateCommitmentStatus(
  commitment: EMPrCommitment,
  status: EMPrComplianceStatus
): EMPrCommitment {
  return { ...commitment, complianceStatus: status };
}

// ─── Compliance Percentage Calculation ───────────────────────────────────────

/**
 * Calculates EMPr compliance percentage.
 *
 * Formula: compliant / (total - not_yet_applicable) * 100
 * Returns 0% when no items are applicable (denominator is 0).
 *
 * Requirement 8.4
 */
export function calculateCompliancePercentage(
  commitments: EMPrCommitment[]
): EMPrComplianceResult {
  const notYetApplicableCount = commitments.filter(
    (c) => c.complianceStatus === 'not_yet_applicable'
  ).length;

  const totalApplicable = commitments.length - notYetApplicableCount;

  if (totalApplicable === 0) {
    return {
      compliancePercentage: 0,
      totalApplicable: 0,
      compliantCount: 0,
      nonCompliantCount: 0,
    };
  }

  const compliantCount = commitments.filter(
    (c) => c.complianceStatus === 'compliant'
  ).length;

  const nonCompliantCount = commitments.filter(
    (c) => c.complianceStatus === 'non_compliant'
  ).length;

  const compliancePercentage = Math.round(
    (compliantCount / totalApplicable) * 100
  );

  return {
    compliancePercentage,
    totalApplicable,
    compliantCount,
    nonCompliantCount,
  };
}

// ─── Monitoring Due Date Calculation ─────────────────────────────────────────

/**
 * Calculates the next monitoring due date based on the last monitored date
 * and the monitoring frequency.
 *
 * Returns an ISO 8601 date string.
 *
 * Requirement 8.2
 */
export function calculateNextDueDate(
  lastMonitored: string,
  frequency: MonitoringFrequency
): string {
  const lastDate = new Date(lastMonitored);

  switch (frequency) {
    case 'daily':
      lastDate.setDate(lastDate.getDate() + 1);
      break;
    case 'weekly':
      lastDate.setDate(lastDate.getDate() + 7);
      break;
    case 'monthly':
      lastDate.setMonth(lastDate.getMonth() + 1);
      break;
    case 'event-triggered':
      // Event-triggered has no scheduled next due date
      return lastMonitored;
  }

  return lastDate.toISOString();
}

// ─── Reminder Logic ──────────────────────────────────────────────────────────

/**
 * Determines if a monitoring reminder is due for a commitment.
 * Returns true if the current time is within 24 hours before the next due date.
 *
 * For commitments without a nextDueDate or with event-triggered frequency,
 * returns false (event-triggered reminders use isEventTriggeredReminderDue instead).
 *
 * Requirement 8.2
 */
export function isReminderDue(commitment: EMPrCommitment, now?: Date): boolean {
  if (!commitment.nextDueDate) {
    return false;
  }

  if (commitment.monitoringFrequency === 'event-triggered') {
    return false;
  }

  const currentTime = (now ?? new Date()).getTime();
  const dueTime = new Date(commitment.nextDueDate).getTime();

  // Reminder is due if we're within 24h before the due date (but not past it by more than 24h)
  const timeToDue = dueTime - currentTime;
  return timeToDue <= REMINDER_THRESHOLD_MS && timeToDue >= -REMINDER_THRESHOLD_MS;
}

/**
 * Determines if an event-triggered monitoring reminder is due.
 * Returns true if the current time is within 48 hours of the triggering event.
 *
 * Requirement 8.7
 */
export function isEventTriggeredReminderDue(
  triggerDate: string,
  now?: Date
): boolean {
  const currentTime = (now ?? new Date()).getTime();
  const triggerTime = new Date(triggerDate).getTime();

  const elapsed = currentTime - triggerTime;

  // Within the 48-hour window: from the trigger event up to 48h after
  return elapsed >= 0 && elapsed <= EVENT_TRIGGERED_WINDOW_MS;
}

// ─── Non-Compliant Item Detection ────────────────────────────────────────────

/**
 * Finds all non-compliant commitments that should be flagged as high-priority
 * action items in the Action Centre.
 *
 * Requirement 8.5
 */
export function findNonCompliantItems(
  commitments: EMPrCommitment[]
): EMPrCommitment[] {
  return commitments.filter((c) => c.complianceStatus === 'non_compliant');
}

// ─── Audit CRUD ──────────────────────────────────────────────────────────────

/**
 * Creates a new EMPr audit record with a generated ID.
 * Requirement 8.3
 */
export function createAudit(data: Omit<EMPrAudit, 'id'>): EMPrAudit {
  const id = generateAuditId();
  return { id, ...data };
}
