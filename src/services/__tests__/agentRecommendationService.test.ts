import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildAgentRecommendation,
  recommend,
  generateComplianceRecommendations,
  resetRecommendationState,
} from '../agentRecommendationService';
import { buildProfessionalRegistration } from '../professionalRegistrationService';
import { buildCompanyDocument } from '../companyDocumentService';
import { buildInsuranceCompliance } from '../insuranceComplianceService';
import { buildContractorCompliance } from '../contractorSupplierComplianceService';
import { evaluateComplianceRisk, buildRiskTrigger } from '../complianceRiskService';

describe('agentRecommendationService — trust_verification_compliance', () => {
  beforeEach(() => resetRecommendationState());

  it('builds an agent recommendation with correct envelope', () => {
    const rec = buildAgentRecommendation({
      agentKey: 'test_agent',
      title: 'Test Recommendation',
      rationale: 'Test rationale',
      sourceObjectId: 'obj-1',
      severity: 'high',
      recommendedAction: 'Take action',
      urgency: 'this_week',
      category: 'compliance_fix',
    });

    expect(rec.agentKey).toBe('test_agent');
    expect(rec.severity).toBe('high');
    expect(rec.moduleKey).toBe('trust_verification_compliance');
    expect(rec.recommendationId).toMatch(/agent-rec-trust-/);
    expect(rec.createdAt).toBeTruthy();
  });

  it('legacy recommend() generates recommendations for blocked records', () => {
    const records = [
      { id: 'r-1', title: 'Record 1', blockers: ['Missing approval'] },
      { id: 'r-2', title: 'Record 2', blockers: [] },
    ];

    const recs = recommend('test_agent', 'Fallback Title', records);
    expect(recs).toHaveLength(1);
    expect(recs[0].title).toContain('Record 1');
    expect(recs[0].severity).toBe('high');
  });

  it('legacy recommend() returns advisory when no blockers', () => {
    const records = [{ id: 'r-1', title: 'Clean Record', blockers: [] }];
    const recs = recommend('test_agent', 'All Clear', records);
    expect(recs).toHaveLength(1);
    expect(recs[0].severity).toBe('low');
    expect(recs[0].title).toBe('All Clear');
  });

  it('generateComplianceRecommendations handles all entity types', () => {
    const reg = buildProfessionalRegistration({
      userId: 'u-1', professionalBody: 'SACAP', registrationNumber: 'SACAP-EXPIRED',
      category: 'Professional Architect', expiryDate: '2025-01-01T00:00:00.000Z',
    });
    const doc = buildCompanyDocument({
      entityId: 'c-1', entityType: 'company', documentType: 'tax_clearance',
      title: 'Tax Clearance', documentUrl: 'https://example.com/doc.pdf',
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    const ins = buildInsuranceCompliance({
      entityId: 'p-1', entityType: 'professional', professionalBody: 'ECSA',
      provider: 'ABC Insurers', policyNumber: 'POL-001',
      coverageAmountCents: 1_000_000_00, // Below ECSA minimum
      issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z',
      certificateUrl: 'https://example.com/cert.pdf',
    });
    const comp = buildContractorCompliance({
      entityId: 'contractor-1', entityType: 'contractor',
      checks: [
        { checkType: 'health_safety_file', status: 'non_compliant' },
      ],
    });
    const risk = evaluateComplianceRisk({
      entityId: 'e-1', entityType: 'professional',
      triggers: [buildRiskTrigger('expired_registration', 'SACAP-EXPIRED', 'Registration expired')],
    });

    const recs = generateComplianceRecommendations({
      registrations: [reg],
      documents: [doc],
      insurance: [ins],
      compliance: [comp],
      risks: [risk],
    });

    expect(recs.length).toBeGreaterThan(0);
    // Should have recommendations for each category
    expect(recs.some((r) => r.category === 'registration_renewal')).toBe(true);
    expect(recs.some((r) => r.category === 'document_renewal')).toBe(true);
    expect(recs.some((r) => r.category === 'coverage_gap')).toBe(true);
    expect(recs.some((r) => r.category === 'compliance_fix')).toBe(true);
    expect(recs.some((r) => r.category === 'risk_mitigation')).toBe(true);
  });

  it('generateComplianceRecommendations skips items that do not need action', () => {
    const reg = buildProfessionalRegistration({
      userId: 'u-1', professionalBody: 'SACAP', registrationNumber: 'SACAP-ACTIVE',
      category: 'Professional Architect', expiryDate: '2027-12-31T00:00:00.000Z',
      status: 'active',
    });
    const recs = generateComplianceRecommendations({ registrations: [reg] });
    // Active registration far from expiry should not generate recommendations
    expect(recs).toHaveLength(0);
  });
});
