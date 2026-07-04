/**
 * Environmental & Heritage Module — Public Exports
 *
 * Domain types and validation schemas for the Environmental Impact Assessment
 * (EIA) & Heritage Impact workflow module (P2.10). Covers EIA Screening,
 * EA Applications, Heritage Assessments, ROD Conditions, EMPr Records,
 * ECO Audits, Corrective Actions, and Environmental Incidents.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  ListingNotice,
  AssessmentType,
  EAStageBasic,
  EAStageScoping,
  EAStage,
  HeritageStage,
  ConditionComplianceState,
  ConditionCategory,
  VerificationMethod,
  ECOAuditRating,
  CorrectiveActionState,
  ConstructionPhase,
  IncidentType,
  AuditFrequency,
  Section38Trigger,
  SelectedActivity,
  GeographicContext,
  ScreeningReport,
  EAApplication,
  HeritageAssessment,
  RODCondition,
  EMPrRecord,
  ECOAudit,
  CorrectiveAction,
  EnvironmentalIncident,
} from './types';

// ─── Services ─────────────────────────────────────────────────────────────────
export { determineAssessmentType, generateScreeningReport } from './services/eiaChecker';
export type { ServiceResult } from './services/eiaChecker';

export {
  transitionCondition,
  calculateConditionCompliance,
  evaluateConditionAlerts,
  recordEvidence,
  DISCLAIMER_BANNER,
} from './services/rodRegister';
export type {
  ConditionComplianceSummary,
  ConditionAlert,
  EvidenceRecord,
} from './services/rodRegister';

// ─── Router ───────────────────────────────────────────────────────────────────
export { createEnvironmentalRouter } from './router';

// ─── Schemas ──────────────────────────────────────────────────────────────────
export {
  ListingNoticeSchema,
  AssessmentTypeSchema,
  EAStageBasicSchema,
  EAStageScopingSchema,
  HeritageStageSchema,
  ConditionComplianceStateSchema,
  ConditionCategorySchema,
  VerificationMethodSchema,
  ECOAuditRatingSchema,
  CorrectiveActionStateSchema,
  ConstructionPhaseSchema,
  IncidentTypeSchema,
  AuditFrequencySchema,
  Section38TriggerSchema,
  AuthorisationTypeSchema,
  CreateScreeningSchema,
  CreateEAApplicationSchema,
  CreateHeritageAssessmentSchema,
  CreateRODConditionSchema,
  CreateEMPrRecordSchema,
  CreateECOAuditSchema,
  CreateCorrectiveActionSchema,
  LogEnvironmentalIncidentSchema,
} from './schemas';
