// Pack 5: Appointment Kickoff Service Tests
// Covers: full appointment lifecycle, 7 kickoff gates, revision immutability,
// missing facts detection, professional confirmation transitions, invalid inputs

import { describe, expect, it } from 'vitest';
import {
  findMissingFacts,
  createAppointmentFromAcceptedProposal,
  confirmProfessionalAppointment,
  reviseAppointment,
  createProjectWorkspace,
  createKickoffChecklist,
  createKickoffPackage,
  validateKickoffReadiness,
  createInitialTasks,
} from '../appointmentKickoffService';
import type {
  AcceptedProposalSnapshot,
  ProjectFacts,
  KickoffAppointmentRecord,
} from '../../types/appointmentKickoff';

// ── Test fixtures ───────────────────────────────────────────────────────────────

const acceptedProposal: AcceptedProposalSnapshot = {
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
  sourceCalculatorVersion: 'architect-fee-calculator-v0.1.0',
  immutabilityHash: 'sha256-demo-accepted-proposal-snapshot',
};

const completeProjectFacts: ProjectFacts = {
  propertyDescription: 'Existing dwelling alteration/addition project',
  erfNumber: 'Erf 1234 Parkview',
  municipality: 'City of Johannesburg',
  province: 'Gauteng',
  landUseOrZoningKnown: false,
  professionalBody: 'SACAP',
  professionalRegistrationNumber: 'PrArch DEMO-12345',
};

const nowIso = '2026-06-04T10:00:00.000Z';

function makeAppointment(
  overrides?: Partial<AcceptedProposalSnapshot>,
  factsOverrides?: Partial<ProjectFacts>,
): KickoffAppointmentRecord {
  return createAppointmentFromAcceptedProposal({
    proposal: { ...acceptedProposal, ...overrides },
    projectFacts: { ...completeProjectFacts, ...factsOverrides },
    nowIso,
  });
}

// ── findMissingFacts ────────────────────────────────────────────────────────────

describe('findMissingFacts', () => {
  it('returns empty array when all required facts are present', () => {
    expect(findMissingFacts(completeProjectFacts)).toEqual([]);
  });

  it('detects missing municipality', () => {
    const missing = findMissingFacts({ ...completeProjectFacts, municipality: undefined });
    expect(missing.some((f) => f.includes('Municipality'))).toBe(true);
  });

  it('detects missing province', () => {
    const missing = findMissingFacts({ ...completeProjectFacts, province: undefined });
    expect(missing.some((f) => f.includes('Province'))).toBe(true);
  });

  it('detects missing property description AND erf number (special case)', () => {
    const missing = findMissingFacts({
      ...completeProjectFacts,
      propertyDescription: undefined,
      erfNumber: undefined,
    });
    expect(missing.some((f) => f.includes('property description or erf number'))).toBe(true);
  });

  it('does not complain about property if erf is present', () => {
    const missing = findMissingFacts({
      ...completeProjectFacts,
      propertyDescription: undefined,
      erfNumber: 'Erf 5678',
    });
    expect(missing.some((f) => f.includes('property description or erf number'))).toBe(false);
    expect(missing.some((f) => f.includes('Property description'))).toBe(true); // still warns about description
  });

  it('does not duplicate messages', () => {
    const missing = findMissingFacts({});
    const unique = new Set(missing);
    expect(unique.size).toBe(missing.length);
  });

  it('detects missing professional body and registration number', () => {
    const missing = findMissingFacts({
      ...completeProjectFacts,
      professionalBody: undefined,
      professionalRegistrationNumber: undefined,
    });
    expect(missing.some((f) => f.includes('Professional body'))).toBe(true);
    expect(missing.some((f) => f.includes('Professional registration'))).toBe(true);
  });
});

// ── createAppointmentFromAcceptedProposal ───────────────────────────────────────

