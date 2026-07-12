/**
 * Town Planning Workflow — Type Definitions
 *
 * Covers the full municipal town-planning application lifecycle
 * for South African SPLUMA (Spatial Planning and Land Use Management Act) workflows.
 */

import type { UserRole } from '@/types';

// ─── Enums & Literals ─────────────────────────────────────────────────────────

export type ApplicationType =
  | 'rezoning'
  | 'subdivision'
  | 'consolidation'
  | 'consent_use'
  | 'departure'
  | 'removal_of_restrictive_conditions'
  | 'township_establishment'
  | 'site_development_plan'
  | 'building_line_relaxation'
  | 'amendment_of_scheme';

export type ApplicationStage =
  | 'preparation'
  | 'submission'
  | 'acknowledgement'
  | 'circulation'
  | 'advertising'
  | 'comment_period'
  | 'hearing'
  | 'decision'
  | 'conditions_compliance'
  | 'appeal'
  | 'withdrawn';

export type DecisionOutcome =
  | 'approved'
  | 'approved_with_conditions'
  | 'refused'
  | 'deferred'
  | 'withdrawn';

// ─── Core Application ─────────────────────────────────────────────────────────

export interface LandUseApplication {
  id: string;
  projectId: string;
  referenceNumber: string;
  applicationType: ApplicationType;
  currentStage: ApplicationStage;
  municipality: string;
  erfNumber: string;
  townshipName: string;
  province: string;
  applicantId: string;
  ownerId: string;
  townPlannerId?: string;
  description: string;
  currentZoning?: string;
  proposedZoning?: string;
  currentLandUse?: string;
  proposedLandUse?: string;
  erfSize?: number;
  decision?: DecisionOutcome;
  decisionDate?: string;
  decisionReasons?: string;
  stageHistory: StageHistoryEntry[];
  deadlines: ApplicationDeadline[];
  createdAt: string;
  updatedAt: string;
}

export interface StageHistoryEntry {
  stage: ApplicationStage;
  enteredAt: string;
  exitedAt?: string;
  triggeredBy: string;
  notes?: string;
}

export interface ApplicationDeadline {
  stage: ApplicationStage;
  dueDate: string;
  workingDays: number;
  description: string;
  isOverdue: boolean;
}

// ─── Property Intelligence ────────────────────────────────────────────────────

export interface PropertyIntelligence {
  erfNumber: string;
  township: string;
  municipality: string;
  province: string;
  currentZoning: string;
  zoningScheme: string;
  titleDeedNumber?: string;
  sgDiagramNumber?: string;
  registeredOwner?: string;
  extent?: number;
  zoningParameters?: ZoningParameters;
  restrictiveConditions: RestrictiveCondition[];
  servitudes: Servitude[];
}

export interface ZoningParameters {
  coverage: number;
  far: number;
  height: number;
  density?: number;
  parkingRatio?: number;
  buildingLines: {
    front: number;
    rear: number;
    side: number;
  };
}

export interface RestrictiveCondition {
  id: string;
  titleDeedReference: string;
  conditionText: string;
  registrationDate?: string;
  isActive: boolean;
}

export interface Servitude {
  id: string;
  type: 'municipal' | 'private' | 'praedial';
  width?: number;
  description: string;
  beneficiary?: string;
}

// ─── Comments & Objections ────────────────────────────────────────────────────

export type CommentType = 'objection' | 'support' | 'comment' | 'representation';

export type CommentStatus =
  | 'received'
  | 'acknowledged'
  | 'under_review'
  | 'addressed'
  | 'dismissed';

export interface CommentRecord {
  id: string;
  applicationId: string;
  commentType: CommentType;
  status: CommentStatus;
  submittedBy: string;
  submitterName: string;
  submitterAddress?: string;
  submitterContact?: string;
  content: string;
  attachments: string[];
  receivedDate: string;
  acknowledgedDate?: string;
  responseNotes?: string;
  respondedBy?: string;
}

// ─── Conditions of Approval ───────────────────────────────────────────────────

export type ConditionStatus =
  | 'outstanding'
  | 'in_progress'
  | 'fulfilled'
  | 'waived';

