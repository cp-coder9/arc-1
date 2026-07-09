// ─── EIA & Environmental Compliance Types ───────────────────────────────────
// Comprehensive type definitions for the EIA Workspace (Module 4).
// Covers NEMA EIA lifecycle, Green Building certifications, and platform integration.

import type { ArchitexRole, Priority, WorkflowEvent } from '../lifecycleTypes';

// Re-export for convenience within EIA services
export type { ArchitexRole, Priority, WorkflowEvent };

// ─── Role Access Control ─────────────────────────────────────────────────────

/**
 * Subset of platform roles permitted to access the EIA Workspace.
 * Read access: all listed roles. Write access varies by tab (see EIA_TAB_WRITE_ROLES).
 */
export type EIAAccessRole =
  | 'architect'
  | 'engineer'
  | 'site_manager'
  | 'platform_admin'
  | 'contractor';

/**
 * Roles with write access to screening, assessment, authorization, and public participation tabs.
 */
export type EIAWriteRole =
  | 'architect'
  | 'engineer';

/**
 * Roles with write access to the EMPr Monitor tab.
 */
export type EMPrWriteRole =
  | 'architect'
  | 'engineer'
  | 'site_manager'
  | 'contractor';

/**
 * Roles with write access to the Green Building tab.
 */
export type GreenBuildingWriteRole =
  | 'architect';

// ─── Screening Engine ────────────────────────────────────────────────────────

export interface ScreeningInput {
  activityType: string;
  totalSiteArea: number;                // 1–999,999,999 m²
  developmentFootprint: number;         // 1–999,999,999 m²
  province: string;
  municipality: string;
  proximityWatercourse: number;         // 0–99,999 m
  proximityCoastal: number;            // 0–99,999 m
  proximityProtectedArea: number;      // 0–99,999 m
  landUseZone: string;
  withinListedGeographicArea: boolean;
}

export type ListingNotice = 'GN_R983' | 'GN_R984' | 'GN_R985';

export interface TriggeredActivity {
  listingNotice: ListingNotice;
  activityNumber: string;
  description: string;                  // max 500 chars
  triggeringAttribute: string;
  triggeringValue: string | number;
  thresholdValue: string | number;
}

export type ScreeningRecommendation = 'no_eia_required' | 'basic_assessment' | 'full_scoping_eia';

export interface ScreeningResult {
  id: string;
  projectId: string;
  input: ScreeningInput;
  triggeredActivities: TriggeredActivity[];
  recommendation: ScreeningRecommendation;
  advisoryText: string;
  screenedAt: string;                   // ISO 8601
  screenedBy: string;
}

// ─── EIA Assessment (Basic Assessment + Full EIA) ────────────────────────────

export type BAPhase =
  | 'application_submission'
  | 'application_acceptance'            // 20 days
  | 'bar_preparation'                   // no statutory timeframe
  | 'public_participation'              // 30 days
  | 'bar_finalization'                  // no statutory timeframe
  | 'bar_submission'                    // within 90 days of acceptance
  | 'authority_review'                  // 107 days
  | 'decision';                         // no statutory timeframe

export type FullEIAPhase =
  | 'application_submission'
  | 'application_acceptance'            // 20 days
  | 'scoping_preparation'              // no statutory timeframe
  | 'scoping_public_participation'     // 30 days
  | 'scoping_submission'               // within 44 days of acceptance
  | 'scoping_acceptance'               // no statutory timeframe
  | 'specialist_studies'               // no statutory timeframe
  | 'eir_preparation'                  // no statutory timeframe
  | 'eir_public_participation'         // 30 days
  | 'eir_submission'                   // within 106 days of scoping acceptance
  | 'authority_review'                 // 107 days
  | 'decision';                        // no statutory timeframe

export type PhaseStatus = 'pending' | 'active' | 'completed' | 'overdue';

export interface PhaseRecord {
  phase: BAPhase | FullEIAPhase;
  status: PhaseStatus;
  startDate?: string;                   // ISO 8601
  completionDate?: string;             // ISO 8601
  referenceNumber?: string;            // max 50 chars
  statutoryDays?: number;              // null/undefined for unregulated phases
  deadline?: string;                   // ISO 8601 - calculated from startDate + statutoryDays
  completedBy?: string;
  notes?: string;
}

export type SpecialistStudyType =
  | 'ecological'
  | 'heritage'
  | 'geotechnical'
  | 'traffic'
  | 'visual'
  | 'noise'
  | 'socio-economic'
  | 'agricultural';

export type SpecialistStudyStatus = 'appointed' | 'in_progress' | 'draft_complete' | 'final';

export interface SpecialistStudy {
  id: string;
  studyType: SpecialistStudyType;
  specialistName: string;              // max 200 chars
  registrationBody?: string;
  registrationNumber?: string;
  status: SpecialistStudyStatus;
  submissionDate?: string;             // ISO 8601
  requiredDate: string;                // ISO 8601
  appointedDate?: string;              // ISO 8601
}

export type AssessmentType = 'basic_assessment' | 'full_scoping_eia';

