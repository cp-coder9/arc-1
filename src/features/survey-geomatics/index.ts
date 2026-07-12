/**
 * Survey & Geomatics Module — Public Exports
 *
 * Survey instruction management, SG diagram tracking,
 * beacon register, boundary lines, and as-built comparison.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  SurveyType,
  SurveyInstructionStage,
  SGDiagramType,
  SGDiagramStage,
  SGOffice,
  BeaconType,
  BeaconCondition,
  CoordinateSystem,
  SurveyInstruction,
  SGDiagram,
  Beacon,
  BeaconReplacement,
  BoundaryLine,
  AsBuiltComparison,
  MeasurementPair,
} from './types';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export {
  surveyInstructionSchema,
  sgDiagramSchema,
  beaconSchema,
  measurementPairSchema,
  boundaryLineSchema,
} from './schemas';

export type {
  SurveyInstructionInput,
  SGDiagramInput,
  BeaconInput,
  MeasurementPairInput,
  BoundaryLineInput,
} from './schemas';

// ─── Service Factories ────────────────────────────────────────────────────────

export { createSurveyEngineService } from './services/surveyEngineService';
export type {
  SurveyEngineService,
  SurveyEngineServiceOptions,
} from './services/surveyEngineService';

export { createSGTrackerService } from './services/sgTrackerService';
export type {
  SGTrackerService,
  SGTrackerServiceOptions,
  CreateSGDiagramInput,
  SGTransitionData,
} from './services/sgTrackerService';

export { createBeaconRegisterService } from './services/beaconRegisterService';
export type {
  BeaconRegisterService,
  BeaconRegisterServiceOptions,
  BeaconConditionNotification,
  ConditionNotificationCallback,
  BeaconReplacementInput,
} from './services/beaconRegisterService';

export { createAsBuiltComparatorService } from './services/asBuiltComparatorService';
export type {
  AsBuiltComparatorService,
  AsBuiltComparatorServiceOptions,
  CreateComparisonInput,
  CreateMeasurementInput,
} from './services/asBuiltComparatorService';

// ─── Adapters ─────────────────────────────────────────────────────────────────

export { createSurveyPassportAdapter } from './adapters/passportAdapter';
export type { SurveyPassportAdapter, SurveyPassportPayload } from './adapters/passportAdapter';

export { createSurveyActionCentreAdapter } from './adapters/actionCentreAdapter';
export type {
  SurveyActionCentreAdapter,
  CompletionReminderPayload,
  OverdueSGProcessingPayload,
  BeaconWarningPayload,
  SurveyActionCentrePayload,
} from './adapters/actionCentreAdapter';

export { createSurveyTownPlanningAdapter } from './adapters/townPlanningAdapter';
export type {
  SurveyTownPlanningAdapter,
  ConditionFulfilmentPayload,
  DecisionBlockPayload,
  DecisionBlockResult,
  IncompletePropertyDataPayload,
} from './adapters/townPlanningAdapter';

export { createSurveyDocumentsAdapter } from './adapters/documentsAdapter';
export type {
  SurveyDocumentsAdapter,
  SurveyDocumentPayload,
  SurveyDocumentType,
} from './adapters/documentsAdapter';

// ─── Access Control ───────────────────────────────────────────────────────────

export {
  checkSurveyAccess,
  getSurveyPermittedActions,
  canCreateInstruction,
  canManageSurvey,
  canViewSurvey,
} from './services/accessControl';

// ─── Components ───────────────────────────────────────────────────────────────

export {
  SurveyGeomaticsView,
  SurveyInstructionForm,
  SGDiagramTracker,
  BeaconRegisterPanel,
  AsBuiltComparisonView,
  ComparisonSummaryPanel,
} from './components';

export type { ComparisonSummaryPanelProps } from './components';
