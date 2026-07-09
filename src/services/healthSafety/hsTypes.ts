/**
 * Health & Safety Module Type Definitions
 *
 * Core interfaces for the Construction Regulations 2014 workflow system.
 * Grounded in OHS Act 85 of 1993 and Construction Regulations 2014.
 */

// ─── Safety File Builder ────────────────────────────────────────────────────

export interface SafetyFileSection {
  sectionId: string;
  title: string;
  regulationRef: string;
  status: 'complete' | 'incomplete' | 'expired' | 'not_applicable';
  lastUpdated?: string;
  updatedBy?: string;
  version: number;
  linkedRecordIds: string[];
}

export interface SafetyFile {
  id: string;
  projectId: string;
  tenantId: string;
  sections: SafetyFileSection[];
  complianceScore: number;
  createdAt: string;
  updatedAt: string;
}

// ─── H&S Plan Workflow ──────────────────────────────────────────────────────

export type HSPlanState = 'draft' | 'submitted' | 'pending_approval' | 'approved' | 'rejected';

export interface HSPlan {
  id: string;
  projectId: string;
  version: number;
  state: HSPlanState;
  submittedBy: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReasons?: string[];
  documentUrl?: string;
}

// ─── HIRA Engine ────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface HazardEntry {
  id: string;
  projectId: string;
  description: string;
  activity: string;
  location: string;
  likelihood: 1 | 2 | 3 | 4 | 5;
  severity: 1 | 2 | 3 | 4 | 5;
  riskRating: number;
  residualRisk: RiskLevel;
  existingControls: string[];
  additionalControls: string[];
  responsiblePerson: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Permit System ──────────────────────────────────────────────────────────

export type PermitType = 'excavation' | 'scaffolding' | 'hot_work' | 'confined_space';

export type PermitState = 'draft' | 'submitted' | 'approved' | 'active' | 'expired' | 'closed' | 'rejected';

export interface Permit {
  id: string;
  projectId: string;
  type: PermitType;
  location: string;
  hazards: string[];
  precautions: string[];
  responsiblePersons: string[];
  requestedBy: string;
  approvedBy?: string;
  validFrom?: string;
  validTo?: string;
  state: PermitState;
  closeOutBy?: string;
  closeOutAt?: string;
  closeOutConditionsMet?: boolean;
  linkedFallProtectionPlanId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Incident Reporter ──────────────────────────────────────────────────────

export type InjuryClassification = 'first_aid' | 'medical_treatment' | 'lost_time' | 'fatality';

export type IncidentState = 'reported' | 'under_investigation' | 'corrective_actions' | 'closed';

export interface CorrectiveAction {
  id: string;
  description: string;
  assignedTo: string;
  dueDate: string;
  completedAt?: string;
  status: 'open' | 'overdue' | 'completed';
}

export interface Incident {
  id: string;
  projectId: string;
  date: string;
  time: string;
  location: string;
  personsInvolved: string[];
  injuryClassification: InjuryClassification;
  description: string;
  immediateActions: string;
  isSection24Notifiable: boolean;
  state: IncidentState;
  investigatorId?: string;
  rootCause?: string;
  correctiveActions: CorrectiveAction[];
  reportedBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Induction Tracker ──────────────────────────────────────────────────────

export type InductionType = 'site' | 'task_specific' | 'visitor';

export interface ToolboxTalk {
  id: string;
  projectId: string;
  date: string;
  topic: string;
  presenter: string;
  duration: number;
  attendees: string[];
  createdAt: string;
}

export interface Induction {
  id: string;
  projectId: string;
  inducteeId: string;
  inducteeName: string;
  type: InductionType;
  date: string;
  acknowledged: boolean;
  conductedBy: string;
  createdAt: string;
}

// ─── Fall Protection Service ────────────────────────────────────────────────

export type FallProtectionMethod = 'guardrails' | 'safety_nets' | 'harnesses' | 'exclusion_zones';

export interface InspectionSchedule {
  frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly';
  nextDue: string;
  lastCompleted?: string;
}

export interface FallProtectionPlan {
  id: string;
  projectId: string;
  methods: FallProtectionMethod[];
  workAreas: string[];
  responsiblePersons: string[];
  inspectionSchedule: InspectionSchedule;
  approvedAt?: string;
  approvedBy?: string;
  expiresAt?: string;
  linkedPermitIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Client Specification Engine ────────────────────────────────────────────

export interface ClientHSSpecification {
  id: string;
  projectId: string;
  projectDescription: string;
  scopeOfWork: string;
  knownHazards: string[];
  minimumHSRequirements: string[];
  complianceMonitoringArrangements: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Designer Risk Capture ──────────────────────────────────────────────────

export interface DesignerRiskAssessment {
  id: string;
  projectId: string;
  designDiscipline: string;
  hazardDescription: string;
  associatedDesignElement: string;
  riskLevel: RiskLevel;
  recommendedControls: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
