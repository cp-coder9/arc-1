/**
 * Practice Management — Schema Extensions for Existing Collections
 *
 * Documents the field extensions applied to existing Firestore collections
 * when used within the Practice Management module. The base types
 * (TimesheetEntry, PipelineProject) in `src/types.ts` remain unchanged.
 * The extension fields are optional on the base types but required on the
 * practice management variants (PracticeTimesheetEntry, PipelineOpportunity).
 *
 * Extended collections:
 *  - `timesheets` — adds sacapStage, activity, submissionId, approvalStatus, billingRateId
 *  - `pipeline_projects` — adds requiredDisciplines, expectedStartDate, isHighConfidence, includedInCapacity
 *
 * @module practiceManagement/persistence/schemaExtensions
 * @see Requirements 1.6, 13.3
 */

import type {
  SacapWorkStage,
  TimesheetSubmissionStatus,
  BillingRateRole,
  PracticeTimesheetEntry,
  PipelineOpportunity,
} from '../types';

// ─── Timesheet Collection Extensions ─────────────────────────────────────────

/**
 * Fields added to the existing `timesheets` collection documents
 * when entries are created through the Practice Management module.
 *
 * These are optional on the base TimesheetEntry (src/types.ts) but required
 * on PracticeTimesheetEntry for full practice management functionality.
 */
export interface TimesheetExtensionFields {
  /** SACAP work stage (1–6) the time entry relates to */
  sacapStage?: SacapWorkStage;
  /** Activity description — what was done during this time */
  activity: string;
  /** Reference to the weekly submission this entry belongs to */
  submissionId?: string;
  /** Approval workflow status for this entry */
  approvalStatus: TimesheetSubmissionStatus;
  /** Reference to the billing rate applied at time of entry */
  billingRateId?: string;
}

/**
 * Field names that extend the base timesheets collection.
 * Used for migration validation and query construction.
 */
export const TIMESHEET_EXTENSION_FIELDS = [
  'sacapStage',
  'activity',
  'submissionId',
  'approvalStatus',
  'billingRateId',
] as const;

/**
 * Default values for timesheet extension fields when creating
 * a new practice management timesheet entry.
 */
export const TIMESHEET_EXTENSION_DEFAULTS: Omit<TimesheetExtensionFields, 'activity'> = {
  sacapStage: undefined,
  submissionId: undefined,
  approvalStatus: 'draft',
  billingRateId: undefined,
};

// ─── Pipeline Projects Collection Extensions ─────────────────────────────────

/**
 * Fields added to the existing `pipeline_projects` collection documents
 * when opportunities are created through the Practice Management CRM module.
 *
 * These are optional on the base PipelineProject (src/types.ts) but required
 * on PipelineOpportunity for capacity planning and income forecasting.
 */
export interface PipelineExtensionFields {
  /** Disciplines/roles needed if this opportunity converts to a project */
  requiredDisciplines: BillingRateRole[];
  /** Expected project start date (ISO string) */
  expectedStartDate?: string;
  /** True when probability > 75% — used for capacity planning */
  isHighConfidence: boolean;
  /** Whether this opportunity is included in forward capacity calculations */
  includedInCapacity: boolean;
}

/**
 * Field names that extend the base pipeline_projects collection.
 * Used for migration validation and query construction.
 */
export const PIPELINE_EXTENSION_FIELDS = [
  'requiredDisciplines',
  'expectedStartDate',
  'isHighConfidence',
  'includedInCapacity',
] as const;

/**
 * Default values for pipeline extension fields when creating
 * a new practice management pipeline opportunity.
 */
export const PIPELINE_EXTENSION_DEFAULTS: PipelineExtensionFields = {
  requiredDisciplines: [],
  expectedStartDate: undefined,
  isHighConfidence: false,
  includedInCapacity: false,
};

// ─── Migration Helpers ───────────────────────────────────────────────────────

/**
 * Checks whether a raw timesheet document has been extended with
 * practice management fields. Useful for identifying documents that
 * need migration or that originate from the base timesheet service.
 */
export function isExtendedTimesheetEntry(
  doc: Record<string, unknown>
): doc is Record<string, unknown> & TimesheetExtensionFields {
  return 'approvalStatus' in doc && 'activity' in doc;
}

/**
 * Checks whether a raw pipeline project document has been extended with
 * practice management CRM fields.
 */
export function isExtendedPipelineProject(
  doc: Record<string, unknown>
): doc is Record<string, unknown> & PipelineExtensionFields {
  return 'isHighConfidence' in doc && 'includedInCapacity' in doc;
}

/**
 * Applies default extension fields to a base timesheet document,
 * producing a partial PracticeTimesheetEntry shape. The `activity`
 * field must be provided explicitly as it has no default.
 */
export function applyTimesheetExtensionDefaults(
  activity: string,
  overrides?: Partial<TimesheetExtensionFields>
): TimesheetExtensionFields {
  return {
    ...TIMESHEET_EXTENSION_DEFAULTS,
    activity,
    ...overrides,
  };
}

/**
 * Applies default extension fields to a base pipeline project document,
 * producing a partial PipelineOpportunity shape.
 */
export function applyPipelineExtensionDefaults(
  overrides?: Partial<PipelineExtensionFields>
): PipelineExtensionFields {
  return {
    ...PIPELINE_EXTENSION_DEFAULTS,
    ...overrides,
  };
}

/**
 * Determines whether a pipeline opportunity qualifies as high-confidence
 * based on its probability. Used when setting the isHighConfidence flag
 * during creation or update.
 *
 * @param probability - Probability percentage (0–100)
 * @returns true if probability exceeds 75%
 */
export function isHighConfidenceProbability(probability: number): boolean {
  return probability > 75;
}

/**
 * Strips practice management extension fields from a timesheet document,
 * returning only the base TimesheetEntry fields. Useful for backward
 * compatibility when passing data to the base timesheetService.
 */
export function stripTimesheetExtensions(
  doc: Record<string, unknown>
): Record<string, unknown> {
  const stripped = { ...doc };
  for (const field of TIMESHEET_EXTENSION_FIELDS) {
    delete stripped[field];
  }
  return stripped;
}

/**
 * Strips practice management extension fields from a pipeline document,
 * returning only the base PipelineProject fields.
 */
export function stripPipelineExtensions(
  doc: Record<string, unknown>
): Record<string, unknown> {
  const stripped = { ...doc };
  for (const field of PIPELINE_EXTENSION_FIELDS) {
    delete stripped[field];
  }
  return stripped;
}

// ─── Type Re-exports for Convenience ─────────────────────────────────────────

export type { PracticeTimesheetEntry, PipelineOpportunity };
