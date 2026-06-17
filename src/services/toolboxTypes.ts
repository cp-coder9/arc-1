// ─── Professional Toolboxes — Shared Type Definitions ───────────────────────
// Plugs into the Architex platform spine for toolbox, calculator, and proposal types.

export type ArchitexRole =
  | 'client_developer'
  | 'architect'
  | 'engineer'
  | 'quantity_surveyor'
  | 'town_planner'
  | 'contractor'
  | 'supplier'
  | 'candidate_professional'
  | 'admin';

export type ProjectPhase =
  | 'feasibility'
  | 'appointment'
  | 'concept_design'
  | 'design_development'
  | 'municipal_submission'
  | 'tender_procurement'
  | 'construction_execution'
  | 'closeout';

export type FormulaType =
  | 'sliding_scale'
  | 'percentage_of_cost'
  | 'stage_apportioned'
  | 'time_based'
  | 'area_unit'
  | 'hybrid';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type ProposalStatus =
  | 'draft'
  | 'pending_review'
  | 'issued'
  | 'accepted'
  | 'expired'
  | 'superseded';

// ── Toolbox Definition ──────────────────────────────────────────────────────

export interface ToolboxDefinition {
  toolboxId: string;
  label: string;
  roles: ArchitexRole[];
  phases: ProjectPhase[];
  toolIds: string[];
}

// ── Calculator Definition ────────────────────────────────────────────────────

export interface CalculatorDefinition {
  calculatorId: string;
  label: string;
  role: ArchitexRole;
  formulaType: FormulaType;
  sourceName: string;
  sourceVersion: string;
  vatRate: number;
  requiresProfessionalConfirmation: boolean;
}

// ── Fee / Calculation Types ──────────────────────────────────────────────────

export interface CalculationInput {
  projectValue: number;
  stagePercentage?: number;
  hours?: number;
  hourlyRate?: number;
  area?: number;
  unitRate?: number;
  complexityFactor?: number;
  disbursements?: number;
  statutoryFees?: number;
  discountPercent?: number;
  discountReason?: string;
}

export interface FeeLine {
  label: string;
  amount: number;
  category:
    | 'professional_fee'
    | 'discount'
    | 'vat'
    | 'disbursement'
    | 'statutory_fee'
    | 'total';
}

export interface CalculationResult {
  calculatorId: string;
  originalProfessionalFee: number;
  discountAmount: number;
  professionalFeeAfterDiscount: number;
  vatAmount: number;
  total: number;
  lines: FeeLine[];
  warnings: string[];
}

// ── Proposal / Terms Types ──────────────────────────────────────────────────

export interface TermsTemplate {
  termsId: string;
  label: string;
  scope: 'architex_standard' | 'profession_specific' | 'company_saved' | 'project_specific';
  clauses: string[];
  requiresApproval: boolean;
}

export interface ProposalDraft {
  proposalId: string;
  tenantId: string;
  projectId: string;
  status: ProposalStatus;
  clientName: string;
  professionalName: string;
  professionalRole: ArchitexRole;
  calculator: CalculatorDefinition;
  calculationInput: CalculationInput;
  calculationResult: CalculationResult;
  scopeOfServices: string[];
  deliverables: string[];
  assumptions: string[];
  exclusions: string[];
  terms: TermsTemplate[];
  validUntil: string;
  supersedesProposalId?: string;
}

// ── Integration & Persistence Types ──────────────────────────────────────────

export interface ProjectRecord {
  id: string;
  tenantId: string;
  projectId: string;
  phase: ProjectPhase;
  moduleKey: 'toolboxes';
  recordType:
    | 'proposal'
    | 'scope_baseline'
    | 'fee_calculation_snapshot'
    | 'terms_snapshot'
    | 'professional_appointment_draft';
  title: string;
  status: 'draft' | 'pending_review' | 'issued' | 'superseded';
  payload: Record<string, unknown>;
  approvals: {
    required: boolean;
    pendingRoles?: ArchitexRole[];
    approvedBy?: string[];
  };
  audit: {
    createdBy: string;
    createdAt: string;
    supersedesRecordId?: string;
  };
  linkedRecordIds: string[];
}

export interface DocumentOutput {
  documentId: string;
  projectId: string;
  title: string;
  documentType: 'proposal';
  status: 'draft' | 'issued' | 'superseded';
  revision: string;
  linkedProposalId: string;
}

export interface WorkflowEvent {
  id: string;
  type: 'approval_required' | 'document_updated' | 'task_overdue' | 'risk_detected';
  projectId: string;
  title: string;
  detail: string;
  priority: Priority;
  sourceModule: 'toolboxes';
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
  relatedRoute: string;
  requiresHumanApproval: boolean;
}
