import { describe, it, expect } from 'vitest';
import {
  validateBbeeCriteria,
  getBbeeCertificateStatus,
  getBbeeWarnings,
  canFinaliseComparison,
  canProgressAward,
  calculateLocalContentPercentage,
  getLocalSpendWarnings,
} from '../bbeeComplianceService';
import type { EvaluationCriteria, SupplierMarketplaceProfile } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<SupplierMarketplaceProfile> = {}): SupplierMarketplaceProfile {
  return {
    supplierId: 'sup-001',
    firmName: 'Test Supplier',
    tradeCategories: ['structural steel'],
    deliveryRegions: ['Gauteng'],
    verificationStatus: 'verified',
    bbeeLevelNumber: 2,
    bbeeCertificateExpiry: '2027-12-31T00:00:00.000Z',
    completedDeliveryCount: 5,
    ...overrides,
  };
}

function makeCriteria(overrides: Partial<EvaluationCriteria> = {}): EvaluationCriteria {
  return {
    priceWeight: 40,
    leadTimeWeight: 20,
    bbeeWeight: 15,
    warrantyWeight: 15,
    performanceWeight: 10,
    ...overrides,
  };
}

const NOW = new Date('2026-06-15T00:00:00.000Z');

// ─── validateBbeeCriteria ────────────────────────────────────────────────────

describe('validateBbeeCriteria', () => {
  it('passes when public sector and bbeeWeight >= 10', () => {
    const criteria = makeCriteria({ bbeeWeight: 10 });
    const result = validateBbeeCriteria(criteria, true, undefined);
    expect(result.valid).toBe(true);
  });

  it('fails when public sector and bbeeWeight < 10', () => {
    const criteria = makeCriteria({ bbeeWeight: 5 });
    const result = validateBbeeCriteria(criteria, true, undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].code).toBe('RFQ_BBEE_WEIGHT_LOW');
    }
  });

  it('fails when estimatedValue > 1,000,000 and bbeeWeight < 10', () => {
    const criteria = makeCriteria({ bbeeWeight: 8 });
    const result = validateBbeeCriteria(criteria, false, 1_500_000);
    expect(result.valid).toBe(false);
  });

  it('passes when estimatedValue > 1,000,000 and bbeeWeight >= 10', () => {
    const criteria = makeCriteria({ bbeeWeight: 12 });
    const result = validateBbeeCriteria(criteria, false, 2_000_000);
    expect(result.valid).toBe(true);
  });

  it('passes when not public sector and value <= 1,000,000 even with bbeeWeight 0', () => {
    const criteria = makeCriteria({ bbeeWeight: 0 });
    const result = validateBbeeCriteria(criteria, false, 500_000);
    expect(result.valid).toBe(true);
  });

  it('passes when not public sector and no estimated value with bbeeWeight 0', () => {
    const criteria = makeCriteria({ bbeeWeight: 0 });
    const result = validateBbeeCriteria(criteria, false, undefined);
    expect(result.valid).toBe(true);
  });

  it('fails at exactly estimatedValue = 1,000,000 boundary (not exceeding)', () => {
    const criteria = makeCriteria({ bbeeWeight: 5 });
    // Exactly R1,000,000 — requirement says EXCEEDS, so boundary is not triggered
    const result = validateBbeeCriteria(criteria, false, 1_000_000);
    expect(result.valid).toBe(true);
  });

  it('fails at estimatedValue = 1,000,001 (exceeds threshold)', () => {
    const criteria = makeCriteria({ bbeeWeight: 5 });
    const result = validateBbeeCriteria(criteria, false, 1_000_001);
    expect(result.valid).toBe(false);
  });
});

// ─── getBbeeCertificateStatus ────────────────────────────────────────────────

