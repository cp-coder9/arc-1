// Pack 5: Appointment Inbox Event Adapter
// Creates inbox events to notify relevant parties about appointment and kickoff state.
// Events fire on state transitions: proposal accepted → appointment created →
// professional confirmation pending → kickoff ready or blocked.

import type {
  KickoffAppointmentRecord,
  InboxEvent,
  KickoffPackage,
} from '../types/appointmentKickoff';

export function createKickoffInboxEvents(
  appointment: KickoffAppointmentRecord,
  kickoff: KickoffPackage,
): InboxEvent[] {
  const events: InboxEvent[] = [
    {
      eventId: `evt-${appointment.appointmentId}-accepted`,
      projectId: kickoff.workspace.projectId,
      recipientRole: 'lead_professional',
      title:
        'Client accepted proposal. Create appointment and project kickoff.',
      severity: 'info',
    },
    {
      eventId: `evt-${appointment.appointmentId}-confirm`,
      projectId: kickoff.workspace.projectId,
      recipientRole: 'lead_professional',
      title:
        'Professional confirmation required before formal appointment issue.',
      severity: 'action_required',
    },
  ];

  // appointment_awaiting_client_acceptance
  if (!appointment.proposalSnapshot.clientAcceptanceId) {
    events.push({
      eventId: `evt-${appointment.appointmentId}-awaiting-client`,
      projectId: kickoff.workspace.projectId,
      recipientRole: 'client',
      title:
        'Client acceptance is required before the appointment can proceed.',
      severity: 'action_required',
    });
  }

  // appointment_awaiting_professional_confirmation
  if (
    appointment.status === 'pending_professional_confirmation' &&
    !appointment.professionalConfirmedAtIso
  ) {
    events.push({
      eventId: `evt-${appointment.appointmentId}-awaiting-pro`,
      projectId: kickoff.workspace.projectId,
      recipientRole: 'lead_professional',
      title:
        'Appointment is awaiting professional confirmation before it can be formally issued.',
      severity: 'action_required',
    });
  }

  // kickoff_blocked_missing_facts
  if (appointment.missingFacts.length > 0) {
    events.push({
      eventId: `evt-${appointment.appointmentId}-missing`,
      projectId: kickoff.workspace.projectId,
      recipientRole: 'client',
      title: `${appointment.missingFacts.length} project facts are missing for kickoff readiness.`,
      severity: 'blocked',
    });
  }

  // kickoff_ready
  if (kickoff.readiness === 'ready') {
    events.push({
      eventId: `evt-${appointment.appointmentId}-ready`,
      projectId: kickoff.workspace.projectId,
      recipientRole: 'team',
      title: 'Project kickoff checklist is ready for team action.',
      severity: 'info',
    });
  }

  return events;
}
