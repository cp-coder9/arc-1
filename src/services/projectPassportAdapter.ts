// ─── Pack 5: Project Passport Adapter ─────────────────────────────────────
// Bridges the appointment/kickoff domain into Project Passport.

import type { ProjectPassport, ProjectMetadata } from "@/services/lifecycleTypes";
import type { AppointmentRecord, ProjectFacts } from "@/services/appointmentService";
import type { ProjectPassportBaseline } from "@/services/kickoffService";

// Minimal workspace shape accepted by this adapter — compatible with
// both Pack 5's ProjectWorkspace (from kickoffService) and the
// pre-existing appointmentKickoff types.
export interface WorkspaceBaselineInput {
  projectId: string;
  appointmentId: string;
}

/**
 * Create a Project Passport baseline record from an accepted appointment.
 * Integrates appointment facts into the wider Project Passport / Lifecycle system.
 */
export function createProjectPassportBaseline(
  workspace: WorkspaceBaselineInput,
  appointment: AppointmentRecord
): ProjectPassportBaseline {
  const complianceContext = [
    "NBR/SANS 10400 awareness required for later technical compliance checks.",
    "Municipal submission readiness depends on verified property, zoning and appointment scope facts.",
    "Professional responsibility remains with the appointed professional; agent outputs are recommendations only."
  ];
  if (!appointment.projectFacts.landUseOrZoningKnown) {
    complianceContext.push("Land-use/zoning not yet confirmed; route to missing-information workflow.");
  }
  return {
    passportId: `passport-${workspace.projectId}`,
    projectId: workspace.projectId,
    appointmentId: appointment.appointmentId,
    facts: {
      ...appointment.projectFacts,
      projectName: appointment.proposalSnapshot.projectName,
      clientName: appointment.proposalSnapshot.clientName,
      professionalName: appointment.proposalSnapshot.professionalName,
      appointmentStatus: appointment.status
    },
    complianceContext
  };
}

/**
 * Convert appointment facts into a lifecycle-compatible ProjectPassport shape.
 * This can be used to seed or update the project's passport in the Lifecycle Engine.
 */
export function projectFactsToPassport(
  facts: ProjectFacts,
  metadata: ProjectMetadata
): Partial<ProjectPassport> {
  return {
    tenantId: metadata.tenantId,
    projectId: metadata.projectId,
    projectName: metadata.projectName,
    clientName: metadata.clientName,
    municipality: facts.municipality ?? metadata.municipality,
    propertyReference: facts.erfNumber ?? metadata.propertyReference,
    landUseNotes: facts.landUseOrZoningKnown !== undefined
      ? (facts.landUseOrZoningKnown ? "Land-use/zoning confirmed" : "Land-use/zoning not yet confirmed")
      : metadata.landUseNotes
  };
}
