/**
 * Contract Administration — Client-Safe Exports
 *
 * This module re-exports ONLY types, pure functions, and constants that
 * are safe to import from client-side React components. It excludes all
 * Firestore-dependent functions that require Firebase Admin SDK.
 *
 * Client components MUST import from this file (or '@/services/contractAdmin/client')
 * instead of the barrel '@/services/contractAdmin' to avoid pulling in
 * server-only Firebase Admin SDK code.
 *
 * Server-side mutations (setupContract, registerNotice, createVariation, etc.)
 * should be accessed via API routes, not directly from client components.
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

// ── Contract Form Configurations (pure data + accessors) ────────────────────
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
  getClauseResponsePeriod,
  getNoticeTypesForForm,
  getPaymentIntervalConfig,
  getEoTNotificationRule,
  getFormConfig,
} from './contractFormConfigs';

// ── Pure Functions: State Machine Validators ────────────────────────────────
export { isValidVariationTransition } from './variationRegisterService';
export { isValidClaimTransition } from './claimsRegisterService';

// ── Pure Functions: Contract Engine Validation ──────────────────────────────
export { validateContractSetup } from './contractEngineService';

// ── Pure Functions: Payment Scheduler (no Firestore) ────────────────────────
export { generateSchedule, calculateRetention } from './paymentSchedulerService';

// ── Pure Functions: Working Day Calculator ──────────────────────────────────
export {
  getSouthAfricanHolidays,
  isWorkingDay,
  addWorkingDays,
  countWorkingDaysBetween,
  getNextWorkingDay,
  getRemainingWorkingDays,
} from './workingDayCalculator';

// ── Pure Functions: Disclaimer Service ──────────────────────────────────────
export {
  getDisclaimerBannerText,
  getDocumentDisclaimerFooter,
  validateDisclaimerPresence,
  isDeemedOutcomeDisclaimer,
} from './disclaimerService';

// ── Pure Functions: RBAC Service ────────────────────────────────────────────
export {
  getPermissions,
  canAccess,
  resolveMultiRolePermissions,
} from './contractRbacService';

// ── Data Sheet Service (pure functions, no direct Firestore) ────────────────
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
