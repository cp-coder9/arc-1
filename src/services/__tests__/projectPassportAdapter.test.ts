// Pack 5: Project Passport Adapter Tests

import { describe, expect, it } from 'vitest';
import { createProjectPassportBaseline } from '../projectPassportAdapter';
import type {
  KickoffAppointmentRecord,
  ProjectWorkspace,
} from '../../types/appointmentKickoff';
import { createProjectWorkspace } from '../appointmentKickoffService';

// ── Test fixtures ───────────────────────────────────────────────────────────────

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
    sourceCalculatorVersion: 'architect-fee-calculator-v0.1.0',
    immutabilityHash: 'sha256-test',
  },
  projectFacts: {
    propertyDescription: 'Existing dwelling alteration/addition project',
    erfNumber: 'Erf 1234 Parkview',
    municipality: 'City of Johannesburg',
    province: 'Gauteng',
    landUseOrZoningKnown: true,
    professionalBody: 'SACAP',
    professionalRegistrationNumber: 'PrArch DEMO-12345',
  },
  status: 'confirmed',
  revision: 1,
  createdAtIso: '2026-06-04T10:00:00.000Z',
  professionalConfirmedAtIso: '2026-06-04T10:05:00.000Z',
  requiresHumanApprovalBeforeFormalIssue: false,
  missingFacts: [],
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('createProjectPassportBaseline', () => {
  it('creates a passport baseline from workspace and appointment', () => {
    const workspace = createProjectWorkspace(appointment);
    const passport = createProjectPassportBaseline(workspace, appointment);

    expect(passport.passportId).toBe(`passport-${workspace.projectId}`);
    expect(passport.projectId).toBe(workspace.projectId);
    expect(passport.appointmentId).toBe(appointment.appointmentId);
  });

  it('maps all appointment facts into the passport', () => {
    const workspace = createProjectWorkspace(appointment);
    const passport = createProjectPassportBaseline(workspace, appointment);

    expect(passport.facts.projectName).toBe('Parkview Alterations and Additions');
    expect(passport.facts.clientName).toBe('Urban Family Trust');
    expect(passport.facts.professionalName).toBe('Demo Architect PrArch');
    expect(passport.facts.appointmentStatus).toBe('confirmed');
    expect(passport.facts.municipality).toBe('City of Johannesburg');
    expect(passport.facts.province).toBe('Gauteng');
    expect(passport.facts.erfNumber).toBe('Erf 1234 Parkview');
  });

  it('includes standard compliance context', () => {
    const workspace = createProjectWorkspace(appointment);
    const passport = createProjectPassportBaseline(workspace, appointment);

    expect(passport.complianceContext.length).toBeGreaterThanOrEqual(3);
    expect(
      passport.complianceContext.some((c) => c.includes('NBR/SANS 10400')),
    ).toBe(true);
    expect(
      passport.complianceContext.some((c) => c.toLowerCase().includes('professional responsibility')),
    ).toBe(true);
  });

  it('adds land-use compliance note when zoning is unknown', () => {
    const apptWithoutZoning: KickoffAppointmentRecord = {
      ...appointment,
      projectFacts: {
        ...appointment.projectFacts,
        landUseOrZoningKnown: false,
      },
    };
    const workspace = createProjectWorkspace(apptWithoutZoning);
    const passport = createProjectPassportBaseline(workspace, apptWithoutZoning);

    expect(
      passport.complianceContext.some((c) =>
        c.includes('Land-use/zoning not yet confirmed'),
      ),
    ).toBe(true);
  });

  it('does not add land-use note when zoning is known', () => {
    const workspace = createProjectWorkspace(appointment);
    const passport = createProjectPassportBaseline(workspace, appointment);

    expect(
      passport.complianceContext.some((c) =>
        c.includes('Land-use/zoning not yet confirmed'),
      ),
    ).toBe(false);
  });

  it('does not add missing facts note to compliance context', () => {
    const apptWithMissing: KickoffAppointmentRecord = {
      ...appointment,
      missingFacts: ['Municipality is required.', 'Province is required.'],
    };
    const workspace = createProjectWorkspace(apptWithMissing);
    const passport = createProjectPassportBaseline(workspace, apptWithMissing);

    expect(
      passport.complianceContext.some((c) => c.includes('missing fact')),
    ).toBe(false);
  });

  it('returns an immutable-looking record (does not share references)', () => {
    const workspace = createProjectWorkspace(appointment);
    const passport1 = createProjectPassportBaseline(workspace, appointment);
    const passport2 = createProjectPassportBaseline(workspace, appointment);

    // Push to one should not affect the other
    passport1.complianceContext.push('test');
    expect(passport2.complianceContext.length).not.toBe(
      passport1.complianceContext.length,
    );
  });
});