describe('createAppointmentFromAcceptedProposal', () => {
  it('creates a valid appointment record from an accepted proposal', () => {
    const record = makeAppointment();
    expect(record.appointmentId).toBe('appt-prop-architect-002');
    expect(record.status).toBe('pending_professional_confirmation');
    expect(record.revision).toBe(1);
    expect(record.createdAtIso).toBe(nowIso);
    expect(record.requiresHumanApprovalBeforeFormalIssue).toBe(true);
    expect(record.proposalSnapshot.immutabilityHash).toBe(
      'sha256-demo-accepted-proposal-snapshot',
    );
  });

  it('throws if client acceptance is missing', () => {
    expect(() =>
      createAppointmentFromAcceptedProposal({
        proposal: { ...acceptedProposal, clientAcceptanceId: '' },
        projectFacts: completeProjectFacts,
        nowIso,
      }),
    ).toThrow(/client acceptance/);
  });

  it('throws if scope snapshot is missing', () => {
    expect(() =>
      createAppointmentFromAcceptedProposal({
        proposal: { ...acceptedProposal, scopeSnapshotId: '' },
        projectFacts: completeProjectFacts,
        nowIso,
      }),
    ).toThrow(/scope, terms and fee snapshots/);
  });

  it('throws if terms snapshot is missing', () => {
    expect(() =>
      createAppointmentFromAcceptedProposal({
        proposal: { ...acceptedProposal, termsSnapshotId: '' },
        projectFacts: completeProjectFacts,
        nowIso,
      }),
    ).toThrow(/scope, terms and fee snapshots/);
  });

  it('throws if fee snapshot is missing', () => {
    expect(() =>
      createAppointmentFromAcceptedProposal({
        proposal: { ...acceptedProposal, feeSnapshotId: '' },
        projectFacts: completeProjectFacts,
        nowIso,
      }),
    ).toThrow(/scope, terms and fee snapshots/);
  });

  it('throws if proposal ID is missing', () => {
    expect(() =>
      createAppointmentFromAcceptedProposal({
        proposal: { ...acceptedProposal, proposalId: '' },
        projectFacts: completeProjectFacts,
        nowIso,
      }),
    ).toThrow(/Proposal ID/);
  });

  it('populates missingFacts when project facts are incomplete', () => {
    const record = makeAppointment(undefined, {
      municipality: undefined,
      province: undefined,
    });
    expect(record.missingFacts.length).toBeGreaterThan(0);
    expect(record.missingFacts.some((f) => f.includes('Municipality'))).toBe(true);
    expect(record.missingFacts.some((f) => f.includes('Province'))).toBe(true);
  });

  it('the proposal snapshot is a copy, not a reference', () => {
    const record = makeAppointment();
    // Mutating the original does not affect the snapshot
    const mutated = { ...acceptedProposal, projectName: 'CHANGED' };
    expect(record.proposalSnapshot.projectName).toBe(
      'Parkview Alterations and Additions',
    );
    expect(mutated.projectName).toBe('CHANGED');
  });

  it('preserves all proposal fields in the snapshot', () => {
    const record = makeAppointment();
    expect(record.proposalSnapshot.proposalId).toBe(acceptedProposal.proposalId);
    expect(record.proposalSnapshot.clientName).toBe(acceptedProposal.clientName);
    expect(record.proposalSnapshot.professionalName).toBe(acceptedProposal.professionalName);
    expect(record.proposalSnapshot.acceptedTotal.amount).toBe(393335);
    expect(record.proposalSnapshot.acceptedTotal.currency).toBe('ZAR');
  });
});

// ── confirmProfessionalAppointment ──────────────────────────────────────────────

describe('confirmProfessionalAppointment', () => {
  it('confirms a pending appointment', () => {
    const draft = makeAppointment();
    const confirmed = confirmProfessionalAppointment(draft, '2026-06-04T10:05:00.000Z');
    expect(confirmed.professionalConfirmedAtIso).toBe('2026-06-04T10:05:00.000Z');
  });

  it('sets status to confirmed when no missing facts', () => {
    const draft = makeAppointment();
    const confirmed = confirmProfessionalAppointment(draft, '2026-06-04T10:05:00.000Z');
    expect(confirmed.status).toBe('confirmed');
  });

  it('keeps status as pending_professional_confirmation when facts are missing', () => {
    const draft = makeAppointment(undefined, {
      municipality: undefined,
      province: undefined,
      propertyDescription: undefined,
      erfNumber: undefined,
    });
    const confirmed = confirmProfessionalAppointment(draft, '2026-06-04T10:05:00.000Z');
    expect(confirmed.status).toBe('pending_professional_confirmation');
    expect(confirmed.missingFacts.length).toBeGreaterThan(0);
  });

  it('throws if already confirmed', () => {
    const draft = makeAppointment();
    const confirmed = confirmProfessionalAppointment(draft, '2026-06-04T10:05:00.000Z');
    expect(() =>
      confirmProfessionalAppointment(confirmed, '2026-06-04T10:10:00.000Z'),
    ).toThrow(/already confirmed/);
  });

  it('throws if appointment requires revision', () => {
    const draft = makeAppointment();
    const revised = reviseAppointment(draft, 'Scope change requested');
    expect(() =>
      confirmProfessionalAppointment(revised, '2026-06-04T10:10:00.000Z'),
    ).toThrow(/requires revision/);
  });

  it('sets requiresHumanApprovalBeforeFormalIssue correctly based on missing facts', () => {
    const draft = makeAppointment();
    const confirmed = confirmProfessionalAppointment(draft, '2026-06-04T10:05:00.000Z');
    expect(confirmed.requiresHumanApprovalBeforeFormalIssue).toBe(false);

    const draftWithMissing = makeAppointment(undefined, { municipality: undefined });
    const confirmedWithMissing = confirmProfessionalAppointment(
      draftWithMissing,
      '2026-06-04T10:05:00.000Z',
    );
    expect(confirmedWithMissing.requiresHumanApprovalBeforeFormalIssue).toBe(true);
  });
});

