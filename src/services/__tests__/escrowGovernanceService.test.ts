import { describe, expect, it } from 'vitest';
import {
  buildEscrowAdminReviewRecord,
  buildEscrowAuditInput,
  buildEscrowLedgerEntry,
  buildEscrowReleaseApprovalGate,
  evaluateEscrowReleaseGate,
  type EscrowMilestoneGateInput,
} from '../escrowGovernanceService';

const milestone: EscrowMilestoneGateInput = {
  projectId: 'project-1',
  jobId: 'job-1',
  stage: 'payments',
  milestoneId: 'payment-1',
  amount: 100_000,
  status: 'release_requested',
  requestedBy: 'bep-1',
  evidenceIds: ['evidence-1'],
  certifiedBy: 'certifier-1',
  releaseConditions: ['Certified claim'],
};

describe('escrowGovernanceService', () => {
  it('requires positive amount, release request status, evidence, and certifier before review', () => {
    const evaluation = evaluateEscrowReleaseGate({ ...milestone, amount: 0, status: 'funded', evidenceIds: [], certifiedBy: undefined });

    expect(evaluation.readyForAdminReview).toBe(false);
    expect(evaluation.blockers).toEqual(expect.arrayContaining([
      'Release amount must be positive.',
      'Milestone must be in release_requested status.',
      'Release evidence is required.',
      'Certifier approval is required before admin release review.',
    ]));
    expect(evaluation.humanApprovalRequired).toBe(true);
    expect(evaluation.autoReleaseProhibited).toBe(true);
  });

  it('projects release requests into human approval gates before escrow ledger effects', () => {
    const projection = buildEscrowReleaseApprovalGate({
      milestone,
      requestedBy: { uid: 'bep-1', role: 'bep', verificationStatus: 'verified' },
      createdAt: '2026-05-22T10:00:00.000Z',
    });

    expect(projection.escrowEvaluation.readyForAdminReview).toBe(true);
    expect(projection.approvalGate).toMatchObject({
      id: 'escrow-release-payment-1',
      domain: 'payment_release',
      target: { type: 'escrow_milestone', id: 'payment-1' },
      requiredApproverRoles: ['client', 'admin'],
      risk: 'medium',
      financialImpactCents: 100_000,
      requiresHumanApproval: true,
      aiMayNotApprove: true,
      immutableRequest: true,
    });
    expect(projection.approvalReadiness).toMatchObject({
      ready: true,
      requiresAdminEscalation: true,
      aiMayNotApprove: true,
    });
  });

  it('keeps blocked escrow releases visible as approval gates with blockers in metadata', () => {
    const projection = buildEscrowReleaseApprovalGate({
      milestone: { ...milestone, status: 'funded', evidenceIds: [], certifiedBy: undefined },
      requestedBy: { uid: 'contractor-1', role: 'contractor' },
    });

    expect(projection.escrowEvaluation.readyForAdminReview).toBe(false);
    expect(projection.approvalGate.metadata).toMatchObject({
      escrowBlockers: expect.arrayContaining([
        'Milestone must be in release_requested status.',
        'Release evidence is required.',
        'Certifier approval is required before admin release review.',
      ]),
      autoReleaseProhibited: true,
    });
    expect(projection.approvalGate.evidence).toEqual([
      { id: 'payment-1-missing-evidence', type: 'audit_log', label: 'Escrow release evidence missing' },
    ]);
  });

  it('builds admin approval records only when the release gate is clear', () => {
    const approval = buildEscrowAdminReviewRecord({ milestone, adminId: 'admin-1', decision: 'approved' });

    expect(approval).toMatchObject({
      adminId: 'admin-1',
      decision: 'approved',
      statusAfterDecision: 'release_approved',
      humanApprovalRequired: true,
      autoReleaseProhibited: true,
    });
    expect(() => buildEscrowAdminReviewRecord({ milestone: { ...milestone, evidenceIds: [] }, adminId: 'admin-1', decision: 'approved' })).toThrow(/cannot be approved/);
  });

  it('requires reasons for rejected or held admin decisions', () => {
    expect(() => buildEscrowAdminReviewRecord({ milestone, adminId: 'admin-1', decision: 'hold' })).toThrow(/reason is required/);
    expect(buildEscrowAdminReviewRecord({ milestone, adminId: 'admin-1', decision: 'rejected', reason: 'Evidence mismatch' })).toMatchObject({ statusAfterDecision: 'release_rejected', reason: 'Evidence mismatch' });
  });

  it('builds immutable-style ledger entries for approved releases', () => {
    const ledger = buildEscrowLedgerEntry({ projectId: 'project-1', jobId: 'job-1', milestoneId: 'payment-1', amount: 100_000, payerId: 'client-1', payeeId: 'bep-1', adminId: 'admin-1' });

    expect(ledger).toMatchObject({
      type: 'milestone_release',
      amount: 100_000,
      direction: 'debit',
      payerId: 'client-1',
      payeeId: 'bep-1',
      escrowMilestoneId: 'payment-1',
      approvedBy: 'admin-1',
    });
    expect(() => buildEscrowLedgerEntry({ ...ledger, amount: -1, adminId: 'admin-1' })).toThrow(/amount must be positive/);
  });

  it('builds audit metadata preserving no-auto-release posture', () => {
    const audit = buildEscrowAuditInput({ actorId: 'admin-1', action: 'escrow.release.approved', projectId: 'project-1', jobId: 'job-1', milestoneId: 'payment-1', decision: 'approved' });

    expect(audit).toMatchObject({
      actorId: 'admin-1',
      action: 'escrow.release.approved',
      resourceType: 'escrow_milestone',
      resourceId: 'payment-1',
      metadata: { decision: 'approved', humanApprovalRequired: true, autoReleaseProhibited: true },
    });
  });
});
