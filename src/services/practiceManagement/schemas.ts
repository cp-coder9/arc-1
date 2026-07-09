/**
 * Zod validation schemas for Practice Management Professional Services module
 * Used for runtime validation of API inputs and form submissions
 *
 * Requirements: 1.1, 2.1, 3.2, 4.1, 7.1, 9.1, 10.1, 13.1
 */

import { z } from 'zod';

// ── Shared Enums ──────────────────────────────────────────────────────────────

export const SacapWorkStageEnum = z.enum([
  'stage_1_inception',
  'stage_2_concept',
  'stage_3_design_development',
  'stage_4_documentation',
  'stage_5_construction',
  'stage_6_close_out',
]);

export const ExpenseCategoryEnum = z.enum([
  'travel', 'printing', 'courier', 'accommodation', 'meals', 'other',
]);

export const ExpenseTypeEnum = z.enum(['reimbursable', 'disbursement']);

export const BillingRateTypeEnum = z.enum(['hourly', 'daily', 'fixed']);

export const BillingRateRoleEnum = z.enum([
  'architect', 'technologist', 'technician', 'draughtsperson', 'admin',
]);

export const FeeBasisEnum = z.enum([
  'lump_sum', 'time_based', 'percentage_of_construction_cost',
]);

export const PracticeInvoiceTypeEnum = z.enum([
  'lump_sum', 'time_based', 'disbursement',
]);

export const LeaveTypeEnum = z.enum([
  'annual', 'sick', 'family_responsibility', 'study', 'unpaid',
]);

export const WriteOffReasonEnum = z.enum([
  'scope_creep', 'rework', 'goodwill', 'fee_negotiation', 'other',
]);

// ── ISO Date Pattern ──────────────────────────────────────────────────────────

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

// ── Timesheet Submission Schema ───────────────────────────────────────────────
// Validates: Requirement 1.1
// WHEN a staff member submits a weekly timesheet for approval, requires
// project, SACAP work stage, activity, date, start time, and end time per entry

export const timesheetSubmissionSchema = z.object({
  firmId: z.string().min(1),
  userId: z.string().min(1),
  weekStartDate: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)'),
  entries: z.array(z.object({
    projectId: z.string().min(1),
    sacapStage: SacapWorkStageEnum,
    activity: z.string().min(1).max(500),
    date: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  })).min(1, 'At least one timesheet entry is required'),
});

// ── Create Expense Claim Schema ───────────────────────────────────────────────
// Validates: Requirement 2.1
// WHEN a staff member creates an expense claim, requires description, amount,
// date, project, expense category, and optional receipt attachment

export const createExpenseClaimSchema = z.object({
  firmId: z.string().min(1),
  userId: z.string().min(1),
  projectId: z.string().min(1),
  description: z.string().min(1).max(500),
  amountCents: z.number().int().positive(),
  date: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)'),
  category: ExpenseCategoryEnum,
  expenseType: ExpenseTypeEnum,
  receiptUrl: z.string().url().optional(),
});

// ── Create Billing Rate Schema ────────────────────────────────────────────────
// Validates: Requirement 3.2
// WHEN a firm_admin creates or updates a billing rate, requires role,
// rate type, rate amount in ZAR cents, and effective date

export const createBillingRateSchema = z.object({
  firmId: z.string().min(1),
  role: BillingRateRoleEnum,
  rateType: BillingRateTypeEnum,
  rateCents: z.number().int().positive(),
  effectiveDate: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)'),
});

// ── Project Fee Structure Schema ──────────────────────────────────────────────
// Validates: Requirement 4.1
// WHEN a project's professional fee structure is defined, requires total agreed
// fee, fee basis, and fee breakdown by SACAP work stage

export const feeStageAllocationSchema = z.object({
  stage: SacapWorkStageEnum,
  percentage: z.number().min(0).max(100).optional(),
  fixedAmountCents: z.number().int().nonnegative().optional(),
});

export const projectFeeStructureSchema = z.object({
  firmId: z.string().min(1),
  projectId: z.string().min(1),
  totalAgreedFeeCents: z.number().int().positive(),
  feeBasis: FeeBasisEnum,
  constructionCostCents: z.number().int().positive().optional(),
  stageBreakdown: z.array(feeStageAllocationSchema).min(1, 'At least one stage allocation is required'),
});

// ── Create Practice Invoice Schema ────────────────────────────────────────────
// Validates: Requirement 7.1
// WHEN a practice invoice is created, supports three invoice types:
// lump sum, time-based, and disbursement claim

export const createPracticeInvoiceSchema = z.object({
  firmId: z.string().min(1),
  projectId: z.string().min(1),
  invoiceType: PracticeInvoiceTypeEnum,
  amountCents: z.number().int().positive(),
  vatCents: z.number().int().nonnegative(),
  dueDate: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)'),
  sacapStage: SacapWorkStageEnum.optional(),
  description: z.string().min(1).max(1000),
  clientName: z.string().min(1).max(200).optional(),
  clientEmail: z.string().email().optional(),
  timesheetEntryIds: z.array(z.string().min(1)).optional(),
  expenseClaimIds: z.array(z.string().min(1)).optional(),
  createdBy: z.string().min(1),
});

// ── Leave Request Schema ──────────────────────────────────────────────────────
// Validates: Requirement 9.1
// WHEN a staff member requests leave, requires leave type, start date,
// end date, and optional notes

export const leaveRequestSchema = z.object({
  firmId: z.string().min(1),
  userId: z.string().min(1),
  leaveType: LeaveTypeEnum,
  startDate: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)'),
  endDate: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)'),
  notes: z.string().max(1000).optional(),
});

// ── Create Write-Off Schema ───────────────────────────────────────────────────
// Validates: Requirement 10.1
// WHEN time is written off for a project, requires write-off amount,
// reason, authorising user, and date

export const createWriteOffSchema = z.object({
  firmId: z.string().min(1),
  projectId: z.string().min(1),
  sacapStage: SacapWorkStageEnum.optional(),
  amountCents: z.number().int().positive(),
  reason: WriteOffReasonEnum,
  description: z.string().max(1000).optional(),
  authorisedBy: z.string().min(1),
  date: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)'),
});

// ── Create Pipeline Opportunity Schema ────────────────────────────────────────
// Validates: Requirement 13.1
// WHEN a pipeline opportunity is created, requires project name, estimated fee,
// probability percentage (0-100), expected start date, and required disciplines/roles

export const createPipelineOpportunitySchema = z.object({
  firmId: z.string().min(1),
  title: z.string().min(1).max(200),
  estimatedFeeCents: z.number().int().positive(),
  probability: z.number().int().min(0).max(100),
  expectedStartDate: z.string().regex(isoDatePattern, 'Must be ISO date (YYYY-MM-DD)').optional(),
  requiredDisciplines: z.array(BillingRateRoleEnum).min(1, 'At least one discipline is required'),
  requiredHeadcount: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
  createdBy: z.string().min(1),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type TimesheetSubmissionInput = z.infer<typeof timesheetSubmissionSchema>;
export type CreateExpenseClaimInput = z.infer<typeof createExpenseClaimSchema>;
export type CreateBillingRateInput = z.infer<typeof createBillingRateSchema>;
export type ProjectFeeStructureInput = z.infer<typeof projectFeeStructureSchema>;
export type CreatePracticeInvoiceInput = z.infer<typeof createPracticeInvoiceSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type CreateWriteOffInput = z.infer<typeof createWriteOffSchema>;
export type CreatePipelineOpportunityInput = z.infer<typeof createPipelineOpportunitySchema>;
