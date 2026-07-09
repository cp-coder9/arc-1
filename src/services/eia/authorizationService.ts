// ─── Environmental Authorization Service ────────────────────────────────────
// CRUD operations, status tracking, expiry warnings, condition deadline tracking,
// and summary calculations for Environmental Authorization records.
//
// Requirements: 6.1–6.7

import type {
  AuthorizationRecord,
  AuthorizationCondition,
  AuthorizationConditionSummary,
  AuthorizationStatus,
  ConditionComplianceStatus,
} from './eiaTypes';

// ─── ID Generation ───────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ─── Authorization CRUD ──────────────────────────────────────────────────────

/**
 * Creates a new AuthorizationRecord with a generated ID.
 * All other fields are provided by the caller.
 */
export function createAuthorization(
  data: Omit<AuthorizationRecord, 'id'>
): AuthorizationRecord {
  return {
    ...data,
    id: generateId('auth'),
  };
}

/**
 * Updates the status of an AuthorizationRecord.
 * Returns a new record with the updated status (pure function).
 */
export function updateAuthorizationStatus(
  record: AuthorizationRecord,
  status: AuthorizationStatus
): AuthorizationRecord {
  return {
    ...record,
    status,
  };
}

// ─── Condition Management ────────────────────────────────────────────────────

/**
 * Adds a condition to an AuthorizationRecord.
 * Generates an ID for the new condition.
 * Returns a new record with the condition appended (pure function).
 */
export function addCondition(
  record: AuthorizationRecord,
  condition: Omit<AuthorizationCondition, 'id'>
): AuthorizationRecord {
  const newCondition: AuthorizationCondition = {
    ...condition,
    id: generateId('cond'),
  };
  return {
    ...record,
    conditions: [...record.conditions, newCondition],
  };
}

/**
 * Updates the compliance status of a specific condition within an AuthorizationRecord.
 * Returns a new record with the updated condition (pure function).
 * If conditionId is not found, returns the record unchanged.
 */
export function updateConditionStatus(
  record: AuthorizationRecord,
  conditionId: string,
  status: ConditionComplianceStatus
): AuthorizationRecord {
  const updatedConditions = record.conditions.map((c) =>
    c.id === conditionId ? { ...c, complianceStatus: status } : c
  );
  return {
    ...record,
    conditions: updatedConditions,
  };
}

// ─── Condition Summary ───────────────────────────────────────────────────────

/**
 * Calculates condition summary statistics for an authorization.
 * - total: total number of conditions
 * - complied: conditions with status 'complied'
 * - outstanding: conditions with status 'not_started' or 'in_progress'
 * - overdue: conditions with status 'non_compliant'
 *
 * Requirement 6.7
 */
export function calculateConditionSummary(
  conditions: AuthorizationCondition[]
): AuthorizationConditionSummary {
  const total = conditions.length;
  const complied = conditions.filter(
    (c) => c.complianceStatus === 'complied'
  ).length;
  const outstanding = conditions.filter(
    (c) =>
      c.complianceStatus === 'not_started' ||
      c.complianceStatus === 'in_progress'
  ).length;
  const overdue = conditions.filter(
    (c) => c.complianceStatus === 'non_compliant'
  ).length;

  return { total, complied, outstanding, overdue };
}

// ─── Expiry Warning ──────────────────────────────────────────────────────────

/**
 * Checks whether an authorization is approaching expiry.
 * Returns a warning indicator and the number of days remaining.
 *
 * Default warning threshold is 60 days (Requirement 6.4).
 * If the authorization has already expired, daysRemaining will be negative.
 */
export function checkExpiryWarning(
  record: AuthorizationRecord,
  warningDays: number = 60,
  now?: Date
): { shouldWarn: boolean; daysRemaining: number } {
  const currentDate = now ?? new Date();
  const expiryDate = new Date(record.validityExpiry);

  // Calculate days remaining (can be negative if already expired)
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = expiryDate.getTime() - currentDate.getTime();
  const daysRemaining = Math.ceil(diffMs / msPerDay);

  const shouldWarn = daysRemaining <= warningDays;

  return { shouldWarn, daysRemaining };
}

// ─── Overdue Conditions ──────────────────────────────────────────────────────

/**
 * Finds conditions that are overdue — i.e. have a compliance deadline in the past
 * and a compliance status other than 'complied'.
 *
 * Requirement 6.5: conditions with a compliance deadline that has passed
 * and status other than 'complied' are overdue → high-priority event.
 */
export function findOverdueConditions(
  conditions: AuthorizationCondition[],
  now?: Date
): AuthorizationCondition[] {
  const currentDate = now ?? new Date();

  return conditions.filter((condition) => {
    // Only conditions with a deadline can be overdue
    if (!condition.complianceDeadline) {
      return false;
    }
    // Already complied — not overdue
    if (condition.complianceStatus === 'complied') {
      return false;
    }
    const deadline = new Date(condition.complianceDeadline);
    return deadline.getTime() < currentDate.getTime();
  });
}
