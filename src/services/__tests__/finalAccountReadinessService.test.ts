import { describe, expect, it } from 'vitest';
import {
  evaluateVariationsIncorporation,
  evaluateClaimsSettlement,
  reconcileRetention,
  evaluateFinalAccountReadiness,
  prepareFinalPaymentCertificate,
} from '../finalAccountReadinessService';
import type { VariationRecord, ClaimRecord, RetentionRecord } from '../finalAccountReadinessService';

function makeVariation(overrides: Partial<VariationRecord> = {}): VariationRecord {
  return {
    id: 'var-1',
    projectId: 'project-1',
    title: 'Test variation',
    amount: 5000,
    status: 'agreed',
    requestedBy: 'contractor-1',
    requestedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeClaim(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    id: 'claim-1',
    projectId: 'project-1',
    title: 'Test claim',
    amount: 10000,
    status: 'agreed',
    submittedBy: 'contractor-1',
    submittedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('finalAccountReadinessService', () => {
  describe('evaluateVariationsIncorporation', () => {
    it('passes when all variations are resolved', () => {
      const result = evaluateVariationsIncorporation([
        makeVariation({ id: '1', status: 'agreed' }),
        makeVariation({ id: '2', status: 'approved' }),
        makeVariation({ id: '3', status: 'rejected' }),
      ]);
      expect(result.allIncorporated).toBe(true);
    });

    it('blocks when variations are pending', () => {
      const result = evaluateVariationsIncorporation([
        makeVariation({ id: '1', status: 'pending' }),
      ]);
      expect(result.allIncorporated).toBe(false);
      expect(result.pendingCount).toBe(1);
    });

    it('flags disputed variations', () => {
      const result = evaluateVariationsIncorporation([
        makeVariation({ id: '1', status: 'disputed' }),
      ]);
      expect(result.allIncorporated).toBe(false);
      expect(result.blockers.some((b) => b.includes('dispute'))).toBe(true);
    });

    it('handles empty array', () => {
      const result = evaluateVariationsIncorporation([]);
      expect(result.allIncorporated).toBe(true);
      expect(result.pendingCount).toBe(0);
    });
  });

  describe('evaluateClaimsSettlement', () => {
    it('passes when all claims are settled', () => {
      const result = evaluateClaimsSettlement([
        makeClaim({ id: '1', status: 'agreed' }),
        makeClaim({ id: '2', status: 'rejected' }),
      ]);
      expect(result.allSettled).toBe(true);
    });

    it('blocks when claims are pending', () => {
      const result = evaluateClaimsSettlement([
        makeClaim({ id: '1', status: 'submitted' }),
      ]);
      expect(result.allSettled).toBe(false);
    });

    it('flags escalated claims', () => {
      const result = evaluateClaimsSettlement([
        makeClaim({ id: '1', status: 'escalated' }),
      ]);
      expect(result.allSettled).toBe(false);
      expect(result.blockers.some((b) => b.includes('escalated'))).toBe(true);
    });
  });

  describe('reconcileRetention', () => {
    it('calculates retention based on contract sum and percentage', () => {
      const result = reconcileRetention({
        totalContractSum: 1000000,
        retentionPercentage: 5,
        variationsTotal: 100000,
        previouslyReleased: 0,
        releaseTriggersMet: [],
      });
      expect(result.totalRetentionAmount).toBe(55000); // 5% of 1,100,000
      expect(result.status).toBe('held');
    });

    it('marks partially released when practical completion trigger is met', () => {
      const result = reconcileRetention({
        totalContractSum: 1000000,
        retentionPercentage: 10,
        variationsTotal: 0,
        previouslyReleased: 0,
        releaseTriggersMet: ['practical_completion'],
      });
      expect(result.totalRetentionAmount).toBe(100000);
      expect(result.releasedAmount).toBe(50000); // 50% of retention
      expect(result.status).toBe('partially_released');
    });

    it('marks fully released when both triggers are met', () => {
      const result = reconcileRetention({
        totalContractSum: 1000000,
        retentionPercentage: 10,
        variationsTotal: 0,
        previouslyReleased: 0,
        releaseTriggersMet: ['practical_completion', 'defects_liability_expiry'],
      });
      expect(result.status).toBe('fully_released');
      expect(result.releasedAmount).toBe(result.totalRetentionAmount);
    });
  });

  describe('evaluateFinalAccountReadiness', () => {
    it('is ready when variations and claims are settled and retention is reconciling', () => {
      const retention = reconcileRetention({
        totalContractSum: 1000000,
        retentionPercentage: 10,
        variationsTotal: 0,
        previouslyReleased: 0,
        releaseTriggersMet: ['practical_completion'],
      });

      const result = evaluateFinalAccountReadiness({
        variations: [makeVariation({ status: 'agreed' })],
        claims: [makeClaim({ status: 'agreed' })],
        retention,
      });
      expect(result.ready).toBe(true);
      expect(result.status).toBe('prepared');
    });

    it('blocks when variations or claims are pending', () => {
      const retention = reconcileRetention({
        totalContractSum: 1000000,
        retentionPercentage: 10,
        variationsTotal: 0,
        previouslyReleased: 0,
        releaseTriggersMet: [],
      });

      const result = evaluateFinalAccountReadiness({
        variations: [makeVariation({ status: 'pending' })],
        claims: [makeClaim({ status: 'submitted' })],
        retention,
      });
      expect(result.ready).toBe(false);
      expect(result.status).toBe('in_progress');
    });
  });

  describe('prepareFinalPaymentCertificate', () => {
    it('calculates net payment due correctly', () => {
      const retention = reconcileRetention({
        totalContractSum: 1000000,
        retentionPercentage: 5,
        variationsTotal: 0,
        previouslyReleased: 0,
        releaseTriggersMet: ['practical_completion'],
      });

      const cert = prepareFinalPaymentCertificate({
        projectId: 'project-1',
        preparedBy: 'qs-1',
        totalContractSum: 1000000,
        variations: [
          makeVariation({ id: '1', amount: 50000, status: 'agreed' }),
          makeVariation({ id: '2', amount: -10000, status: 'approved' }),
        ],
        claims: [
          makeClaim({ id: '1', amount: 20000, status: 'agreed' }),
        ],
        retention,
      });

      expect(cert.totalContractSum).toBe(1000000);
      expect(cert.variationsTotal).toBe(40000); // 50000 - 10000
      expect(cert.claimsTotal).toBe(20000);
      expect(cert.status).toBe('draft');
      expect(cert.projectId).toBe('project-1');
    });
  });
});
