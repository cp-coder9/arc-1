/**
 * Architex Practice Management Professional Services — Domain Types
 *
 * Professional services management layer for architectural and engineering firms.
 * Tracks what firms earn vs what their staff time costs, providing WIP visibility,
 * profitability tracking, resource capacity planning, and professional services invoicing.
 *
 * @module practiceManagement/types
 */

import type { TimesheetEntry } from '@/types';
import type { PipelineProject } from '@/types';

// ─── SACAP Work Stage Mapping ────────────────────────────────────────────────

export type SacapWorkStage =
  | 'stage_1_inception'
  | 'stage_2_concept'
  | 'stage_3_design_development'
  | 'stage_4_documentation'
  | 'stage_5_construction'
  | 'stage_6_close_out';

export const SACAP_STAGE_LABELS: Record<SacapWorkStage, string> = {
  stage_1_inception: 'Stage 1 – Inception',
  stage_2_concept: 'Stage 2 – Concept & Viability',
  stage_3_design_development: 'Stage 3 – Design Development',
  stage_4_documentation: 'Stage 4 – Documentation & Procurement',
  stage_5_construction: 'Stage 5 – Construction',
  stage_6_close_out: 'Stage 6 – Close Out',
};

export const SACAP_WORK_STAGES: SacapWorkStage[] = [
  'stage_1_inception',
  'stage_2_concept',
  'stage_3_design_development',
  'stage_4_documentation',
  'stage_5_construction',
  'stage_6_close_out',
];

// ─── Timesheet Engine ────────────────────────────────────────────────────────

export type TimesheetSubmissionStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export interface TimesheetSubmission {
  id: string;
  firmId: string;
  userId: string;
  weekStartDate: string; // ISO date (Monday)
  weekEndDate: string;   // ISO date (Sunday)
  entryIds: string[];    // references to TimesheetEntry docs
  status: TimesheetSubmissionStatus;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  totalHours: number;
  totalValueCents: number;
  createdAt: string;
  updatedAt: string;
}

/** Extended TimesheetEntry — adds practice management fields to existing type */
export interface PracticeTimesheetEntry extends TimesheetEntry {
  sacapStage?: SacapWorkStage;
  activity: string;
  submissionId?: string;
  approvalStatus: TimesheetSubmissionStatus;
  billingRateId?: string;
}

// ─── Expense Manager ─────────────────────────────────────────────────────────

