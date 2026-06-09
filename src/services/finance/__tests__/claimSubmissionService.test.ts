/**
 * Tests for Claim Submission Service
 */
import { describe, it, expect } from 'vitest';
import {
  submitPaymentClaim,
  disputeClaim,
  resolveDispute,
  amendClaim,
  totalClaimedAmount,
} from '../claimSubmissionService';

describe('claimSubmissionService', () => {
  describe('submitPaymentClaim', () => {
    it('submits a claim with default values', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 500_000 },
        linkedMilestoneId: 'milestone-structure',
      });
      expect(claim.claimId).toContain('claim-milestone-structure');
      expect(claim.claimantRole).toBe('contractor');
      expect(claim.claimedAmount.amount).toBe(500_000);
      expect(claim.disputed).toBe(false);
      expect(claim.linkedVariationIds).toEqual([]);
      expect(claim.submittedAtIso).toBeTruthy();
    });

    it('links to variation IDs when provided', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'subcontractor',
        claimedAmount: { currency: 'ZAR', amount: 100_000 },
        linkedMilestoneId: 'milestone-enclosure',
        linkedVariationIds: ['var-001', 'var-002'],
      });
      expect(claim.linkedVariationIds).toEqual(['var-001', 'var-002']);
    });

    it('sets disputed flag when provided', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'supplier',
        claimedAmount: { currency: 'ZAR', amount: 50_000 },
        linkedMilestoneId: 'milestone-completion',
        disputed: true,
        description: 'Disputed material quality',
      });
      expect(claim.disputed).toBe(true);
      expect(claim.description).toContain('Disputed material quality');
    });

    it('generates unique claim IDs', () => {
      const c1 = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 100_000 },
        linkedMilestoneId: 'milestone-structure',
      });
      const c2 = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 200_000 },
        linkedMilestoneId: 'milestone-structure',
      });
      expect(c1.claimId).not.toBe(c2.claimId);
    });
  });

  describe('disputeClaim', () => {
    it('marks a claim as disputed', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 300_000 },
        linkedMilestoneId: 'milestone-structure',
      });
      const disputed = disputeClaim(claim, 'Overstated quantities');
      expect(disputed.disputed).toBe(true);
      expect(disputed.description).toContain('DISPUTED');
      expect(disputed.description).toContain('Overstated quantities');
    });
  });

  describe('resolveDispute', () => {
    it('resolves a dispute on a claim', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 300_000 },
        linkedMilestoneId: 'milestone-structure',
        disputed: true,
      });
      expect(claim.disputed).toBe(true);
      const resolved = resolveDispute(claim);
      expect(resolved.disputed).toBe(false);
    });
  });

  describe('amendClaim', () => {
    it('amends claim amounts', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 300_000 },
        linkedMilestoneId: 'milestone-structure',
      });
      const amended = amendClaim(claim, {
        claimedAmount: { currency: 'ZAR', amount: 350_000 },
      });
      expect(amended.claimedAmount.amount).toBe(350_000);
    });

    it('preserves unchanged fields', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 300_000 },
        linkedMilestoneId: 'milestone-structure',
        linkedVariationIds: ['var-001'],
      });
      const amended = amendClaim(claim, {});
      expect(amended.claimedAmount.amount).toBe(300_000);
      expect(amended.linkedVariationIds).toEqual(['var-001']);
    });
  });

  describe('totalClaimedAmount', () => {
    it('sums amounts across multiple claims', () => {
      const c1 = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 200_000 },
        linkedMilestoneId: 'ms-1',
      });
      const c2 = submitPaymentClaim({
        claimantRole: 'subcontractor',
        claimedAmount: { currency: 'ZAR', amount: 150_000 },
        linkedMilestoneId: 'ms-2',
      });
      expect(totalClaimedAmount([c1, c2])).toEqual({
        currency: 'ZAR',
        amount: 350_000,
      });
    });

    it('returns zero for empty array', () => {
      expect(totalClaimedAmount([])).toEqual({ currency: 'ZAR', amount: 0 });
    });
  });
});