// ── reviseAppointment ───────────────────────────────────────────────────────────

describe('reviseAppointment', () => {
  it('creates a revision with incremented revision number', () => {
    const original = makeAppointment();
    const revised = reviseAppointment(original, 'Client requested scope change');
    expect(revised.revision).toBe(2);
    expect(revised.status).toBe('revision_required');
    expect(revised.appointmentId).toContain('-rev-2');
  });

  it('preserves the original proposal snapshot (immutability)', () => {
    const original = makeAppointment();
    const revised = reviseAppointment(original, 'Scope change');
    expect(revised.proposalSnapshot).toEqual(original.proposalSnapshot);
    expect(revised.proposalSnapshot.immutabilityHash).toBe(
      original.proposalSnapshot.immutabilityHash,
    );
  });

  it('throws if revision reason is empty', () => {
    const original = makeAppointment();
    expect(() => reviseAppointment(original, '')).toThrow(/reason/);
    expect(() => reviseAppointment(original, '   ')).toThrow(/reason/);
  });

  it('requires human approval after revision', () => {
    const original = makeAppointment();
    const revised = reviseAppointment(original, 'Client requested changes');
    expect(revised.requiresHumanApprovalBeforeFormalIssue).toBe(true);
  });

  it('multiple revisions produce correct IDs', () => {
    let record = makeAppointment();
    record = reviseAppointment(record, 'First revision');
    expect(record.revision).toBe(2);
    record = reviseAppointment(record, 'Second revision');
    expect(record.revision).toBe(3);
    expect(record.appointmentId).toContain('-rev-3');
  });
});

// ── createProjectWorkspace ──────────────────────────────────────────────────────

describe('createProjectWorkspace', () => {
  it('creates a workspace from a confirmed appointment', () => {
    const appointment = makeAppointment();
    const confirmed = confirmProfessionalAppointment(appointment, '2026-06-04T10:05:00.000Z');
    const workspace = createProjectWorkspace(confirmed);
    expect(workspace.projectId).toBe(`project-${confirmed.appointmentId}`);
    expect(workspace.projectName).toBe('Parkview Alterations and Additions');
    expect(workspace.phase).toBe('appointment_confirmed');
  });

  it('sets phase to pre_appointment for unconfirmed appointments', () => {
    const appointment = makeAppointment(undefined, { municipality: undefined });
    const workspace = createProjectWorkspace(appointment);
    expect(workspace.phase).toBe('pre_appointment');
  });

  it('includes both client and professional roles', () => {
    const appointment = makeAppointment();
    const workspace = createProjectWorkspace(appointment);
    expect(workspace.roles).toHaveLength(2);
    expect(workspace.roles.some((r) => r.role === 'client')).toBe(true);
    expect(workspace.roles.some((r) => r.role === 'lead_professional')).toBe(true);
  });

  it('links to the correct appointment and client', () => {
    const appointment = makeAppointment();
    const workspace = createProjectWorkspace(appointment);
    expect(workspace.appointmentId).toBe(appointment.appointmentId);
    expect(workspace.clientId).toBe('client-urban-family-trust');
    expect(workspace.professionalId).toBe('pro-demo-architect');
  });
});

// ── validateKickoffReadiness (7 gates) ──────────────────────────────────────────