describe('getBbeeCertificateStatus', () => {
  it('returns valid when bbeeLevelNumber set and certificate not expired', () => {
    const profile = makeProfile({
      bbeeLevelNumber: 3,
      bbeeCertificateExpiry: '2027-06-01T00:00:00.000Z',
    });
    expect(getBbeeCertificateStatus(profile, NOW)).toBe('valid');
  });

  it('returns expired when certificate expiry is in the past', () => {
    const profile = makeProfile({
      bbeeLevelNumber: 2,
      bbeeCertificateExpiry: '2025-01-01T00:00:00.000Z',
    });
    expect(getBbeeCertificateStatus(profile, NOW)).toBe('expired');
  });

  it('returns missing when bbeeLevelNumber is undefined', () => {
    const profile = makeProfile({
      bbeeLevelNumber: undefined,
      bbeeCertificateExpiry: '2027-12-31T00:00:00.000Z',
    });
    expect(getBbeeCertificateStatus(profile, NOW)).toBe('missing');
  });

  it('returns missing when bbeeLevelNumber is set but no expiry date', () => {
    const profile = makeProfile({
      bbeeLevelNumber: 4,
      bbeeCertificateExpiry: undefined,
    });
    expect(getBbeeCertificateStatus(profile, NOW)).toBe('missing');
  });

  it('returns expired when expiry is exactly the reference date (same instant)', () => {
    const profile = makeProfile({
      bbeeLevelNumber: 1,
      bbeeCertificateExpiry: '2026-06-14T23:59:59.999Z',
    });
    // Expiry is before reference date NOW (2026-06-15)
    expect(getBbeeCertificateStatus(profile, NOW)).toBe('expired');
  });
});

// ─── getBbeeWarnings ─────────────────────────────────────────────────────────

describe('getBbeeWarnings', () => {
  it('returns empty array when all suppliers have valid certificates', () => {
    const profiles = [
      makeProfile({ supplierId: 'a', firmName: 'A' }),
      makeProfile({ supplierId: 'b', firmName: 'B' }),
    ];
    expect(getBbeeWarnings(profiles, NOW)).toHaveLength(0);
  });

  it('returns expired warning for expired certificate', () => {
    const profiles = [
      makeProfile({ supplierId: 'a', firmName: 'Expired Co', bbeeCertificateExpiry: '2025-01-01T00:00:00.000Z' }),
    ];
    const warnings = getBbeeWarnings(profiles, NOW);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].status).toBe('expired');
    expect(warnings[0].firmName).toBe('Expired Co');
    expect(warnings[0].message).toContain('expired');
  });

  it('returns missing warning for missing certificate', () => {
    const profiles = [
      makeProfile({ supplierId: 'b', firmName: 'Missing Co', bbeeLevelNumber: undefined }),
    ];
    const warnings = getBbeeWarnings(profiles, NOW);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].status).toBe('missing');
    expect(warnings[0].firmName).toBe('Missing Co');
    expect(warnings[0].message).toContain('No B-BBEE certificate');
  });

  it('distinguishes between expired and missing states', () => {
    const profiles = [
      makeProfile({ supplierId: 'a', firmName: 'Expired', bbeeCertificateExpiry: '2024-01-01T00:00:00.000Z' }),
      makeProfile({ supplierId: 'b', firmName: 'Missing', bbeeLevelNumber: undefined }),
      makeProfile({ supplierId: 'c', firmName: 'Valid' }),
    ];
    const warnings = getBbeeWarnings(profiles, NOW);
    expect(warnings).toHaveLength(2);
    expect(warnings[0].status).toBe('expired');
    expect(warnings[1].status).toBe('missing');
  });
});

// ─── canFinaliseComparison ───────────────────────────────────────────────────

describe('canFinaliseComparison', () => {
  it('returns true for non-public sector regardless of certificate status', () => {
    const profiles = [
      makeProfile({ bbeeLevelNumber: undefined }),
    ];
    expect(canFinaliseComparison(profiles, false, NOW)).toBe(true);
  });

  it('returns true for public sector when at least one supplier has valid certificate', () => {
    const profiles = [
      makeProfile({ supplierId: 'a', bbeeCertificateExpiry: '2024-01-01T00:00:00.000Z' }), // expired
      makeProfile({ supplierId: 'b', bbeeCertificateExpiry: '2027-12-31T00:00:00.000Z' }), // valid
    ];
    expect(canFinaliseComparison(profiles, true, NOW)).toBe(true);
  });

  it('returns false for public sector when no supplier has valid certificate', () => {
    const profiles = [
      makeProfile({ supplierId: 'a', bbeeCertificateExpiry: '2024-01-01T00:00:00.000Z' }), // expired
      makeProfile({ supplierId: 'b', bbeeLevelNumber: undefined }), // missing
    ];
    expect(canFinaliseComparison(profiles, true, NOW)).toBe(false);
  });

  it('returns false for public sector with empty profiles array', () => {
    expect(canFinaliseComparison([], true, NOW)).toBe(false);
  });
});

