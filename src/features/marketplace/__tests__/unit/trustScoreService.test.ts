import { describe, it, expect } from 'vitest';
import {
  computeScoreFromInputs,
  computeRegistrationScore,
  computeCpdScore,
  computeProjectCompletionScore,
  computeAuditPassScore,
  computeRatingsScore,
  computeToolMasteryScore,
  computeDisputeFreeScore,
  FACTOR_WEIGHTS,
  type TrustScoreFactorInputs,
} from '../../services/trustScoreService';

describe('trustScoreService — pure computation', () => {
  const TIMESTAMP = '2026-01-15T12:00:00.000Z';

  describe('computeRegistrationScore', () => {
    it('returns 100 for active registration', () => {
      const result = computeRegistrationScore('active');
      expect(result.rawScore).toBe(100);
      expect(result.insufficientData).toBe(false);
    });

    it('returns 0 for inactive registration', () => {
      const result = computeRegistrationScore('inactive');
      expect(result.rawScore).toBe(0);
      expect(result.insufficientData).toBe(false);
    });

    it('returns 0 for suspended registration', () => {
      const result = computeRegistrationScore('suspended');
      expect(result.rawScore).toBe(0);
      expect(result.insufficientData).toBe(false);
    });

    it('returns 0 with insufficientData when null', () => {
      const result = computeRegistrationScore(null);
      expect(result.rawScore).toBe(0);
      expect(result.insufficientData).toBe(true);
    });

    it('returns 0 with insufficientData when undefined', () => {
      const result = computeRegistrationScore(undefined);
      expect(result.rawScore).toBe(0);
      expect(result.insufficientData).toBe(true);
    });
  });

  describe('computeCpdScore', () => {
    it('returns 100 when CPD compliant', () => {
      expect(computeCpdScore(true)).toEqual({ rawScore: 100, insufficientData: false });
    });

    it('returns 0 when CPD non-compliant', () => {
      expect(computeCpdScore(false)).toEqual({ rawScore: 0, insufficientData: false });
    });

    it('returns 0 with insufficientData when null', () => {
      expect(computeCpdScore(null)).toEqual({ rawScore: 0, insufficientData: true });
    });
  });

  describe('computeProjectCompletionScore', () => {
    it('returns 100 when all accepted projects are completed', () => {
      const result = computeProjectCompletionScore(5, 5);
      expect(result.rawScore).toBe(100);
      expect(result.insufficientData).toBe(false);
    });

    it('returns proportional score for partial completion', () => {
      const result = computeProjectCompletionScore(3, 4);
      expect(result.rawScore).toBe(75);
      expect(result.insufficientData).toBe(false);
    });

    it('returns 0 with insufficientData when accepted is 0', () => {
      const result = computeProjectCompletionScore(0, 0);
      expect(result.rawScore).toBe(0);
      expect(result.insufficientData).toBe(true);
    });

    it('returns 0 with insufficientData when data unavailable', () => {
      const result = computeProjectCompletionScore(null, null);
      expect(result.rawScore).toBe(0);
      expect(result.insufficientData).toBe(true);
    });
  });

  describe('computeAuditPassScore', () => {
    it('returns 100 when all audits passed first time', () => {
      const result = computeAuditPassScore(10, 10);
      expect(result.rawScore).toBe(100);
      expect(result.insufficientData).toBe(false);
    });

    it('returns proportional score for partial pass rate', () => {
      const result = computeAuditPassScore(7, 10);
      expect(result.rawScore).toBe(70);
      expect(result.insufficientData).toBe(false);
    });

    it('returns 0 with insufficientData when total is 0', () => {
      const result = computeAuditPassScore(0, 0);
      expect(result.rawScore).toBe(0);
      expect(result.insufficientData).toBe(true);
    });

    it('returns 0 with insufficientData when data unavailable', () => {
      const result = computeAuditPassScore(undefined, undefined);
      expect(result.rawScore).toBe(0);
      expect(result.insufficientData).toBe(true);
    });
  });

  describe('computeRatingsScore', () => {
    it('maps 5.0 rating to 100', () => {
      expect(computeRatingsScore(5.0)).toEqual({ rawScore: 100, insufficientData: false });
    });

    it('maps 1.0 rating to 20', () => {
      expect(computeRatingsScore(1.0)).toEqual({ rawScore: 20, insufficientData: false });
    });

    it('maps 3.5 rating to 70', () => {
      expect(computeRatingsScore(3.5)).toEqual({ rawScore: 70, insufficientData: false });
    });

    it('returns 0 with insufficientData when unavailable', () => {
      expect(computeRatingsScore(null)).toEqual({ rawScore: 0, insufficientData: true });
    });
  });

  describe('computeToolMasteryScore', () => {
    it('returns 100 when 5 or more tools used', () => {
      expect(computeToolMasteryScore(5)).toEqual({ rawScore: 100, insufficientData: false });
      expect(computeToolMasteryScore(10)).toEqual({ rawScore: 100, insufficientData: false });
    });

    it('returns proportional score when fewer than 5 tools', () => {
      expect(computeToolMasteryScore(3)).toEqual({ rawScore: 60, insufficientData: false });
      expect(computeToolMasteryScore(1)).toEqual({ rawScore: 20, insufficientData: false });
    });

    it('returns 0 when no tools used', () => {
      expect(computeToolMasteryScore(0)).toEqual({ rawScore: 0, insufficientData: false });
    });

    it('returns 0 with insufficientData when unavailable', () => {
      expect(computeToolMasteryScore(null)).toEqual({ rawScore: 0, insufficientData: true });
    });
  });

  describe('computeDisputeFreeScore', () => {
    it('returns 100 when no upheld disputes', () => {
      expect(computeDisputeFreeScore(false)).toEqual({ rawScore: 100, insufficientData: false });
    });

    it('returns 0 when upheld disputes exist', () => {
      expect(computeDisputeFreeScore(true)).toEqual({ rawScore: 0, insufficientData: false });
    });

    it('returns 0 with insufficientData when unavailable', () => {
      expect(computeDisputeFreeScore(null)).toEqual({ rawScore: 0, insufficientData: true });
    });
  });

  describe('computeScoreFromInputs', () => {
    it('produces score of 0 when all data unavailable', () => {
      const score = computeScoreFromInputs('user-1', {}, TIMESTAMP);
      expect(score.userId).toBe('user-1');
      expect(score.overallScore).toBe(0);
      expect(score.calculatedAt).toBe(TIMESTAMP);
      expect(score.badges).toEqual([]);
      expect(score.factors).toHaveLength(7);
      for (const factor of score.factors) {
        expect(factor.rawScore).toBe(0);
        expect(factor.insufficientData).toBe(true);
      }
    });

    it('produces maximum score of 100 with all perfect inputs', () => {
      const inputs: TrustScoreFactorInputs = {
        registrationStatus: 'active',
        cpdCompliant: true,
        projectsCompleted: 10,
        projectsAccepted: 10,
        auditsPassed: 20,
        auditsTotal: 20,
        averageRating: 5.0,
        distinctToolsUsed: 10,
        hasUpheldDisputes: false,
      };
      const score = computeScoreFromInputs('user-perfect', inputs, TIMESTAMP);
      expect(score.overallScore).toBe(100);
      expect(score.badges).toContain('top_10_percent');
    });

    it('correctly computes weighted sum', () => {
      const inputs: TrustScoreFactorInputs = {
        registrationStatus: 'active',      // 100 * 0.25 = 25
        cpdCompliant: true,                // 100 * 0.20 = 20
        projectsCompleted: 5,
        projectsAccepted: 10,              // 50 * 0.15 = 7.5
        auditsPassed: 8,
        auditsTotal: 10,                   // 80 * 0.15 = 12
        averageRating: 4.0,               // 80 * 0.10 = 8
        distinctToolsUsed: 3,              // 60 * 0.10 = 6
        hasUpheldDisputes: false,          // 100 * 0.05 = 5
      };
      // Total = 25 + 20 + 7.5 + 12 + 8 + 6 + 5 = 83.5 → rounded = 84
      const score = computeScoreFromInputs('user-mid', inputs, TIMESTAMP);
      expect(score.overallScore).toBe(84);
      expect(score.badges).toEqual([]);
    });

    it('assigns top_10_percent badge when score ≥ 90', () => {
      const inputs: TrustScoreFactorInputs = {
        registrationStatus: 'active',      // 100 * 0.25 = 25
        cpdCompliant: true,                // 100 * 0.20 = 20
        projectsCompleted: 9,
        projectsAccepted: 10,              // 90 * 0.15 = 13.5
        auditsPassed: 9,
        auditsTotal: 10,                   // 90 * 0.15 = 13.5
        averageRating: 4.5,               // 90 * 0.10 = 9
        distinctToolsUsed: 5,              // 100 * 0.10 = 10
        hasUpheldDisputes: false,          // 100 * 0.05 = 5
      };
      // Total = 25 + 20 + 13.5 + 13.5 + 9 + 10 + 5 = 96 → rounded = 96
      const score = computeScoreFromInputs('user-top', inputs, TIMESTAMP);
      expect(score.overallScore).toBe(96);
      expect(score.badges).toContain('top_10_percent');
    });

    it('does NOT assign badge when score is 89', () => {
      const inputs: TrustScoreFactorInputs = {
        registrationStatus: 'active',      // 100 * 0.25 = 25
        cpdCompliant: true,                // 100 * 0.20 = 20
        projectsCompleted: 8,
        projectsAccepted: 10,              // 80 * 0.15 = 12
        auditsPassed: 8,
        auditsTotal: 10,                   // 80 * 0.15 = 12
        averageRating: 4.5,               // 90 * 0.10 = 9
        distinctToolsUsed: 5,              // 100 * 0.10 = 10
        hasUpheldDisputes: false,          // 100 * 0.05 = 5
      };
      // Total = 25 + 20 + 12 + 12 + 9 + 10 + 5 = 93 → nope, let's recalc
      // Actually: 25 + 20 + 12 + 12 + 9 + 10 + 5 = 93, still above 90
      // Let's reduce: averageRating to 3.0 → 60 * 0.10 = 6
      // distinctToolsUsed to 4 → 80 * 0.10 = 8
      // Total = 25 + 20 + 12 + 12 + 6 + 8 + 5 = 88
      const adjustedInputs: TrustScoreFactorInputs = {
        registrationStatus: 'active',
        cpdCompliant: true,
        projectsCompleted: 8,
        projectsAccepted: 10,
        auditsPassed: 8,
        auditsTotal: 10,
        averageRating: 3.0,
        distinctToolsUsed: 4,
        hasUpheldDisputes: false,
      };
      const score = computeScoreFromInputs('user-under-90', adjustedInputs, TIMESTAMP);
      expect(score.overallScore).toBeLessThan(90);
      expect(score.badges).not.toContain('top_10_percent');
    });

    it('clamps score to 0 minimum', () => {
      // All factors returning 0 should give 0
      const inputs: TrustScoreFactorInputs = {
        registrationStatus: 'suspended',
        cpdCompliant: false,
        projectsCompleted: 0,
        projectsAccepted: 10,
        auditsPassed: 0,
        auditsTotal: 10,
        averageRating: 0,
        distinctToolsUsed: 0,
        hasUpheldDisputes: true,
      };
      const score = computeScoreFromInputs('user-zero', inputs, TIMESTAMP);
      expect(score.overallScore).toBe(0);
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('clamps score to 100 maximum', () => {
      // Perfect scores should not exceed 100
      const inputs: TrustScoreFactorInputs = {
        registrationStatus: 'active',
        cpdCompliant: true,
        projectsCompleted: 100,
        projectsAccepted: 100,
        auditsPassed: 100,
        auditsTotal: 100,
        averageRating: 5.0,
        distinctToolsUsed: 50,
        hasUpheldDisputes: false,
      };
      const score = computeScoreFromInputs('user-max', inputs, TIMESTAMP);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });

    it('returns integer overall score (rounded)', () => {
      const inputs: TrustScoreFactorInputs = {
        registrationStatus: 'active',
        cpdCompliant: true,
        projectsCompleted: 1,
        projectsAccepted: 3,    // 33.33... * 0.15 = 5.0
        auditsPassed: 1,
        auditsTotal: 3,         // 33.33... * 0.15 = 5.0
        averageRating: 2.7,    // 54 * 0.10 = 5.4
        distinctToolsUsed: 2,   // 40 * 0.10 = 4
        hasUpheldDisputes: false,
      };
      const score = computeScoreFromInputs('user-frac', inputs, TIMESTAMP);
      expect(Number.isInteger(score.overallScore)).toBe(true);
    });

    it('per-factor weightedScore equals rawScore * weight', () => {
      const inputs: TrustScoreFactorInputs = {
        registrationStatus: 'active',
        cpdCompliant: true,
        projectsCompleted: 7,
        projectsAccepted: 10,
        auditsPassed: 6,
        auditsTotal: 10,
        averageRating: 4.2,
        distinctToolsUsed: 3,
        hasUpheldDisputes: false,
      };
      const score = computeScoreFromInputs('user-verify', inputs, TIMESTAMP);
      for (const factor of score.factors) {
        expect(factor.weightedScore).toBeCloseTo(factor.rawScore * factor.weight, 10);
      }
    });

    it('all factor weights sum to 1.0', () => {
      const totalWeight = Object.values(FACTOR_WEIGHTS).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBeCloseTo(1.0, 10);
    });

    it('returns exactly 7 factors', () => {
      const score = computeScoreFromInputs('user-count', {}, TIMESTAMP);
      expect(score.factors).toHaveLength(7);
    });

    it('sets registration factor to 0 when API returns inactive/suspended (Requirement 1.6)', () => {
      const suspendedInputs: TrustScoreFactorInputs = {
        registrationStatus: 'suspended',
        cpdCompliant: true,
        projectsCompleted: 10,
        projectsAccepted: 10,
        auditsPassed: 10,
        auditsTotal: 10,
        averageRating: 5.0,
        distinctToolsUsed: 10,
        hasUpheldDisputes: false,
      };
      const score = computeScoreFromInputs('user-suspended', suspendedInputs, TIMESTAMP);
      const regFactor = score.factors.find(f => f.factor === 'professional_registration')!;
      expect(regFactor.rawScore).toBe(0);
      expect(regFactor.insufficientData).toBe(false);
      // Overall should be 75 (100 - 25 registration weight * 100)
      expect(score.overallScore).toBe(75);
    });

    it('uses provided calculatedAt timestamp', () => {
      const score = computeScoreFromInputs('user-ts', {}, '2026-06-01T00:00:00.000Z');
      expect(score.calculatedAt).toBe('2026-06-01T00:00:00.000Z');
    });

    it('generates timestamp if not provided', () => {
      const score = computeScoreFromInputs('user-auto-ts', {});
      expect(score.calculatedAt).toBeDefined();
      // Should be a valid ISO string
      expect(new Date(score.calculatedAt).toISOString()).toBe(score.calculatedAt);
    });
  });
});
