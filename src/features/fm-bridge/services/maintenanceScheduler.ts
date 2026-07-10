/**
 * FM Bridge — Maintenance Scheduler Service
 *
 * Manages Planned Preventive Maintenance (PPM) scheduling, occurrence generation,
 * forward-only state machine transitions, overdue flagging, metrics calculation,
 * and asset/field validation.
 *
 * Pure functions — no direct persistence imports.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import type {
  AssetItem,
  MaintenanceFrequency,
  MaintenanceOccurrence,
  MaintenanceState,
  PPMScheduleEntry,
} from '../types';

// ─── Service Result Type ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Output Types ─────────────────────────────────────────────────────────────

/** Summary metrics for maintenance schedules and occurrences */
export interface MaintenanceMetrics {
  totalScheduled: number;
  completedCount: number;
  overdueCount: number;
  estimatedAnnualCost: number;
  assetsWithoutSchedules: string[];
}

/** Input for creating a PPM schedule entry */
export interface CreatePPMScheduleInput {
  buildingId: string;
  assetId: string;
  taskDescription: string;
  frequency: MaintenanceFrequency;
  customIntervalDays?: number;
  responsibleParty: string;
  estimatedDurationHours: number;
  estimatedCostZAR: number;
  priority: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Forward-only maintenance state machine (Requirement 6.4).
 * scheduled → in_progress → completed → verified (terminal)
 */
const MAINTENANCE_STATE_ORDER: readonly MaintenanceState[] = [
  'scheduled',
  'in_progress',
  'completed',
  'verified',
] as const;

/** Frequency to interval days mapping (Requirements task key rules) */
const FREQUENCY_INTERVAL_DAYS: Record<Exclude<MaintenanceFrequency, 'custom'>, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  semi_annually: 182,
  annually: 365,
};

/** Overdue threshold in days (Requirement 6.5) */
const OVERDUE_THRESHOLD_DAYS = 7;

/** Valid maintenance priorities */
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

/** Valid maintenance frequencies */
const VALID_FREQUENCIES: MaintenanceFrequency[] = [
  'daily', 'weekly', 'monthly', 'quarterly', 'semi_annually', 'annually', 'custom',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculates the interval in days for a given frequency.
 */
function getIntervalDays(frequency: MaintenanceFrequency, customIntervalDays?: number): number {
  if (frequency === 'custom') {
    return customIntervalDays ?? 30; // fallback should not happen with validation
  }
  return FREQUENCY_INTERVAL_DAYS[frequency];
}

/**
 * Adds a number of days to a date, returning a new Date.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculates the number of occurrences per year for a given frequency.
 */
function occurrencesPerYear(frequency: MaintenanceFrequency, customIntervalDays?: number): number {
  const interval = getIntervalDays(frequency, customIntervalDays);
  return 365 / interval;
}

/**
 * Determines whether an occurrence is overdue (Requirement 6.5).
 * Overdue = scheduledDate + 7 days has passed AND state is still 'scheduled'.
 */
function isOccurrenceOverdue(occurrence: MaintenanceOccurrence, now: Date): boolean {
  if (occurrence.state !== 'scheduled') {
    return false;
  }
  const scheduledDate = new Date(occurrence.scheduledDate);
  const overdueDate = addDays(scheduledDate, OVERDUE_THRESHOLD_DAYS);
  return now >= overdueDate;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates scheduled maintenance occurrences for a date range based on frequency.
 *
 * Produces an occurrence at each interval point within the specified range.
 * The first occurrence is at the start of the range (or the first interval date after),
 * and continues at each frequency interval until the end of the range.
 *
 * @param schedule - The PPM schedule entry defining frequency and asset
 * @param range - The date range to generate occurrences for
 * @returns ServiceResult with array of generated occurrences
 */
export function generateScheduledOccurrences(
  schedule: PPMScheduleEntry,
  range: { start: Date; end: Date },
): ServiceResult<MaintenanceOccurrence[]> {
  if (!schedule || !range || !range.start || !range.end) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Schedule entry and date range (start, end) are required',
      },
    };
  }

  if (range.start >= range.end) {
    return {
      success: false,
      error: {
        code: 'INVALID_RANGE',
        message: 'Range start must be before range end',
      },
    };
  }

  // Validate frequency
  if (!VALID_FREQUENCIES.includes(schedule.frequency)) {
    return {
      success: false,
      error: {
        code: 'INVALID_FREQUENCY',
        message: `Invalid frequency: "${schedule.frequency}". Valid: ${VALID_FREQUENCIES.join(', ')}`,
      },
    };
  }

  // Validate custom interval
  if (schedule.frequency === 'custom') {
    if (
      !schedule.customIntervalDays ||
      schedule.customIntervalDays < 1 ||
      schedule.customIntervalDays > 3650
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_CUSTOM_INTERVAL',
          message: 'Custom frequency requires customIntervalDays between 1 and 3650',
        },
      };
    }
  }

  const intervalDays = getIntervalDays(schedule.frequency, schedule.customIntervalDays);
  const occurrences: MaintenanceOccurrence[] = [];
  let currentDate = new Date(range.start.getTime());
  let index = 0;

  while (currentDate < range.end) {
    const occurrence: MaintenanceOccurrence = {
      id: `occ_${schedule.id}_${index}`,
      scheduleId: schedule.id,
      buildingId: schedule.buildingId,
      scheduledDate: currentDate.toISOString(),
      state: 'scheduled',
      isOverdue: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    occurrences.push(occurrence);
    currentDate = addDays(currentDate, intervalDays);
    index++;
  }

  return {
    success: true,
    data: occurrences,
  };
}

