// ─── Pack 5: Appointment & Project Kickoff — Shared Inline Types ───────────

export type AppointmentStatus = "draft" | "pending_professional_confirmation" | "confirmed" | "revision_required";
export type KickoffReadiness = "blocked" | "ready";

export interface MoneyAmount {
  currency: "ZAR";
  amount: number;
}

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

export interface ProjectFacts {
  propertyDescription?: string;
  erfNumber?: string;
  municipality?: string;
  province?: string;
  landUseOrZoningKnown?: boolean;
  professionalBody?: string;
  professionalRegistrationNumber?: string;
}

export interface AppointmentRecord {
  appointmentId: string;
  proposalSnapshot: AcceptedProposalSnapshot;
  projectFacts: ProjectFacts;
  status: AppointmentStatus;
  revision: number;
  createdAtIso: string;
  professionalConfirmedAtIso?: string;
  requiresHumanApprovalBeforeFormalIssue: boolean;
  missingFacts: string[];
}

// ─── Service Functions ─────────────────────────────────────────────────────

const requiredFactLabels: Array<[keyof ProjectFacts, string]> = [
  ["municipality", "Municipality is required for project and later submission readiness."],
  ["province", "Province is required for South African jurisdiction context."],
  ["propertyDescription", "Property description is required unless erf number is sufficient."],
  ["professionalBody", "Professional body should be recorded for appointment responsibility context."],
  ["professionalRegistrationNumber", "Professional registration number should be captured where applicable."]
];

export function findMissingFacts(facts: ProjectFacts): string[] {
  const missing = requiredFactLabels
    .filter(([key]) => !facts[key])
    .map(([, label]) => label);
  if (!facts.propertyDescription && !facts.erfNumber) {
    missing.push("Either a property description or erf number is required.");
  }
  return Array.from(new Set(missing));
}

export function createAppointmentFromAcceptedProposal(input: {
  proposal: AcceptedProposalSnapshot;
  projectFacts: ProjectFacts;
  nowIso: string;
}): AppointmentRecord {
  if (!input.proposal.clientAcceptanceId) {
    throw new Error("Cannot create appointment without client acceptance.");
  }
  if (!input.proposal.scopeSnapshotId || !input.proposal.termsSnapshotId || !input.proposal.feeSnapshotId) {
    throw new Error("Cannot create appointment without scope, terms and fee snapshots.");
  }
  const missingFacts = findMissingFacts(input.projectFacts);
  return {
    appointmentId: `appt-${input.proposal.proposalId}`,
    proposalSnapshot: { ...input.proposal },
    projectFacts: { ...input.projectFacts },
    status: "pending_professional_confirmation",
    revision: 1,
    createdAtIso: input.nowIso,
    requiresHumanApprovalBeforeFormalIssue: true,
    missingFacts
  };
}

export function confirmProfessionalAppointment(appointment: AppointmentRecord, nowIso: string): AppointmentRecord {
  return {
    ...appointment,
    status: appointment.missingFacts.length === 0 ? "confirmed" : "pending_professional_confirmation",
    professionalConfirmedAtIso: nowIso
  };
}

export function reviseAppointment(appointment: AppointmentRecord, reason: string): AppointmentRecord {
  if (!reason.trim()) throw new Error("Appointment revision requires a reason.");
  return {
    ...appointment,
    appointmentId: `${appointment.appointmentId}-rev-${appointment.revision + 1}`,
    revision: appointment.revision + 1,
    status: "revision_required",
    requiresHumanApprovalBeforeFormalIssue: true
  };
}
