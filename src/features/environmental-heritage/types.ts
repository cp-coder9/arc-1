/**
 * Environmental & Heritage Module — Type Definitions
 *
 * Domain types for the Environmental Impact Assessment (EIA) & Heritage
 * Impact workflow module (P2.10). Covers: EIA Screening, EA Applications,
 * Heritage Assessments, ROD Conditions, EMPr Records, ECO Audits,
 * Corrective Actions, and Environmental Incidents.
 */

// ─── Enums / Unions ───────────────────────────────────────────────────────────

/** NEMA Listed Activity classification notices */
export type ListingNotice = 'listing_notice_1' | 'listing_notice_2' | 'listing_notice_3';

/** Assessment pathway determined by screening */
export type AssessmentType = 'none' | 'basic_assessment' | 'scoping_and_eir';

/** Basic Assessment Report (BAR) application stages */
export type EAStageBasic =
  | 'pre_application'
  | 'application_submitted'
  | 'acknowledgement_received'
  | 'public_participation'
  | 'comments_period_closed'
  | 'specialist_studies'
  | 'bar_submitted'
  | 'authority_review'
  | 'decision_issued'
  | 'appeal_period'
  | 'ea_granted'
  | 'ea_refused'
  | 'appeal_lodged'
  | 'appeal_decision';

/** Scoping & EIR application stages */
export type EAStageScoping =
  | 'pre_application'
  | 'scoping_report_submitted'
  | 'authority_acceptance_scoping'
  | 'specialist_studies'
  | 'eir_submitted'
  | 'authority_review'
  | 'decision_issued'
  | 'appeal_period'
  | 'ea_granted'
  | 'ea_refused'
  | 'appeal_lodged'
  | 'appeal_decision';

/** Combined EA stage type */
export type EAStage = EAStageBasic | EAStageScoping;

/** Heritage assessment workflow stages */
export type HeritageStage =
  | 'notification_submitted'
  | 'interim_comment_received'
  | 'assessment_required'
  | 'hia_undertaken'
  | 'hia_report_submitted'
  | 'heritage_authority_review'
  | 'permit_issued'
  | 'no_further_action_required';

/** ROD condition compliance states (forward-only) */
export type ConditionComplianceState = 'outstanding' | 'in_progress' | 'evidence_submitted' | 'verified_compliant';

/** ROD condition categories by project phase */
export type ConditionCategory = 'pre_construction' | 'construction' | 'operational' | 'ongoing';

/** Method used to verify condition compliance */
export type VerificationMethod = 'inspection' | 'report_submission' | 'monitoring_data' | 'audit' | 'self_declaration';

/** ECO audit overall rating */
export type ECOAuditRating = 'compliant' | 'minor_non_conformance' | 'major_non_conformance' | 'critical_non_conformance';

/** Corrective action lifecycle states */
export type CorrectiveActionState = 'issued' | 'in_progress' | 'completed' | 'verified_closed';

/** Construction phase for EMPr scoping */
export type ConstructionPhase = 'bulk_earthworks' | 'substructure' | 'superstructure' | 'services_installation' | 'finishes' | 'external_works';

/** Environmental incident classification */
export type IncidentType = 'spill' | 'clearing' | 'dust' | 'water_pollution' | 'noise' | 'waste' | 'other';

/** ECO audit frequency */
export type AuditFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly';

/** NHRA Section 38 trigger criteria */
export type Section38Trigger =
  | 'road_wall_pipeline_300m'
  | 'development_5000sqm'
  | 'rezoning_10000sqm'
  | 'character_alteration_5000sqm'
  | 'other';

// ─── Domain Interfaces ────────────────────────────────────────────────────────

/** A selected NEMA listed activity for screening */
export interface SelectedActivity {
  listingNotice: ListingNotice;
  activityNumber: string;
  description: string;
}

/** Geographic context for screening assessment */
export interface GeographicContext {
  province: string;
  municipality?: string;
  isCoastalZone: boolean;
  isUrbanArea: boolean;
  isSensitiveEnvironment: boolean;
}

/** EIA Screening Report — initial assessment determination */
export interface ScreeningReport {
  id: string;
  projectId: string;
  projectName: string;
  screeningDate: string;
  performedBy: string;
  activitiesSelected: SelectedActivity[];
  assessmentType: AssessmentType;
  competentAuthority: string;
  geographicContext: GeographicContext;
  nextSteps: string[];
  createdAt: string;
}

/** Environmental Authorisation Application */
export interface EAApplication {
  id: string;
  projectId: string;
  applicationReferenceNumber: string; // max 100
  applicantName: string; // max 200
  eapName: string; // max 200
  eapRegistrationNumber: string; // max 200
  assessmentType: AssessmentType;
  competentAuthority: string;
  listedActivities: SelectedActivity[];
  screeningId: string;
  applicationSubmissionDate: string;
  currentStage: EAStage;
  decisionOutcome?: 'ea_granted' | 'ea_refused';
  decisionDate?: string;
  decisionReferenceNumber?: string;
  appealPeriodEndDate?: string;
  stageHistory: { stage: EAStage; date: string; actor: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Heritage Impact Assessment record */
export interface HeritageAssessment {
  id: string;
  projectId: string;
  siteDescription: string; // max 2000
  section38Trigger: Section38Trigger;
  heritageAuthority: string; // max 200
  notificationDate: string;
  siteCoordinates?: { lat: number; lng: number };
  currentStage: HeritageStage;
  assessmentPractitioner?: string;
  permitReferenceNumber?: string; // max 100
  determinationDate?: string;
  conditions?: string[];
  stageHistory: { stage: HeritageStage; date: string; actor: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Record of Decision (ROD) condition for compliance tracking */
export interface RODCondition {
  id: string;
  projectId: string;
  authorisationId: string;
  authorisationType: 'environmental_authorisation' | 'heritage_permit';
  conditionNumber: number;
  conditionText: string; // max 2000
  complianceCategory: ConditionCategory;
  responsibleParty: string; // max 200
  complianceDeadline?: string;
  verificationMethod: VerificationMethod;
  state: ConditionComplianceState;
  evidence: string[];
  stageHistory: { state: ConditionComplianceState; date: string; actor: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Environmental Management Programme (EMPr) record */
export interface EMPrRecord {
  id: string;
  projectId: string;
  emprDocumentRef: string;
  approvalDate: string;
  ecoName: string; // max 200
  ecoContactEmail: string;
  auditFrequency: AuditFrequency;
  constructionPhase: ConstructionPhase;
  createdAt: string;
  updatedAt: string;
}

/** Environmental Control Officer audit record */
export interface ECOAudit {
  id: string;
  emprId: string;
  projectId: string;
  auditDate: string;
  auditorName: string;
  overallRating: ECOAuditRating;
  findingsCount: number;
  correctiveActions: string[];
  auditReportRef: string;
  createdAt: string;
}

/** Corrective action raised from an ECO audit */
export interface CorrectiveAction {
  id: string;
  auditId: string;
  findingDescription: string; // max 500
  severity: ECOAuditRating;
  responsibleParty: string;
  deadline: string;
  state: CorrectiveActionState;
  stateHistory: { state: CorrectiveActionState; date: string; actor: string }[];
}

/** Environmental incident logged during construction */
export interface EnvironmentalIncident {
  id: string;
  emprId: string;
  projectId: string;
  incidentType: IncidentType;
  description: string; // max 1000
  locationOnSite: string; // max 200
  photographicEvidence: string[]; // 0-10
  immediateRemedialAction: string; // max 1000
  date: string;
  reportedBy: string;
  createdAt: string;
}
