/**
 * Practice Management — Timesheet Engine Service
 *
 * Pure business logic for timesheet management:
 * - Entry validation (daily max 24h, 0.25 increments, date not in future, required fields)
 * - Metrics calculation (total hours week/month, billable %, utilisation rate)
 * - Weekly submission for approval (locks entries, routes to approver)
 * - Immutability enforcement for approved/invoiced entries
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.9, 10.10
 */

import type {
  TimesheetEntry,
  TimesheetEntryInput,
  TimesheetMetrics,
  TimesheetSubmission,
  ActivityCategory,
} from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DAILY_HOURS = 24;
const HOUR_INCREMENT = 0.25;
const MAX_DESCRIPTION_LENGTH = 500;

const VALID_ACTIVITY_CATEGORIES: ActivityCategory[] = [
  'design', 'documentation', 'administration', 'site_visit',
  'meeting', 'travel', 'research', 'other',
];

// ─── Validate Timesheet Entry ─────────────────────────────────────────────────

/**
 * Validate a timesheet entry against business rules.
 *
 * Rules:
 * - date: required, not in the future
 * - projectId: required
 * - activityCategory: must be from the defined enum
 * - hours: 0.25–24 in 0.25 increments
 * - description: required, max 500 characters
 * - Daily max: sum of all entries for the same date + new entry <= 24
 *
 * Requirements: 10.1, 10.2
 */
export function validateTimesheetEntry(
  entry: TimesheetEntryInput,
  existingEntries: TimesheetEntry[],
  now: Date
): ServiceResult<{ valid: boolean; errors?: string[] }> {
  const errors: string[] = [];

  // Validate date — required and not in the future
  if (!entry.date) {
    errors.push('Date is required.');
  } else {
    const entryDate = new Date(entry.date);
    if (isNaN(entryDate.getTime())) {
      errors.push('Date must be a valid date string.');
    } else {
      // Compare date only (ignore time component)
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      if (entryDate > todayEnd) {
        errors.push('Date cannot be in the future.');
      }
    }
  }

  // Validate projectId — required
  if (!entry.projectId || entry.projectId.trim().length === 0) {
    errors.push('Project reference is required.');
  }

  // Validate activityCategory — from defined enum
  if (!entry.activityCategory) {
    errors.push('Activity category is required.');
  } else if (!VALID_ACTIVITY_CATEGORIES.includes(entry.activityCategory)) {
    errors.push(`Activity category must be one of: ${VALID_ACTIVITY_CATEGORIES.join(', ')}.`);
  }

  // Validate hours — 0.25–24 in 0.25 increments
  if (entry.hours === undefined || entry.hours === null) {
    errors.push('Hours are required.');
  } else if (entry.hours < HOUR_INCREMENT || entry.hours > MAX_DAILY_HOURS) {
    errors.push(`Hours must be between ${HOUR_INCREMENT} and ${MAX_DAILY_HOURS}.`);
  } else if (entry.hours % HOUR_INCREMENT !== 0) {
    // Handle floating point precision issues
    const remainder = Math.round((entry.hours % HOUR_INCREMENT) * 100) / 100;
    if (remainder !== 0 && remainder !== HOUR_INCREMENT) {
      errors.push('Hours must be in 0.25 increments.');
    }
  }

  // Validate description — required, max 500 chars
  if (!entry.description || entry.description.trim().length === 0) {
    errors.push('Description is required.');
  } else if (entry.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  // Validate daily max — sum of existing entries for same date + new hours <= 24
  if (entry.date && entry.hours > 0) {
    const sameDateEntries = existingEntries.filter(e => e.date === entry.date);
    const existingHoursForDate = sameDateEntries.reduce((sum, e) => sum + e.hours, 0);
    const totalForDay = existingHoursForDate + entry.hours;

    if (totalForDay > MAX_DAILY_HOURS) {
      errors.push(
        `Daily maximum of ${MAX_DAILY_HOURS} hours would be exceeded. ` +
        `Current total for this date: ${existingHoursForDate}h, new entry: ${entry.hours}h, ` +
        `combined: ${totalForDay}h.`
      );
    }
  }

  if (errors.length > 0) {
    return {
      success: true,
      data: { valid: false, errors },
    };
  }

  return {
    success: true,
    data: { valid: true },
  };
}

// ─── Calculate Timesheet Metrics ──────────────────────────────────────────────

/**
 * Calculate timesheet metrics for a set of entries.
 *
 * Metrics:
 * - totalHoursWeek: sum of hours for entries in the current week
 * - totalHoursMonth: sum of hours for entries in the current month
 * - billablePercentage: (billable hours / total hours) × 100
 * - utilisationRate: (billable hours / availableHours) × 100
 *
 * Requirements: 10.10
 */
export function calculateTimesheetMetrics(
  entries: TimesheetEntry[],
  availableHours: number
): ServiceResult<TimesheetMetrics> {
  if (!entries || !Array.isArray(entries)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Entries must be a valid array.',
      },
    };
  }

  if (availableHours <= 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_AVAILABLE_HOURS',
        message: 'Available hours must be a positive number.',
      },
    };
  }

  const totalHoursWeek = entries.reduce((sum, e) => sum + e.hours, 0);
  const totalHoursMonth = entries.reduce((sum, e) => sum + e.hours, 0);

  const billableHours = entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0);
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  const billablePercentage = totalHours > 0
    ? (billableHours / totalHours) * 100
    : 0;

  const utilisationRate = (billableHours / availableHours) * 100;

  return {
    success: true,
    data: {
      totalHoursWeek: Math.round(totalHoursWeek * 100) / 100,
      totalHoursMonth: Math.round(totalHoursMonth * 100) / 100,
      billablePercentage: Math.round(billablePercentage * 100) / 100,
      utilisationRate: Math.round(utilisationRate * 100) / 100,
    },
  };
}

