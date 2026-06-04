export type ArchitexRole =
  | 'client'
  | 'developer'
  | 'architect'
  | 'engineer'
  | 'quantity_surveyor'
  | 'town_planner'
  | 'contractor'
  | 'subcontractor'
  | 'supplier'
  | 'site_manager'
  | 'candidate_professional'
  | 'platform_admin';

export type ProjectPhase =
  | 'lead_enquiry'
  | 'brief_feasibility'
  | 'proposal_appointment'
  | 'design_coordination'
  | 'municipal_submission'
  | 'tender_procurement'
  | 'construction_execution'
  | 'payments_commercial_control'
  | 'closeout'
  | 'defects_liability'
  | 'operations_post_occupancy';

export type ProductModuleKey =
  | 'project_lifecycle'
  | 'project_passport'
  | 'documents'
  | 'knowledge'
  | 'marketplace'
  | 'finance'
  | 'procurement'
  | 'site_execution'
  | 'closeout'
  | 'practice_management'
  | 'trust_verification'
  | 'admin_governance'
  | 'risk_engine'
  | 'client_command_centre'
  | 'municipal_readiness';

export type ProjectRecordType =
  | 'document'
  | 'drawing_revision'
  | 'knowledge_source'
  | 'marketplace_listing'
  | 'resource_booking'
  | 'escrow_milestone'
  | 'payment_certificate'
  | 'rfq'
  | 'quote_comparison'
  | 'purchase_order'
  | 'site_diary'
  | 'snag'
  | 'delay_event'
  | 'closeout_item'
  | 'practice_record'
  | 'verification_record'
  | 'risk_alert'
  | 'municipal_submission_item';

export interface AuditMetadata {
  createdByUserId: string;
  createdAt: string;
  updatedAt?: string;
  source?: 'user' | 'agent' | 'system' | 'import';
  revision?: number;
  lockedAfterIssue?: boolean;
}

export interface ApprovalMetadata {
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'issued' | 'superseded';
  requiredApproverRoles: ArchitexRole[];
  approvedByUserId?: string;
  approvedAt?: string;
  reason?: string;
}

export interface ProjectRecord<TPayload = unknown> {
  id: string;
  tenantId: string;
  projectId: string;
  phase: ProjectPhase;
  moduleKey: ProductModuleKey;
  recordType: ProjectRecordType;
  title: string;
  status: string;
  payload: TPayload;
  approval: ApprovalMetadata;
  audit: AuditMetadata;
  linkedRecordIds: string[];
}

export interface ProjectLifecycleState {
  tenantId: string;
  projectId: string;
  currentPhase: ProjectPhase;
  phaseStartedAt: string;
  requiredRecordTypes: ProjectRecordType[];
  completedRecordTypes: ProjectRecordType[];
  blockers: string[];
}

export interface ProjectPassportSummary {
  tenantId: string;
  projectId: string;
  currentPhase: ProjectPhase;
  totalRecords: number;
  currentDrawingRevisions: number;
  openRisks: number;
  pendingApprovals: number;
  outstandingPayments: number;
  missingRequiredRecords: ProjectRecordType[];
  nextBestActions: string[];
}

export interface ProductModuleDefinition {
  key: ProductModuleKey;
  label: string;
  purpose: string;
  primaryRoles: ArchitexRole[];
  phases: ProjectPhase[];
  produces: ProjectRecordType[];
}