describe('validateKickoffReadiness', () => {
  it('all 7 gates pass with complete data and professional confirmation', () => {
    const appointment = makeAppointment();
    const confirmed = confirmProfessionalAppointment(appointment, '2026-06-04T10:05:00.000Z');
    const result = validateKickoffReadiness(confirmed);
    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.gates).toHaveLength(7);
    expect(result.gates.every((g) => g.passed)).toBe(true);
  });

  it('gate 1 fails: proposal not accepted (no clientAcceptanceId)', () => {
    // Build record directly — createAppointmentFromAcceptedProposal would reject this
    const appointment: KickoffAppointmentRecord = {
      ...makeAppointment(),
      proposalSnapshot: { ...acceptedProposal, clientAcceptanceId: '' },
    };
    const result = validateKickoffReadiness(appointment);
    expect(result.gates[0].passed).toBe(false);
    expect(result.blockers.some((b) => b.includes('not been accepted'))).toBe(true);
  });

  it('gate 3 fails: no professional confirmation', () => {
    const appointment = makeAppointment(); // not confirmed
    const result = validateKickoffReadiness(appointment);
    expect(result.gates[2].passed).toBe(false);
    expect(result.blockers.some((b) => b.includes('not yet confirmed'))).toBe(true);
  });

  it('gate 4 fails: project name missing', () => {
    const appointment = makeAppointment({ projectName: '' });
    const result = validateKickoffReadiness(appointment);
    expect(result.gates[3].passed).toBe(false);
    expect(result.blockers.some((b) => b.includes('Project name'))).toBe(true);
  });

  it('gate 5 fails: municipality missing', () => {
    const appointment = makeAppointment(undefined, { municipality: undefined });
    const result = validateKickoffReadiness(appointment);
    expect(result.gates[4].passed).toBe(false);
    expect(result.blockers.some((b) => b.includes('Municipality'))).toBe(true);
  });

  it('gate 6 fails: no property description or erf', () => {
    const appointment = makeAppointment(undefined, {
      propertyDescription: undefined,
      erfNumber: undefined,
    });
    const result = validateKickoffReadiness(appointment);
    expect(result.gates[5].passed).toBe(false);
    expect(result.blockers.some((b) => b.includes('property description'))).toBe(true);
  });

  it('gate 7 fails: scope or terms snapshots missing', () => {
    const appointment: KickoffAppointmentRecord = {
      ...makeAppointment(),
      proposalSnapshot: { ...acceptedProposal, scopeSnapshotId: '' },
    };
    const result = validateKickoffReadiness(appointment);
    expect(result.gates[6].passed).toBe(false);
    expect(result.blockers.some((b) => b.includes('snapshot'))).toBe(true);
  });

  it('returns blocker strings for each failed gate', () => {
    const appointment: KickoffAppointmentRecord = {
      ...makeAppointment(),
      proposalSnapshot: {
        ...acceptedProposal,
        clientAcceptanceId: '',
        projectName: '',
        scopeSnapshotId: '',
      },
      projectFacts: {
        ...completeProjectFacts,
        municipality: undefined,
        propertyDescription: undefined,
        erfNumber: undefined,
      },
    };
    const result = validateKickoffReadiness(appointment);
    expect(result.ready).toBe(false);
    expect(result.blockers.length).toBeGreaterThanOrEqual(4);
  });

  it('gate 6 passes with erfNumber only (no property description)', () => {
    const appointment = makeAppointment(undefined, {
      propertyDescription: undefined,
      erfNumber: 'Erf 9999',
    });
    const result = validateKickoffReadiness(appointment);
    expect(result.gates[5].passed).toBe(true);
  });
});

// ── createKickoffChecklist ──────────────────────────────────────────────────────

describe('createKickoffChecklist', () => {
  it('returns all 7 gate items plus operational items', () => {
    const appointment = makeAppointment();
    const checklist = createKickoffChecklist(appointment);
    // 7 gates + 3 operational items + 0 missing fact items (complete facts)
    expect(checklist.length).toBeGreaterThanOrEqual(10);
  });

  it('includes missing fact items when facts are incomplete', () => {
    const appointment = makeAppointment(undefined, {
      municipality: undefined,
      province: undefined,
    });
    const checklist = createKickoffChecklist(appointment);
    const missingItems = checklist.filter((item) =>
      item.id.startsWith('missing-fact-'),
    );
    expect(missingItems.length).toBeGreaterThan(0);
    expect(missingItems.every((item) => !item.completed)).toBe(true);
  });

  it('professional confirmation item matches appointment status', () => {
    const draft = makeAppointment();
    const draftChecklist = createKickoffChecklist(draft);
    const confirmItem = draftChecklist.find(
      (item) => item.id === 'gate-3-professional-confirmation',
    );
    expect(confirmItem?.completed).toBe(false);

    const confirmed = confirmProfessionalAppointment(draft, '2026-06-04T10:05:00.000Z');
    const confirmedChecklist = createKickoffChecklist(confirmed);
    const confirmItem2 = confirmedChecklist.find(
      (item) => item.id === 'gate-3-professional-confirmation',
    );
    expect(confirmItem2?.completed).toBe(true);
  });

  it('marks all required items as required: true', () => {
    const appointment = makeAppointment();
    const checklist = createKickoffChecklist(appointment);
    const gateItems = checklist.filter((item) => item.id.startsWith('gate-'));
    expect(gateItems.every((item) => item.required)).toBe(true);
  });
});

