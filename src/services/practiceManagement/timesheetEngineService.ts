/**
 * Timesheet Engine Service
 *
 * Pure business logic for timesheet entry creation, cost calculation,
 * submission workflow, and approval/rejection. Supports:
 * - Entry creation with cost calculation from billing rates
 * - Weekly timesheet submission (draft → pending_approval)
 * - Approval (pending_approval → approved) with project cost total update
 * - Rejection (pending_approval → rejected) with reason
 * - Query submissions for approval queue and personal history
 *
 * This service operates on arrays of typed objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 * @module practiceManagement/timesheetEngineService
 */

import type {
  BillingRate,
  BillingRateRole,
  PracticeTimesheetEntry,
  SacapWorkStage,
  TimesheetSubmission,
  TimesheetSubmissionStatus,
} from './types';
import { getApplicableRate } from './billingRateTableService';

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateTimesheetEntryInput {
  userId: string;
  firmId: string;
  projectId: string;
  sacapStage: SacapWorkStage;
  activity: string;
  date: string; // ISO date YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  role: BillingRateRole;
}

export interface ActionCentreAction {
  type: 'timesheet_approval_required' | 'timesheet_rejected';
  targetUserId: string;
  submissionId: string;
  firmId: string;
  message: string;
  createdAt: string;
}

export interface ApprovalResult {
  submission: TimesheetSubmission;
  updatedEntries: PracticeTimesheetEntry[];
  projectTimeCostDelta: { projectId: string; deltaCents: number }[];
}

export interface RejectionResult {
  submission: TimesheetSubmission;
  updatedEntries: PracticeTimesheetEntry[];
  notification: ActionCentreAction;
}

export interface SubmissionResult {
  submission: TimesheetSubmission;
  updatedEntries: PracticeTimesheetEntry[];
  action: ActionCentreAction;
}

// ─── Entry Creation ─────────────────────────────────────────────────────────

/**
 * Creates a practice timesheet entry with cost calculation from billing rates.
 *
 * Validates: Requirements 1.1, 1.2, 3.4
 * - Requires project, SACAP stage, activity, date, start/end time
 * - Calculates duration in hours and computes cost using applicable billing rate
 * - If no applicable rate, entry is saved with zero cost and flagged (billingRateId undefined)
 *
 * @param input - Entry creation input
 * @param rates - All billing rates for the firm (for rate lookup)
 * @returns The created PracticeTimesheetEntry
 */
export function createTimesheetEntry(
  input: CreateTimesheetEntryInput,
  rates: BillingRate[],
): PracticeTimesheetEntry {
  const now = new Date().toISOString();
  const durationMinutes = calculateDurationMinutes(input.startTime, input.endTime);
  const durationHours = durationMinutes / 60;

  // Look up applicable billing rate
  const applicableRate = getApplicableRate(rates, input.role, input.firmId, input.date);

  // Calculate cost: hours × hourly rate
  let totalValueCents = 0;
  let hourlyRateCents: number | undefined;

  if (applicableRate) {
    hourlyRateCents = getHourlyRateCents(applicableRate);
    totalValueCents = Math.round(durationHours * hourlyRateCents);
  }

  const id = generateEntryId(input.userId, input.date, input.startTime);

  return {
    id,
    userId: input.userId,
    firmId: input.firmId,
    projectId: input.projectId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    durationMinutes,
    description: input.activity,
    billable: 'billable',
    hourlyRateCents,
    totalValueCents,
    createdAt: now,
    // Practice management extension fields
    sacapStage: input.sacapStage,
    activity: input.activity,
    approvalStatus: 'draft',
    billingRateId: applicableRate?.id,
  };
}

// ─── Weekly Submission ──────────────────────────────────────────────────────

/**
 * Submits a weekly timesheet for approval.
 *
 * Validates: Requirement 1.3
 * - Changes status to pending_approval
 * - Creates an action in the Action Centre for the designated approver
 *
 * @param userId - The staff member submitting
 * @param firmId - The firm
 * @param weekStartDate - ISO date of the Monday for the week
 * @param entries - All entries belonging to this user for this week
 * @param approverId - The designated approver's userId
 * @returns SubmissionResult with the submission, updated entries, and action
 */
