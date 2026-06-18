import type { AcceptedProposalSnapshot } from '../types/appointmentKickoff';

export const demoAcceptedProposal: AcceptedProposalSnapshot = {
  proposalId: 'prop-architect-001',
  proposalRevisionId: 'prop-architect-001-rev1',
  acceptedAtIso: '2026-06-10T08:00:00.000Z',
  clientAcceptanceId: 'client-acceptance-001',
  clientId: 'client-dev-001',
  clientName: 'Demo Client Developments (Pty) Ltd',
  professionalId: 'architect-pro-001',
  professionalName: 'Demo Architects Inc.',
  companyName: 'Demo Architects Inc.',
  projectName: 'Sandton Office Upgrade',
  scopeSnapshotId: 'scope-snapshot-001',
  termsSnapshotId: 'terms-snapshot-001',
  feeSnapshotId: 'fee-snapshot-001',
  acceptedTotal: { currency: 'ZAR', amount: 350000 },
  sourceCalculatorVersion: 'sacap-fees-2026-v1.0',
  immutabilityHash: 'a1b2c3d4e5f6',
};

export const demoProjectFacts = {
  propertyDescription: 'Erf 1234, Sandton CBD',
  erfNumber: '1234',
  municipality: 'City of Johannesburg',
  province: 'Gauteng',
  landUseOrZoningKnown: true,
  professionalBody: 'SACAP',
  professionalRegistrationNumber: 'SACAP-5678',
};