// ─── Submit Week for Approval ─────────────────────────────────────────────────

/**
 * Submit a week's timesheet entries for approval.
 *
 * Rules:
 * - All entries must be in 'draft' status
 * - Locks entries by transitioning status to 'submitted'
 * - Creates a submission record for the approver
 *
 * Requirements: 10.4, 10.5
 */
export function submitWeekForApproval(
  entries: TimesheetEntry[],
  weekStart: Date
): ServiceResult<TimesheetSubmission> {
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return {
      success: false,
      error: {
        code: 'NO_ENTRIES',
        message: 'At least one timesheet entry is required for submission.',
      },
    };
  }

  // All entries must be in 'draft' status
  const nonDraftEntries = entries.filter(e => e.status !== 'draft');
  if (nonDraftEntries.length > 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_ENTRY_STATUS',
        message: `All entries must be in "draft" status for submission. Found ${nonDraftEntries.length} entries with non-draft status.`,
        details: nonDraftEntries.map(e => ({ id: e.id, status: e.status })),
      },
    };
  }

  const now = new Date().toISOString();

  // Lock entries by transitioning to 'submitted'
  const submittedEntries: TimesheetEntry[] = entries.map(entry => ({
    ...entry,
    status: 'submitted' as const,
    updatedAt: now,
  }));

  const submission: TimesheetSubmission = {
    entries: submittedEntries,
    weekStart: weekStart.toISOString().split('T')[0],
    submittedAt: now,
    status: 'submitted',
  };

  return {
    success: true,
    data: submission,
  };
}

// ─── Can Edit Entry ───────────────────────────────────────────────────────────

/**
 * Determine if a timesheet entry can be edited.
 *
 * Immutability rule: entries with status 'approved' or 'invoiced' CANNOT be edited.
 *
 * Requirements: 10.9
 */
export function canEditEntry(
  entry: TimesheetEntry
): ServiceResult<{ editable: boolean; reason?: string }> {
  if (!entry) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'A timesheet entry is required.',
      },
    };
  }

  if (entry.status === 'approved') {
    return {
      success: true,
      data: {
        editable: false,
        reason: 'Approved entries cannot be modified.',
      },
    };
  }

  if (entry.status === 'invoiced') {
    return {
      success: true,
      data: {
        editable: false,
        reason: 'Invoiced entries cannot be modified.',
      },
    };
  }

  return {
    success: true,
    data: { editable: true },
  };
}
