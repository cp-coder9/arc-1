/**
 * Town Planning & Land Development Workflow — Core Types
 *
 * This module defines the type system for the town planning workflow feature,
 * covering applications, property intelligence, conditions, SDP, subdivision,
 * appeals, municipality configuration, and access control.
 */

import type { UserRole } from '@/types';

// ─── Application Types ───────────────────────────────────────────────────────

export type ApplicationType =
  | 'rezoning'
  | 'departure'
  | 'subdivision'
  | 'consolidation'
  | 'removal_of_restrictive_conditions'
  | 'township_establishment'
  | 'consent_use'
  | 'amendment_of_scheme';

export type ApplicationStage =
  | 'preparation'
  | 'submission'
  | 'acknowledgement'
  | 'circulation'
  | 'advertising'
  | 'objection_period'
  | 'comment_period'
  | 'hearing'
  | 'consideration'
  | 'decision'
  | 'conditions_compliance'
  | 'appeal'
  | 'withdrawn';

export type DecisionOutcome = 'approved' | 'refused' | 'deferred' | 'approved_with_conditions';

export interface LandUseApplication {
  id: string;
  projectId: string;
  referenceNumber: string;
  applicationType: ApplicationType;
  stage: ApplicationStage;
  municipalityId: string;
  propertyId: string;
  applicantName: string;
  applicantContact: string;
  description: string;
  submissionDate?: string;
  municipalReference?: string;
  acknowledgementDate?: string;
  advertisingStartDate?: string;
  advertisingEndDate?: string;
  hearingDate?: string;
  decisionDate?: string;
  decisionOutcome?: DecisionOutcome;
  decisionReasons?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

// ─── Property Intelligence ───────────────────────────────────────────────────

export interface ZoningParameters {
  currentZoning: string;
  proposedZoning?: string;
  coveragePercentage?: number;
  floorAreaRatio?: number;
  height?: number;
  buildingLines?: {
    front?: number;
    rear?: number;
    side1?: number;
    side2?: number;
  };
  parkingRequired?: number;
  densityUnitsPerHa?: number;
}

export interface RestrictiveCondition {
  id: string;
  titleDeedReference: string;
  conditionText: string;
  registeredDate?: string;
  status: 'active' | 'removed' | 'suspended';
}

export interface Servitude {
  id: string;
  type: string;
  width?: number;
  beneficiary?: string;
  description: string;
  registeredDate?: string;
}

export interface PropertyIntelligence {
  id: string;
  projectId: string;
  erfNumber: string;
  portionNumber?: string;
  township: string;
  registrationDivision: string;
  province: string;
  municipality: string;
  titleDeedNumber: string;
  extent: number; // square metres
  zoning: ZoningParameters;
  restrictiveConditions: RestrictiveCondition[];
  servitudes: Servitude[];
  surveyorName?: string;
  surveyorPlatoNumber?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Conditions of Approval ──────────────────────────────────────────────────

export type ConditionStatus = 'outstanding' | 'in_progress' | 'fulfilled' | 'waived';

export interface ConditionOfApproval {
  id: string;
  applicationId: string;
  conditionNumber: number;
  description: string;
  responsibleParty?: string;
  deadline?: string;
  status: ConditionStatus;
  evidenceDocuments: string[];
  waiverReference?: string;
  waiverReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Comments & Objections ───────────────────────────────────────────────────

export type CommentType = 'support' | 'neutral' | 'objection';
export type CommentStatus = 'received' | 'reviewed' | 'response_prepared' | 'addressed';

export interface Comment {
  id: string;
  applicationId: string;
  type: CommentType;
  status: CommentStatus;
  submitterName: string;
  submitterContact: string;
  content: string;
  dateReceived: string;
  isLateSubmission: boolean;
  response?: string;
  responseDate?: string;
  respondedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── SDP (Site Development Plan) ─────────────────────────────────────────────

export type SDPStage =
  | 'preparation'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'amendments_required'
  | 'rejected';

export type SDPChecklistItemStatus = 'not_started' | 'in_progress' | 'complete';

export interface SDPChecklistItem {
  id: string;
  name: string;
  description: string;
  status: SDPChecklistItemStatus;
  linkedDocumentIds: string[];
  isRequired: boolean;
  category: string;
}

export interface SiteDevelopmentPlan {
  id: string;
  applicationId: string;
  projectId: string;
  stage: SDPStage;
  checklist: SDPChecklistItem[];
  submissionDate?: string;
  reviewDate?: string;
  decisionDate?: string;
  decisionNotes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Subdivision ─────────────────────────────────────────────────────────────

export type SGDiagramStage =
  | 'instruction_issued'
  | 'survey_in_progress'
  | 'diagram_prepared'
  | 'diagram_lodged'
  | 'approved'
  | 'rejected';

export type TitleDeedEndorsementStage = 'pending' | 'lodged' | 'registered' | 'rejected';

export interface SubdivisionRecord {
  id: string;
  applicationId: string;
  projectId: string;
  surveyorId?: string;
  surveyorName?: string;
  surveyorPlatoNumber?: string;
  sgDiagramStage: SGDiagramStage;
  titleDeedStage: TitleDeedEndorsementStage;
  instructionDocument?: string;
  sgDiagramReference?: string;
  newErfNumbers: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Appeal ──────────────────────────────────────────────────────────────────

export type AppealStage =
  | 'filed'
  | 'under_consideration'
  | 'hearing_scheduled'
  | 'decision_received'
  | 'withdrawn';

export type AppealOutcome = 'upheld' | 'dismissed' | 'varied';

export interface Appeal {
  id: string;
  applicationId: string;
  projectId: string;
  stage: AppealStage;
  filingDate: string;
  prescribedDeadline: string;
  filedWithinPrescribedPeriod: boolean;
  grounds: string;
  hearingDate?: string;
  outcome?: AppealOutcome;
  outcomeDate?: string;
  outcomeReasons?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Municipality Configuration ──────────────────────────────────────────────

export interface MunicipalityProfile {
  id: string;
  name: string;
  province: string;
  districtMunicipality?: string;
  contactEmail?: string;
  contactPhone?: string;
  typicalProcessingDays: number;
  advertisingPeriodDays: number;
  appealPeriodDays: number;
  requiredDocuments: string[];
  additionalSDPComponents: string[];
  additionalFields: Record<string, string>;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Document Checklist ──────────────────────────────────────────────────────

export type ChecklistItemStatus = 'required' | 'uploaded' | 'not_applicable';

export interface DocumentChecklistItem {
  id: string;
  name: string;
  description: string;
  status: ChecklistItemStatus;
  documentId?: string;
  isTypeSpecific: boolean;
  applicationType?: ApplicationType;
}

// ─── Access Control ──────────────────────────────────────────────────────────

/** Actions that can be performed in the Town Planning module */
export type TownPlanningAction =
  | 'create_application'
  | 'manage_workflow'
  | 'manage_comments'
  | 'manage_conditions'
  | 'configure_municipality'
  | 'manage_sdp'
  | 'view_application'
  | 'view_property'
  | 'update_property'
  | 'manage_subdivision'
  | 'manage_surveyor'
  | 'link_drawings'
  | 'view_conditions'
  | 'approve_costs'
  | 'view_documents';

/** Result of a permission check */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Effective permissions computed from one or more roles */
export interface TownPlanningPermissions {
  allowedActions: TownPlanningAction[];
  isAdmin: boolean;
  roles: UserRole[];
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export interface TownPlanningAuditEntry {
  id: string;
  projectId: string;
  applicationId?: string;
  action: string;
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  details: Record<string, unknown>;
}
