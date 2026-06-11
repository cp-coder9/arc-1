/**
 * Tests for Commercial Baseline Service
 */
import { describe, it, expect } from 'vitest';
import {
  createCommercialBaseline,
  incorporateVariationIntoBaseline,
  removeVariationFromBaseline,
  calculateContingency,
} from '../commercialBaselineService';
import type { AwardSnapshot } from '../types';

const mockAward: AwardSnapshot = {
  awardId: 'award-001',
  projectId: 'project-001',
  appointedPartyId: 'party-001',
  appointedPartyName: 'Test Contractor CC',
  contractSum: { currency: 'ZAR', amount: 2_000_000 },
  vatIncluded: true,
  exclusions: [],
  qualifications: [],
  approvedAtIso: '2026-07-01T00:00:00.000Z',
};

describe('commercialBaselineService', () => {
  describe('createCommercialBaseline', () => {
    it('creates a baseline from an award snapshot', () => {
      const baseline = createCommercialBaseline(mockAward);
      expect(baseline.baselineId).toBe('base-award-001');
      expect(baseline.award).toEqual(mockAward);
      expect(baseline.approvedVariationsTotal).toEqual({ currency: 'ZAR', amount: 0 });
      expect(baseline.currentContractSum).toEqual({ currency: 'ZAR', amount: 2_000_000 });
      expect(baseline.retentionPercent).toBe(5);
      expect(baseline.status).toBe('active');
    });

    it('preserves award data integrity', () => {
      const baseline = createCommercialBaseline(mockAward);
      expect(baseline.award.appointedPartyName).toBe('Test Contractor CC');
      expect(baseline.award.vatIncluded).toBe(true);
    });
  });

  describe('incorporateVariationIntoBaseline', () => {
    it('adds variation impact to baseline', () => {
      const baseline = createCommercialBaseline(mockAward);
      const updated = incorporateVariationIntoBaseline(baseline, {
        currency: 'ZAR',
        amount: 150_000,
      });
      expect(updated.approvedVariationsTotal).toEqual({
        currency: 'ZAR',
        amount: 150_000,
      });
      expect(updated.currentContractSum).toEqual({
        currency: 'ZAR',
        amount: 2_150_000,
      });
    });

    it('accumulates multiple variations', () => {
      const baseline = createCommercialBaseline(mockAward);
      const afterFirst = incorporateVariationIntoBaseline(baseline, {
        currency: 'ZAR',
        amount: 100_000,
      });
      const afterSecond = incorporateVariationIntoBaseline(afterFirst, {
        currency: 'ZAR',
        amount: 50_000,
      });
      expect(afterSecond.approvedVariationsTotal.amount).toBe(150_000);
      expect(afterSecond.currentContractSum.amount).toBe(2_150_000);
    });

    it('does not mutate the original baseline', () => {
      const baseline = createCommercialBaseline(mockAward);
      incorporateVariationIntoBaseline(baseline, {
        currency: 'ZAR',
        amount: 100_000,
      });
      expect(baseline.currentContractSum.amount).toBe(2_000_000);
    });
  });

  describe('removeVariationFromBaseline', () => {
    it('removes variation impact', () => {
      const baseline = createCommercialBaseline(mockAward);
      const withVar = incorporateVariationIntoBaseline(baseline, {
        currency: 'ZAR',
        amount: 200_000,
      });
      const removed = removeVariationFromBaseline(withVar, {
        currency: 'ZAR',
        amount: 200_000,
      });
      expect(removed.approvedVariationsTotal.amount).toBe(0);
      expect(removed.currentContractSum.amount).toBe(2_000_000);
    });

    it('prevents contract sum from falling below original award', () => {
      const baseline = createCommercialBaseline(mockAward);
      const removed = removeVariationFromBaseline(baseline, {
        currency: 'ZAR',
        amount: 500_000,
      });
      expect(removed.currentContractSum.amount).toBe(2_000_000);
      expect(removed.approvedVariationsTotal.amount).toBe(0);
    });
  });

  describe('calculateContingency', () => {
    it('returns zero when no variations', () => {
      const baseline = createCommercialBaseline(mockAward);
      expect(calculateContingency(baseline)).toEqual({
        currency: 'ZAR',
        amount: 0,
      });
    });

    it('returns variation total as contingency', () => {
      const baseline = createCommercialBaseline(mockAward);
      const withVar = incorporateVariationIntoBaseline(baseline, {
        currency: 'ZAR',
        amount: 300_000,
      });
      expect(calculateContingency(withVar).amount).toBe(300_000);
    });
  });
});
