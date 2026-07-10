/**
 * NHBRC Enrolment Module
 *
 * Project enrolment readiness, inspection tracking, warranty claims
 * management, and builder verification for NHBRC compliance.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  EnrolmentStatus,
  ChecklistItemStatus,
  InspectionStage,
  InspectionOutcome,
  WarrantyDefectCategory,
  WarrantyClaimStage,
  LiabilityOutcome,
  BuilderVerificationStatus,
  EnrolmentChecklist,
  ChecklistItem,
  FeeBand,
  InspectionRecord,
  UnitInspectionStatus,
  WarrantyClaim,
  BuilderVerification,
  CreateEnrolmentInput,
  RecordInspectionInput,
  UserRole,
  CreateWarrantyClaimInput,
  WarrantyTransitionData,
  WarrantyClaimsSummary,
  VerifyBuilderInput,
  NHBRCEngineService,
  InspectionTrackerService,
  WarrantyManagerService,
  BuilderVerificationService,
} from './types';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export {
  enrolmentInputSchema,
  inspectionRecordSchema,
  warrantyClaimSchema,
  builderVerificationSchema,
} from './schemas';

export type {
  EnrolmentInput,
  InspectionRecordInput,
  WarrantyClaimInput,
  BuilderVerificationInput,
} from './schemas';

// ─── Service Factories ────────────────────────────────────────────────────────

export { createNHBRCEngineService } from './services/nhbrcEngineService';
export type { NHBRCEngineServiceOptions } from './services/nhbrcEngineService';

export { createInspectionTrackerService, STAGE_ORDER } from './services/inspectionTrackerService';
export type { InspectionTrackerServiceOptions } from './services/inspectionTrackerService';

export { createWarrantyManagerService } from './services/warrantyManagerService';
export type { WarrantyManagerServiceOptions } from './services/warrantyManagerService';

export { createBuilderVerificationService } from './services/builderVerificationService';
export type {
  BuilderVerificationServiceOptions,
  ExternalVerificationResult,
  ExternalVerifierFn,
} from './services/builderVerificationService';

// ─── Adapters ─────────────────────────────────────────────────────────────────

export { createNHBRCPassportAdapter } from './adapters/passportAdapter';
export type { NHBRCPassportAdapter, NHBRCPassportPayload } from './adapters/passportAdapter';

export { createNHBRCActionCentreAdapter } from './adapters/actionCentreAdapter';
export type {
  NHBRCActionCentreAdapter,
  InspectionFailurePayload,
  ConditionDeadlinePayload,
  WarrantyInspectionSchedulePayload,
  RectificationOverduePayload,
  EnrolmentMilestonePayload,
} from './adapters/actionCentreAdapter';

export { createNHBRCRiskEngineAdapter } from './adapters/riskEngineAdapter';
export type { NHBRCRiskEngineAdapter, InspectionFailureRiskPayload } from './adapters/riskEngineAdapter';

export { createNHBRCSiteExecutionAdapter } from './adapters/siteExecutionAdapter';
export type {
  NHBRCSiteExecutionAdapter,
  InspectionHoldPointPayload,
  ProgrammeViewEntry,
  InspectionStageStatus,
} from './adapters/siteExecutionAdapter';

// ─── Access Control ───────────────────────────────────────────────────────────

export {
  checkNHBRCAccess,
  getNHBRCPermittedActions,
  canManageEnrolment,
  canRecordInspection,
  canViewNHBRC,
} from './services/accessControl';

// ─── Components ───────────────────────────────────────────────────────────────

export {
  NHBRCEnrolmentView,
  EnrolmentChecklist as EnrolmentChecklistComponent,
  FeeCalculator,
  InspectionTrackerView,
  InspectionOutcomeForm,
  WarrantyClaimForm,
  WarrantyClaimsList,
  BuilderVerificationPanel,
} from './components';

export type {
  NHBRCEnrolmentViewProps,
  EnrolmentChecklistProps,
  FeeCalculatorProps,
  InspectionTrackerViewProps,
  InspectionOutcomeFormProps,
  WarrantyClaimFormProps,
  WarrantyClaimsListProps,
  BuilderVerificationPanelProps,
} from './components';