export interface AssessmentRecord {
  id: string;
  projectId: string;
  type: AssessmentType;
  phases: PhaseRecord[];
  currentPhase: BAPhase | FullEIAPhase;
  specialistStudies?: SpecialistStudy[];  // Full EIA only
  createdAt: string;                      // ISO 8601
  updatedAt: string;                      // ISO 8601
}

// ─── Environmental Authorization ─────────────────────────────────────────────

export type AuthorizationStatus =
  | 'pending_decision'
  | 'authorized'
  | 'authorized_with_conditions'
  | 'refused'
  | 'appealed'
  | 'lapsed'
  | 'amended';

export type ConditionComplianceStatus = 'not_started' | 'in_progress' | 'complied' | 'non_compliant';

export interface AuthorizationCondition {
  id: string;
  conditionNumber: number;
  conditionText: string;               // max 2000 chars
  responsibleParty: string;
  complianceDeadline?: string;         // ISO 8601
  complianceStatus: ConditionComplianceStatus;
}

export interface AuthorizationRecord {
  id: string;
  projectId: string;
  referenceNumber: string;             // max 100 chars
  dateOfIssue: string;                 // ISO 8601
  competentAuthority: string;          // max 200 chars
  validityStart: string;               // ISO 8601
  validityExpiry: string;              // ISO 8601
  authorizedActivities: string[];      // max 1000 chars each
  status: AuthorizationStatus;
  conditions: AuthorizationCondition[];
}

/**
 * Summary statistics for an authorization's conditions.
 */
export interface AuthorizationConditionSummary {
  total: number;
  complied: number;
  outstanding: number;
  overdue: number;
}

// ─── Environmental Management Programme (EMPr) ──────────────────────────────

export type EMPrPhase = 'pre-construction' | 'construction' | 'operation' | 'rehabilitation';

export type MonitoringFrequency = 'daily' | 'weekly' | 'monthly' | 'event-triggered';

export type EMPrComplianceStatus = 'compliant' | 'non_compliant' | 'not_yet_applicable';

export interface EMPrCommitment {
  id: string;
  projectId: string;
  reference: string;
  description: string;
  applicablePhase: EMPrPhase;
  responsibleParty: string;
  monitoringFrequency: MonitoringFrequency;
  complianceStatus: EMPrComplianceStatus;
  lastMonitoredDate?: string;          // ISO 8601
  nextDueDate?: string;                // ISO 8601
  specForgeItemId?: string;            // bidirectional SpecForge link
}

export interface EMPrAudit {
  id: string;
  projectId: string;
  auditDate: string;                   // ISO 8601
  auditorName: string;
  findingsSummary: string;             // max 2000 chars
  overallStatus: EMPrComplianceStatus;
}

/**
 * EMPr compliance calculation result.
 */
export interface EMPrComplianceResult {
  compliancePercentage: number;        // 0–100
  totalApplicable: number;
  compliantCount: number;
  nonCompliantCount: number;
}

// ─── Public Participation ────────────────────────────────────────────────────

export type RegistrationMethod = 'written_request' | 'site_notice' | 'advertisement_response' | 'organ_of_state';

export type InterestCategory = 'adjacent_owner' | 'community_member' | 'organ_of_state' | 'ngo' | 'other';

export type NotificationType = 'site_notice' | 'newspaper_advertisement' | 'written_notice' | 'bid_distribution';

export interface IAPRecord {
  id: string;
  projectId: string;
  partyName: string;                   // max 200 chars
  organisation?: string;               // max 200 chars
  email: string;
  phone: string;
  postalAddress: string;
  dateRegistered: string;              // ISO 8601
  registrationMethod: RegistrationMethod;
  interestCategory: InterestCategory;
}

export interface NotificationEvent {
  id: string;
  projectId: string;
  notificationType: NotificationType;
  dateIssued: string;                  // ISO 8601
  recipientIds: string[];              // linked to IAPRecord ids
  proofReference: string;              // max 500 chars
  commentDeadline: string;             // dateIssued + 30 days
  isClosed: boolean;
  totalComments: number;
  commentsWithResponse: number;
}

export interface CommentRecord {
  id: string;
  projectId: string;
  notificationId: string;
  commentingPartyId: string;           // linked to IAPRecord
  dateReceived: string;                // ISO 8601
  commentSummary: string;              // max 2000 chars
  eapResponse?: string;                // max 2000 chars
}

/**
 * Public participation completeness indicator.
 */
export interface PPCompletenessIndicator {
  totalIAPs: number;
  notifiedIAPs: number;
  totalComments: number;
  commentsWithResponse: number;
}

// ─── EAP Management ──────────────────────────────────────────────────────────

export type EAPVerificationStatus = 'verified' | 'unverified' | 'expired';

export type EAPAssignmentStatus = 'active' | 'replaced' | 'withdrawn';

