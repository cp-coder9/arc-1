/**
 * Town Planning Feature Module — Public Exports
 *
 * Barrel export for the SPLUMA land use application workflow.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  ApplicationType,
  ApplicationStage,
  DecisionOutcome,
  LandUseApplication,
  StageHistoryEntry,
  ApplicationDeadline,
  PropertyIntelligence,
  ZoningParameters,
  RestrictiveCondition,
  Servitude,
  CommentType,
  CommentStatus,
  CommentRecord,
  ConditionStatus,
  ConditionOfApproval,
  SDPStage,
  SDPChecklistItem,
  SiteDevelopmentPlan,
  SGDiagramStage,
  TitleDeedStage,
  SubdivisionRecord,
  AppealStage,
  AppealOutcome,
  Appeal,
  MunicipalityProfile,
  DocumentChecklistItem,
  TownPlanningAction,
  TownPlanningPermissions,
  ActorContext,
} from './types';
export { ROLE_PERMISSIONS, hasPermission } from './types';

// ─── Schemas ──────────────────────────────────────────────────────────────────
export {
  CreateApplicationParamsSchema,
  ConditionInputSchema,
  CommentInputSchema,
  MunicipalityProfileInputSchema,
  StageTransitionParamsSchema,
  AppealInputSchema,
  ChecklistItemUpdateSchema,
  ApplicationTypeEnum,
  ApplicationStageEnum,
  CommentTypeEnum,
} from './schemas';
export type {
  CreateApplicationParams,
  ConditionInput,
  CommentInput,
  MunicipalityProfileInput,
  StageTransitionParams,
  AppealInput,
  ChecklistItemUpdate,
} from './schemas';

// ─── Services: Date Utils ─────────────────────────────────────────────────────
export {
  calculateEasterSunday,
  getPublicHolidays,
  isWorkingDay,
  addWorkingDays,
  addCalendarDays,
  getRemainingWorkingDays,
} from './services/dateUtils';

// ─── Services: Access Control ─────────────────────────────────────────────────
export {
  PERMISSION_MATRIX,
  checkPermission,
  getEffectivePermissions,
  isAdminRole,
  buildActorContext,
} from './services/accessControl';
export type { FirestoreDB } from './services/accessControl';

// ─── Services: Workflow Tracker ───────────────────────────────────────────────
export {
  PERMITTED_TRANSITIONS,
  transitionStage,
  TransitionError,
  getStageHistory,
  getDeadlines,
  persistTransition,
} from './services/workflowTracker';

// ─── Services: Conditions Register ────────────────────────────────────────────
export {
  CONDITION_STATUS_TRANSITIONS,
  ConditionStatusError,
  createCondition,
  updateConditionStatus,
  isConditionsCompliant,
  getConditionsSummary,
  persistCondition,
  loadConditions,
} from './services/conditionsRegister';

// ─── Services: Application Engine ─────────────────────────────────────────────
export {
  ApplicationValidationError,
  createApplication,
  getApplication,
  listApplicationsByProject,
  generateReferenceNumber,
  persistApplication,
} from './services/applicationEngine';

// ─── Services: Sequential Dependency ──────────────────────────────────────────
export {
  checkReadiness,
  markPlanningNotApplicable,
  getProgressIndicator,
} from './services/sequentialDependency';
export type {
  PlanningPhase,
  PhaseStatus,
  PhaseDependency,
  ProgressIndicator,
} from './services/sequentialDependency';
