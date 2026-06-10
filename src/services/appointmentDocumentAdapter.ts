// Pack 5: Appointment Document Adapter
// Creates document placeholders referencing exact revision IDs from the appointment.
// All documents are traceable to their source snapshots for audit integrity.

import type {
  KickoffAppointmentRecord,
  DocumentOutput,
  ProjectWorkspace,
} from '../types/appointmentKickoff';

export function createAppointmentDocumentOutputs(
  workspace: ProjectWorkspace,
  appointment: KickoffAppointmentRecord,
): DocumentOutput[] {
  const revision = `appointment-rev-${appointment.revision}`;

  return [
    {
      documentId: `doc-${workspace.projectId}-proposal`,
      projectId: workspace.projectId,
      title: 'Accepted Proposal PDF',
      kind: 'proposal_pdf',
      status: 'placeholder',
      sourceRevisionId: appointment.proposalSnapshot.proposalRevisionId,
    },
    {
      documentId: `doc-${workspace.projectId}-acceptance`,
      projectId: workspace.projectId,
      title: 'Client Acceptance Record',
      kind: 'client_acceptance',
      status: 'ready_to_generate',
      sourceRevisionId: appointment.proposalSnapshot.clientAcceptanceId,
    },
    {
      documentId: `doc-${workspace.projectId}-terms`,
      projectId: workspace.projectId,
      title: 'Accepted Terms Snapshot',
      kind: 'terms_snapshot',
      status: 'ready_to_generate',
      sourceRevisionId: appointment.proposalSnapshot.termsSnapshotId,
    },
    {
      documentId: `doc-${workspace.projectId}-appointment-letter`,
      projectId: workspace.projectId,
      title: 'Appointment Letter Draft',
      kind: 'appointment_letter_draft',
      status: 'requires_human_approval',
      sourceRevisionId: revision,
    },
    {
      documentId: `doc-${workspace.projectId}-brief`,
      projectId: workspace.projectId,
      title: 'Project Brief Draft',
      kind: 'project_brief',
      status: 'placeholder',
      sourceRevisionId: revision,
    },
    {
      documentId: `doc-${workspace.projectId}-kickoff`,
      projectId: workspace.projectId,
      title: 'Kickoff Checklist',
      kind: 'kickoff_checklist',
      status: 'ready_to_generate',
      sourceRevisionId: revision,
    },
  ];
}