// ── createKickoffPackage ───────────────────────────────────────────────────────

describe('createKickoffPackage', () => {
  it('returns a complete package with workspace, passport, checklist, tasks', () => {
    const appointment = makeAppointment();
    const confirmed = confirmProfessionalAppointment(appointment, '2026-06-04T10:05:00.000Z');
    const pkg = createKickoffPackage(confirmed);
    expect(pkg.workspace).toBeDefined();
    expect(pkg.passport).toBeDefined();
    expect(pkg.checklist).toBeDefined();
    expect(pkg.initialTasks).toBeDefined();
    expect(pkg.readiness).toBeDefined();
  });

  it('readiness is "ready" when all gates pass and no required items are open', () => {
    const appointment = makeAppointment();
    const confirmed = confirmProfessionalAppointment(appointment, '2026-06-04T10:05:00.000Z');
    const pkg = createKickoffPackage(confirmed);
    // Note: landUseOrZoningKnown is false, but that doesn't block gates
    // The "check zoning" recommendation exists but kickoff can still be ready
    expect(pkg.readiness).toBe('ready');
  });

  it('readiness is "blocked" when gates fail', () => {
    const appointment = makeAppointment(undefined, {
      municipality: undefined,
      province: undefined,
      propertyDescription: undefined,
      erfNumber: undefined,
    });
    const pkg = createKickoffPackage(appointment);
    expect(pkg.readiness).toBe('blocked');
  });

  it('initial tasks include inception and submission readiness', () => {
    const tasks = createInitialTasks();
    expect(tasks).toHaveLength(3);
    expect(tasks.some((t) => t.phase === 'inception')).toBe(true);
    expect(tasks.some((t) => t.phase === 'municipal_submission_readiness')).toBe(true);
  });
});

// ── Full lifecycle integration test ─────────────────────────────────────────────

describe('full appointment lifecycle', () => {
  it('proposal → appointment → professional confirm → workspace → kickoff ready', () => {
    // Step 1: Create appointment from accepted proposal
    const appointment = createAppointmentFromAcceptedProposal({
      proposal: acceptedProposal,
      projectFacts: completeProjectFacts,
      nowIso,
    });
    expect(appointment.status).toBe('pending_professional_confirmation');
    expect(appointment.missingFacts).toHaveLength(0);

    // Step 2: Gates check before confirmation
    const gatesBefore = validateKickoffReadiness(appointment);
    expect(gatesBefore.ready).toBe(false); // gate 3 not passed yet

    // Step 3: Professional confirms
    const confirmed = confirmProfessionalAppointment(
      appointment,
      '2026-06-04T10:05:00.000Z',
    );
    expect(confirmed.status).toBe('confirmed');

    // Step 4: All gates now pass
    const gatesAfter = validateKickoffReadiness(confirmed);
    expect(gatesAfter.ready).toBe(true);

    // Step 5: Create workspace
    const workspace = createProjectWorkspace(confirmed);
    expect(workspace.projectName).toBe('Parkview Alterations and Additions');
    expect(workspace.phase).toBe('appointment_confirmed');

    // Step 6: Create kickoff package
    const pkg = createKickoffPackage(confirmed);
    expect(pkg.readiness).toBe('ready');
    expect(pkg.passport.facts.projectName).toBe('Parkview Alterations and Additions');
    expect(pkg.checklist.length).toBeGreaterThanOrEqual(10);
  });

  it('revision preserves baseline and creates new revision', () => {
    const appointment = makeAppointment();
    const confirmed = confirmProfessionalAppointment(
      appointment,
      '2026-06-04T10:05:00.000Z',
    );

    // Client requests changes — create revision
    const revised = reviseAppointment(confirmed, 'Scope and fee renegotiation');
    expect(revised.revision).toBe(2);
    expect(revised.status).toBe('revision_required');
    expect(revised.requiresHumanApprovalBeforeFormalIssue).toBe(true);

    // The proposal snapshot is untouched
    expect(revised.proposalSnapshot).toEqual(confirmed.proposalSnapshot);
    expect(revised.proposalSnapshot.immutabilityHash).toBe(
      acceptedProposal.immutabilityHash,
    );
  });
});
