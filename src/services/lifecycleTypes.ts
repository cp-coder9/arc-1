// ─── Pack 2: Project Passport + Lifecycle Unified Types ─────────────────────
// Unified types from packs 2, 3, 5 of the Architex Project Passport Lifecycle.

export type ArchitexRole =
  | 'client_developer'
  | 'architect'
  | 'engineer'
  | 'quantity_surveyor'
  | 'contractor'
  | 'supplier'
  | 'candidate_professional'
  | 'admin';

export type ProjectPhase =
  | 'onboarding'
  | 'feasibility'
  | 'appointment'
  | 'concept_design'
  | 'design_development'
  | 'municipal_submission'
  | 'tender_procurement'
  | 'construction_execution'
  | 'closeout';

export type ModuleKey =
  | 'project'
  | 'appointment'
  | 'documents'
  | 'municipal'
  | 'procurement'
  | 'finance'
  | 'site'
  | 'closeout'
  | 'marketplace'
  | 'knowledge'
  | 'agent';

export type RecordStatus = 'draft' | 'pending_review' | 'approved' | 'issued' | 'superseded' | 'rejected' | 'missing';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type ProjectRecordType =
  | 'project_brief'
  | 'property_profile'
  | 'professional_appointment'
  | 'scope_baseline'
  | 'concept_drawings'
  | 'technical_drawings'
  | 'drawing_revision'
  | 'municipal_submission_pack'
  | 'municipal_approval_letter'
  | 'tender_pack'
  | 'quote_comparison'
  | 'construction_programme'
  | 'payment_certificate'
  | 'site_diary'
  | 'rfi'
  | 'site_instruction'
  | 'snag_register'
  | 'closeout_pack'
  | 'candidate_supervision_record';

export interface AuditMetadata {
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  supersedesRecordId?: string;
}

export interface ApprovalMetadata {
  required: boolean;
  approvedBy?: string[];
  pendingRoles?: ArchitexRole[];
  approvalNote?: string;
}

export interface ProjectRecord<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  tenantId: string;
  projectId: string;
  phase: ProjectPhase;
  moduleKey: ModuleKey;
  recordType: ProjectRecordType;
  title: string;
  status: RecordStatus;
  payload: TPayload;
  approvals: ApprovalMetadata;
  audit: AuditMetadata;
  linkedRecordIds: string[];
}

export interface ProjectMetadata {
  tenantId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  municipality: string;
  propertyReference: string;
  propertyUse: string;
  landUseNotes: string;
  currentPhase: ProjectPhase;
  leadProfessionalRole: ArchitexRole;
}

export interface PhaseDefinition {
  phase: ProjectPhase;
  label: string;
  requiredRecordTypes: ProjectRecordType[];
  optionalRecordTypes: ProjectRecordType[];
  handoffRule: string;
}

export interface MissingRecord {
  recordType: ProjectRecordType;
  priority: Priority;
  reason: string;
}

export interface LifecycleEvaluation {
  phase: ProjectPhase;
  requiredRecordTypes: ProjectRecordType[];
  presentRequiredRecordTypes: ProjectRecordType[];
  missingRecords: MissingRecord[];
  mayAdvance: boolean;
  blockers: string[];
  nextBestActions: string[];
}

export interface TeamAppointmentSummary {
  role: ArchitexRole;
  appointedParty: string;
  status: RecordStatus;
  recordId: string;
}

export interface ProjectPassport {
  tenantId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  municipality: string;
  propertyReference: string;
  propertyUse: string;
  landUseNotes: string;
  currentPhase: ProjectPhase;
  leadProfessionalRole: ArchitexRole;
  appointments: TeamAppointmentSummary[];
  approvalStatus: 'missing' | 'pending' | 'approved';
  documentStatus: 'incomplete' | 'ready' | 'issued';
  financialStatus: 'not_started' | 'pending_review' | 'current';
  lifecycle: LifecycleEvaluation;
  riskLevel: Priority;
}

export interface WorkflowEvent {
  id: string;
  type: 'approval_required' | 'municipal_blocker' | 'payment_due' | 'task_overdue' | 'risk_detected' | 'project_phase_changed';
  projectId: string;
  title: string;
  detail: string;
  priority: Priority;
  sourceModule: 'projects' | 'documents' | 'finance' | 'marketplace' | 'messages' | 'settings_admin';
  assignedRoles: ArchitexRole[];
  createdAt: string;
}

export interface AgentRecommendation {
  id: string;
  scope: 'user' | 'project';
  title: string;
  rationale: string;
  priority: Priority;
  recommendedActionLabel: string;
  relatedRecordType?: ProjectRecordType;
  relatedRoute: string;
  requiresHumanApproval: boolean;
}

export interface RiskFinding {
  code: string;
  priority: Priority;
  message: string;
  assignedRoles: ArchitexRole[];
}

export interface RiskEvaluation {
  riskLevel: Priority;
  riskFactors: RiskFinding[];
  score: number;
  details: string;
}
