/**
 * Tests for Payment Certificate Service
 */
import { describe, it, expect } from 'vitest';
import {
  certifyPaymentClaim,
  reviseCertificate,
  calculateNetPayable,
  approveCertificateForRelease,
  getCertificateChain,
} from '../paymentCertificateService';
import { createCommercialBaseline } from '../commercialBaselineService';
import { submitPaymentClaim } from '../claimSubmissionService';
import type { AwardSnapshot, PaymentCertificate } from '../types';

const mockAward: AwardSnapshot = {
  awardId: 'award-001',
  projectId: 'project-001',
  appointedPartyId: 'party-001',
  appointedPartyName: 'Test Contractor',
  contractSum: { currency: 'ZAR', amount: 1_000_000 },
  vatIncluded: true,
  exclusions: [],
  qualifications: [],
  approvedAtIso: '2026-07-01T00:00:00.000Z',
};

const baseline = createCommercialBaseline(mockAward);

describe('paymentCertificateService', () => {
  describe('certifyPaymentClaim', () => {
    it('certifies a claim and calculates retention', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 500_000 },
        linkedMilestoneId: 'milestone-structure',
      });
      const cert = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 480_000,
      });
      expect(cert.certifiedAmount.amount).toBe(480_000);
      expect(cert.retentionHeld.amount).toBe(24_000); // 5% of 480k
      expect(cert.disputedAmount.amount).toBe(20_000); // claimed - certified
      expect(cert.approvedForRelease.amount).toBe(456_000); // certified - retention
      expect(cert.status).toBe('approval_required');
    });

    it('certifies full amount with no dispute', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 300_000 },
        linkedMilestoneId: 'milestone-enclosure',
      });
      const cert = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 300_000,
      });
      expect(cert.disputedAmount.amount).toBe(0);
      expect(cert.retentionHeld.amount).toBe(15_000);
    });

    it('disputed claims lock to disputed_locked status', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 150_000 },
        linkedMilestoneId: 'milestone-completion',
        disputed: true,
      });
      const cert = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 0,
      });
      expect(cert.status).toBe('disputed_locked');
      expect(cert.disputedAmount.amount).toBe(150_000);
    });

    it('assigns reviewer roles', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 100_000 },
        linkedMilestoneId: 'ms-1',
      });
      const cert = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 100_000,
      });
      expect(cert.reviewerRoles).toEqual([
        'quantity_surveyor',
        'lead_professional',
      ]);
    });

    it('allows custom reviewer roles', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'supplier',
        claimedAmount: { currency: 'ZAR', amount: 50_000 },
        linkedMilestoneId: 'ms-1',
      });
      const cert = certifyPaymentClaim(
        claim,
        baseline,
        { currency: 'ZAR', amount: 50_000 },
        ['lead_professional'],
      );
      expect(cert.reviewerRoles).toEqual(['lead_professional']);
    });
  });

  describe('reviseCertificate', () => {
    it('supersedes previous certificate', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 400_000 },
        linkedMilestoneId: 'ms-1',
      });
      const original = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 380_000,
      });
      const revised = reviseCertificate(original, claim, baseline, {
        currency: 'ZAR',
        amount: 390_000,
      });
      expect(revised.revisedFromCertificateId).toBe(original.certificateId);
      expect(revised.certificateId).not.toBe(original.certificateId);
      expect(revised.certifiedAmount.amount).toBe(390_000);
    });
  });

  describe('calculateNetPayable', () => {
    it('calculates net after retention and previous payments', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 200_000 },
        linkedMilestoneId: 'ms-1',
      });
      const cert = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 200_000,
      });
      const net = calculateNetPayable(cert, 50_000);
      // 200k - 10k retention - 50k previous = 140k
      expect(net.amount).toBe(140_000);
    });

    it('floors at zero', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 100_000 },
        linkedMilestoneId: 'ms-1',
      });
      const cert = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 100_000,
      });
      const net = calculateNetPayable(cert, 200_000);
      expect(net.amount).toBe(0);
    });
  });

  describe('approveCertificateForRelease', () => {
    it('transitions cert to approved_for_provider_request', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 100_000 },
        linkedMilestoneId: 'ms-1',
      });
      const cert = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 100_000,
      });
      const approved = approveCertificateForRelease(cert, 'lead_professional');
      expect(approved.status).toBe('approved_for_provider_request');
    });

    it('throws if certificate is disputed_locked', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 100_000 },
        linkedMilestoneId: 'ms-1',
        disputed: true,
      });
      const cert = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 0,
      });
      expect(() =>
        approveCertificateForRelease(cert, 'lead_professional'),
      ).toThrow(/disputed_locked/);
    });
  });

  describe('getCertificateChain', () => {
    it('returns chain of superseded certificates', () => {
      const claim = submitPaymentClaim({
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 400_000 },
        linkedMilestoneId: 'ms-1',
      });
      const c1 = certifyPaymentClaim(claim, baseline, {
        currency: 'ZAR',
        amount: 380_000,
      });
      const c2 = reviseCertificate(c1, claim, baseline, {
        currency: 'ZAR',
        amount: 390_000,
      });
      const c3 = reviseCertificate(c2, claim, baseline, {
        currency: 'ZAR',
        amount: 400_000,
      });

      const allCerts = [c1, c2, c3];
      const chain = getCertificateChain(allCerts, c3.certificateId);
      expect(chain).toHaveLength(3);
      expect(chain[0].certificateId).toBe(c3.certificateId);
      expect(chain[1].certificateId).toBe(c2.certificateId);
      expect(chain[2].certificateId).toBe(c1.certificateId);
    });
  });
});
