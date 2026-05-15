import { describe, expect, it } from 'vitest';
import { buildAppointmentIdempotencyKey, buildAppointmentRecord, buildProjectStageHistoryEntry, assertAppointmentPreconditions } from '../appointmentWorkflowService';

const verification = { status: 'verified' as const, expiresAt: '2099-01-01T00:00:00.000Z', subjectType: 'bep' as const, statutoryBody: 'SACAP' };
const brief = { id: 'brief-1', clientId: 'client-1', status: 'published' };
const proposal = { id: 'proposal-1', briefId: 'brief-1', clientId: 'client-1', professionalId: 'bep-1', status: 'submitted' };

describe('appointmentWorkflowService', () => {
  it('requires eligible brief, matching proposal, and active BEP verification', () => {
    expect(() => assertAppointmentPreconditions({ brief, proposal, verification })).not.toThrow();
    expect(() => assertAppointmentPreconditions({ brief, proposal, verification: { ...verification, status: 'pending' } })).toThrow(/Active BEP verification/);
    expect(() => assertAppointmentPreconditions({ brief, proposal: { ...proposal, clientId: 'other' }, verification })).toThrow(/client does not match/);
    expect(() => assertAppointmentPreconditions({ brief: { ...brief, appointmentId: 'appointment-1' }, proposal, verification })).toThrow(/already been appointed/);
  });

  it('builds appointment records with human acceptance gates and deterministic idempotency', () => {
    const appointment = buildAppointmentRecord({
      briefId: 'brief-1',
      proposalId: 'proposal-1',
      clientId: 'client-1',
      professionalId: 'bep-1',
      verificationId: 'verification-1',
      createdBy: 'client-1',
    });

    expect(appointment.status).toBe('pending_acceptance');
    expect(appointment.legalAcceptanceRequired).toBe(true);
    expect(appointment.humanAcceptanceRequired).toBe(true);
    expect(appointment.idempotencyKey).toBe(buildAppointmentIdempotencyKey({ briefId: 'brief-1', clientId: 'client-1', professionalId: 'bep-1' }));
    expect(() => buildAppointmentRecord({ ...appointment, createdBy: 'other' })).toThrow(/Only the client owner/);
  });

  it('builds immutable project stage history entries', () => {
    expect(buildProjectStageHistoryEntry({ projectId: 'project-1', actorId: 'client-1', stage: 'appointed', note: 'Appointment created' })).toMatchObject({
      projectId: 'project-1',
      immutable: true,
      stage: 'appointed',
    });
  });
});
