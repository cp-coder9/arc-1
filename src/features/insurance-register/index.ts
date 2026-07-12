/**
 * Insurance Register Module — Public Exports
 *
 * Project-level insurance policy tracking, expiry management,
 * compliance checking, and claims notification.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  InsurancePolicyType,
  PolicyStatus,
  ClaimNotificationStatus,
  ClaimCategory,
  ContractForm,
  InsurancePolicy,
  InsuranceComplianceResult,
  InsuranceComplianceSummary,
  ClaimsNotification,
  ClaimsSummary,
  ContractDataSheet,
  InsuranceRegisterService,
  PolicyCheckerService,
  ClaimsNotificationService,
} from './types';

// ─── Schemas ──────────────────────────────────────────────────────────────────
export {
  insurancePolicySchema,
  claimsNotificationSchema,
} from './schemas';

export type {
  InsurancePolicyInput,
  ClaimsNotificationInput,
} from './schemas';

// ─── Service Factories ────────────────────────────────────────────────────────
export { createInsuranceRegisterService } from './services/insuranceRegisterService';
export type {
  ExpiryThreshold,
  ExpiryNotification,
  NotificationCallback,
  AutoExpireCallback,
  InsuranceRegisterServiceOptions,
} from './services/insuranceRegisterService';

export { createPolicyCheckerService } from './services/policyCheckerService';
export type { PolicyCheckerOptions } from './services/policyCheckerService';

export { createClaimsNotificationService } from './services/claimsNotificationService';
export type {
  ClaimsNotificationServiceOptions,
  StateTransitionError,
} from './services/claimsNotificationService';

// ─── Adapters ─────────────────────────────────────────────────────────────────
export { createPassportAdapter as createInsurancePassportAdapter } from './adapters/passportAdapter';
export type { InsurancePassportAdapter, PassportAdapterPayload as InsurancePassportPayload } from './adapters/passportAdapter';

export { createActionCentreAdapter as createInsuranceActionCentreAdapter } from './adapters/actionCentreAdapter';
export type {
  InsuranceActionCentreAdapter,
  RenewalWarningPayload,
  ClaimsNotificationPayload,
  NonComplianceAlertPayload,
  ActionCentreAdapterPayload as InsuranceActionCentrePayload,
  RenewalWarningLevel,
} from './adapters/actionCentreAdapter';

export { createRiskEngineAdapter as createInsuranceRiskEngineAdapter } from './adapters/riskEngineAdapter';
export type { InsuranceRiskEngineAdapter, RiskEngineAdapterPayload as InsuranceRiskPayload } from './adapters/riskEngineAdapter';

export { createDocumentsAdapter as createInsuranceDocumentsAdapter } from './adapters/documentsAdapter';
export type { InsuranceDocumentsAdapter, DocumentsAdapterPayload as InsuranceDocumentsPayload } from './adapters/documentsAdapter';

// ─── Access Control ───────────────────────────────────────────────────────────
export {
  checkInsuranceAccess,
  getInsurancePermittedActions,
  canRegisterPolicy,
  canUpdatePolicy,
  canManagePolicies,
} from './services/accessControl';

// ─── Components ───────────────────────────────────────────────────────────────
export {
  InsuranceRegisterView,
  PolicyForm,
  PolicyCompliancePanel,
  ClaimsNotificationForm,
  ClaimsSummaryPanel,
} from './components';

export type {
  InsuranceRegisterViewProps,
  PolicyFormProps,
  PolicyCompliancePanelProps,
  ClaimsNotificationFormProps,
  ClaimsSummaryPanelProps,
} from './components';
