/**
 * Practice Management Module — Public Exports (P2.9)
 *
 * Subscription product for small/medium built environment firms (2–50 staff).
 * Covers enquiry pipeline, WIP tracking, timesheet-to-billing bridge,
 * project profitability, capacity planning, and PI insurance/registration tracking.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  PracticeSubscriptionTier,
  EnquirySource,
  EnquiryStage,
  LossReason,
  PracticeDiscipline,
  ActivityCategory,
  BillingModel,
  TimesheetStatus,
  LeaveType,
  RegistrationBody,
  EnquiryRecord,
  PracticeProject,
  TimesheetEntry,
  ChargeOutRates,
  Disbursement,
  Invoice,
  InvoiceLineItem,
  StaffMember,
  Allocation,
  LeaveRecord,
  StaffComplianceRecord,
  WIPCalculation,
  PipelineMetrics,
  ProfitabilityMetrics,
  StaffUtilisation,
  CapacityForecast,
} from './types';

// ─── Staff Compliance Service ─────────────────────────────────────────────────
export {
  evaluateComplianceStatus,
  calculateFirmCompliance,
  generateComplianceAlerts,
  getVerificationExposure,
  COMPLIANCE_DISCLAIMER,
} from './services/staffCompliance';

export type {
  ComplianceStatusResult,
  FirmComplianceSummary,
  ComplianceAlert,
  AlertSeverity,
  AlertCategory,
  PIStatus,
  RegistrationStatus,
  VerificationExposure,
} from './services/staffCompliance';

// ─── Schemas ──────────────────────────────────────────────────────────────────
export {
  PracticeSubscriptionTierSchema,
  EnquirySourceSchema,
  EnquiryStageSchema,
  LossReasonSchema,
  PracticeDisciplineSchema,
  ActivityCategorySchema,
  BillingModelSchema,
  TimesheetStatusSchema,
  LeaveTypeSchema,
  RegistrationBodySchema,
  CreateEnquirySchema,
  CreateTimesheetEntrySchema,
  InvoiceConfigSchema,
  CreateAllocationSchema,
  CreateComplianceRecordSchema,
} from './schemas';

// ─── Audit Trail Adapter ──────────────────────────────────────────────────────
export {
  recordEnquiryTransition,
  recordWIPAdjustment,
  recordComplianceChange,
  recordPracticeEvent,
} from './adapters/auditTrailAdapter';

export type {
  AuditEventInput,
  PersistAuditEvent,
} from './adapters/auditTrailAdapter';

// ─── Action Centre Adapter ────────────────────────────────────────────────────
export {
  publishStaleEnquiryAlert,
  publishWIPBudgetWarning,
  publishCapacityAlert,
  publishComplianceAlert,
  publishComplianceAlertsBatch,
} from './adapters/actionCentreAdapter';

export type {
  PersistNotification,
} from './adapters/actionCentreAdapter';

// ─── Project Link Adapter ─────────────────────────────────────────────────────
export {
  getLinkedConstructionProjectStatus,
  linkToConstructionProject,
  unlinkFromConstructionProject,
} from './adapters/projectLinkAdapter';

export type {
  ConstructionProjectStatus,
  ProjectLink,
  ReadConstructionProject,
  PersistProjectLink,
  ReadProjectLink,
} from './adapters/projectLinkAdapter';

// ─── API Router ───────────────────────────────────────────────────────────────
export { createPracticeRouter } from './router';
export type { PracticeRouterDeps } from './router';
