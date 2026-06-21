import { describe, expect, it } from 'vitest';
import {
  assertApprovalGateResolutionAllowed,
  buildApprovalGateAuditInput,
  buildApprovalGateRecord,
  buildApprovalGateResolution,
  evaluateApprovalGateReadiness,
  type ApprovalGateInput,
} from '../approvalGateService';

const requester = { uid: 'bep-1', role: 'bep' as const, verificationStatus: 'verified' };

function gateInput(overrides: Partial<ApprovalGateInput> = {}): ApprovalGateInput {
  return {
    id: 'gate-1',
    domain: 'compliance_signoff',
    projectId: 'project-1',
    target: { type: 'sans_form', id: 'form-10400-a' },
    requestedBy: requester,
    requiredApproverRoles: ['bep'],
    risk: 'high',
    reason: 'SANS form needs a verified human sign-off before municipal submission',
    statutoryImpact: true,
    evidence: [
      { id: 'drawing-1', type: 'drawing', label: 'Council drawing set', hash: 'sha256:drawing' },
      { id: 'form-1', type: 'form', label: 'SANS 10400-A form', hash: 'sha256:form' },
    ],
    createdAt: '2026-05-22T09:00:00.000Z',
    ...overrides,
  };
}

describe('approvalGateService', () => {
  it('builds immutable human approval gates with no AI approval path', () => {
    const gate = buildApprovalGateRecord(gateInput({ aiGenerated: true }));

    expect(gate).toMatchObject({
      id: 'gate-1',
      domain: 'compliance_signoff',
      status: 'pending',
      risk: 'high',
      requiredApproverRoles: ['bep'],
    });
  });

  it('evaluates readiness blockers for AI generated and statutory approval gates', () => {
    const gate = buildApprovalGateRecord(gateInput({ aiGenerated: true, requiredApproverRoles: ['subcontractor'] }));
    const readiness = evaluateApprovalGateReadiness(gate);

    expect(readiness).toMatchObject({
      ready: false,
      risk: 'high',
      requiresVerifiedProfessional: true,
      aiMayNotApprove: true,
    });
    expect(readiness.blockers).toEqual([
      'High-risk approval (high) requires admin escalation',
    ]);
  });

  it('builds approval gate resolution records', () => {
    const resolution = buildApprovalGateResolution({
      gateId: 'gate-1',
      approved: true,
      resolvedBy: { uid: 'bep-2', role: 'bep', verificationStatus: 'verified' },
      reason: 'Reviewed source drawings and SANS form pack manually.',
    });

    expect(resolution).toMatchObject({
      gateId: 'gate-1',
      approved: true,
      resolvedBy: expect.objectContaining({ uid: 'bep-2', role: 'bep' }),
      reason: 'Reviewed source drawings and SANS form pack manually.',
    });
    expect(resolution.resolvedAt).toBeDefined();
  });

  it('blocks AI and wrong role approvals', () => {
    const gate = buildApprovalGateRecord(gateInput());

    expect(() => assertApprovalGateResolutionAllowed(
      gate,
      { uid: 'ai', role: 'ai' },
    )).toThrow(/not an authorized approver/);

    expect(() => assertApprovalGateResolutionAllowed(
      gate,
      { uid: 'supplier-1', role: 'supplier' },
    )).toThrow(/not an authorized approver/);
  });

  it('requires client or admin approval for financial gates', () => {
    const gate = buildApprovalGateRecord(gateInput({
      domain: 'payment_release',
      statutoryImpact: false,
      financialImpactCents: 150_000_00,
      requiredApproverRoles: ['client'],
      target: { type: 'escrow_release', id: 'release-1' },
    }));

    expect(() => assertApprovalGateResolutionAllowed(
      gate,
      { uid: 'bep-1', role: 'bep', verificationStatus: 'verified' },
    )).toThrow(/not an authorized approver/);

    expect(() => assertApprovalGateResolutionAllowed(
      gate,
      { uid: 'client-1', role: 'client' },
    )).not.toThrow();
  });

  it('builds approval audit events for requests and resolutions', () => {
    const gate = buildApprovalGateRecord(gateInput({ metadata: { workflow: 'municipal-pack' } }));
    const requestAudit = buildApprovalGateAuditInput(gate);
    const resolution = buildApprovalGateResolution({
      gateId: 'gate-1',
      approved: false,
      resolvedBy: { uid: 'admin-1', role: 'admin' },
      reason: 'Missing owner signature page.',
    });
    const resolutionAudit = buildApprovalGateAuditInput(gate, resolution);

    expect(requestAudit).toMatchObject({
      action: 'approval_gate_created',
      sourceObjectId: 'gate-1',
      actorId: 'bep-1',
      metadata: { domain: 'compliance_signoff', risk: 'high' },
    });
    expect(resolutionAudit).toMatchObject({
      action: 'approval_gate_rejected',
      sourceObjectId: 'gate-1',
      actorId: 'admin-1',
    });
  });
});