export interface ConditionOfApproval {
  id: string;
  applicationId: string;
  conditionNumber: number;
  description: string;
  responsibleParty: string;
  status: ConditionStatus;
  dueDate?: string;
  fulfilledDate?: string;
  waivedDate?: string;
  waivedBy?: string;
  waiverReason?: string;
  evidence?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Site Development Plan ────────────────────────────────────────────────────

export type SDPStage =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'amendment_required';

export interface SDPChecklistItem {
  id: string;
  category: string;
  description: string;
  isRequired: boolean;
  isComplete: boolean;
  completedDate?: string;
  notes?: string;
}

export interface SiteDevelopmentPlan {
  id: string;
  applicationId: string;
  stage: SDPStage;
  version: number;
  checklistItems: SDPChecklistItem[];
  submittedDate?: string;
  approvedDate?: string;
  rejectedDate?: string;
  rejectionReasons?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Surveyor General & Title Deed ────────────────────────────────────────────

export type SGDiagramStage =
  | 'instruction_to_surveyor'
  | 'survey_in_progress'
  | 'diagram_lodged'
  | 'diagram_approved'
  | 'diagram_rejected';

export type TitleDeedStage =
  | 'draft_deed_prepared'
  | 'deed_lodged'
  | 'deed_registered'
  | 'deed_rejected';

// ─── Subdivision ──────────────────────────────────────────────────────────────

export interface SubdivisionRecord {
  id: string;
  applicationId: string;
  parentErf: string;
  resultingErven: string[];
  sgDiagramStage: SGDiagramStage;
  titleDeedStage?: TitleDeedStage;
  surveyorId?: string;
  conveyancerId?: string;
  sgDiagramNumber?: string;
  newTitleDeedNumbers?: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Appeal ───────────────────────────────────────────────────────────────────

export type AppealStage =
  | 'notice_of_intent'
  | 'appeal_lodged'
  | 'response_period'
  | 'hearing_scheduled'
  | 'hearing_concluded'
  | 'appeal_decided';

export type AppealOutcome =
  | 'upheld'
  | 'dismissed'
  | 'varied'
  | 'remitted';

export interface Appeal {
  id: string;
  applicationId: string;
  stage: AppealStage;
  outcome?: AppealOutcome;
  appellantId: string;
  appellantName: string;
  groundsOfAppeal: string;
  filedDate: string;
  decisionDate?: string;
  decisionReasons?: string;
  appealAuthority: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Municipality Profile ─────────────────────────────────────────────────────

export interface MunicipalityProfile {
  id: string;
  name: string;
  province: string;
  districtMunicipality?: string;
  contactEmail?: string;
  contactPhone?: string;
  physicalAddress?: string;
  postalAddress?: string;
  zoningScheme: string;
  sdpRequired: boolean;
  advertisingPeriodDays: number;
  commentPeriodDays: number;
  decisionTimelineDays: number;
  tribunalName?: string;
  appealAuthority?: string;
  onlinePortalUrl?: string;
  specialRequirements?: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Document Checklist ───────────────────────────────────────────────────────

export interface DocumentChecklistItem {
  id: string;
  applicationId: string;
  documentType: string;
  description: string;
  isRequired: boolean;
  isUploaded: boolean;
  uploadedDate?: string;
  fileReference?: string;
  notes?: string;
}

// ─── Actions & Permissions ────────────────────────────────────────────────────

export type TownPlanningAction =
  | 'create_application'
  | 'edit_application'
  | 'view_application'
  | 'transition_stage'
  | 'add_comment'
  | 'respond_to_comment'
  | 'add_condition'
  | 'update_condition'
  | 'waive_condition'
  | 'upload_document'
  | 'manage_municipality'
  | 'submit_appeal'
  | 'decide_application'
  | 'view_all_applications'
  | 'delete_application';

export type TownPlanningPermissions = Record<TownPlanningAction, boolean>;

export interface ActorContext {
  userId: string;
  role: UserRole;
  permissions: TownPlanningPermissions;
  municipalityId?: string;
  firmId?: string;
}

// ─── Role-Permission Matrix ───────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<UserRole, TownPlanningAction[]> = {
  town_planner: [
    'create_application',
    'edit_application',
    'view_application',
    'transition_stage',
    'add_comment',
    'respond_to_comment',
    'add_condition',
    'update_condition',
    'waive_condition',
    'upload_document',
    'submit_appeal',
    'view_all_applications',
  ],
  architect: [
    'create_application',
    'edit_application',
    'view_application',
    'upload_document',
    'add_comment',
    'view_all_applications',
  ],
  admin: [
    'create_application',
    'edit_application',
    'view_application',
    'transition_stage',
    'add_comment',
    'respond_to_comment',
    'add_condition',
    'update_condition',
    'waive_condition',
    'upload_document',
    'manage_municipality',
    'submit_appeal',
    'decide_application',
    'view_all_applications',
    'delete_application',
  ],
  platform_admin: [
    'create_application',
    'edit_application',
    'view_application',
    'transition_stage',
    'add_comment',
    'respond_to_comment',
    'add_condition',
    'update_condition',
    'waive_condition',
    'upload_document',
    'manage_municipality',
    'submit_appeal',
    'decide_application',
    'view_all_applications',
    'delete_application',
  ],
  client: [
    'view_application',
    'add_comment',
    'upload_document',
  ],
  developer: [
    'create_application',
    'view_application',
    'add_comment',
    'upload_document',
    'view_all_applications',
  ],
  engineer: [
    'view_application',
    'add_comment',
    'upload_document',
  ],
  quantity_surveyor: [
    'view_application',
  ],
  energy_professional: [
    'view_application',
  ],
  fire_engineer: [
    'view_application',
    'add_comment',
  ],
  site_manager: [
    'view_application',
  ],
  bep: [
    'create_application',
    'view_application',
    'add_comment',
    'upload_document',
    'view_all_applications',
  ],
  contractor: [
    'view_application',
  ],
  subcontractor: [
    'view_application',
  ],
  supplier: [],
  freelancer: [
    'view_application',
  ],
  firm_admin: [
    'view_application',
    'view_all_applications',
  ],
  land_surveyor: [
    'view_application',
    'add_comment',
    'upload_document',
  ],
  cpm: [
    'view_application',
    'add_comment',
    'view_all_applications',
  ],
  health_safety: [
    'view_application',
    'add_comment',
  ],
};

/**
 * Check if a user role has a specific town planning permission.
 */
export function hasPermission(role: UserRole, permission: TownPlanningAction): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}
