// Pack 5: Appointment Audit Service
// Creates immutable audit trail records for the appointment and kickoff workflow.
// Every state transition — proposal snapshot, appointment creation, workspace creation —
// is recorded for compliance and traceability.

import type {
  KickoffAppointmentRecord,
  AuditRecord,
  KickoffPackage,
} from '../types/appointmentKickoff';

export function createAppointmentAuditTrail(
  appointment: KickoffAppointmentRecord,
  kickoff: KickoffPackage,
  nowIso: string,
): AuditRecord[] {
  const records: AuditRecord[] = [
    {
      auditId: `audit-${appointment.appointmentId}-snapshot`,
      entityId: appointment.appointmentId,
      action: 'accepted_proposal_snapshotted',
      actor: 'system',
      atIso: nowIso,
      notes: `Proposal ${appointment.proposalSnapshot.proposalId} revision ${appointment.proposalSnapshot.proposalRevisionId} snapshotted with immutability hash ${appointment.proposalSnapshot.immutabilityHash}.`,
    },
    {
      auditId: `audit-${appointment.appointmentId}-appointment`,
      entityId: appointment.appointmentId,
      action: 'appointment_created',
      actor: 'system',
      atIso: nowIso,
      notes: `Appointment record created from accepted proposal. Status: ${appointment.status}. Revision: ${appointment.revision}.`,
    },
    {
      auditId: `audit-${kickoff.workspace.projectId}-workspace`,
      entityId: kickoff.workspace.projectId,
      action: 'project_workspace_created',
      actor: 'system',
      atIso: nowIso,
      notes: `Workspace created for project "${kickoff.workspace.projectName}" with readiness: ${kickoff.readiness}. Phase: ${kickoff.workspace.phase}.`,
    },
  ];

  if (appointment.professionalConfirmedAtIso) {
    records.push({
      auditId: `audit-${appointment.appointmentId}-pro-confirmed`,
      entityId: appointment.appointmentId,
      action: 'professional_confirmed_appointment',
      actor: appointment.proposalSnapshot.professionalId,
      atIso: appointment.professionalConfirmedAtIso,
      notes: `Professional ${appointment.proposalSnapshot.professionalName} confirmed appointment responsibility at revision ${appointment.revision}.`,
    });
  }

  if (appointment.missingFacts.length > 0) {
    records.push({
      auditId: `audit-${appointment.appointmentId}-missing-facts`,
      entityId: appointment.appointmentId,
      action: 'kickoff_blocked_missing_facts',
      actor: 'system',
      atIso: nowIso,
      notes: `${appointment.missingFacts.length} missing fact(s) blocking kickoff: ${appointment.missingFacts.join('; ')}`,
    });
  }

  return records;
}
