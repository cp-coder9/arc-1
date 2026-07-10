/**
 * Practice Management Module — Type Definitions (P2.9)
 *
 * Domain types for small/medium built environment firm management:
 * enquiry pipeline, WIP tracking, timesheets, billing, profitability,
 * capacity planning, and staff compliance.
 */

// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type PracticeSubscriptionTier = 'essentials' | 'professional';
export type EnquirySource = 'referral' | 'website' | 'repeat_client' | 'tender_notice' | 'other';
export type EnquiryStage = 'lead' | 'quote_sent' | 'quote_accepted' | 'appointed' | 'active' | 'complete' | 'on_hold' | 'lost';
export type LossReason = 'price' | 'scope_mismatch' | 'competitor_won' | 'client_cancelled' | 'timeline' | 'relationship' | 'other';
export type PracticeDiscipline = 'architecture' | 'engineering' | 'quantity_surveying' | 'project_management' | 'town_planning' | 'multi_discipline';
export type ActivityCategory = 'design' | 'documentation' | 'administration' | 'site_visit' | 'meeting' | 'travel' | 'research' | 'other';
export type BillingModel = 'hourly' | 'fixed_fee' | 'percentage_of_construction';
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'invoiced';
export type LeaveType = 'annual' | 'sick' | 'study' | 'other';
export type RegistrationBody = 'SACAP' | 'ECSA' | 'SACQSP' | 'SACPCMP' | 'PLATO' | 'other';

// ─── Domain Entities ──────────────────────────────────────────────────────────

export interface EnquiryRecord {
  id: string;
  firmId: string;
  source: EnquirySource;
  clientName: string; // max 200 chars
  clientEmail: string;
  clientPhone?: string;
  projectDescription: string; // max 2000 chars
  estimatedProjectValueZAR: number;
  estimatedFeeValueZAR: number;
  discipline: PracticeDiscipline;
  expectedStartDate?: string;
  enquiryDate: string;
  currentStage: EnquiryStage;
  lossReason?: LossReason;
  lossNotes?: string; // max 1000 chars
  linkedProjectId?: string;
  stageHistory: { stage: EnquiryStage; date: string; actor: string }[];
  lastActivityDate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeProject {
  id: string;
  firmId: string;
  enquiryId?: string;
  clientName: string;
  projectDescription: string;
  discipline: PracticeDiscipline;
  totalFeeZAR: number;
  billingModel: BillingModel;
  linkedConstructionProjectId?: string;
  status: 'active' | 'complete' | 'on_hold' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface TimesheetEntry {
  id: string;
  firmId: string;
  staffId: string;
  projectId: string;
  date: string;
  activityCategory: ActivityCategory;
  hours: number; // 0.25–24.00 in 0.25 increments
  description: string; // max 500 chars
  billable: boolean;
  status: TimesheetStatus;
  approvedBy?: string;
  approvedAt?: string;
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChargeOutRates {
  staffId: string;
  clientRate: number;
  internalCostRate: number;
}

export interface Disbursement {
  id: string;
  firmId: string;
  projectId: string;
  description: string;
  amountZAR: number;
  date: string;
  invoiced: boolean;
  invoiceId?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  firmId: string;
  projectId: string;
  invoiceNumber: string;
  lineItems: InvoiceLineItem[];
  subtotalZAR: number;
  vatZAR: number; // 15%
  totalZAR: number;
  status: 'draft' | 'approved' | 'sent' | 'paid';
  billingModel: BillingModel;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  description: string;
  hours?: number;
  rate?: number;
  amount: number;
  category: ActivityCategory | 'disbursement' | 'milestone';
}

export interface StaffMember {
  id: string;
  firmId: string;
  userId: string;
  displayName: string;
  discipline: PracticeDiscipline;
  availableHoursPerWeek: number; // default 40, range 8–60
  clientChargeOutRate: number;
  internalCostRate: number;
}

export interface Allocation {
  id: string;
  firmId: string;
  staffId: string;
  projectId: string;
  hoursPerWeek: number; // 1–60
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRecord {
  id: string;
  firmId: string;
  staffId: string;
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  createdAt: string;
}

export interface StaffComplianceRecord {
  id: string;
  firmId: string;
  staffId: string;
  staffDisplayName: string;
  registrationBody: RegistrationBody;
  registrationBodyCustomName?: string;
  registrationNumber: string; // max 50 chars
  registrationCategory: string;
  registrationExpiryDate?: string; // null/undefined = lifetime
  piInsurancePolicyNumber?: string; // max 100 chars
  piInsuranceExpiryDate?: string;
  piInsuranceSumInsuredZAR?: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Calculated Types (returned by services, not persisted) ───────────────────

export interface WIPCalculation {
  projectId: string;
  totalWIPValueZAR: number;
  billableHoursNotInvoiced: number;
  unbilledDisbursementsZAR: number;
  lastInvoiceDate?: string;
  wipAgeDays: number;
  budgetPercentage?: number; // undefined if no budget set
}

export interface PipelineMetrics {
  totalByStage: Record<EnquiryStage, number>;
  feeValueByStage: Record<EnquiryStage, number>;
  conversionRate: number; // percentage
  averageTimePerStage: Record<EnquiryStage, number>; // days
  winLossRatioMonth: number;
  winLossRatio12Month: number;
}

export interface ProfitabilityMetrics {
  totalFee: number;
  revenueRecognised: number;
  totalCost: number;
  grossMargin: number;
  grossMarginPercentage: number;
  effectiveHourlyRate: number;
  budgetBurnRate: number;
}

export interface StaffUtilisation {
  staffId: string;
  availableHours: number;
  allocatedHours: number;
  availableCapacity: number;
  utilisationPercentage: number;
}

export interface CapacityForecast {
  weekStart: string;
  totalCapacity: number;
  totalAllocated: number;
  pipelineWeighted: number;
  totalAvailable: number;
  firmUtilisation: number;
}

// ─── Timesheet Engine Types ───────────────────────────────────────────────────

export interface TimesheetEntryInput {
  date: string;
  projectId: string;
  activityCategory: ActivityCategory;
  hours: number;
  description: string;
  billable: boolean;
}

export interface TimesheetMetrics {
  totalHoursWeek: number;
  totalHoursMonth: number;
  billablePercentage: number;
  utilisationRate: number;
}

export interface TimesheetSubmission {
  entries: TimesheetEntry[];
  weekStart: string;
  submittedAt: string;
  status: 'submitted';
}