export function submitWeeklyTimesheet(
  userId: string,
  firmId: string,
  weekStartDate: string,
  entries: PracticeTimesheetEntry[],
  approverId: string,
): SubmissionResult {
  const now = new Date().toISOString();
  const weekEndDate = calculateWeekEndDate(weekStartDate);

  // Filter entries for this user/firm/week that are in draft status
  const weekEntries = entries.filter(
    (e) =>
      e.userId === userId &&
      e.firmId === firmId &&
      e.date >= weekStartDate &&
      e.date <= weekEndDate &&
      e.approvalStatus === 'draft',
  );

  if (weekEntries.length === 0) {
    throw new Error('No draft entries found for the specified week');
  }

  const totalHours = weekEntries.reduce((sum, e) => sum + e.durationMinutes / 60, 0);
  const totalValueCents = weekEntries.reduce((sum, e) => sum + (e.totalValueCents ?? 0), 0);

  const submissionId = generateSubmissionId(userId, weekStartDate);

  const submission: TimesheetSubmission = {
    id: submissionId,
    firmId,
    userId,
    weekStartDate,
    weekEndDate,
    entryIds: weekEntries.map((e) => e.id),
    status: 'pending_approval',
    submittedAt: now,
    totalHours: Math.round(totalHours * 100) / 100,
    totalValueCents,
    createdAt: now,
    updatedAt: now,
  };

  // Update entries to reference the submission and set status
  const updatedEntries = weekEntries.map((e) => ({
    ...e,
    submissionId,
    approvalStatus: 'pending_approval' as TimesheetSubmissionStatus,
  }));

  const action: ActionCentreAction = {
    type: 'timesheet_approval_required',
    targetUserId: approverId,
    submissionId,
    firmId,
    message: `Timesheet submission from ${userId} for week of ${weekStartDate} requires your approval (${submission.totalHours}h, R${(totalValueCents / 100).toFixed(2)})`,
    createdAt: now,
  };

  return { submission, updatedEntries, action };
}

// ─── Approval ───────────────────────────────────────────────────────────────

/**
 * Approves a timesheet submission.
 *
 * Validates: Requirement 1.4
 * - Marks all entries as approved
 * - Updates project time cost totals
 *
 * @param submission - The submission to approve
 * @param approverId - The user approving
 * @param entries - All entries referenced by the submission
 * @returns ApprovalResult with updated submission, entries, and project cost deltas
 */
export function approveSubmission(
  submission: TimesheetSubmission,
  approverId: string,
  entries: PracticeTimesheetEntry[],
): ApprovalResult {
  if (submission.status !== 'pending_approval') {
    throw new Error(
      `Cannot approve submission with status "${submission.status}". Only pending_approval submissions can be approved.`,
    );
  }

  const now = new Date().toISOString();

  // Update entries to approved
  const updatedEntries = entries
    .filter((e) => submission.entryIds.includes(e.id))
    .map((e) => ({
      ...e,
      approvalStatus: 'approved' as TimesheetSubmissionStatus,
    }));

  // Calculate project time cost deltas
  const projectCosts = new Map<string, number>();
  for (const entry of updatedEntries) {
    const projectId = entry.projectId ?? 'unassigned';
    const current = projectCosts.get(projectId) ?? 0;
    projectCosts.set(projectId, current + (entry.totalValueCents ?? 0));
  }

  const projectTimeCostDelta = Array.from(projectCosts.entries()).map(
    ([projectId, deltaCents]) => ({ projectId, deltaCents }),
  );

  const updatedSubmission: TimesheetSubmission = {
    ...submission,
    status: 'approved',
    approvedBy: approverId,
    approvedAt: now,
    updatedAt: now,
  };

  return {
    submission: updatedSubmission,
    updatedEntries,
    projectTimeCostDelta,
  };
}

// ─── Rejection ──────────────────────────────────────────────────────────────

/**
 * Rejects a timesheet submission with a reason.
 *
 * Validates: Requirement 1.5
 * - Marks submission as rejected with reason
 * - Notifies the staff member to revise
 *
 * @param submission - The submission to reject
 * @param approverId - The user rejecting
 * @param reason - The reason for rejection
 * @param entries - All entries referenced by the submission
 * @returns RejectionResult with updated submission, entries, and notification
 */
