import { describe, expect, it, beforeEach } from 'vitest';
import {
  toProjectRecord,
  professionalRegistrationToProjectRecord,
  companyDocumentToProjectRecord,
  insuranceComplianceToProjectRecord,
  contractorComplianceToProjectRecord,
  complianceRiskToProjectRecord,
  verificationBadgeToProjectRecord,
  getProjectRecord,
  getProjectRecords,
  resetProjectRecordState,
  TRUST_VERIFICATION_COMPLIANCE_MODULE_KEY,
} from '../projectRecordAdapter';
import { buildProfessionalRegistration } from '../professionalRegistrationService';
import { buildCompanyDocument } from '../companyDocumentService';
import { buildInsuranceCompliance } from '../insuranceComplianceService';
import { buildContractorCompliance } from '../contractorSupplierComplianceService';
import { evaluateComplianceRisk, buildRiskTrigger } from '../complianceRiskService';
import { buildVerificationBadge } from '../verificationBadgeService';

const ctx = { tenantId: 'tenant-1', projectId: 'proj-1', userId: 'user-1', actorRole: 'admin' };

describe('projectRecordAdapter — trust_verification_compliance', () => {
  beforeEach(() => resetProjectRecordState());

  it('creates project record with correct module key and envelope', () => {
    const record = toProjectRecord(ctx, 'audit_entry', 'Test Audit', 'active', { note: 'test' });
    expect(record.moduleKey).toBe(TRUST_VERIFICATION_COMPLIANCE_MODULE_KEY);
    expect(record.tenantId).toBe('tenant-1');
    expect(record.projectId).toBe('proj-1');
    expect(record.audit.createdBy).toBe('user-1');
    expect(record.recordId).toMatch(/pr-trust-compliance-/);
    expect(record.payload).toEqual({ note: 'test' });
    expect(record.linkedRecordIds).toEqual([]);
  });

  it('maps professional registration to project record', () => {
    const reg = buildProfessionalRegistration({
      userId: 'u-1', professionalBody: 'SACAP', registrationNumber: 'SACAP-001',
      category: 'Professional Architect', expiryDate: '2027-06-10T00:00:00.000Z',
    });
    const pr = professionalRegistrationToProjectRecord(ctx, reg);
    expect(pr.recordType).toBe('professional_registration');
    expect(pr.title).toContain('SACAP');
    expect(pr.title).toContain('SACAP-001');
    expect(pr.status).toBe('pending');
  });

  it('maps company document to project record', () => {
    const doc = buildCompanyDocument({
      entityId: 'c-1', entityType: 'company', documentType: 'cipc_registration',
      title: 'CIPC Certificate', documentUrl: 'https://example.com/doc.pdf',
    });
    const pr = companyDocumentToProjectRecord(ctx, doc);
    expect(pr.recordType).toBe('company_document');
    expect(pr.title).toContain('CIPC Certificate');
  });

  it('maps insurance compliance to project record', () => {
    const ins = buildInsuranceCompliance({
      entityId: 'p-1', entityType: 'professional', professionalBody: 'SACAP',
      provider: 'ABC Insurers', policyNumber: 'POL-001', coverageAmountCents: 2_000_000_00,
      issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z',
      certificateUrl: 'https://example.com/cert.pdf',
    });
    const pr = insuranceComplianceToProjectRecord(ctx, ins);
    expect(pr.recordType).toBe('insurance_compliance');
    expect(pr.title).toContain('ABC Insurers');
    expect(pr.title).toContain('POL-001');
  });

  it('maps contractor compliance to project record', () => {
    const comp = buildContractorCompliance({
      entityId: 'contractor-1', entityType: 'contractor',
      checks: [
        { checkType: 'health_safety_file', status: 'compliant' },
        { checkType: 'coida_registration', status: 'compliant' },
        { checkType: 'sars_tax_pin', status: 'compliant' },
      ],
    });
    const pr = contractorComplianceToProjectRecord(ctx, comp);
    expect(pr.recordType).toBe('contractor_supplier_compliance');
    expect(pr.status).toBe('compliant');
  });

  it('maps compliance risk to project record', () => {
    const risk = evaluateComplianceRisk({
      entityId: 'e-1', entityType: 'professional',
      triggers: [buildRiskTrigger('missing_insurance', 'NONE', 'No insurance')],
    });
    const pr = complianceRiskToProjectRecord(ctx, risk);
    expect(pr.recordType).toBe('compliance_risk');
    expect(pr.status).toBe(risk.riskLevel);
  });

  it('maps verification badge to project record', () => {
    const badge = buildVerificationBadge({
      badgeType: 'identity_verified', entityId: 'p-1',
      entityType: 'professional', provenance: 'externally_verified',
    });
    const pr = verificationBadgeToProjectRecord(ctx, badge);
    expect(pr.recordType).toBe('verification_badge');
    expect(pr.status).toBe('issued');
  });

  it('retrieves project records by id and projectId', () => {
    const record = toProjectRecord(ctx, 'audit_entry', 'Test', 'active', {});
    expect(getProjectRecord(record.recordId)).toBeDefined();
    expect(getProjectRecords('proj-1')).toHaveLength(1);
    expect(getProjectRecords('other-proj')).toHaveLength(0);
  });

  it('supports linked record IDs', () => {
    const record = toProjectRecord(ctx, 'compliance_risk', 'Linked Test', 'high', {}, ['pr-1', 'pr-2']);
    expect(record.linkedRecordIds).toEqual(['pr-1', 'pr-2']);
  });
});
