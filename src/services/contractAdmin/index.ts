/**
 * Contract Administration & Legal Layer — Barrel Export
 *
 * Re-exports all public functions, types, and constants from each
 * service module in the contractAdmin bounded domain.
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  ContractForm,
  ContractParty,
  ClauseElection,
  JbccParams,
  NecParams,
  GccParams,
  FidicParams,
  FormSpecificParams,
  ContractConfig,
  NoticeRecord,
  NoticeStatus,
  VariationRecord,
  VariationStatus,
  VariationCumulativeSummary,
  EoTClaimRecord,
  EoTStatus,
  DelayCause,
  EvidenceAttachment,
  ClaimRecord,
  ClaimStatus,
  ClaimType,
  ClaimsCumulativeSummary,
  PaymentScheduleEntry,
  PaymentCycleStatus,
  ContractAuditRecord,
  PublicHoliday,
  HolidayCalendar,
  ContractErrorCode,
  ContractError,
  ContractFeature,
  ContractPermission,
  ContractProjectAssignment,
  IntegrationWriteResult,
  PassportContractUpdate,
  ContractWorkflowEvent,
  SpecForgeChangeRecord,
  ContractDocumentMeta,
  ContractRiskEvent,
  ContractSetupInput,
  ContractSetupResult,
  ValidationResult,
  ValidationFieldError,
  NoticeRegistrationInput,
  NoticeResponse,
  DeadlineCheckResult,
  VariationInput,
  EoTClaimInput,
  ClaimInput,
  PaymentOverdueResult,
  RetentionResult,
} from './contractTypes';

export { VARIATION_TRANSITIONS, CLAIM_TRANSITIONS } from './contractTypes';

// ── Contract Form Configurations ────────────────────────────────────────────
export type {
  ContractFormConfig,
  ClauseResponsePeriod,
  ContractNoticeType,
  EoTNotificationRule,
  PaymentIntervalConfig,
  DayType,
  DeemedOutcome,
} from './contractFormConfigs';

export {
  CONTRACT_FORM_CONFIGS,
  JBCC_PBA_CONFIG,
  NEC_ECC_CONFIG,
  GCC_2025_CONFIG,
  FIDIC_CONFIG,
  getClauseResponsePeriod,
  getNoticeTypesForForm,
  getPaymentIntervalConfig,
  getEoTNotificationRule,
  getFormConfig,
} from './contractFormConfigs';

// ── Working Day Calculator ──────────────────────────────────────────────────
export {
  getSouthAfricanHolidays,
  isWorkingDay,
  addWorkingDays,
  countWorkingDaysBetween,
  getNextWorkingDay,
  getRemainingWorkingDays,
} from './workingDayCalculator';

// ── Disclaimer Service ──────────────────────────────────────────────────────
export {
  getDisclaimerBannerText,
  getDocumentDisclaimerFooter,
  validateDisclaimerPresence,
  isDeemedOutcomeDisclaimer,
} from './disclaimerService';

// ── RBAC Service ────────────────────────────────────────────────────────────
export {
  getPermissions,
  canAccess,
  resolveMultiRolePermissions,
  assertAccess,
  DEFAULT_APPROVAL_THRESHOLD,
} from './contractRbacService';

// ── Contract Data Sheet Service ─────────────────────────────────────────────
export type {
  DataSheetField,
  KeyDatesSheet,
  NamedPersonEntry,
  NamedPersonsSheet,
  CommercialRatesSheet,
  ContractDataSheet,
} from './contractDataSheetService';

export {
  getDataSheet,
  getKeyDates,
  getNamedPersons,
  getCommercialRates,
  canViewDataSheet,
  canEditDataSheet,
} from './contractDataSheetService';

// ── Contract Engine Service ─────────────────────────────────────────────────
export {
  validateContractSetup,
  setupContract,
  getContractConfig,
  updateContractParameter,
} from './contractEngineService';

// ── Notice Engine Service ───────────────────────────────────────────────────
export {
  registerNotice,
  calculateDeadline,
  acknowledgeNotice,
  respondToNotice,
  withdrawNotice,
  getActiveNotices,
  runDeadlineCheck,
} from './noticeEngineService';

// ── Variation Register Service ──────────────────────────────────────────────
export {
  createVariation,
  isValidVariationTransition,
  transitionVariation,
  valueVariation,
  getCumulativeSummary,
  linkToSpecForge,
} from './variationRegisterService';

// ── EoT Engine Service ──────────────────────────────────────────────────────
export {
  createEoTClaim,
  submitEoTClaim,
  reviewEoTClaim,
  calculateNotificationDeadline,
} from './eotEngineService';

// ── Payment Scheduler Service ───────────────────────────────────────────────
export {
  generateSchedule,
  calculateRetention,
  regenerateRemainingSchedule,
  linkCertificate,
  runPaymentDeadlineCheck,
  generateCertificateReminders,
  handlePaymentCertificateEvent,
} from './paymentSchedulerService';

export type {
  PaymentCertificateEvent,
  PaymentCertificateEventResult,
} from './paymentSchedulerService';

// ── Claims Register Service ─────────────────────────────────────────────────
export {
  registerClaim,
  isValidClaimTransition,
  transitionClaim,
  registerDissatisfaction,
  getCumulativeSummary as getClaimsCumulativeSummary,
  checkSubmissionDeadlines,
  linkEvidence,
} from './claimsRegisterService';

// ── Contract Integration Service ────────────────────────────────────────────
export {
  writeToProjectPassport,
  writeToAuditTrail,
  surfaceToActionCentre,
  writeToSpecForge,
  registerDocument,
  createRiskEvent,
  retryWithBackoff,
} from './contractIntegrationService';
