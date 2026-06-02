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
      decision: 'pending',
      risk: 'high',
      requiresHumanApproval: true,
      aiMayNotApprove: true,
      immutableRequest: true,
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
      'AI-generated output requires named human review before action',
      'statutory/compliance action requires verified BEP, architect, or admin approver',
    ]);
  });

  it('allows verified BEP humans to resolve statutory approval gates', () => {
    const gate = buildApprovalGateRecord(gateInput());
    const resolution = buildApprovalGateResolution({
      gate,
      actor: { uid: 'bep-2', role: 'bep', verificationStatus: 'verified' },
      decision: 'approved',
      rationale: 'Reviewed source drawings and SANS form pack manually.',
      evidence: [{ id: 'audit-1', type: 'audit_log', label: 'Manual review log' }],
      decidedAt: '2026-05-22T10:00:00.000Z',
    });

    expect(resolution).toMatchObject({
      decision: 'approved',
      humanConfirmed: true,
      aiMayNotApprove: true,
      immutableDecision: true,
      decidedAt: '2026-05-22T10:00:00.000Z',
    });
  });

  it('blocks AI, unverified professionals, and wrong role approvals', () => {
    const gate = buildApprovalGateRecord(gateInput());

    expect(() => assertApprovalGateResolutionAllowed({
      gate,
      actor: { uid: 'ai', role: 'ai' },
      decision: 'approved',
      rationale: 'Automated pass',
    })).toThrow(/AI\/system actors cannot resolve/);

    expect(() => assertApprovalGateResolutionAllowed({
      gate,
      actor: { uid: 'bep-2', role: 'bep', verificationStatus: 'pending' },
      decision: 'approved',
      rationale: 'Looks fine',
    })).toThrow(/verified professional status/);

    expect(() => assertApprovalGateResolutionAllowed({
      gate,
      actor: { uid: 'supplier-1', role: 'supplier' },
      decision: 'approved',
      rationale: 'Supplier approval attempt',
    })).toThrow(/requires one of/);
  });

  it('requires client or admin approval for financial gates', () => {
    const gate = buildApprovalGateRecord(gateInput({
      domain: 'payment_release',
      statutoryImpact: false,
      financialImpactCents: 150_000_00,
      requiredApproverRoles: ['client'],
      target: { type: 'escrow_release', id: 'release-1' },
    }));

    expect(() => assertApprovalGateResolutionAllowed({
      gate,
      actor: { uid: 'bep-1', role: 'bep', verificationStatus: 'verified' },
      decision: 'approved',
      rationale: 'Professional approval is not enough for escrow release',
    })).toThrow(/financial gate requires a client or admin approver/);

    expect(() => assertApprovalGateResolutionAllowed({
      gate,
      actor: { uid: 'client-1', role: 'client' },
      decision: 'approved',
      rationale: 'Client confirms release',
    })).not.toThrow();
  });

  it('builds approval audit events for requests and resolutions', () => {
    const gate = buildApprovalGateRecord(gateInput({ metadata: { workflow: 'municipal-pack' } }));
    const requestAudit = buildApprovalGateAuditInput(gate);
    const resolution = buildApprovalGateResolution({
      gate,
      actor: { uid: 'admin-1', role: 'admin' },
      decision: 'changes_requested',
      rationale: 'Missing owner signature page.',
      decidedAt: '2026-05-22T11:00:00.000Z',
    });
    const resolutionAudit = buildApprovalGateAuditInput(gate, resolution);

    expect(requestAudit).toMatchObject({
      category: 'approval',
      action: 'approval_gate.compliance_signoff.requested',
      target: { type: 'sans_form', id: 'form-10400-a', projectId: 'project-1' },
      metadata: { gateId: 'gate-1', aiMayNotApprove: true, workflow: 'municipal-pack' },
      immutable: true,
    });
    expect(resolutionAudit).toMatchObject({
      action: 'approval_gate.compliance_signoff.changes_requested',
      actor: { uid: 'admin-1', role: 'admin' },
      reason: 'Missing owner signature page.',
      createdAt: '2026-05-22T11:00:00.000Z',
    });
  });
});
