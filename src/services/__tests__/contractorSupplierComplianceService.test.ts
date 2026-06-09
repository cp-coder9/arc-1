import { describe, expect, it, vi } from 'vitest';
import {
  buildContractorCompliance,
  getMissingComplianceChecks,
  assertContractorCompliant,
  assertMinimumComplianceForProject,
  getComplianceCheckSummary,
  COMPLIANCE_CHECK_REQUIREMENTS,
} from '../contractorSupplierComplianceService';

describe('contractorSupplierComplianceService', () => {
  const validChecks = [
    { checkType: 'health_safety_file' as const, status: 'compliant' as const, referenceNumber: 'HSF-001' },
    { checkType: 'coida_registration' as const, status: 'compliant' as const, referenceNumber: 'COIDA-001' },
    { checkType: 'sars_tax_pin' as const, status: 'compliant' as const, referenceNumber: 'TAX-001' },
  ];

  it('builds a valid contractor compliance record', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const comp = buildContractorCompliance({
      entityId: 'contractor-1',
      entityType: 'contractor',
      projectId: 'proj-1',
      checks: validChecks,
    });

    expect(comp).toMatchObject({
      entityId: 'contractor-1',
      entityType: 'contractor',
      overallStatus: 'compliant',
      immutable: true,
    });
    expect(comp.missingCriticalChecks).toHaveLength(0);
    expect(comp.expiredChecks).toHaveLength(0);
    vi.useRealTimers();
  });

  it('detects missing mandatory checks for contractors', () => {
    const comp = buildContractorCompliance({
      entityId: 'contractor-2',
      entityType: 'contractor',
      checks: [{ checkType: 'bbbee_verification' as const, status: 'compliant' as const }],
    });

    expect(comp.overallStatus).toBe('non_compliant');
    expect(comp.missingCriticalChecks).toContain('health_safety_file');
    expect(comp.missingCriticalChecks).toContain('coida_registration');
    expect(comp.missingCriticalChecks).toContain('sars_tax_pin');
  });

  it('suppliers have different mandatory checks than contractors', () => {
    // Suppliers need COIDA and SARS PIN, but NOT Health & Safety
    const comp = buildContractorCompliance({
      entityId: 'supplier-1',
      entityType: 'supplier',
      checks: [
        { checkType: 'coida_registration' as const, status: 'compliant' as const },
        { checkType: 'sars_tax_pin' as const, status: 'compliant' as const },
      ],
    });

    expect(comp.overallStatus).toBe('compliant');
    expect(comp.missingCriticalChecks).toHaveLength(0);
  });

  it('detects expired compliance checks', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const comp = buildContractorCompliance({
      entityId: 'contractor-3',
      entityType: 'contractor',
      checks: [
        ...validChecks.map((c) => ({ ...c, expiresAt: '2025-01-01T00:00:00.000Z' })),
      ],
    });

    expect(comp.overallStatus).toBe('expired');
    expect(comp.expiredChecks.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('requires at least one compliance check', () => {
    expect(() =>
      buildContractorCompliance({
        entityId: 'c-1',
        entityType: 'contractor',
        checks: [],
      }),
    ).toThrow(/at least one compliance check/);
  });

  it('rejects invalid check types', () => {
    expect(() =>
      buildContractorCompliance({
        entityId: 'c-1',
        entityType: 'contractor',
        checks: [{ checkType: 'invalid_check' as any, status: 'compliant' as const }],
      }),
    ).toThrow(/Invalid compliance check type/);
  });

  it('returns missing compliance checks with reasons', () => {
    const comp = buildContractorCompliance({
      entityId: 'contractor-4',
      entityType: 'contractor',
      checks: [
        { checkType: 'health_safety_file' as const, status: 'non_compliant' as const },
      ],
    });

    const missing = getMissingComplianceChecks(comp);
    expect(missing.length).toBeGreaterThan(0);
    // Should include non-compliant H&S check
    expect(missing.some((m) => m.checkType === 'health_safety_file')).toBe(true);
  });

  it('asserts contractor compliant for fully compliant records', () => {
    const comp = buildContractorCompliance({
      entityId: 'c-5',
      entityType: 'contractor',
      checks: validChecks,
    });
    expect(() => assertContractorCompliant(comp)).not.toThrow();
  });

  it('throws for non-compliant contractors', () => {
    const comp = buildContractorCompliance({
      entityId: 'c-6',
      entityType: 'contractor',
      checks: [{ checkType: 'health_safety_file' as const, status: 'non_compliant' as const }],
    });
    expect(() => assertContractorCompliant(comp)).toThrow(/compliance not met/);
  });

  it('blocks project participation when site-critical checks are missing', () => {
    const comp = buildContractorCompliance({
      entityId: 'c-7',
      entityType: 'contractor',
      checks: [{ checkType: 'sars_tax_pin' as const, status: 'compliant' as const }],
    });
    expect(() => assertMinimumComplianceForProject(comp)).toThrow(/required before participating/);
  });

  it('provides compliance check summary with percentages', () => {
    const comp = buildContractorCompliance({
      entityId: 'c-8',
      entityType: 'contractor',
      checks: validChecks,
    });
    const summary = getComplianceCheckSummary(comp);
    expect(summary.overallStatus).toBe('compliant');
    expect(summary.percentageCompliant).toBe(100);
    expect(summary.readyForProject).toBe(true);
  });

  it('defines compliance check requirements for all entity types', () => {
    expect(COMPLIANCE_CHECK_REQUIREMENTS.health_safety_file.mandatory).toBe(true);
    expect(COMPLIANCE_CHECK_REQUIREMENTS.health_safety_file.appliesTo).toContain('contractor');
    expect(COMPLIANCE_CHECK_REQUIREMENTS.health_safety_file.appliesTo).not.toContain('supplier');
    expect(COMPLIANCE_CHECK_REQUIREMENTS.coida_registration.mandatory).toBe(true);
    expect(COMPLIANCE_CHECK_REQUIREMENTS.sars_tax_pin.mandatory).toBe(true);
    expect(COMPLIANCE_CHECK_REQUIREMENTS.bbbee_verification.mandatory).toBe(false);
  });
});