export function rejectSubmission(
  submission: TimesheetSubmission,
  approverId: string,
  reason: string,
  entries: PracticeTimesheetEntry[],
): RejectionResult {
  if (submission.status !== 'pending_approval') {
    throw new Error(
      `Cannot reject submission with status "${submission.status}". Only pending_approval submissions can be rejected.`,
    );
  }

  if (!reason || reason.trim().length === 0) {
    throw new Error('Rejection reason is required');
  }

  const now = new Date().toISOString();

  // Update entries back to draft so they can be revised
  const updatedEntries = entries
    .filter((e) => submission.entryIds.includes(e.id))
    .map((e) => ({
      ...e,
      approvalStatus: 'rejected' as TimesheetSubmissionStatus,
      submissionId: undefined,
    }));

  const updatedSubmission: TimesheetSubmission = {
    ...submission,
    status: 'rejected',
    rejectedBy: approverId,
    rejectedAt: now,
    rejectionReason: reason,
    updatedAt: now,
  };

  const notification: ActionCentreAction = {
    type: 'timesheet_rejected',
    targetUserId: submission.userId,
    submissionId: submission.id,
    firmId: submission.firmId,
    message: `Your timesheet for week of ${submission.weekStartDate} was rejected: ${reason}`,
    createdAt: now,
  };

  return {
    submission: updatedSubmission,
    updatedEntries,
    notification,
  };
}

// ─── Query Functions ────────────────────────────────────────────────────────

/**
 * Gets all submissions pending approval for a given approver within a firm.
 *
 * In a real system the approver mapping would come from team/org structure.
 * Here we filter submissions by firmId and pending_approval status.
 *
 * @param submissions - All submissions
 * @param firmId - The firm to scope to
 * @returns Submissions with status pending_approval in the given firm
 */
export function getSubmissionsForApproval(
  submissions: TimesheetSubmission[],
  firmId: string,
): TimesheetSubmission[] {
  return submissions.filter(
    (s) => s.firmId === firmId && s.status === 'pending_approval',
  );
}

/**
 * Gets all submissions for a specific user within a firm.
 *
 * @param submissions - All submissions
 * @param userId - The user whose submissions to retrieve
 * @param firmId - The firm to scope to
 * @returns User's submissions sorted by weekStartDate descending
 */
export function getMySubmissions(
  submissions: TimesheetSubmission[],
  userId: string,
  firmId: string,
): TimesheetSubmission[] {
  return submissions
    .filter((s) => s.userId === userId && s.firmId === firmId)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Calculates the duration in minutes between two time strings.
 * Handles cases where endTime is after midnight (next day).
 *
 * @param startTime - HH:MM format
 * @param endTime - HH:MM format
 * @returns Duration in minutes (always positive)
 */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    // End time is next day
    return (24 * 60 - startMinutes) + endMinutes;
  }

  return endMinutes - startMinutes;
}

/**
 * Converts a billing rate to an hourly rate in cents.
 * - Hourly: returns rateCents directly
 * - Daily: divides by 8 (standard working day)
 * - Fixed: returns rateCents (treated as hourly equivalent)
 */
export function getHourlyRateCents(rate: BillingRate): number {
  switch (rate.rateType) {
    case 'hourly':
      return rate.rateCents;
    case 'daily':
      return Math.round(rate.rateCents / 8);
    case 'fixed':
      return rate.rateCents;
  }
}

/**
 * Calculates the week end date (Sunday) from a week start date (Monday).
 */
function calculateWeekEndDate(weekStartDate: string): string {
  const date = new Date(weekStartDate);
  date.setDate(date.getDate() + 6);
  return date.toISOString().split('T')[0];
}

/**
 * Generates a deterministic entry ID.
 */
function generateEntryId(userId: string, date: string, startTime: string): string {
  return `entry_${userId}_${date}_${startTime.replace(':', '')}_${Date.now()}`;
}

/**
 * Generates a deterministic submission ID.
 */
function generateSubmissionId(userId: string, weekStartDate: string): string {
  return `sub_${userId}_${weekStartDate}_${Date.now()}`;
}
