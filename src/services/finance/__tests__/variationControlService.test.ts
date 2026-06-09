/**
 * Tests for Variation Control Service
 */
import { describe, it, expect } from 'vitest';
import {
  createVariationRequest,
  createAndSubmitVariation,
  transitionVariation,
  approveAndIncorporateVariation,
  rejectVariation,
  reverseVariation,
} from '../variationControlService';
import { createCommercialBaseline } from '../commercialBaselineService';
import type { AwardSnapshot } from '../types';

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

describe('variationControlService', () => {
  describe('createVariationRequest', () => {
    it('creates a draft variation', () => {
      const v = createVariationRequest({
        description: 'Additional drainage works',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 50_000 },
        programmeImpactDays: 5,
      });
      expect(v.status).toBe('draft');
      expect(v.approved).toBe(false);
      expect(v.description).toBe('Additional drainage works');
      expect(v.estimatedImpact.amount).toBe(50_000);
      expect(v.programmeImpactDays).toBe(5);
    });

    it('generates unique variation IDs', () => {
      const v1 = createVariationRequest({
        description: 'Test variation',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      const v2 = createVariationRequest({
        description: 'Test variation',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      expect(v1.variationId).not.toBe(v2.variationId);
    });
  });

  describe('createAndSubmitVariation', () => {
    it('creates and submits in one call', () => {
      const v = createAndSubmitVariation({
        description: 'Urgent variation',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 25_000 },
        programmeImpactDays: 3,
      });
      expect(v.status).toBe('submitted');
      expect(v.submittedAtIso).toBeTruthy();
    });
  });

  describe('transitionVariation', () => {
    it('transitions draft → submitted', () => {
      const v = createVariationRequest({
        description: 'Test',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      const submitted = transitionVariation(v, 'submitted');
      expect(submitted.status).toBe('submitted');
      expect(submitted.submittedAtIso).toBeTruthy();
    });

    it('transitions submitted → under_review', () => {
      const v = createAndSubmitVariation({
        description: 'Test',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      const reviewed = transitionVariation(v, 'under_review');
      expect(reviewed.status).toBe('under_review');
    });

    it('transitions under_review → approved', () => {
      let v = createAndSubmitVariation({
        description: 'Test',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      v = transitionVariation(v, 'under_review');
      const approved = transitionVariation(v, 'approved');
      expect(approved.status).toBe('approved');
      expect(approved.approved).toBe(true);
      expect(approved.approvedAtIso).toBeTruthy();
    });

    it('transitions under_review → rejected', () => {
      let v = createAndSubmitVariation({
        description: 'Test',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      v = transitionVariation(v, 'under_review');
      const rejected = transitionVariation(v, 'rejected');
      expect(rejected.status).toBe('rejected');
      expect(rejected.approved).toBe(false);
    });

    it('allows restart from rejected → draft', () => {
      let v = createAndSubmitVariation({
        description: 'Test',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      v = transitionVariation(v, 'under_review');
      v = transitionVariation(v, 'rejected');
      const restart = transitionVariation(v, 'draft');
      expect(restart.status).toBe('draft');
    });

    it('throws on invalid transitions', () => {
      const v = createVariationRequest({
        description: 'Test',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      expect(() => transitionVariation(v, 'approved')).toThrow(
        /Invalid variation transition/,
      );
    });

    it('prevents transition from incorporated', () => {
      let v = createAndSubmitVariation({
        description: 'Test',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      v = transitionVariation(v, 'under_review');
      v = transitionVariation(v, 'approved');
      v = transitionVariation(v, 'incorporated');
      expect(() => transitionVariation(v, 'rejected')).toThrow(
        /Invalid variation transition/,
      );
    });
  });

  describe('approveAndIncorporateVariation', () => {
    it('approves and incorporates into baseline', () => {
      const v = createAndSubmitVariation({
        description: 'Drainage upgrade',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 85_000 },
        programmeImpactDays: 5,
      });
      const result = approveAndIncorporateVariation(baseline, v);
      expect(result.variation.status).toBe('incorporated');
      expect(result.variation.approved).toBe(true);
      expect(result.baseline.currentContractSum.amount).toBe(1_085_000);
      expect(result.baseline.approvedVariationsTotal.amount).toBe(85_000);
    });

    it('handles variation in draft state', () => {
      const v = createVariationRequest({
        description: 'Draft variation',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 20_000 },
        programmeImpactDays: 2,
      });
      const result = approveAndIncorporateVariation(baseline, v);
      expect(result.variation.status).toBe('incorporated');
    });
  });

  describe('rejectVariation', () => {
    it('rejects a submitted variation', () => {
      const v = createAndSubmitVariation({
        description: 'Rejected work',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 30_000 },
        programmeImpactDays: 4,
      });
      let underReview = transitionVariation(v, 'under_review');
      const rejected = rejectVariation(underReview);
      expect(rejected.status).toBe('rejected');
      expect(rejected.approved).toBe(false);
    });
  });

  describe('reverseVariation', () => {
    it('reverses an incorporated variation', () => {
      const v = createAndSubmitVariation({
        description: 'To be reversed',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 100_000 },
        programmeImpactDays: 10,
      });
      const { baseline: updatedBaseline, variation: incorporated } =
        approveAndIncorporateVariation(baseline, v);
      expect(incorporated.status).toBe('incorporated');

      const { baseline: reversedBaseline, variation: reversed } =
        reverseVariation(updatedBaseline, incorporated);
      expect(reversed.status).toBe('rejected');
      expect(reversed.approved).toBe(false);
      expect(reversedBaseline.currentContractSum.amount).toBe(1_000_000);
    });

    it('throws if variation is not incorporated', () => {
      const v = createAndSubmitVariation({
        description: 'Not incorporated',
        requestedBy: 'contractor',
        estimatedImpact: { currency: 'ZAR', amount: 10_000 },
        programmeImpactDays: 1,
      });
      expect(() => reverseVariation(baseline, v)).toThrow(
        /only reverse incorporated variations/,
      );
    });
  });
});
