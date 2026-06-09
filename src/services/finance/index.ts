/**
 * Architex Finance / Payment / Escrow + Commercial Control — Barrel Exports
 *
 * All money movement, trust/escrow wallets, card/EFT collections, payouts and
 * compliance-sensitive financial services must be executed by third-party trusted
 * and registered financial service providers through approved connectors.
 * Architex stores project/commercial records, approvals, provider references,
 * webhooks and audit trails.
 *
 * @module finance
 * @see ARCHITEX_FINANCE_PAYMENT_ESCROW_COMMERCIAL_CONTROL_BRIEF.md
 */

// Types
export type {
  FinancePartyRole,
  ProviderType,
  MoneyStatus,
  VariationStatus,
  MoneyAmount,
  AwardSnapshot,
  CommercialBaseline,
  PaymentMilestone,
  VariationRequest,
  PaymentClaim,
  PaymentCertificate,
  FinancialProvider,
  ReleaseRequest,
  ProviderStatusEvent,
  CashflowForecast,
  RetentionRecord,
  FinanceProjectRecord,
  FinanceInboxEvent,
  FinanceAuditRecord,
  FinanceAgentRecommendation,
} from './types';

// Sample data
export { sampleAward, sampleProviders } from './sampleData';

// Commercial Baseline
export {
  createCommercialBaseline,
  incorporateVariationIntoBaseline,
  removeVariationFromBaseline,
  calculateContingency,
} from './commercialBaselineService';

// Payment Schedule
export {
  DEFAULT_PAYMENT_MILESTONE_TEMPLATES,
  buildPaymentSchedule,
  buildCustomPaymentSchedule,
  findNextPaymentDue,
  totalScheduledAmount,
  totalReleasedAmount,
} from './paymentScheduleService';

// Variation Control
export {
  createVariationRequest,
  createAndSubmitVariation,
  transitionVariation,
  approveAndIncorporateVariation,
  rejectVariation,
  reverseVariation,
} from './variationControlService';

// Claim Submission
export {
  submitPaymentClaim,
  disputeClaim,
  resolveDispute,
  amendClaim,
  totalClaimedAmount,
} from './claimSubmissionService';

// Payment Certificate
export {
  certifyPaymentClaim,
  reviseCertificate,
  calculateNetPayable,
  approveCertificateForRelease,
  getCertificateChain,
} from './paymentCertificateService';

// Third-Party Financial Provider Registry
export {
  selectProvider,
  assessProviderReadiness,
  isProviderLiveReady,
  registerProvider,
  updateProviderConfiguration,
  findProvidersByType,
} from './thirdPartyFinancialProviderRegistry';

// Escrow Release Request
export {
  createReleaseRequest,
  approveReleaseRequest,
  getReleaseBlockers,
} from './escrowReleaseRequestService';

// Payment Provider Webhook Adapter
export {
  recordProviderStatusEvent,
  parseProviderWebhook,
  confirmPaymentReceived,
  handlePaymentFailure,
} from './paymentProviderWebhookAdapter';

// Retention
export {
  calculateRetention,
  createRetentionRecord,
  releaseRetention,
  scheduleRetentionRelease,
  totalRetentionHeld,
  totalRetentionReleased,
  retentionBalance,
} from './retentionService';

// Cashflow Forecast
export {
  createCashflowForecast,
  calculateCashflowProjections,
  compareActualsVsForecast,
  mergeForecasts,
} from './cashflowForecastService';

// Project Record Adapter
export {
  createProjectRecords,
  createBaselineRecord,
  createVariationRecord,
  createCertificateRecord,
  createReleaseRecord,
  createPaymentScheduleRecord,
  createRetentionRecord as createRetentionProjectRecord,
  createCashflowForecastRecord,
} from './projectRecordAdapter';

// Inbox Event Adapter
export {
  createInboxEvents,
  createTargetedInboxEvent,
  createVariationInboxEvents,
  createRetentionInboxEvents,
} from './inboxEventAdapter';

// Audit Trail
export {
  createAuditTrail,
  createAuditEntry,
  auditProviderWebhook,
  auditDispute,
  auditVariationStateChange,
  auditRetention,
} from './auditTrailService';

// Agent Recommendations
export {
  createAgentRecommendations,
  createRecommendation,
  createScheduleRecommendations,
  createRiskRecommendations,
} from './agentRecommendationService';
