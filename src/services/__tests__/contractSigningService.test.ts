import { describe, expect, it } from 'vitest';
import { buildSignatureAuditInput, buildSignatureRequest, evaluateContractSignatureReadiness, type AppointmentContractLike } from '../contractSigningService';

const readyContract: AppointmentContractLike = {
  id: 'contract-1',
  projectId: 'project-1',
  clientId: 'client-1',
  bepId: 'bep-1',
  status: 'generated_pending_acceptance',
  professionalFee: 100_000,
  platformFee: 5_000,
  totalEscrowAmount: 105_000,
  scope: ['Concept design'],
  deliverables: ['Drawings'],
  milestones: [{ id: 'm1', name: 'Concept', percentage: 100, amount: 105_000, releaseConditions: ['Client approval'] }],
  verificationId: 'verification-1',
};

describe('contractSigningService', () => {
  it('blocks signature requests until contract scope, milestones, fees, and escrow total are present', () => {
    const readiness = evaluateContractSignatureReadiness({ ...readyContract, scope: [], professionalFee: 0, milestones: [] }, { status: 'funded' });

    expect(readiness.readyForHumanReview).toBe(false);
    expect(readiness.readyForSignatureRequest).toBe(false);
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      'Contract scope is not recorded.',
      'Milestones and release conditions are not recorded.',
      'Professional fee is not recorded.',
    ]));
    expect(() => buildSignatureRequest({ contract: { ...readyContract, deliverables: [] }, requestedBy: 'client-1', requesterRole: 'client' })).toThrow(/not ready/);
  });

  it('creates an auditable human signature request without auto-executing the contract', () => {
    const request = buildSignatureRequest({ contract: readyContract, requestedBy: 'client-1', requesterRole: 'client', escrow: { status: 'funded' }, provider: 'DocuSign' });

    expect(request).toMatchObject({
      contractId: 'contract-1',
      projectId: 'project-1',
      provider: 'DocuSign',
      status: 'pending_human_signatures',
      humanSignatureRequired: true,
      autoExecutionProhibited: true,
      blockersAtRequest: [],
    });
    expect(request).not.toHaveProperty('signedAt');
    expect(request).not.toHaveProperty('executedAt');
  });

  it('requires both client and professional signatures before execution readiness', () => {
    const partial = evaluateContractSignatureReadiness({
      ...readyContract,
      signatureRequestId: 'sig-1',
      status: 'signature_requested',
      signatures: { client: { actorId: 'client-1', role: 'client', signedAt: '2026-01-01T00:00:00.000Z' } },
    });
    const complete = evaluateContractSignatureReadiness({
      ...readyContract,
      signatureRequestId: 'sig-1',
      status: 'partially_signed',
      signatures: {
        client: { actorId: 'client-1', role: 'client', signedAt: '2026-01-01T00:00:00.000Z' },
        professional: { actorId: 'bep-1', role: 'professional', signedAt: '2026-01-01T00:00:00.000Z' },
      },
    });

    expect(partial.readyForExecution).toBe(false);
    expect(partial.missingSignatures).toEqual(['professional']);
    expect(partial.nextStatus).toBe('partially_signed');
    expect(complete.readyForExecution).toBe(true);
    expect(complete.missingSignatures).toEqual([]);
    expect(complete.nextStatus).toBe('signed');
  });

  it('limits signature requests to contract parties or admins', () => {
    expect(() => buildSignatureRequest({ contract: readyContract, requestedBy: 'other', requesterRole: 'client' })).toThrow(/party or admin/);
    expect(() => buildSignatureRequest({ contract: readyContract, requestedBy: 'admin-1', requesterRole: 'admin' })).not.toThrow();
  });

  it('builds audit metadata that preserves blockers, warnings, and no-auto-execution posture', () => {
    const readiness = evaluateContractSignatureReadiness(readyContract, null);
    const audit = buildSignatureAuditInput({ contract: readyContract, actorId: 'client-1', action: 'contract.signature_request.created', readiness });

    expect(audit).toMatchObject({
      actorId: 'client-1',
      action: 'contract.signature_request.created',
      resourceType: 'appointment_contract',
      resourceId: 'contract-1',
      projectId: 'project-1',
      metadata: {
        clientId: 'client-1',
        professionalId: 'bep-1',
        autoExecutionProhibited: true,
      },
    });
    expect(audit.metadata.warnings).toContain('No live escrow record is visible for this contract.');
  });
});
