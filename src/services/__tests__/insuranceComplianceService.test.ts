import { describe, expect, it, vi } from 'vitest';
import {
  buildInsuranceCompliance,
  getInsuranceLifecycle,
  assertInsuranceCompliant,
  analyzeCoverageGap,
  getMinimumCoverageForEntity,
  DEFAULT_MINIMUM_PI_COVERAGE_CENTS,
} from '../insuranceComplianceService';

describe('insuranceComplianceService', () => {
  it('builds a valid insurance compliance record', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const ins = buildInsuranceCompliance({
      entityId: 'prof-1',
      entityType: 'professional',
      professionalBody: 'SACAP',
      provider: 'ABC Insurers',
      policyNumber: 'POL-2026-001',
      coverageAmountCents: 2_500_000_00, // R2.5M
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      certificateUrl: 'https://files.public.blob.vercel-storage.com/pi-cert.pdf',
    });

    expect(ins).toMatchObject({
      entityId: 'prof-1',
      entityType: 'professional',
      professionalBody: 'SACAP',
      provider: 'ABC Insurers',
      policyNumber: 'POL-2026-001',
      coverageAmountCents: 2_500_000_00,
      coverageSufficient: true,
      coverageGapCents: 0,
      immutable: true,
    });
    vi.useRealTimers();
  });

  it('detects coverage gaps', () => {
    const ins = buildInsuranceCompliance({
      entityId: 'prof-1',
      entityType: 'professional',
      professionalBody: 'ECSA',
      provider: 'Min Insurers',
      policyNumber: 'POL-MIN-001',
      coverageAmountCents: 1_000_000_00, // R1M — ECSA requires R3M
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      certificateUrl: 'https://files.public.blob.vercel-storage.com/pi-cert.pdf',
    });

    expect(ins.coverageSufficient).toBe(false);
    expect(ins.coverageGapCents).toBeGreaterThan(0);
    expect(ins.status).toBe('gap_detected');
  });

  it('requires certificateUrl or evidenceHash', () => {
    expect(() =>
      buildInsuranceCompliance({
        entityId: 'e-1',
        entityType: 'professional',
        provider: 'Test',
        policyNumber: 'POL-001',
        coverageAmountCents: 1_000_000_00,
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
      }),
    ).toThrow(/certificateUrl or evidenceHash/);
  });

  it('rejects expiresAt before issuedAt', () => {
    expect(() =>
      buildInsuranceCompliance({
        entityId: 'e-1',
        entityType: 'professional',
        provider: 'Test',
        policyNumber: 'POL-001',
        coverageAmountCents: 1_000_000_00,
        issuedAt: '2027-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:00:00.000Z',
        certificateUrl: 'https://example.com/cert.pdf',
      }),
    ).toThrow(/expiresAt must be after issuedAt/);
  });

  it('detects expired insurance', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const lifecycle = getInsuranceLifecycle({
      status: 'active' as const,
      expiresAt: '2026-01-01T00:00:00.000Z',
      coverageSufficient: true,
    });
    expect(lifecycle.status).toBe('expired');
    expect(lifecycle.isExpired).toBe(true);
    expect(lifecycle.requiresAction).toBe(true);
    vi.useRealTimers();
  });

  it('detects expiring-soon insurance', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const lifecycle = getInsuranceLifecycle({
      status: 'active' as const,
      expiresAt: '2026-06-30T00:00:00.000Z',
      coverageSufficient: true,
    });
    expect(lifecycle.status).toBe('expiring_soon');
    expect(lifecycle.isExpiringSoon).toBe(true);
    vi.useRealTimers();
  });

  it('detects not_insured status', () => {
    const lifecycle = getInsuranceLifecycle({
      status: 'not_insured' as const,
      expiresAt: '2027-01-01T00:00:00.000Z',
      coverageSufficient: false,
    });
    expect(lifecycle.status).toBe('not_insured');
    expect(lifecycle.requiresAction).toBe(true);
    expect(lifecycle.actionLabel).toContain('No PI insurance');
  });

  it('asserts insurance compliant for valid coverage', () => {
    expect(() =>
      assertInsuranceCompliant({
        status: 'active' as const,
        expiresAt: '2027-06-10T00:00:00.000Z',
        coverageSufficient: true,
        coverageGapCents: 0,
        minimumRequiredCoverageCents: 2_000_000_00,
        entityType: 'professional',
      }),
    ).not.toThrow();
  });

  it('throws for not_insured status', () => {
    expect(() =>
      assertInsuranceCompliant({
        status: 'not_insured' as const,
        expiresAt: '2027-06-10T00:00:00.000Z',
        coverageSufficient: false,
        coverageGapCents: 2_000_000_00,
        minimumRequiredCoverageCents: 2_000_000_00,
        entityType: 'professional',
      }),
    ).toThrow(/PI insurance is required/);
  });

  it('throws for coverage gaps', () => {
    expect(() =>
      assertInsuranceCompliant({
        status: 'gap_detected' as const,
        expiresAt: '2027-06-10T00:00:00.000Z',
        coverageSufficient: false,
        coverageGapCents: 1_000_000_00,
        minimumRequiredCoverageCents: 2_000_000_00,
        entityType: 'professional',
      }),
    ).toThrow(/coverage gap/);
  });

  it('analyzes coverage gaps correctly', () => {
    const gap = analyzeCoverageGap(1_000_000_00, 3_000_000_00);
    expect(gap.hasGap).toBe(true);
    expect(gap.gapCents).toBe(2_000_000_00);
    expect(gap.percentageOfRequirement).toBe(33);

    const sufficient = analyzeCoverageGap(5_000_000_00, 3_000_000_00);
    expect(sufficient.hasGap).toBe(false);
    expect(sufficient.gapCents).toBe(0);
    expect(sufficient.percentageOfRequirement).toBe(166);
  });

  it('returns minimum coverage per entity type and professional body', () => {
    expect(getMinimumCoverageForEntity('professional', 'SACAP')).toBe(2_000_000 * 100); // R2M in cents
    expect(getMinimumCoverageForEntity('professional', 'ECSA')).toBe(3_000_000 * 100);
    expect(getMinimumCoverageForEntity('company')).toBe(DEFAULT_MINIMUM_PI_COVERAGE_CENTS);
    expect(getMinimumCoverageForEntity('contractor')).toBe(DEFAULT_MINIMUM_PI_COVERAGE_CENTS);
  });
});