export interface EAPAppointment {
  id: string;
  projectId: string;
  practitionerName: string;            // max 200 chars
  firmName: string;                    // max 200 chars
  eapasaRegistration: string;
  email: string;
  telephone: string;
  dateOfAppointment: string;           // ISO 8601
  verificationStatus: EAPVerificationStatus;
  assignmentStatus: EAPAssignmentStatus;
  dateEnded?: string;                  // ISO 8601
  replacementReason?: string;
}

// ─── Green Building: Green Star SA ───────────────────────────────────────────

export type RatingTool =
  | 'office_v1'
  | 'residential_v1'
  | 'retail_v1'
  | 'public_education_v1'
  | 'custom';

export type CreditCategory =
  | 'management'
  | 'ieq'
  | 'energy'
  | 'transport'
  | 'water'
  | 'materials'
  | 'land_use_ecology'
  | 'emissions'
  | 'innovation';

export type EvidenceStatus = 'not_started' | 'in_progress' | 'submitted' | 'verified';

export interface Credit {
  id: string;
  category: CreditCategory;
  name: string;                        // 1–120 chars
  availablePoints: number;             // 0–25
  targetedPoints: number;              // 0–availablePoints
  achievedPoints: number;              // 0–availablePoints
  evidenceStatus: EvidenceStatus;
}

export type StarRating = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface GreenStarResult {
  ratingTool: RatingTool;
  credits: Credit[];
  totalTargeted: number;
  totalAchieved: number;
  starRating: StarRating;
  categoryMinimumsMet: boolean;
  unmetMinimums: UnmetMinimum[];
}

export interface UnmetMinimum {
  category: CreditCategory;
  required: number;
  achieved: number;
}

/**
 * Persisted Green Star SA rating record.
 */
export interface GreenStarRating {
  id: string;
  projectId: string;
  ratingTool: RatingTool;
  credits: Credit[];
  reviewSubmissionDate?: string;       // ISO 8601
}

// ─── Green Building: EDGE Certification ──────────────────────────────────────

export type EDGECategory = 'energy' | 'water' | 'embodied_energy_materials';

export type EDGELevel = 'not_eligible' | 'edge_certified' | 'edge_advanced' | 'edge_zero_carbon';

export type EDGEStage = 'preliminary_design' | 'post_construction' | 'certified';

export interface EDGECategoryValue {
  category: EDGECategory;
  baselineValue: number;
  designedValue: number;
  percentageSavings: number;           // 0–100
  meetsThreshold: boolean;             // ≥20%
}

export interface EDGEResult {
  categories: EDGECategoryValue[];
  level: EDGELevel;
  stage: EDGEStage;
  allCategoriesValid: boolean;
  lastUpdated: string;                 // ISO 8601
}

/**
 * Persisted EDGE certification record.
 */
export interface EDGECertification {
  id: string;
  projectId: string;
  categories: EDGECategoryValue[];
  level: EDGELevel;
  stage: EDGEStage;
  lastUpdated: string;                 // ISO 8601
}

// ─── Green Building: Net Zero Pathway ────────────────────────────────────────

export type NetZeroTargetType = 'net_zero_carbon' | 'net_zero_energy' | 'net_zero_water';

export interface NetZeroTarget {
  id: string;
  projectId: string;
  targetType: NetZeroTargetType;
  baselineYear: number;
  targetYear: number;                  // 1–30 years from baseline
  baselineConsumption: number;         // 0–999,999,999.99
}

export interface AnnualPerformance {
  year: number;
  actualConsumption: number;           // 0–999,999,999.99
  baselineConsumption: number;
  onSiteRenewable?: number;           // energy targets only
  offsetCredits?: number;             // carbon targets only
}

export interface NetZeroProgress {
  target: NetZeroTarget;
  annualData: AnnualPerformance[];
  percentageReduction: number;
  trajectoryTarget: number;            // expected % reduction for current year
  onTrack: boolean;
  deviationPercentagePoints: number;
}

// ─── Integration & Platform Spine ────────────────────────────────────────────

/**
 * Workflow event types specific to EIA module.
 */
export type EIAWorkflowEventType =
  | 'deadline_warning'
  | 'action_required'
  | 'blocker'
  | 'info';

/**
 * Audit trail entry for EIA actions.
 */
export interface EIAAuditEntry {
  id: string;
  action: string;
  actorId: string;
  projectId: string;
  timestamp: string;                   // ISO 8601
  outcome: string;
  metadata?: Record<string, unknown>;
}

/**
 * Environmental blocker evaluation result.
 */
export interface EnvironmentalBlockerResult {
  isBlocker: boolean;
  reason: string;
}

// ─── EIA Workspace Tab Configuration ─────────────────────────────────────────

export type EIATabId =
  | 'overview'
  | 'screening'
  | 'basic-assessment'
  | 'full-eia'
  | 'authorization'
  | 'empr'
  | 'public-participation'
  | 'green-building';

export interface EIATabConfig {
  id: EIATabId;
  label: string;
  writeRoles: ArchitexRole[];
}

/**
 * Props for the main EIA Workspace component.
 */
export interface EIAWorkspaceProps {
  user: { uid: string; role?: string };
  projectId?: string;
}
