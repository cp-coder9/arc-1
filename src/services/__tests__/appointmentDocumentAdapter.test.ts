// Pack 5: Appointment Document Adapter Tests

import { describe, expect, it } from 'vitest';
import { createAppointmentDocumentOutputs } from '../appointmentDocumentAdapter';
import type {
  KickoffAppointmentRecord,
  ProjectWorkspace,
} from '../../types/appointmentKickoff';

// ── Test fixtures ───────────────────────────────────────────────────────────────

const workspace: ProjectWorkspace = {
  projectId: 'project-appt-prop-architect-002',
  appointmentId: 'appt-prop-architect-002',
  projectName: 'Parkview Alterations and Additions',
  clientId: 'client-urban-family-trust',
  professionalId: 'pro-demo-architect',
  phase: 'appointment_confirmed',
  roles: [
    { userId: 'client-urban-family-trust', role: 'client' },
    { userId: 'pro-demo-architect', role: 'lead_professional' },
  ],
};

const appointment: KickoffAppointmentRecord = {
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
  requiresHumanApprovalBeforeFormalIssue: false,
  missingFacts: [],
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('createAppointmentDocumentOutputs', () => {
  it('creates exactly 6 document placeholders', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    expect(docs).toHaveLength(6);
  });

  it('all documents belong to the correct project', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    expect(docs.every((d) => d.projectId === workspace.projectId)).toBe(true);
  });

  it('each document has a unique documentId', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    const ids = docs.map((d) => d.documentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes all required document kinds', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    const kinds = docs.map((d) => d.kind);
    expect(kinds).toContain('proposal_pdf');
    expect(kinds).toContain('client_acceptance');
    expect(kinds).toContain('terms_snapshot');
    expect(kinds).toContain('appointment_letter_draft');
    expect(kinds).toContain('project_brief');
    expect(kinds).toContain('kickoff_checklist');
  });

  it('uses the correct revision ID format', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    const appointmentLetter = docs.find(
      (d) => d.kind === 'appointment_letter_draft',
    );
    expect(appointmentLetter?.sourceRevisionId).toBe('appointment-rev-1');
  });

  it('references snapshot IDs for proposal-derived documents', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    const proposalDoc = docs.find((d) => d.kind === 'proposal_pdf');
    expect(proposalDoc?.sourceRevisionId).toBe('rev-002');

    const acceptanceDoc = docs.find((d) => d.kind === 'client_acceptance');
    expect(acceptanceDoc?.sourceRevisionId).toBe('accept-001');

    const termsDoc = docs.find((d) => d.kind === 'terms_snapshot');
    expect(termsDoc?.sourceRevisionId).toBe('terms-snap-002');
  });

  it('appointment letter requires human approval', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    const appointmentLetter = docs.find(
      (d) => d.kind === 'appointment_letter_draft',
    );
    expect(appointmentLetter?.status).toBe('requires_human_approval');
  });

  it('kickoff checklist is ready to generate', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    const kickoffDoc = docs.find((d) => d.kind === 'kickoff_checklist');
    expect(kickoffDoc?.status).toBe('ready_to_generate');
  });

  it('proposal PDF and project brief start as placeholders', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    const proposalDoc = docs.find((d) => d.kind === 'proposal_pdf');
    expect(proposalDoc?.status).toBe('placeholder');

    const briefDoc = docs.find((d) => d.kind === 'project_brief');
    expect(briefDoc?.status).toBe('placeholder');
  });

  it('all documents have non-empty titles', () => {
    const docs = createAppointmentDocumentOutputs(workspace, appointment);
    expect(docs.every((d) => d.title.trim().length > 0)).toBe(true);
  });
});
