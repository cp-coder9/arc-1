/**
 * Environmental & Heritage Module — Zod Validation Schemas
 *
 * Input validation schemas for Environmental & Heritage API boundary operations.
 * These validate user-submitted data (creation/mutation), not full domain models.
 */

import { z } from 'zod';

// ─── Enum Schemas (reusable) ──────────────────────────────────────────────────

export const ListingNoticeSchema = z.enum([
  'listing_notice_1', 'listing_notice_2', 'listing_notice_3',
]);

export const AssessmentTypeSchema = z.enum([
  'none', 'basic_assessment', 'scoping_and_eir',
]);

export const EAStageBasicSchema = z.enum([
  'pre_application', 'application_submitted', 'acknowledgement_received',
  'public_participation', 'comments_period_closed', 'specialist_studies',
  'bar_submitted', 'authority_review', 'decision_issued', 'appeal_period',
  'ea_granted', 'ea_refused', 'appeal_lodged', 'appeal_decision',
]);

export const EAStageScopingSchema = z.enum([
  'pre_application', 'scoping_report_submitted', 'authority_acceptance_scoping',
  'specialist_studies', 'eir_submitted', 'authority_review', 'decision_issued',
  'appeal_period', 'ea_granted', 'ea_refused', 'appeal_lodged', 'appeal_decision',
]);

export const HeritageStageSchema = z.enum([
  'notification_submitted', 'interim_comment_received', 'assessment_required',
  'hia_undertaken', 'hia_report_submitted', 'heritage_authority_review',
  'permit_issued', 'no_further_action_required',
]);

export const ConditionComplianceStateSchema = z.enum([
  'outstanding', 'in_progress', 'evidence_submitted', 'verified_compliant',
]);

export const ConditionCategorySchema = z.enum([
  'pre_construction', 'construction', 'operational', 'ongoing',
]);

export const VerificationMethodSchema = z.enum([
  'inspection', 'report_submission', 'monitoring_data', 'audit', 'self_declaration',
]);

export const ECOAuditRatingSchema = z.enum([
  'compliant', 'minor_non_conformance', 'major_non_conformance', 'critical_non_conformance',
]);

export const CorrectiveActionStateSchema = z.enum([
  'issued', 'in_progress', 'completed', 'verified_closed',
]);

export const ConstructionPhaseSchema = z.enum([
  'bulk_earthworks', 'substructure', 'superstructure', 'services_installation', 'finishes', 'external_works',
]);

export const IncidentTypeSchema = z.enum([
  'spill', 'clearing', 'dust', 'water_pollution', 'noise', 'waste', 'other',
]);

export const AuditFrequencySchema = z.enum([
  'weekly', 'fortnightly', 'monthly', 'quarterly',
]);

export const Section38TriggerSchema = z.enum([
  'road_wall_pipeline_300m', 'development_5000sqm', 'rezoning_10000sqm',
  'character_alteration_5000sqm', 'other',
]);

export const AuthorisationTypeSchema = z.enum([
  'environmental_authorisation', 'heritage_permit',
]);

// ─── Composite Sub-Schemas ────────────────────────────────────────────────────

const SelectedActivitySchema = z.object({
  listingNotice: ListingNoticeSchema,
  activityNumber: z.string().min(1),
  description: z.string().min(1),
});

const GeographicContextSchema = z.object({
  province: z.string().min(1),
  municipality: z.string().optional(),
  isCoastalZone: z.boolean(),
  isUrbanArea: z.boolean(),
  isSensitiveEnvironment: z.boolean(),
});

// ─── Input Validation Schemas ─────────────────────────────────────────────────

/**
 * Schema for creating a screening report (Requirements 15.1).
 * Validates: projectId, projectName, activitiesSelected, geographicContext.
 */
export const CreateScreeningSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  activitiesSelected: z.array(SelectedActivitySchema).min(1),
  geographicContext: GeographicContextSchema,
});

/**
 * Schema for creating an EA application (Requirement 16.1).
 * Validates: reference numbers, practitioner details, assessment type, activities.
 */
export const CreateEAApplicationSchema = z.object({
  applicationReferenceNumber: z.string().min(1).max(100),
  applicantName: z.string().min(1).max(200),
  eapName: z.string().min(1).max(200),
  eapRegistrationNumber: z.string().min(1).max(200),
  assessmentType: AssessmentTypeSchema,
  competentAuthority: z.string().min(1),
  listedActivities: z.array(SelectedActivitySchema).min(1),
  screeningId: z.string().optional(),
  applicationSubmissionDate: z.string().min(1),
});

/**
 * Schema for creating a heritage assessment (Requirement 17.1).
 * Validates: site description, trigger, authority, notification date.
 */
export const CreateHeritageAssessmentSchema = z.object({
  siteDescription: z.string().min(1).max(2000),
  section38Trigger: Section38TriggerSchema,
  heritageAuthority: z.string().min(1).max(200),
  notificationDate: z.string().min(1),
  siteCoordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
});

/**
 * Schema for creating a ROD condition (Requirement 18.1).
 * Validates: authorisation reference, condition details, compliance category.
 */
export const CreateRODConditionSchema = z.object({
  authorisationId: z.string().min(1),
  authorisationType: AuthorisationTypeSchema,
  conditionNumber: z.number().int().min(1),
  conditionText: z.string().min(1).max(2000),
  complianceCategory: ConditionCategorySchema,
  responsibleParty: z.string().min(1).max(200),
  complianceDeadline: z.string().optional(),
  verificationMethod: VerificationMethodSchema,
});

/**
 * Schema for creating an EMPr record (Requirement 19.1).
 * Validates: document reference, approval date, ECO details, frequency, phase.
 */
export const CreateEMPrRecordSchema = z.object({
  emprDocumentRef: z.string().min(1),
  approvalDate: z.string().min(1),
  ecoName: z.string().min(1).max(200),
  ecoContactEmail: z.string().email(),
  auditFrequency: AuditFrequencySchema,
  constructionPhase: ConstructionPhaseSchema,
});

/**
 * Schema for creating an ECO audit record (Requirement 19.3).
 * Validates: audit date, auditor, rating, findings count.
 */
export const CreateECOAuditSchema = z.object({
  auditDate: z.string().min(1),
  auditorName: z.string().min(1),
  overallRating: ECOAuditRatingSchema,
  findingsCount: z.number().int().min(0),
  auditReportRef: z.string().optional(),
});

/**
 * Schema for creating a corrective action from an audit finding (Requirement 19.3).
 * Validates: finding description, severity, responsible party, deadline.
 */
export const CreateCorrectiveActionSchema = z.object({
  findingDescription: z.string().min(1).max(500),
  severity: ECOAuditRatingSchema,
  responsibleParty: z.string().min(1),
  deadline: z.string().min(1),
});

/**
 * Schema for logging an environmental incident (Requirement 19.3).
 * Validates: incident type, description, location, evidence, remedial action.
 */
export const LogEnvironmentalIncidentSchema = z.object({
  incidentType: IncidentTypeSchema,
  description: z.string().min(1).max(1000),
  locationOnSite: z.string().min(1).max(200),
  photographicEvidence: z.array(z.string()).min(0).max(10),
  immediateRemedialAction: z.string().min(1).max(1000),
  date: z.string().min(1),
});
