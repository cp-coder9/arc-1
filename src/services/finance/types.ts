/**
 * Architex Finance / Payment / Escrow + Commercial Control — Types
 *
 * All money movement, trust/escrow wallets, card/EFT collections, payouts and
 * compliance-sensitive financial services must be executed by third-party trusted
 * and registered financial service providers through approved connectors.
 * Architex stores project/commercial records, approvals, provider references,
 * webhooks and audit trails.
 *
 * @module finance/types
 * @see ARCHITEX_FINANCE_PAYMENT_ESCROW_COMMERCIAL_CONTROL_BRIEF.md
 */

/** Participant roles in the commercial control workflow */
export type FinancePartyRole =
  | 'client'
  | 'lead_professional'
  | 'quantity_surveyor'
  | 'contractor'
  | 'subcontractor'
  | 'supplier'
  | 'specialist_consultant'
  | 'financial_provider'
  | 'platform_finance_admin';

/** Types of registered third-party financial providers */
export type ProviderType =
  | 'payment_gateway'
  | 'escrow_provider'
  | 'trust_account_provider'
  | 'bank_eft_orchestrator';

/**
 * Money status lifecycle:
 *   draft → approval_required → approved_for_provider_request →
 *   submitted_to_provider → provider_confirmed_paid
 *
 * Blocking states:
 *   provider_configuration_required — no live provider configured
 *   disputed_locked — claim is disputed, release blocked
 */
export type MoneyStatus =
  | 'draft'
  | 'approval_required'
  | 'approved_for_provider_request'
  | 'provider_configuration_required'
  | 'submitted_to_provider'
  | 'provider_confirmed_paid'
  | 'disputed_locked';

/** South African Rand amount */
export interface MoneyAmount {
  currency: 'ZAR';
  amount: number;
}

/** Snapshot of the accepted award / appointment that forms the commercial baseline */
export interface AwardSnapshot {
  awardId: string;
  projectId: string;
  appointedPartyId: string;
  appointedPartyName: string;
  contractSum: MoneyAmount;
  vatIncluded: boolean;
  exclusions: string[];
  qualifications: string[];
  approvedAtIso: string;
}

/** The commercial baseline against which all financial activity is measured */
export interface CommercialBaseline {
  baselineId: string;
  award: AwardSnapshot;
  approvedVariationsTotal: MoneyAmount;
  currentContractSum: MoneyAmount;
  retentionPercent: number;
  status: 'active';
}

/** A single milestone in the payment schedule */
export interface PaymentMilestone {
  milestoneId: string;
  label: string;
  percent: number;
  amount: MoneyAmount;
  dueTrigger: string;
  status: MoneyStatus;
}

/**
 * Variation request state machine:
 *   draft → submitted → under_review → approved → incorporated
 *   (or) draft → submitted → under_review → rejected
 */
export type VariationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'incorporated'
  | 'rejected';

export interface VariationRequest {
  variationId: string;
  description: string;
  requestedBy: FinancePartyRole;
  estimatedImpact: MoneyAmount;
  programmeImpactDays: number;
  approved: boolean;
  status: VariationStatus;
  submittedAtIso?: string;
  reviewedBy?: FinancePartyRole[];
  approvedAtIso?: string;
}

/** A payment claim submitted by a party (contractor, supplier, consultant, etc.) */
export interface PaymentClaim {
  claimId: string;
  claimantRole: FinancePartyRole;
  claimedAmount: MoneyAmount;
  linkedMilestoneId: string;
  linkedVariationIds: string[];
  submittedAtIso: string;
  disputed: boolean;
  description?: string;
}

/**
 * Payment certificate — the certified valuation against a claim.
 *
 * Key principle: claimed, certified, approved-release, and provider-paid
 * amounts are always kept separate.
 */
export interface PaymentCertificate {
  certificateId: string;
  claimId: string;
  claimedAmount: MoneyAmount;
  certifiedAmount: MoneyAmount;
  retentionHeld: MoneyAmount;
  disputedAmount: MoneyAmount;
  approvedForRelease: MoneyAmount;
  reviewerRoles: FinancePartyRole[];
  status: MoneyStatus;
  issuedAtIso?: string;
  revisedFromCertificateId?: string;
}

/** A registered third-party financial service provider */
export interface FinancialProvider {
  providerId: string;
  name: string;
  providerType: ProviderType;
  registered: boolean;
  capabilities: Array<'collect' | 'escrow_hold' | 'release' | 'payout' | 'webhook_status'>;
  liveConfigured: boolean;
  configurationNotes?: string[];
}

/**
 * A request to release funds via a third-party provider.
 * Architex does NOT hold funds — it only creates instructions/references.
 */
export interface ReleaseRequest {
  releaseRequestId: string;
  certificateId: string;
  providerId: string;
  amount: MoneyAmount;
  requiredApprovals: FinancePartyRole[];
  approvals: FinancePartyRole[];
  status: MoneyStatus;
  providerReference?: string;
  createdAtIso?: string;
}

/** Webhook / status event received from a third-party provider */
export interface ProviderStatusEvent {
  eventId: string;
  providerId: string;
  providerReference: string;
  status: 'received' | 'processing' | 'paid' | 'failed';
  rawSummary: string;
  receivedAtIso?: string;
}

/** Cashflow forecast for a project */
export interface CashflowForecast {
  forecastId: string;
  projectId: string;
  totalScheduled: MoneyAmount;
  nextRelease: MoneyAmount;
  retentionHeld: MoneyAmount;
  notes: string[];
  generatedAtIso?: string;
}

/** Retention tracking record */
export interface RetentionRecord {
  retentionId: string;
  projectId: string;
  certificateId: string;
  amountHeld: MoneyAmount;
  percent: number;
  scheduledReleaseDate?: string;
  status: 'held' | 'partially_released' | 'fully_released';
  releasedAmount: MoneyAmount;
}

/** ProjectRecord linking financial entities for the Project Passport */
export interface FinanceProjectRecord {
  recordId: string;
  projectId: string;
  moduleKey: 'finance_commercial_control' | 'finance_payment_escrow_commercial_control';
  recordType:
    | 'commercial_baseline'
    | 'payment_schedule'
    | 'variation_order'
    | 'claim_submission'
    | 'payment_certificate'
    | 'escrow_release_request'
    | 'retention_release'
    | 'cashflow_forecast';
  title: string;
  status: string;
  linkedRecordIds: string[];
}

/** Inbox notification event for commercial control */
export interface FinanceInboxEvent {
  eventId: string;
  recipient: FinancePartyRole;
  title: string;
  severity: 'info' | 'action_required' | 'blocked';
  description?: string;
}

/** Audit trail record for financial actions */
export interface FinanceAuditRecord {
  auditId: string;
  action: string;
  notes: string;
  actorRole?: FinancePartyRole;
  timestampIso?: string;
}

/** Agent-generated recommendation for the finance workflow */
export interface FinanceAgentRecommendation {
  id: string;
  title: string;
  rationale: string;
  requiresHumanApproval: boolean;
}