/**
 * Transitions a maintenance occurrence to the next state in the forward-only state machine.
 *
 * State machine (Requirement 6.4):
 * scheduled → in_progress → completed → verified
 *
 * Rules:
 * - Only forward transitions permitted (no skipping)
 * - "verified" is the terminal state
 * - Target state must be the immediate next state
 *
 * @param occurrence - The current maintenance occurrence
 * @param targetState - The desired next state
 * @returns ServiceResult with the updated occurrence or validation error
 */
export function transitionMaintenance(
  occurrence: MaintenanceOccurrence,
  targetState: MaintenanceState,
): ServiceResult<{ next: MaintenanceOccurrence; valid: boolean; error?: string }> {
  if (!occurrence || !targetState) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Occurrence and target state are required',
      },
    };
  }

  const currentIndex = MAINTENANCE_STATE_ORDER.indexOf(occurrence.state);
  const targetIndex = MAINTENANCE_STATE_ORDER.indexOf(targetState);

  // Validate target state is a known state
  if (targetIndex === -1) {
    return {
      success: true,
      data: {
        next: occurrence,
        valid: false,
        error: `Invalid target state: "${targetState}". Valid states: ${MAINTENANCE_STATE_ORDER.join(', ')}`,
      },
    };
  }

  // Terminal state — no further transitions allowed
  if (occurrence.state === 'verified') {
    return {
      success: true,
      data: {
        next: occurrence,
        valid: false,
        error: 'Occurrence is already at terminal state "verified". No further transitions permitted.',
      },
    };
  }

  // Must be the immediate next state (forward-only, no skipping)
  if (targetIndex !== currentIndex + 1) {
    const expectedNext = MAINTENANCE_STATE_ORDER[currentIndex + 1];
    return {
      success: true,
      data: {
        next: occurrence,
        valid: false,
        error: `Cannot transition from "${occurrence.state}" to "${targetState}". ` +
          `Only forward transitions are permitted. Next valid state: "${expectedNext}".`,
      },
    };
  }

  // Valid transition — produce updated occurrence
  const updatedOccurrence: MaintenanceOccurrence = {
    ...occurrence,
    state: targetState,
    updatedAt: new Date().toISOString(),
  };

  // Set completion date when transitioning to completed
  if (targetState === 'completed') {
    updatedOccurrence.completionDate = new Date().toISOString();
  }

  return {
    success: true,
    data: {
      next: updatedOccurrence,
      valid: true,
    },
  };
}

/**
 * Calculates maintenance metrics across all schedules and occurrences.
 *
 * Metrics (Requirement 6.7):
 * - totalScheduled: total occurrences in any state
 * - completedCount: occurrences at "completed" or "verified" state
 * - overdueCount: occurrences flagged as overdue
 * - estimatedAnnualCost: sum of (estimatedCostZAR × occurrences per year) across all schedules
 * - assetsWithoutSchedules: asset IDs that have no PPM schedule defined
 *
 * Also evaluates overdue status for each occurrence (Requirement 6.5).
 *
 * @param schedules - All PPM schedule entries for the building
 * @param occurrences - All maintenance occurrences
 * @param assets - All assets for the building (to find unscheduled assets)
 * @param now - Current date (injected for testability)
 * @returns ServiceResult with MaintenanceMetrics
 */
export function calculateMaintenanceMetrics(
  schedules: PPMScheduleEntry[],
  occurrences: MaintenanceOccurrence[],
  assets: AssetItem[],
  now: Date,
): ServiceResult<MaintenanceMetrics> {
  if (!schedules || !occurrences || !assets || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Schedules, occurrences, assets, and current date are required',
      },
    };
  }

  // Evaluate overdue for each occurrence
  let overdueCount = 0;
  let completedCount = 0;

  for (const occ of occurrences) {
    if (occ.state === 'completed' || occ.state === 'verified') {
      completedCount++;
    }
    if (isOccurrenceOverdue(occ, now)) {
      overdueCount++;
    }
  }

  // Calculate estimated annual cost
  let estimatedAnnualCost = 0;
  for (const schedule of schedules) {
    const yearlyOccurrences = occurrencesPerYear(schedule.frequency, schedule.customIntervalDays);
    estimatedAnnualCost += schedule.estimatedCostZAR * yearlyOccurrences;
  }

  // Find assets without schedules
  const scheduledAssetIds = new Set(schedules.map((s) => s.assetId));
  const assetsWithoutSchedules = assets
    .filter((a) => !scheduledAssetIds.has(a.id))
    .map((a) => a.id);

  return {
    success: true,
    data: {
      totalScheduled: occurrences.length,
      completedCount,
      overdueCount,
      estimatedAnnualCost: Math.round(estimatedAnnualCost * 100) / 100, // round to 2dp
      assetsWithoutSchedules,
    },
  };
}

