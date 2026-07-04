/**
 * Contract Administration & Legal Layer — Type Definitions
 *
 * All TypeScript types for the contract administration domain.
 * This module is the single source of truth for the bounded domain
 * under src/services/contractAdmin/.
 */

import type { UserRole } from '@/types';

// ══════════════════════════════════════════════════════════════════════════════
// Contract Form & Setup
// ══════════════════════════════════════════════════════════════════════════════

/** Supported South African standard contract forms */
export type ContractForm = 'jbcc_pba' | 'nec_ecc' | 'gcc_2025' | 'fidic';

/** A party to the contract with their contractual role */
export interface ContractParty {
  id: string;
  name: string;
  role:
    | 'employer'
    | 'contractor'
    | 'principal_agent'
    | 'employer_agent'
    | 'quantity_surveyor'
    | 'subcontractor'
    | string;
  userId?: string;
  contactEmail?: string;
}

/** A clause election made during contract setup */
export interface ClauseElection {
  clauseNumber: string;
  clauseTitle: string;
  elected: boolean;
  parameters?: Record<string, unknown>;
}

// ── Form-Specific Parameter Types ───────────────────────────────────────────

/** JBCC PBA specific parameters */
export interface JbccParams {
  /** Interim payment period in calendar days, default 30 */
  interimPaymentPeriodDays: number;
  /** Penalty rate per calendar day in ZAR, min 0.01 */
  penaltyRatePerDay: number;
  /** Retention percentage, 0.00–10.00 */
  retentionPercentage: number;
  /** Defects liability period in calendar months, range 3–24 */
  defectsLiabilityMonths: number;
}

/** NEC ECC specific parameters */
export interface NecParams {
  /** Early warning time period in weeks, range 1–12 */
  earlyWarningWeeks: number;
  /** Compensation event notification period in weeks, range 1–12 */
  compensationEventNotificationWeeks: number;
  /** Programme submission interval in weeks, range 1–8 */
  programmeSubmissionIntervalWeeks: number;
}

/** GCC 2025 specific parameters */
export interface GccParams {
  /** Advance warning period in working days, range 1–60 */
  advanceWarningWorkingDays: number;
  /** Penalty rate per calendar day in ZAR, min 0.01 */
  penaltyRatePerDay: number;
  /** First stage claim period in working days, range 5–60 */
  firstStageClaimWorkingDays: number;
  /** Second stage claim period in working days, range 5–60 */
  secondStageClaimWorkingDays: number;
  /** Deemed rejection timeout in working days, range 5–60 */
  deemedRejectionWorkingDays: number;
}

/** FIDIC specific parameters */
export interface FidicParams {
  /** Time for completion in calendar days, range 1–3650 */
  timeForCompletionDays: number;
  /** Defects notification period in calendar days, range 365–1095 */
  defectsNotificationDays: number;
  /** Dispute adjudication board composition: 1 or 3 members */
  dabComposition: 1 | 3;
}

/** Union of all form-specific parameter types */
export type FormSpecificParams = JbccParams | NecParams | GccParams | FidicParams;

// ══════════════════════════════════════════════════════════════════════════════
// Contract Config (persisted to Firestore)
// ══════════════════════════════════════════════════════════════════════════════