export type ExpenseCategory = 'travel' | 'printing' | 'courier' | 'accommodation' | 'meals' | 'other';
export type ExpenseType = 'reimbursable' | 'disbursement';
export type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export interface ExpenseClaim {
  id: string;
  firmId: string;
  userId: string;
  projectId: string;
  description: string;
  amountCents: number;
  date: string;
  category: ExpenseCategory;
  expenseType: ExpenseType;
  receiptUrl?: string;
  status: ExpenseStatus;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  invoiced: boolean;
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSummary {
  projectId: string;
  totalReimbursableCents: number;
  totalDisbursementCents: number;
  pendingCents: number;
  approvedCents: number;
  invoicedCents: number;
  byCategory: Record<ExpenseCategory, number>;
}

// ─── Billing Rate Table ──────────────────────────────────────────────────────

export type BillingRateType = 'hourly' | 'daily' | 'fixed';
export type BillingRateRole = 'architect' | 'technologist' | 'technician' | 'draughtsperson' | 'admin';

export interface BillingRate {
  id: string;
  firmId: string;
  role: BillingRateRole;
  rateType: BillingRateType;
  rateCents: number; // ZAR cents
  effectiveDate: string; // ISO date
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Fee Tracker ─────────────────────────────────────────────────────────────

export type FeeBasis = 'lump_sum' | 'time_based' | 'percentage_of_construction_cost';

export interface ProjectFeeStructure {
  id: string;
  firmId: string;
  projectId: string;
  totalAgreedFeeCents: number;
  feeBasis: FeeBasis;
  constructionCostCents?: number; // for percentage basis
  stageBreakdown: FeeStageAllocation[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeeStageAllocation {
  stage: SacapWorkStage;
  percentage?: number;           // for percentage-based
  fixedAmountCents?: number;     // for lump_sum / time_based
  allocatedFeeCents: number;     // computed: the actual fee for this stage
}

export interface FeeStageBreakdown {
  stage: SacapWorkStage;
  agreedFeeCents: number;
  timeCostsCents: number;
  disbursementsCents: number;
  netPositionCents: number; // fee - costs
  percentUsed: number;
  status: 'healthy' | 'warning' | 'over_run';
}

export interface FeeHealthMetrics {
  projectId: string;
  totalFeeCents: number;
  totalCostsIncurredCents: number;
  netPositionCents: number;
  overRunStages: SacapWorkStage[];
  warningStages: SacapWorkStage[];
}

// ─── WIP Engine ──────────────────────────────────────────────────────────────

export interface WipPosition {
  projectId: string;
  stage?: SacapWorkStage;
  agreedFeeCents: number;
  costsIncurredCents: number;    // time + disbursements
  amountInvoicedCents: number;
  amountCollectedCents: number;
  wipBalanceCents: number;       // fee - costs - invoiced
  isLoss: boolean;               // costs >= fee
}

export interface WipReport {
  firmId: string;
  projects: WipPosition[];
  totalAgreedFeeCents: number;
  totalCostsIncurredCents: number;
  totalInvoicedCents: number;
  totalCollectedCents: number;
  totalWipBalanceCents: number;
  calculatedAt: string;
}

// ─── Profitability Calculator ────────────────────────────────────────────────

export interface ProfitabilityResult {
  projectId: string;
  stage?: SacapWorkStage;
  feeEarnedCents: number;
  timeCostCents: number;
  disbursementsCents: number;
  writeOffsCents: number;
  netProfitCents: number;
  marginPercent: number;         // (fee - costs) / fee * 100
  status: 'profitable' | 'at_risk' | 'loss_making';
}

export interface FirmProfitabilityReport {
  firmId: string;
  projects: ProfitabilityResult[];
  averageMarginPercent: number;
  totalRevenueCents: number;
  totalCostsCents: number;
  totalProfitCents: number;
}

// ─── Practice Invoice Manager ────────────────────────────────────────────────

export type PracticeInvoiceType = 'lump_sum' | 'time_based' | 'disbursement';
export type PracticeInvoiceStatus = 'draft' | 'submitted' | 'sent_to_client' | 'paid' | 'overdue' | 'write_off';

export interface PracticeInvoice {
  id: string;
  firmId: string;
  projectId: string;
  invoiceNumber: string;
  invoiceType: PracticeInvoiceType;
  status: PracticeInvoiceStatus;
  amountCents: number;
  vatCents: number;
  totalCents: number;
  dueDate: string;
  issuedDate?: string;
  paidDate?: string;
  timesheetEntryIds?: string[];  // for time_based invoices
  expenseClaimIds?: string[];    // for disbursement invoices
  sacapStage?: SacapWorkStage;
  description: string;
  clientName?: string;
  clientEmail?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Resource Planner ────────────────────────────────────────────────────────

export interface PersonCapacity {
  userId: string;
  displayName: string;
  role: BillingRateRole;
  weeks: WeekCapacity[];
}

export interface WeekCapacity {
  weekStart: string; // ISO date (Monday)
  totalAvailableHours: number;
  allocatedHours: number;
  leaveHours: number;
  remainingCapacity: number;
  isOverAllocated: boolean;
  pipelineImpactHours: number; // from high-confidence pipeline
}

export interface CapacityView {
  firmId: string;
  people: PersonCapacity[];
  firmTotalAvailable: number;
  firmTotalAllocated: number;
  firmUtilisationPercent: number;
}

export interface OverAllocation {
  userId: string;
  displayName: string;
  weekStart: string;
  allocatedHours: number;
  availableHours: number;
  overBy: number;
}

// ─── Leave Manager ───────────────────────────────────────────────────────────

export type LeaveType = 'annual' | 'sick' | 'family_responsibility' | 'study' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  firmId: string;
  userId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  workingDays: number; // calculated excluding weekends + public holidays
  notes?: string;
  status: LeaveStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalance {
  userId: string;
  firmId: string;
  leaveType: LeaveType;
  annualCycle: string; // e.g. '2025'
  entitlement: number; // total days entitled
  used: number;        // days used
  pending: number;     // days in pending requests
  available: number;   // entitlement - used - pending
}

// ─── Write-Off Tracker ───────────────────────────────────────────────────────

export type WriteOffReason = 'scope_creep' | 'rework' | 'goodwill' | 'fee_negotiation' | 'other';

export interface WriteOffEntry {
  id: string;
  firmId: string;
  projectId: string;
  sacapStage?: SacapWorkStage;
  amountCents: number;
  reason: WriteOffReason;
  description?: string;
  isReversal: boolean;
  reversalOfId?: string; // reference to original write-off if reversal
  authorisedBy: string;
  date: string;
  createdAt: string;
}

export interface WriteOffSummary {
  projectId: string;
  cumulativeWriteOffCents: number;
  agreedFeeCents: number;
  writeOffPercentage: number; // cumulative / fee * 100
  byStage: Partial<Record<SacapWorkStage, number>>;
  entries: WriteOffEntry[];
  warnings: WriteOffWarning[];
}

export interface WriteOffWarning {
  projectId: string;
  message: string;
  writeOffPercentage: number;
  thresholdPercent: number;
}

export interface FirmWriteOffReport {
  firmId: string;
  projects: WriteOffSummary[];
  totalWriteOffCents: number;
  totalAgreedFeeCents: number;
  firmWriteOffPercentage: number;
  calculatedAt: string;
}

// ─── Income Forecaster ───────────────────────────────────────────────────────

export type ForecastConfidence = 'confirmed' | 'probable' | 'pipeline';

export interface MonthlyForecastEntry {
  month: string; // 'YYYY-MM'
  confirmedCents: number;
  probableCents: number;
  pipelineCents: number;
  totalCents: number;
  projects: Array<{
    projectId: string;
    projectName: string;
    amountCents: number;
    confidence: ForecastConfidence;
    stage?: SacapWorkStage;
  }>;
}

export interface IncomeForecast {
  firmId: string;
  generatedAt: string;
  months: MonthlyForecastEntry[];
  totalConfirmedCents: number;
  totalProbableCents: number;
  totalPipelineCents: number;
}

// ─── Firm Dashboard ──────────────────────────────────────────────────────────

export interface FirmSummaryMetrics {
  totalRevenueCents: number;     // invoiced
  totalWipExposureCents: number;
  averageProjectMarginPercent: number;
  firmUtilisationPercent: number;
  pipelineValueCents: number;    // weighted
  writeOffPercentage: number;    // firm-wide
}

export interface ProjectPortfolioEntry {
  projectId: string;
  projectName: string;
  feeCents: number;
  costsCents: number;
  wipCents: number;
  marginPercent: number;
  status: 'healthy' | 'warning' | 'over_run' | 'loss_making';
}

export interface UtilisationMetrics {
  firmAverage: number;           // percentage
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  byPerson: Array<{
    userId: string;
    displayName: string;
    utilisation: number;
    trend: 'up' | 'down' | 'stable';
  }>;
}

export type DateRange = {
  type: 'monthly' | 'quarterly' | 'annually';
  from: string;
  to: string;
};

// ─── CRM Pipeline (extends existing PipelineProject) ─────────────────────────

export interface PipelineOpportunity extends PipelineProject {
  requiredDisciplines: BillingRateRole[];
  requiredHeadcount?: number;
  expectedStartDate?: string;
  isHighConfidence: boolean; // probability > 75%
  includedInCapacity: boolean;
  weightedValueCents: number; // fee * probability
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export type PracticeAuditAction =
  | 'timesheet_submitted'
  | 'timesheet_approved'
  | 'timesheet_rejected'
  | 'expense_submitted'
  | 'expense_approved'
  | 'expense_rejected'
  | 'invoice_created'
  | 'invoice_status_changed'
  | 'leave_requested'
  | 'leave_approved'
  | 'leave_rejected'
  | 'write_off_created'
  | 'write_off_reversed'
  | 'rate_created'
  | 'rate_updated'
  | 'fee_defined'
  | 'fee_updated'
  | 'pipeline_created'
  | 'pipeline_won'
  | 'pipeline_lost'
  | 'access_violation';

export interface PracticeAuditEvent {
  id: string;
  firmId: string;
  projectId?: string;
  userId: string;
  action: PracticeAuditAction;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// ─── Forecast Trigger Events ─────────────────────────────────────────────────

export type ForecastTriggerEvent =
  | { type: 'invoice_raised'; projectId: string; amountCents: number }
  | { type: 'stage_completed'; projectId: string; stage: SacapWorkStage }
  | { type: 'pipeline_won'; opportunityId: string; projectId: string }
  | { type: 'pipeline_lost'; opportunityId: string }
  | { type: 'timeline_changed'; projectId: string };

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface CreateExpenseClaimInput {
  firmId: string;
  userId: string;
  projectId: string;
  description: string;
  amountCents: number;
  date: string;
  category: ExpenseCategory;
  expenseType: ExpenseType;
  receiptUrl?: string;
}

export interface CreateBillingRateInput {
  firmId: string;
  role: BillingRateRole;
  rateType: BillingRateType;
  rateCents: number;
  effectiveDate: string;
}

export interface CreateWriteOffInput {
  firmId: string;
  projectId: string;
  sacapStage?: SacapWorkStage;
  amountCents: number;
  reason: WriteOffReason;
  description?: string;
  authorisedBy: string;
  date: string;
}

export interface LeaveRequestInput {
  firmId: string;
  userId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  notes?: string;
}

export interface CreatePipelineOpportunityInput {
  firmId: string;
  projectId: string;
  title: string;
  estimatedFeeCents: number;
  probability: number;
  expectedStartDate?: string;
  requiredDisciplines: BillingRateRole[];
  requiredHeadcount?: number;
}

export interface CreatePracticeInvoiceInput {
  firmId: string;
  projectId: string;
  invoiceType: PracticeInvoiceType;
  amountCents: number;
  vatCents: number;
  dueDate: string;
  sacapStage?: SacapWorkStage;
  description: string;
  clientName?: string;
  clientEmail?: string;
  timesheetEntryIds?: string[];
  expenseClaimIds?: string[];
  createdBy: string;
}
