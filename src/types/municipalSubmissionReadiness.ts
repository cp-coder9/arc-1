/**
 * Municipal Submission Readiness Types
 * Pack 6: architex-municipal-submission-readiness-pack
 *
 * Trigger-based professional routing, readiness scoring across 8 categories,
 * evidence pack assembly, and inbox events for municipal submission workflow.
 */

// ── Disciplines ────────────────────────────────────────────
export type SubmissionDiscipline =
  | 'client'
  | 'lead_professional'
  | 'architect'
  | 'structural_engineer'
  | 'civil_engineer'
  | 'fire_consultant'
  | 'energy_consultant'
  | 'town_planner'
  | 'land_surveyor'
  | 'quantity_surveyor'
  | 'heritage_practitioner'
  | 'environmental_practitioner'
  | 'traffic_engineer'
  | 'municipal_coordinator';

// ── Complexity ─────────────────────────────────────────────
export type ProjectComplexity = 'low' | 'medium' | 'high';

export interface ComplexityAssessment {
  complexity: ProjectComplexity;
  triggers: string[];
  assessedAt: string;
}

// ── Professional Team Routing ──────────────────────────────
export type RoutingStatus = 'required' | 'optional' | 'not_currently_required';

export interface ProfessionalRoutingDecision {
  discipline: SubmissionDiscipline;
  status: RoutingStatus;
  reason: string;
  approvalRequired: boolean;
}

// ── Readiness Checks ───────────────────────────────────────
export type CheckStatus =
  | 'complete'
  | 'missing'
  | 'requires_professional_review'
  | 'not_applicable';

export type ReadinessCategory =
  | 'property_and_municipal_facts'
  | 'land_use_and_zoning'
  | 'professional_team'
  | 'nbr_sans_advisory_precheck'
  | 'drawing_register'
  | 'supporting_documents'
  | 'professional_signoffs'
  | 'client_authority';

export interface ReadinessCheck {
  id: string;
  category: ReadinessCategory;
  label: string;
  status: CheckStatus;
  owner: SubmissionDiscipline;
}

// ── Project Scope Facts ────────────────────────────────────
export interface ProjectScopeFacts {
  projectId: string;
  projectName: string;
  municipality?: string;
  province?: string;
  propertyDescription?: string;
  erfNumber?: string;
  zoningKnown: boolean;
  occupancyType:
    | 'single_residential'
    | 'multi_residential'
    | 'commercial'
    | 'public_assembly'
    | 'mixed_use';
  alterationToExisting: boolean;
  additions: boolean;
  newBuild: boolean;
  changesLoadBearing: boolean;
  changesDrainageOrStormwater: boolean;
  publicAccessOrAssembly: boolean;
  envelopeEnergyImpact: boolean;
  coverageOrParkingRisk: boolean;
  boundaryOrServitudeUnclear: boolean;
  heritagePotential: boolean;
  environmentalSensitivity: boolean;
  trafficImpact: boolean;
  estimatedConstructionValueZar: number;
  drawingRegister: DrawingRegisterItem[];
  supportingDocuments: SupportingDocument[];
}

export interface DrawingRegisterItem {
  kind:
    | 'site_plan'
    | 'floor_plan'
    | 'elevation'
    | 'section'
    | 'schedule'
    | 'fire_plan'
    | 'structural_drawing'
    | 'drainage_layout'
    | 'energy_calculation';
  revision: string;
  status: 'draft' | 'checked' | 'signed_off';
}

export interface SupportingDocument {
  kind:
    | 'title_deed'
    | 'sg_diagram'
    | 'zoning_certificate'
    | 'client_authority'
    | 'appointment_record'
    | 'heritage_comment'
    | 'traffic_comment'
    | 'environmental_comment';
  status: 'available' | 'missing' | 'requested';
}

// ── Readiness Assessment ───────────────────────────────────
export interface ReadinessAssessment {
  score: number;
  readyForProfessionalSubmissionReview: boolean;
  blockers: string[];
  checks: ReadinessCheck[];
  categoryScores: Record<ReadinessCategory, { total: number; complete: number; score: number }>;
}

// ── Evidence Pack ──────────────────────────────────────────
export interface EvidencePackItem {
  id: string;
  title: string;
  source: string;
  status: 'included' | 'placeholder' | 'blocked';
}

// ── Inbox Events ───────────────────────────────────────────
export interface SubmissionInboxEvent {
  id: string;
  recipient: SubmissionDiscipline;
  title: string;
  severity: 'info' | 'action_required' | 'blocked';
}

// ── Agent Recommendations ─────────────────────────────────
export interface SubmissionAgentRecommendation {
  id: string;
  title: string;
  rationale: string;
  requiresHumanApproval: boolean;
}

// ── Audit ──────────────────────────────────────────────────
export interface SubmissionAuditRecord {
  id: string;
  action: string;
  actor: 'system' | 'agent' | 'professional';
  notes: string;
  timestamp: string;
}

// ── Unified Submission Readiness Result ────────────────────
export interface MunicipalSubmissionReadinessResult {
  projectId: string;
  projectName: string;
  assessedAt: string;
  complexity: ComplexityAssessment;
  professionalRoutes: ProfessionalRoutingDecision[];
  checks: ReadinessCheck[];
  readiness: ReadinessAssessment;
  evidencePack: EvidencePackItem[];
  inboxEvents: SubmissionInboxEvent[];
  recommendations: SubmissionAgentRecommendation[];
  auditTrail: SubmissionAuditRecord[];
}
