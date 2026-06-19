import { describe, expect, it } from 'vitest';
import {
  evaluateOccupancyCertificate,
  evaluateInsuranceTransition,
  evaluateUtilityHandover,
  evaluateOccupationReadiness,
  getRequiredUtilityTypes,
  getUtilityLabel,
} from '../occupationReadinessService';
import type { OccupancyCertificate, InsuranceTransitionCheck, UtilityHandoverItem } from '../occupationReadinessService';

function makeOC(overrides: Partial<OccupancyCertificate> = {}): OccupancyCertificate {
  return {
    id: 'oc-1',
    projectId: 'project-1',
    issuingAuthority: 'City of Cape Town',
    status: 'obtained',
    ...overrides,
  };
}

function makeInsurance(overrides: Partial<InsuranceTransitionCheck> = {}): InsuranceTransitionCheck {
  return {
    id: 'ins-1',
    projectId: 'project-1',
    constructionPolicyActive: true,
    occupationPolicyQuoted: true,
    occupationPolicyActive: true,
    gapInCover: false,
    requiresBrokerReview: false,
    ...overrides,
  };
}

function makeUtility(overrides: Partial<UtilityHandoverItem> = {}): UtilityHandoverItem {
  return {
    id: 'util-1',
    utilityType: 'water',
    provider: 'City Water',
    accountTransferred: true,
    meterReadingRecorded: true,
    status: 'complete',
    ...overrides,
  };
}

describe('occupationReadinessService', () => {
  describe('evaluateOccupancyCertificate', () => {
    it('passes when certificate is obtained', () => {
      const result = evaluateOccupancyCertificate({
        certificateObtained: true,
        issuingAuthority: 'City of Cape Town',
        hasConditions: false,
      });
      expect(result.valid).toBe(true);
    });

    it('blocks when certificate not obtained', () => {
      const result = evaluateOccupancyCertificate({
        certificateObtained: false,
        issuingAuthority: 'City of Cape Town',
        hasConditions: false,
      });
      expect(result.valid).toBe(false);
      expect(result.blockers[0]).toContain('not been obtained');
    });

    it('blocks when certificate has unaddressed conditions', () => {
      const result = evaluateOccupancyCertificate({
        certificateObtained: true,
        issuingAuthority: 'City of Cape Town',
        hasConditions: true,
        conditions: ['Install fire extinguishers', 'Repair access ramp'],
      });
      expect(result.valid).toBe(false);
      expect(result.blockers[0]).toContain('2 condition(s)');
    });
  });

  describe('evaluateInsuranceTransition', () => {
    it('passes when all policies are active', () => {
      const result = evaluateInsuranceTransition({
        constructionPolicyActive: true,
        occupationPolicyQuoted: true,
        occupationPolicyActive: true,
      });
      expect(result.ready).toBe(true);
    });

    it('blocks when construction policy not active', () => {
      const result = evaluateInsuranceTransition({
        constructionPolicyActive: false,
        occupationPolicyQuoted: true,
        occupationPolicyActive: true,
      });
      expect(result.ready).toBe(false);
    });

    it('blocks when occupation policy not quoted or active', () => {
      const result = evaluateInsuranceTransition({
        constructionPolicyActive: true,
        occupationPolicyQuoted: false,
        occupationPolicyActive: false,
      });
      expect(result.ready).toBe(false);
      expect(result.blockers).toHaveLength(2);
    });
  });

  describe('evaluateUtilityHandover', () => {
    it('passes when required utilities are handed over', () => {
      const result = evaluateUtilityHandover([
        makeUtility({ id: '1', utilityType: 'water', status: 'complete' }),
        makeUtility({ id: '2', utilityType: 'electricity', status: 'complete' }),
        makeUtility({ id: '3', utilityType: 'sewerage', status: 'complete' }),
      ]);
      expect(result.ready).toBe(true);
    });

    it('blocks when required utilities are pending', () => {
      const result = evaluateUtilityHandover([
        makeUtility({ id: '1', utilityType: 'water', status: 'pending' }),
        makeUtility({ id: '2', utilityType: 'electricity', status: 'pending' }),
      ]);
      expect(result.ready).toBe(false);
      expect(result.blockers[0]).toContain('Water supply');
    });

    it('treats not_applicable as complete', () => {
      const result = evaluateUtilityHandover([
        makeUtility({ id: '1', utilityType: 'water', status: 'not_applicable' }),
        makeUtility({ id: '2', utilityType: 'electricity', status: 'complete' }),
        makeUtility({ id: '3', utilityType: 'sewerage', status: 'not_applicable' }),
      ]);
      expect(result.ready).toBe(true);
    });
  });

  describe('evaluateOccupationReadiness', () => {
    it('passes when all checks are met', () => {
      const result = evaluateOccupationReadiness({
        occupancyCertificate: makeOC(),
        insuranceTransition: makeInsurance(),
        utilityHandoverItems: [
          makeUtility({ id: '1', utilityType: 'water', status: 'complete' }),
          makeUtility({ id: '2', utilityType: 'electricity', status: 'complete' }),
          makeUtility({ id: '3', utilityType: 'sewerage', status: 'complete' }),
        ],
        statutoryApprovals: [{ type: 'fire_safety', status: 'approved', reference: 'FIRE-001' }],
      });
      expect(result.ready).toBe(true);
      expect(result.status).toBe('ready');
    });

    it('blocks when OC has conditions that must be addressed', () => {
      const result = evaluateOccupationReadiness({
        occupancyCertificate: makeOC({ status: 'conditional', conditions: ['Minor item'] }),
        insuranceTransition: makeInsurance(),
        utilityHandoverItems: [
          makeUtility({ id: '1', utilityType: 'water', status: 'complete' }),
          makeUtility({ id: '2', utilityType: 'electricity', status: 'complete' }),
          makeUtility({ id: '3', utilityType: 'sewerage', status: 'complete' }),
        ],
      });
      expect(result.ready).toBe(false);
      expect(result.status).toBe('blocked');
    });

    it('blocks when statutory approvals are rejected', () => {
      const result = evaluateOccupationReadiness({
        occupancyCertificate: makeOC(),
        insuranceTransition: makeInsurance(),
        utilityHandoverItems: [],
        statutoryApprovals: [{ type: 'zoning', status: 'rejected', reference: 'Z-001' }],
      });
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes('rejected'))).toBe(true);
    });
  });

  describe('getRequiredUtilityTypes', () => {
    it('returns water, electricity, and sewerage', () => {
      const required = getRequiredUtilityTypes();
      expect(required).toContain('water');
      expect(required).toContain('electricity');
      expect(required).toContain('sewerage');
    });
  });

  describe('getUtilityLabel', () => {
    it('returns human readable labels', () => {
      expect(getUtilityLabel('water')).toBe('Water supply');
      expect(getUtilityLabel('electricity')).toBe('Electricity supply');
      expect(getUtilityLabel('unknown' as any)).toBe('unknown');
    });
  });
});
