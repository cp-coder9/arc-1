// Pack 5: Project Passport Adapter
// Maps appointment facts into the Project Passport baseline (Pack 2 integration).
// The passport becomes the single source of truth for the project lifecycle.

import type {
  KickoffAppointmentRecord,
  ProjectPassportBaseline,
  ProjectWorkspace,
} from '../types/appointmentKickoff';

export function createProjectPassportBaseline(
  workspace: ProjectWorkspace,
  appointment: KickoffAppointmentRecord,
): ProjectPassportBaseline {
  const complianceContext: string[] = [
    'NBR/SANS 10400 awareness required for later technical compliance checks.',
    'Municipal submission readiness depends on verified property, zoning and appointment scope facts.',
    'Professional responsibility remains with the appointed professional; agent outputs are recommendations only.',
  ];

  if (!appointment.projectFacts.landUseOrZoningKnown) {
    complianceContext.push(
      'Land-use/zoning not yet confirmed; route to missing-information workflow.',
    );
  }

  if (appointment.missingFacts.length > 0) {
    complianceContext.push(
      `Project has ${appointment.missingFacts.length} missing fact(s) that may affect downstream compliance: ${appointment.missingFacts.join('; ')}`,
    );
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
      appointmentStatus: appointment.status,
    },
    complianceContext,
  };
}
