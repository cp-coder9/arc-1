export type ProposalPartyRole =
  | 'client'
  | 'architect'
  | 'engineer'
  | 'quantity_surveyor'
  | 'town_planner'
  | 'land_surveyor'
  | 'construction_project_manager'
  | 'landscape_architect'
  | 'interior_designer'
  | 'contractor'
  | 'subcontractor'
  | 'supplier';

export type ProposalStatus =
  | 'draft'
  | 'calculator_completed'
  | 'terms_attached'
  | 'professional_approved'
  | 'issued'
  | 'revision_requested'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'converted_to_appointment';

export type CashflowStatus =
  | 'draft'
  | 'funding_requested'
  | 'escrow_funding_pending'
  | 'escrow_funded'
  | 'milestone_active'
  | 'release_requested'
  | 'release_approved'
  | 'release_disputed'
  | 'released'
  | 'refunded'
  | 'reconciled';

export interface MoneyBreakdown {
  currency: 'ZAR';
  amountExVat: number;
  vatAmount: number;
  amountIncVat: number;
}

export interface PlatformTransactionFeeConfig {
  version: string;
  totalPlatformFeePercent: number;
  payerSharePercent: number;
  payeeSharePercent: number;
  discountAppliesBeforePlatformFee: boolean;
  includeVatInChargeableBase: boolean;
  includeDisbursementsInChargeableBase: boolean;
  includeStatutoryFeesInChargeableBase: boolean;
}

export interface PlatformTransactionFeeBreakdown {
  configVersion: string;
  chargeableBase: number;
  payerSharePercent: number;
  payeeSharePercent: number;
  payerPlatformFee: number;
  payeePlatformFee: number;
  totalPlatformFee: number;
  payerTotalIntoEscrow: number;
  payeeGrossRelease: number;
  payeeNetRelease: number;
  disclosure: string;
}

export interface ProposalDiscount {
  percentage: number;
  amount: number;
  reason: string;
  appliedBy: string;
  approvedBy?: string;
  appliedAt: string;
}

export interface ProposalTermsSnapshot {
  termsTemplateId?: string;
  termsTemplateVersion?: string;
  standardTermsText?: string;
  customTermsText?: string;
  specialConditions?: string;
  paymentTerms?: string;
  validityPeriodDays?: number;
  clientResponsibilities?: string[];
  exclusions?: string[];
  acceptanceMethod?: 'digital_acceptance' | 'signature_upload' | 'manual_admin_capture';
}

export interface ProposalLineItem {
  id: string;
  description: string;
  category: 'professional_fee' | 'construction_bill' | 'supplier_bill' | 'additional_service' | 'disbursement' | 'statutory_fee' | 'platform_fee' | 'discount';
  quantity: number;
  unitPrice: number;
  total: number;
  chargeableForPlatformFee: boolean;
}

export interface ProposalBuilderInput {
  projectId?: string;
  jobId?: string;
  calculatorId: string;
  calculatorVersion: string;
  issuingUserId: string;
  payerUserId: string;
  payeeUserId: string;
  payeeRole: ProposalPartyRole;
  title: string;
  scopeSummary: string;
  lineItems: ProposalLineItem[];
  discount?: ProposalDiscount;
  terms?: ProposalTermsSnapshot;
  vatRatePercent: number;
  platformFeeConfig?: Partial<PlatformTransactionFeeConfig>;
}

export interface ProposalBuilderResult {
  idSeed: string;
  status: ProposalStatus;
  title: string;
  feeBeforeDiscountExVat: number;
  discountAmount: number;
  feeAfterDiscountExVat: number;
  vatAmount: number;
  feeAfterDiscountIncVat: number;
  platformFee: PlatformTransactionFeeBreakdown;
  clientAmountPayableIntoEscrow: number;
  payeeNetReleaseAmount: number;
  architexPlatformRevenue: number;
  visibleLineItems: ProposalLineItem[];
  terms?: ProposalTermsSnapshot;
  auditSnapshot: Record<string, unknown>;
}

export interface EscrowMilestonePlan {
  id: string;
  name: string;
  percentage: number;
  grossChargeableBase: number;
  payerPlatformFee: number;
  payerFundingAmount: number;
  payeePlatformFee: number;
  payeeNetRelease: number;
  releaseConditions: string[];
  status: CashflowStatus;
}

export interface CashflowAgentEvent {
  type:
    | 'proposal_generated'
    | 'proposal_issued'
    | 'proposal_accepted'
    | 'escrow_schedule_generated'
    | 'invoice_generated'
    | 'payment_confirmed'
    | 'release_requested'
    | 'release_approved'
    | 'release_disputed'
    | 'release_completed'
    | 'ledger_reconciled';
  actor: 'user' | 'proposal_agent' | 'terms_agent' | 'escrow_agent' | 'invoice_agent' | 'payment_agent' | 'reconciliation_agent' | 'dispute_agent' | 'acceptance_agent';
  projectId?: string;
  proposalId?: string;
  milestoneId?: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
