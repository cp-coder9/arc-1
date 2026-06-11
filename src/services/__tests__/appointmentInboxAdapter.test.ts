// Pack 5: Appointment Inbox Adapter Tests

import { describe, expect, it } from 'vitest';
import { createKickoffInboxEvents } from '../appointmentInboxAdapter';
import type {
  KickoffAppointmentRecord,
  KickoffPackage,
} from '../../types/appointmentKickoff';

// ── Test fixtures ───────────────────────────────────────────────────────────────

const workspace = {
  projectId: 'project-appt-prop-architect-002',
  appointmentId: 'appt-prop-architect-002',
  projectName: 'Parkview Alterations and Additions',
  clientId: 'client-urban-family-trust',
  professionalId: 'pro-demo-architect',
  phase: 'appointment_confirmed' as const,
  roles: [
    { userId: 'client-urban-family-trust', role: 'client' as const },
    { userId: 'pro-demo-architect', role: 'lead_professional' as const },
  ],
};

const baseAppointment: KickoffAppointmentRecord = {
  appointmentId: 'appt-prop-architect-002',
  proposalSnapshot: {
    proposalId: 'prop-architect-002',
    proposalRevisionId: 'rev-002',
    acceptedAtIso: '2026-06-04T09:15:00.000Z',
    clientAcceptanceId: 'accept-001',
    clientId: 'client-urban-family-trust',
    clientName: 'Urban Family Trust',
    professionalId: 'pro-demo-architect',
    professionalName: 'Demo Architect PrArch',
    companyName: 'Demo Architects Inc.',
    projectName: 'Parkview Alterations and Additions',
    scopeSnapshotId: 'scope-snap-002',
    termsSnapshotId: 'terms-snap-002',
    feeSnapshotId: 'fee-snap-002',
    acceptedTotal: { currency: 'ZAR', amount: 393335 },
    immutabilityHash: 'sha256-test',
  },
  projectFacts: {
    municipality: 'City of Johannesburg',
    province: 'Gauteng',
  },
  status: 'confirmed',
  revision: 1,
  createdAtIso: '2026-06-04T10:00:00.000Z',
  professionalConfirmedAtIso: '2026-06-04T10:05:00.000Z',
  requiresHumanApprovalBeforeFormalIssue: false,
  missingFacts: [],
};

function makePackage(
  appointment: KickoffAppointmentRecord,
  readiness: 'blocked' | 'ready' = 'ready',
): KickoffPackage {
  return {
    workspace: { ...workspace, projectId: `project-${appointment.appointmentId}` },
    passport: {
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
      complianceContext: [],
    },
    checklist: [],
    initialTasks: [],
    readiness,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('createKickoffInboxEvents', () => {
  it('always includes proposal-accepted and confirmation-required events', () => {
    const pkg = makePackage(baseAppointment);
    const events = createKickoffInboxEvents(baseAppointment, pkg);

    expect(
      events.some((e) => e.title.includes('Client accepted proposal')),
    ).toBe(true);
    expect(
      events.some((e) => e.title.includes('Professional confirmation required')),
    ).toBe(true);
  });

  it('creates kickoff_ready event when readiness is "ready"', () => {
    const pkg = makePackage(baseAppointment, 'ready');
    const events = createKickoffInboxEvents(baseAppointment, pkg);

    expect(events.some((e) => e.severity === 'info' && e.title.includes('ready for team action'))).toBe(true);
  });

  it('does NOT create kickoff_ready event when readiness is "blocked"', () => {
    const pkg = makePackage(baseAppointment, 'blocked');
    const events = createKickoffInboxEvents(baseAppointment, pkg);

    expect(events.some((e) => e.title.includes('ready for team action'))).toBe(false);
  });

  it('creates blocked event when missing facts exist', () => {
    const apptWithMissing: KickoffAppointmentRecord = {
      ...baseAppointment,
      missingFacts: ['Municipality is required.', 'Province is required.'],
    };
    const pkg = makePackage(apptWithMissing, 'blocked');
    const events = createKickoffInboxEvents(apptWithMissing, pkg);

    const blockedEvent = events.find((e) => e.severity === 'blocked');
    expect(blockedEvent).toBeDefined();
    expect(blockedEvent!.title).toContain('2 project facts are missing');
    expect(blockedEvent!.recipientRole).toBe('client');
  });

  it('creates awaiting-client-acceptance event when no client acceptance', () => {
    const apptNoAcceptance: KickoffAppointmentRecord = {
      ...baseAppointment,
      proposalSnapshot: {
        ...baseAppointment.proposalSnapshot,
        clientAcceptanceId: '',
      },
    };
    const pkg = makePackage(apptNoAcceptance, 'blocked');
    const events = createKickoffInboxEvents(apptNoAcceptance, pkg);

    expect(
      events.some(
        (e) =>
          e.recipientRole === 'client' &&
          e.title.includes('Client acceptance is required'),
      ),
    ).toBe(true);
  });

  it('creates awaiting-professional-confirmation event when not yet confirmed', () => {
    const apptPending: KickoffAppointmentRecord = {
      ...baseAppointment,
      status: 'pending_professional_confirmation',
      professionalConfirmedAtIso: undefined,
    };
    const pkg = makePackage(apptPending, 'blocked');
    const events = createKickoffInboxEvents(apptPending, pkg);

    expect(
      events.some(
        (e) =>
          e.recipientRole === 'lead_professional' &&
          e.title.includes('awaiting professional confirmation'),
      ),
    ).toBe(true);
  });

  it('all events reference the correct project ID', () => {
    const pkg = makePackage(baseAppointment);
    const events = createKickoffInboxEvents(baseAppointment, pkg);

    expect(events.every((e) => e.projectId === pkg.workspace.projectId)).toBe(true);
  });

  it('all events have unique eventIds', () => {
    const pkg = makePackage(baseAppointment);
    const events = createKickoffInboxEvents(baseAppointment, pkg);

    const ids = events.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('events have correct severity levels', () => {
    const pkg = makePackage(baseAppointment);
    const events = createKickoffInboxEvents(baseAppointment, pkg);

    for (const event of events) {
      expect(['info', 'action_required', 'blocked']).toContain(event.severity);
    }
  });
});