// ─── canProgressAward ────────────────────────────────────────────────────────

describe('canProgressAward', () => {
  it('returns true when supplier has valid certificate', () => {
    const profile = makeProfile();
    expect(canProgressAward(profile, NOW)).toBe(true);
  });

  it('returns false when supplier certificate is expired', () => {
    const profile = makeProfile({ bbeeCertificateExpiry: '2025-06-01T00:00:00.000Z' });
    expect(canProgressAward(profile, NOW)).toBe(false);
  });

  it('returns false when supplier certificate is missing', () => {
    const profile = makeProfile({ bbeeLevelNumber: undefined });
    expect(canProgressAward(profile, NOW)).toBe(false);
  });
});

// ─── calculateLocalContentPercentage ─────────────────────────────────────────

describe('calculateLocalContentPercentage', () => {
  it('returns 100% when supplier delivers only from the project region', () => {
    const profile = makeProfile({ deliveryRegions: ['Gauteng'] });
    expect(calculateLocalContentPercentage(profile, 'Gauteng')).toBe(100);
  });

  it('returns 50% when supplier delivers from 2 regions including project region', () => {
    const profile = makeProfile({ deliveryRegions: ['Gauteng', 'Western Cape'] });
    expect(calculateLocalContentPercentage(profile, 'Gauteng')).toBe(50);
  });

  it('returns 0% when supplier does not deliver to project region', () => {
    const profile = makeProfile({ deliveryRegions: ['Western Cape', 'KwaZulu-Natal'] });
    expect(calculateLocalContentPercentage(profile, 'Gauteng')).toBe(0);
  });

  it('returns 0% when supplier has no delivery regions', () => {
    const profile = makeProfile({ deliveryRegions: [] });
    expect(calculateLocalContentPercentage(profile, 'Gauteng')).toBe(0);
  });

  it('is case-insensitive for region matching', () => {
    const profile = makeProfile({ deliveryRegions: ['gauteng'] });
    expect(calculateLocalContentPercentage(profile, 'Gauteng')).toBe(100);
  });

  it('returns 33% for 3 regions including project region', () => {
    const profile = makeProfile({ deliveryRegions: ['Gauteng', 'Western Cape', 'Limpopo'] });
    expect(calculateLocalContentPercentage(profile, 'Gauteng')).toBe(33);
  });
});

// ─── getLocalSpendWarnings ───────────────────────────────────────────────────

describe('getLocalSpendWarnings', () => {
  it('returns empty array when all suppliers meet the target', () => {
    const profiles = [
      makeProfile({ supplierId: 'a', firmName: 'A', deliveryRegions: ['Gauteng'] }),
    ];
    const warnings = getLocalSpendWarnings(profiles, 50, 'Gauteng');
    expect(warnings).toHaveLength(0);
  });

  it('returns warning when supplier local content is below target', () => {
    const profiles = [
      makeProfile({ supplierId: 'a', firmName: 'Far Away', deliveryRegions: ['Western Cape'] }),
    ];
    const warnings = getLocalSpendWarnings(profiles, 30, 'Gauteng');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].localContentPct).toBe(0);
    expect(warnings[0].targetPct).toBe(30);
    expect(warnings[0].message).toContain('below the project target');
  });

  it('returns warning when supplier has multiple regions but below target', () => {
    const profiles = [
      makeProfile({
        supplierId: 'a',
        firmName: 'Multi Region',
        deliveryRegions: ['Gauteng', 'Western Cape', 'Limpopo', 'Mpumalanga'],
      }),
    ];
    // 1/4 = 25%, target is 30%
    const warnings = getLocalSpendWarnings(profiles, 30, 'Gauteng');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].localContentPct).toBe(25);
  });

  it('returns no warning when supplier meets target exactly', () => {
    const profiles = [
      makeProfile({
        supplierId: 'a',
        firmName: 'Two Region',
        deliveryRegions: ['Gauteng', 'Western Cape'],
      }),
    ];
    // 1/2 = 50%, target is 50%
    const warnings = getLocalSpendWarnings(profiles, 50, 'Gauteng');
    expect(warnings).toHaveLength(0);
  });
});
