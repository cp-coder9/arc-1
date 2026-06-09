/**
 * Tests for Escrow Release Request Service
 */
import { describe, it, expect } from 'vitest';
import {
  createReleaseRequest,
  approveReleaseRequest,
  getReleaseBlockers,
} from '../escrowReleaseRequestService';
import { createCommercialBaseline } from '../commercialBaselineService';
import { submitPaymentClaim } from '../claimSubmissionService';
import { certifyPaymentClaim } from '../paymentCertificateService';
import type { AwardSnapshot, FinancialProvider, PaymentCertificate } from '../types';

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

const liveProvider: FinancialProvider = {
  providerId: 'live-escrow',
  name: 'Live Escrow Provider',
  providerType: 'escrow_provider',
  registered: true,
  capabilities: ['collect', 'escrow_hold', 'release', 'webhook_status'],
  liveConfigured: true,
};

const unconfiguredProvider: FinancialProvider = {
  providerId: 'placeholder-escrow',
  name: 'Placeholder Escrow',
  providerType: 'escrow_provider',
  registered: true,
  capabilities: ['escrow_hold', 'release'],
  liveConfigured: false,
};

function makeCertificate(disputed = false): PaymentCertificate {
  const claim = submitPaymentClaim({
    claimantRole: 'contractor',
    claimedAmount: { currency: 'ZAR', amount: 500_000 },
    linkedMilestoneId: 'milestone-structure',
    disputed,
  });
  return certifyPaymentClaim(claim, baseline, {
    currency: 'ZAR',
    amount: disputed ? 0 : 480_000,
  });
}

describe('escrowReleaseRequestService', () => {
  describe('createReleaseRequest', () => {
    it('creates a release request with approval_required when no approvals', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, liveProvider, []);
      expect(release.status).toBe('approval_required');
      expect(release.amount).toEqual(cert.approvedForRelease);
    });

    it('creates submitted_to_provider when all approvals present with live provider', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, liveProvider, [
        'client',
        'lead_professional',
      ]);
      expect(release.status).toBe('submitted_to_provider');
      expect(release.providerReference).toBeTruthy();
    });

    it('stays provider_configuration_required when provider not live', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, unconfiguredProvider, [
        'client',
        'lead_professional',
      ]);
      expect(release.status).toBe('provider_configuration_required');
      expect(release.providerReference).toBeUndefined();
    });

    it('disputes lock to disputed_locked status', () => {
      const cert = makeCertificate(true);
      const release = createReleaseRequest(cert, liveProvider, [
        'client',
        'lead_professional',
      ]);
      expect(release.status).toBe('disputed_locked');
    });

    it('records required approvals', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, liveProvider, ['client']);
      expect(release.requiredApprovals).toContain('client');
      expect(release.requiredApprovals).toContain('lead_professional');
    });
  });

  describe('approveReleaseRequest', () => {
    it('adds an approval to the request', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, liveProvider, []);
      const updated = approveReleaseRequest(release, 'client', liveProvider);
      expect(updated.approvals).toContain('client');
      expect(updated.approvals).toHaveLength(1);
    });

    it('transitions when all approvals present', () => {
      const cert = makeCertificate();
      let release = createReleaseRequest(cert, liveProvider, ['client']);
      release = approveReleaseRequest(release, 'lead_professional', liveProvider);
      expect(release.status).toBe('submitted_to_provider');
    });

    it('no-ops for duplicate approvals', () => {
      const cert = makeCertificate();
      let release = createReleaseRequest(cert, liveProvider, ['client']);
      release = approveReleaseRequest(release, 'client', liveProvider);
      expect(release.approvals).toHaveLength(1);
    });

    it('throws for non-required approver', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, liveProvider, []);
      expect(() =>
        approveReleaseRequest(release, 'quantity_surveyor', liveProvider),
      ).toThrow(/not a required approver/);
    });

    it('stays provider_configuration_required with unconfigured provider even with all approvals', () => {
      const cert = makeCertificate();
      let release = createReleaseRequest(cert, unconfiguredProvider, ['client']);
      release = approveReleaseRequest(
        release,
        'lead_professional',
        unconfiguredProvider,
      );
      expect(release.status).toBe('provider_configuration_required');
    });
  });

  describe('getReleaseBlockers', () => {
    it('lists missing approvals as blockers', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, liveProvider, ['client']);
      const blockers = getReleaseBlockers(release, liveProvider);
      expect(blockers.some((b) => b.includes('lead_professional'))).toBe(true);
    });

    it('lists provider_configuration_required as blocker', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, unconfiguredProvider, [
        'client',
        'lead_professional',
      ]);
      const blockers = getReleaseBlockers(release, unconfiguredProvider);
      expect(blockers.some((b) => b.includes('not live-configured'))).toBe(true);
    });

    it('lists dispute as blocker', () => {
      const cert = makeCertificate(true);
      const release = createReleaseRequest(cert, liveProvider, [
        'client',
        'lead_professional',
      ]);
      const blockers = getReleaseBlockers(release, liveProvider);
      expect(blockers.some((b) => b.includes('disputed_locked'))).toBe(true);
    });

    it('returns empty when no blockers', () => {
      const cert = makeCertificate();
      const release = createReleaseRequest(cert, liveProvider, [
        'client',
        'lead_professional',
      ]);
      const blockers = getReleaseBlockers(release, liveProvider);
      expect(blockers).toHaveLength(0);
    });
  });
});