/** The persisted contract configuration document */
export interface ContractConfig {
  id: string;
  projectId: string;
  contractForm: ContractForm;
  parties: ContractParty[];
  commencementDate: string;
  practicalCompletionDate: string;
  revisedCompletionDate?: string;
  contractSum: number;
  clauseElections: ClauseElection[];
  formSpecificParams: FormSpecificParams;
  status: 'active' | 'amended' | 'terminated';
  setupBy: string;
  setupAt: string;
  updatedAt?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Notice Records
// ══════════════════════════════════════════════════════════════════════════════

/** Notice lifecycle statuses */
export type NoticeStatus = 'issued' | 'acknowledged' | 'responded' | 'expired' | 'withdrawn';

/** A contractual notice record */
export interface NoticeRecord {
  id: string;
  projectId: string;
  noticeType: string;
  issuingPartyId: string;
  receivingPartyId: string;
  referenceClause: string;
  dateIssued: string;
  subject: string;
  linkedDocumentIds: string[];
  status: NoticeStatus;
  deadline?: string;
  deadlineDayType?: 'working' | 'calendar';
  responsePeriodDays?: number;
  deemedOutcome?: 'acceptance' | 'rejection' | null;
  respondedAt?: string;
  respondedBy?: string;
  withdrawnAt?: string;
  withdrawnBy?: string;
  registeredBy: string;
  createdAt: string;
  updatedAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Variation Records
// ══════════════════════════════════════════════════════════════════════════════

/** Variation order lifecycle statuses */
export type VariationStatus = 'instructed' | 'valued' | 'approved' | 'rejected' | 'implemented';

/** Permitted state transitions for variation orders */
export const VARIATION_TRANSITIONS: Record<VariationStatus, VariationStatus[]> = {
  instructed: ['valued'],
  valued: ['approved', 'rejected'],
  approved: ['implemented'],
  rejected: [],
  implemented: [],
};

/** A variation order record */
export interface VariationRecord {
  id: string;
  projectId: string;
  variationNumber: string;
  description: string;
  originatingInstruction: string;
  dateInstructed: string;
  linkedSiteInstructionId?: string;
  linkedRfiId?: string;
  linkedSpecForgeItemId?: string;
  status: VariationStatus;
  costImpact?: { type: 'addition' | 'omission'; amount: number };
  timeImpactDays?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Cumulative variation summary for a project */
export interface VariationCumulativeSummary {
  totalVariations: number;
  totalAdditions: number;
  totalOmissions: number;
  netCostDelta: number;
  totalTimeImpactDays: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Extension of Time (EoT) Claims
// ══════════════════════════════════════════════════════════════════════════════

/** EoT claim lifecycle statuses */
export type EoTStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'granted'
  | 'partially_granted'
  | 'rejected'
  | 'withdrawn';

/** Delay cause categories for EoT claims */
export type DelayCause =
  | 'weather'
  | 'materials'
  | 'labour'
  | 'client'
  | 'professional'
  | 'contractor'
  | 'unforeseen_ground_conditions'
  | 'force_majeure';

/** An evidence attachment linked to an EoT claim */
export interface EvidenceAttachment {
  id: string;
  type: 'site_diary' | 'weather_record' | 'site_instruction' | 'delay_early_warning' | 'photo';
  sourceId: string;
  date: string;
  /** Max 200 characters */
  caption: string;
}

/** An Extension of Time claim record */
export interface EoTClaimRecord {
  id: string;
  projectId: string;
  /** Auto-generated, unique per project */
  claimReference: string;
  cause: DelayCause;
  /** Working days, 1–365 */
  periodClaimedDays: number;
  /** Days approved by reviewer (partial grant) */
  approvedDays?: number;
  delayEventDate: string;
  /** Max 2000 characters */
  narrative: string;
  evidenceAttachments: EvidenceAttachment[];
  status: EoTStatus;
  notificationDeadline?: string;
  isLateSubmission: boolean;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Claims & Disputes
// ══════════════════════════════════════════════════════════════════════════════

/** Claim type categories */
export type ClaimType = 'loss_and_expense' | 'disruption' | 'prolongation' | 'varied_work';

/** Claim lifecycle statuses */
export type ClaimStatus =
  | 'notified'
  | 'substantiated'
  | 'assessed'
  | 'accepted'
  | 'partially_accepted'
  | 'rejected'
  | 'disputed';

/** Permitted state transitions for claims */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  notified: ['substantiated'],
  substantiated: ['assessed'],
  assessed: ['accepted', 'partially_accepted', 'rejected'],
  accepted: ['disputed'],
  partially_accepted: ['disputed'],
  rejected: ['disputed'],
  disputed: [],
};

/** A loss/expense/disruption claim record */
export interface ClaimRecord {
  id: string;
  projectId: string;
  claimReference: string;
  claimType: ClaimType;
  dateOfEvent: string;
  notificationDate: string;
  /** Amount claimed in ZAR, 0.01–999,999,999.99 */
  amountClaimed: number;
  /** Time impact in calendar days, 0–9999 */
  timeImpactDays: number;
  status: ClaimStatus;
  submissionDeadline?: string;
  linkedEvidenceIds: string[];
  dissatisfactionDate?: string;
  adjudicationDeadline?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Cumulative claims summary for a project */
export interface ClaimsCumulativeSummary {
  totalByType: Record<ClaimType, number>;
  totalAmountClaimed: number;
  totalAmountAssessed: number;
  totalAmountSettled: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Payment Schedule
// ══════════════════════════════════════════════════════════════════════════════

/** Payment cycle status */
export type PaymentCycleStatus = 'pending' | 'certificate_issued' | 'payment_confirmed' | 'overdue';

/** A single payment schedule entry */
export interface PaymentScheduleEntry {
  id: string;
  cycleNumber: number;
  valuationDate: string;
  certificateDeadline: string;
  paymentDeadline: string;
  status: PaymentCycleStatus;
  certifiedAmount?: number;
  certificateId?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Audit Trail
// ══════════════════════════════════════════════════════════════════════════════

/** An immutable audit record for contract state changes */
export interface ContractAuditRecord {
  id: string;
  projectId: string;
  entityType: 'contract' | 'notice' | 'variation' | 'eot' | 'claim' | 'payment_schedule';
  entityId: string;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
  clauseReference?: string;
  actorId: string;
  timestamp: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Holiday Calendar
// ══════════════════════════════════════════════════════════════════════════════

/** A single public holiday entry */
export interface PublicHoliday {
  /** ISO date YYYY-MM-DD */
  date: string;
  name: string;
  year: number;
}

/** A holiday calendar for a specific year */
export interface HolidayCalendar {
  year: number;
  holidays: PublicHoliday[];
  lastUpdatedBy: string;
  lastUpdatedAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Error Handling
// ══════════════════════════════════════════════════════════════════════════════

/** Error codes for the contract administration domain */
export type ContractErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_TRANSITION'
  | 'UNAUTHORIZED'
  | 'INTEGRATION_FAILURE'
  | 'CALENDAR_MISSING';

/** Structured error response for contract operations */
export interface ContractError {
  code: ContractErrorCode;
  message: string;
  details?: {
    invalidFields?: string[];
    currentStatus?: string;
    attemptedStatus?: string;
    permittedTransitions?: string[];
    targetModule?: string;
    retryCount?: number;
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// RBAC — Role-Based Access Control
// ══════════════════════════════════════════════════════════════════════════════

/** Contract administration features subject to access control */
export type ContractFeature =
  | 'contract_setup'
  | 'notices'
  | 'variations'
  | 'payment_schedule'
  | 'claims'
  | 'eot'
  | 'data_sheet_view'
  | 'data_sheet_edit';

/** Permission levels for contract features */
export type ContractPermission = 'read' | 'write' | 'approve';

/** Project-level assignment for RBAC evaluation */
export interface ContractProjectAssignment {
  projectId: string;
  userId: string;
  roles: UserRole[];
  isAssignedTeamMember: boolean;
  isAssignedContractor: boolean;
  isAssignedSubcontractor: boolean;
  isProjectOwner: boolean;
  isAssignedSiteManager: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// Integration Service
// ══════════════════════════════════════════════════════════════════════════════

/** Result of a write operation to a platform spine module */
export interface IntegrationWriteResult {
  success: boolean;
  targetModule: string;
  retryCount: number;
  failedSyncAlertId?: string;
}

/** Update payload for Project Passport contract section */
export interface PassportContractUpdate {
  contractStatus: 'active' | 'amended' | 'terminated';
  keyDates: {
    commencementDate: string;
    practicalCompletionDate: string;
    revisedCompletionDate?: string;
    defectsLiabilityEndDate?: string;
    retentionReleaseDate?: string;
  };
  outstandingNoticesCount: number;
  nearestDeadlineDays?: number;
}

/** Event payload for Action Centre surfacing */
export interface ContractWorkflowEvent {
  projectId: string;
  targetUserId: string;
  priority: 'high' | 'normal';
  deadlineDate?: string;
  clauseReference?: string;
  requiredResponseType?: string;
  remainingDays?: number;
  subject: string;
  entityType: 'notice' | 'variation' | 'eot' | 'claim' | 'payment' | 'contract';
  entityId: string;
}

/** Change record payload for SpecForge write-back */
export interface SpecForgeChangeRecord {
  variationId: string;
  variationNumber: string;
  specItemId: string;
  approvalDate: string;
  costImpact: number;
}

/** Document metadata for controlled document registration */
export interface ContractDocumentMeta {
  documentType: string;
  clauseReference?: string;
  originatingParty: string;
  dateOfIssue: string;
  linkedNoticeId?: string;
  linkedVariationId?: string;
  responseDeadline?: string;
}

/** Risk event payload for the Risk Engine */
export interface ContractRiskEvent {
  entityType: 'notice' | 'variation' | 'claim' | 'payment';
  entityId: string;
  severity: 'financial_penalty' | 'time_extension_entitlement' | 'termination_right' | 'deemed_acceptance';
  description: string;
  clauseReference?: string;
  deadlineMissedDate?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Input / Output Interfaces
// ══════════════════════════════════════════════════════════════════════════════

// ── Contract Engine ─────────────────────────────────────────────────────────

/** Input for contract setup */
export interface ContractSetupInput {
  projectId: string;
  contractForm: ContractForm;
  /** Minimum 2 parties: employer + contractor */
  parties: ContractParty[];
  /** ISO date */
  commencementDate: string;
  /** ISO date, must be > commencementDate */
  practicalCompletionDate: string;
  /** 1.00–999,999,999,999.99 ZAR */
  contractSum: number;
  clauseElections: ClauseElection[];
  formSpecificParams: FormSpecificParams;
  /** User ID of person performing setup */
  setupBy: string;
}

/** Result of a successful contract setup */
export interface ContractSetupResult {
  contractId: string;
  status: 'active';
  auditRecordId: string;
}

/** Result of input validation */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationFieldError[];
}

/** A single field validation error */
export interface ValidationFieldError {
  field: string;
  message: string;
}

// ── Notice Engine ───────────────────────────────────────────────────────────

/** Input for notice registration */
export interface NoticeRegistrationInput {
  projectId: string;
  /** From contract-form-specific types */
  noticeType: string;
  issuingPartyId: string;
  receivingPartyId: string;
  /** Clause number e.g. "23.1" */
  referenceClause: string;
  /** ISO date */
  dateIssued: string;
  /** Max 500 characters */
  subject: string;
  /** 0–20 document references */
  linkedDocumentIds: string[];
  /** User ID of registrant */
  registeredBy: string;
}

/** Data for a notice response */
export interface NoticeResponse {
  responseType: string;
  responseDate: string;
  responseDetails: string;
  respondedBy: string;
}

/** Result of a deadline check run */
export interface DeadlineCheckResult {
  noticeId: string;
  subject: string;
  deadline: string;
  remainingWorkingDays: number;
  status: NoticeStatus;
  warningLevel?: 'info' | 'urgent' | 'critical';
}

// ── Variation Register ──────────────────────────────────────────────────────

/** Input for creating a variation order */
export interface VariationInput {
  projectId: string;
  /** Unique within the project */
  variationNumber: string;
  /** Max 2000 characters */
  description: string;
  originatingInstruction: string;
  /** ISO date */
  dateInstructed: string;
  linkedSiteInstructionId?: string;
  linkedRfiId?: string;
  createdBy: string;
}

// ── EoT Engine ──────────────────────────────────────────────────────────────

/** Input for creating an Extension of Time claim */
export interface EoTClaimInput {
  projectId: string;
  cause: DelayCause;
  /** 1–365 working days */
  periodClaimedDays: number;
  /** ISO date */
  delayEventDate: string;
  /** Max 2000 characters */
  narrative: string;
  /** Min 1 attachment required for submission */
  evidenceAttachments: EvidenceAttachment[];
  createdBy: string;
}

// ── Claims Register ─────────────────────────────────────────────────────────

/** Input for registering a claim */
export interface ClaimInput {
  projectId: string;
  claimType: ClaimType;
  /** ISO date */
  dateOfEvent: string;
  /** ISO date */
  notificationDate: string;
  /** 0.01–999,999,999.99 ZAR */
  amountClaimed: number;
  /** Calendar days, 0–9999 */
  timeImpactDays: number;
  linkedEvidenceIds: string[];
  createdBy: string;
}

// ── Payment Scheduler ───────────────────────────────────────────────────────

/** Result of a payment overdue check */
export interface PaymentOverdueResult {
  scheduleEntryId: string;
  cycleNumber: number;
  paymentDeadline: string;
  daysOverdue: number;
}

/** Retention calculation result */
export interface RetentionResult {
  retentionHeld: number;
  atLimit: boolean;
}
