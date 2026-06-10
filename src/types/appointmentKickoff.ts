// Pack 5: Appointment & Project Kickoff — Type Definitions
// Mirrors the pack specification with adaptations for arc-1 integration

export type AppointmentKickoffStatus =
  | 'draft'
  | 'pending_professional_confirmation'
  | 'confirmed'
  | 'revision_required';

export type KickoffReadiness = 'blocked' | 'ready';

export type AppointmentProjectPhase =
  | 'pre_appointment'
  | 'appointment_confirmed'
  | 'inception'
  | 'concept_design'
  | 'municipal_submission_readiness';

export interface MoneyAmount {
  currency: 'ZAR';
  amount: number;
}

/** Immutable snapshot of the accepted proposal from the proposal builder (Pack 4).
 *  Once created, this snapshot MUST NOT be mutated — changes create revisions. */
export interface AcceptedProposalSnapshot {
  proposalId: string;
  proposalRevisionId: string;
  acceptedAtIso: string;
  clientAcceptanceId: string;
  clientId: string;
  clientName: string;
  professionalId: string;
  professionalName: string;
  companyName: string;
  projectName: string;
  scopeSnapshotId: string;
  termsSnapshotId: string;
  feeSnapshotId: string;
  acceptedTotal: MoneyAmount;
  sourceCalculatorVersion?: string;
  immutabilityHash: string;
}

/** Project facts collected during the kickoff process.
 *  Some are required; missing facts block kickoff readiness. */
export interface ProjectFacts {
  propertyDescription?: string;
  erfNumber?: string;
  municipality?: string;
  province?: string;
  landUseOrZoningKnown?: boolean;
  professionalBody?: string;
  professionalRegistrationNumber?: string;
}

/** The auditable appointment wrapper around accepted scope, terms, fees,
 *  client acceptance, and professional confirmation.
 *  Named KickoffAppointmentRecord to avoid collision with the existing
 *  AppointmentRecord in appointmentWorkflowService.ts. */
export interface KickoffAppointmentRecord {
  appointmentId: string;
  proposalSnapshot: AcceptedProposalSnapshot;
  projectFacts: ProjectFacts;
  status: AppointmentKickoffStatus;
  revision: number;
  createdAtIso: string;
  professionalConfirmedAtIso?: string;
  requiresHumanApprovalBeforeFormalIssue: boolean;
  missingFacts: string[];
}

/** The live Architex project shell created or linked after appointment. */
export interface ProjectWorkspace {
  projectId: string;
  appointmentId: string;
  projectName: string;
  clientId: string;
  professionalId: string;
  phase: AppointmentProjectPhase;
  roles: Array<{ userId: string; role: 'client' | 'lead_professional' | 'team_member' }>;
}

/** The first project truth baseline derived from the appointment and project facts.
 *  Maps into Pack 2's passport structure. */
export interface ProjectPassportBaseline {
  passportId: string;
  projectId: string;
  appointmentId: string;
  facts: ProjectFacts & {
    projectName: string;
    clientName: string;
    professionalName: string;
    appointmentStatus: AppointmentKickoffStatus;
  };
  complianceContext: string[];
}

/** A single item in the 7-gate kickoff readiness checklist. */
export interface KickoffChecklistItem {
  id: string;
  label: string;
  ownerRole: 'client' | 'lead_professional' | 'platform_agent';
  required: boolean;
  completed: boolean;
}

export interface InitialTask {
  id: string;
  title: string;
  phase: AppointmentProjectPhase;
  ownerRole: string;
}

/** The complete kickoff package: workspace + passport + checklist + tasks + readiness. */
export interface KickoffPackage {
  workspace: ProjectWorkspace;
  passport: ProjectPassportBaseline;
  checklist: KickoffChecklistItem[];
  initialTasks: InitialTask[];
  readiness: KickoffReadiness;
}

export interface DocumentOutput {
  documentId: string;
  projectId: string;
  title: string;
  kind:
    | 'proposal_pdf'
    | 'client_acceptance'
    | 'terms_snapshot'
    | 'appointment_letter_draft'
    | 'project_brief'
    | 'kickoff_checklist';
  status: 'placeholder' | 'requires_human_approval' | 'ready_to_generate';
  sourceRevisionId: string;
}

export interface InboxEvent {
  eventId: string;
  projectId: string;
  recipientRole: 'client' | 'lead_professional' | 'team';
  title: string;
  severity: 'info' | 'action_required' | 'blocked';
}

export interface AuditRecord {
  auditId: string;
  entityId: string;
  action: string;
  actor: string;
  atIso: string;
  notes: string;
}

export interface AgentRecommendation {
  id: string;
  title: string;
  rationale: string;
  requiresHumanApproval: boolean;
}