/**
 * Flags overdue occurrences and returns them with updated isOverdue flag.
 *
 * An occurrence is overdue when (Requirement 6.5):
 * - Its state is still "scheduled"
 * - scheduledDate + 7 calendar days has passed
 *
 * @param occurrences - Array of maintenance occurrences to evaluate
 * @param now - Current date
 * @returns ServiceResult with occurrences that have updated isOverdue flags
 */
export function flagOverdueOccurrences(
  occurrences: MaintenanceOccurrence[],
  now: Date,
): ServiceResult<MaintenanceOccurrence[]> {
  if (!occurrences || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Occurrences array and current date are required',
      },
    };
  }

  const updated = occurrences.map((occ) => ({
    ...occ,
    isOverdue: isOccurrenceOverdue(occ, now),
  }));

  return {
    success: true,
    data: updated,
  };
}

/**
 * Validates a PPM schedule creation input against business rules.
 *
 * Validates (Requirements 6.1, 6.8):
 * - Asset reference exists in the provided asset list
 * - taskDescription: required, max 500 characters
 * - frequency: required, from valid list
 * - customIntervalDays: required for 'custom' frequency, range 1–3650
 * - responsibleParty: required, max 200 characters
 * - estimatedDurationHours: required, range 0.25–999
 * - estimatedCostZAR: required, range 0.01–999,999.99
 * - priority: required, from valid list
 *
 * @param input - The schedule creation input
 * @param existingAssets - Array of existing assets in the building (for reference validation)
 * @returns ServiceResult with validation result
 */
export function validatePPMScheduleCreation(
  input: CreatePPMScheduleInput,
  existingAssets: AssetItem[],
): ServiceResult<{ valid: boolean; errors?: string[] }> {
  if (!input) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'PPM schedule input data is required',
      },
    };
  }

  const errors: string[] = [];

  // Requirement 6.8: Validate asset reference exists
  if (!input.assetId || input.assetId.trim().length === 0) {
    errors.push('Asset reference is required.');
  } else if (existingAssets && !existingAssets.some((a) => a.id === input.assetId)) {
    errors.push(
      `Asset "${input.assetId}" does not exist in the building's asset register.`,
    );
  }

  // Task description: required, max 500 chars (Requirement 6.1)
  if (!input.taskDescription || input.taskDescription.trim().length === 0) {
    errors.push('Task description is required.');
  } else if (input.taskDescription.length > 500) {
    errors.push('Task description must not exceed 500 characters.');
  }

  // Frequency: required, from valid list
  if (!input.frequency) {
    errors.push('Frequency is required.');
  } else if (!VALID_FREQUENCIES.includes(input.frequency)) {
    errors.push(
      `Frequency must be one of: ${VALID_FREQUENCIES.join(', ')}. Received: "${input.frequency}".`,
    );
  }

  // Custom interval validation
  if (input.frequency === 'custom') {
    if (
      input.customIntervalDays === undefined ||
      input.customIntervalDays === null
    ) {
      errors.push('Custom interval in days is required when frequency is "custom".');
    } else if (input.customIntervalDays < 1 || input.customIntervalDays > 3650) {
      errors.push('Custom interval must be between 1 and 3650 days.');
    }
  }

  // Responsible party: required, max 200 chars
  if (!input.responsibleParty || input.responsibleParty.trim().length === 0) {
    errors.push('Responsible party is required.');
  } else if (input.responsibleParty.length > 200) {
    errors.push('Responsible party must not exceed 200 characters.');
  }

  // Estimated duration: required, range 0.25–999
  if (
    input.estimatedDurationHours === undefined ||
    input.estimatedDurationHours === null
  ) {
    errors.push('Estimated duration in hours is required.');
  } else if (input.estimatedDurationHours < 0.25 || input.estimatedDurationHours > 999) {
    errors.push('Estimated duration must be between 0.25 and 999 hours.');
  }

  // Estimated cost: required, range 0.01–999,999.99
  if (
    input.estimatedCostZAR === undefined ||
    input.estimatedCostZAR === null
  ) {
    errors.push('Estimated cost in ZAR is required.');
  } else if (input.estimatedCostZAR < 0.01 || input.estimatedCostZAR > 999999.99) {
    errors.push('Estimated cost must be between R0.01 and R999,999.99.');
  }

  // Priority: required, from valid list
  if (!input.priority) {
    errors.push('Priority is required.');
  } else if (!VALID_PRIORITIES.includes(input.priority as (typeof VALID_PRIORITIES)[number])) {
    errors.push(
      `Priority must be one of: ${VALID_PRIORITIES.join(', ')}. Received: "${input.priority}".`,
    );
  }

  return {
    success: true,
    data: {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}
