import { describe, expect, it } from 'vitest';
import {
  buildSansComplianceFormPack,
  evaluateSansComplianceFormPackReadiness,
  type SansComplianceFormPackInput,
} from '../sansComplianceFormPackService';

const baseInput: SansComplianceFormPackInput = {
  projectId: 'project-1',
  packId: 'sans-pack-1',
  stage: 'compliance_municipal',
  property: {
    erfNumber: 'ERF 1234',
    municipality: 'City of Johannesburg',
    address: '10 Example Street, Johannesburg',
  },
  client: {
    uid: 'client-1',
    displayName: 'Client Owner',
    idNumberVerified: true,
  },
  responsibleProfessional: {
    uid: 'bep-1',
    role: 'bep',
    displayName: 'BEP Architect',
    registrationNumber: 'SACAP-12345',
    verificationStatus: 'verified',
  },
  documents: [
    { id: 'doc-drawings', type: 'drawing_set', title: 'Council drawing set', status: 'approved', hash: 'sha256:drawing' },
    { id: 'doc-title', type: 'title_deed', title: 'Title deed', status: 'approved', hash: 'sha256:title' },
    { id: 'doc-zoning', type: 'zoning_certificate', title: 'Zoning certificate', status: 'approved', hash: 'sha256:zoning' },
    { id: 'doc-form-a', type: 'sans_form', title: 'SANS 10400-A form', status: 'draft', hash: 'sha256:form-a' },
  ],
  complianceChecks: [
    { id: 'check-fire', label: 'Fire notes', status: 'passed', standard: 'SANS 10400-T' },
    { id: 'check-drainage', label: 'Drainage layout', status: 'passed', standard: 'SANS 10400-P' },
  ],
  generatedAt: '2026-05-23T08:30:00.000Z',
};

describe('sansComplianceFormPackService', () => {
  it('blocks municipal submission until the BEP-signable SANS form pack has required approved evidence and a human approval gate', () => {
    const readiness = evaluateSansComplianceFormPackReadiness({
      ...baseInput,
      documents: baseInput.documents.map((document) => document.type === 'sans_form' ? { ...document, status: 'draft' as const } : document),
      complianceChecks: [
        ...baseInput.complianceChecks,
        { id: 'check-sseg', label: 'SSEG registration', status: 'flagged', standard: 'Municipal SSEG' },
      ],
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missingDocumentTypes).toEqual([]);
    expect(readiness.blockers).toEqual([
      'SANS form must be approved before BEP sign-off.',
      '1 compliance check remains flagged for human resolution.',
    ]);
    expect(readiness.requiresBepDigitalSignature).toBe(true);
    expect(readiness.aiMaySubmitToAuthority).toBe(false);
    expect(readiness.nextAction).toMatchObject({
      label: 'Resolve SANS form approval',
      target: 'sans-forms',
      requiresHumanConfirmation: true,
    });
  });

  it('builds a municipal-ready SANS pack with an immutable approval gate for verified BEP sign-off', () => {
    const pack = buildSansComplianceFormPack({
      ...baseInput,
      documents: baseInput.documents.map((document) => document.type === 'sans_form' ? { ...document, status: 'approved' as const } : document),
    });

    expect(pack.readiness).toMatchObject({ ready: true, aiMaySubmitToAuthority: false, requiresBepDigitalSignature: true });
    expect(pack.approvalGate).toMatchObject({
      id: 'sans-pack-1-bep-signoff',
      domain: 'compliance_signoff',
      projectId: 'project-1',
      target: { type: 'sans_compliance_form_pack', id: 'sans-pack-1' },
      requiredApproverRoles: ['bep'],
      statutoryImpact: true,
      aiMayNotApprove: true,
      requiresHumanApproval: true,
      immutableRequest: true,
    });
    expect(pack.approvalGate.evidence.map((item) => item.id)).toEqual(['doc-drawings', 'doc-title', 'doc-zoning', 'doc-form-a']);
    expect(pack.autofillSummary).toContain('ERF 1234');
    expect(pack.autofillSummary).toContain('SACAP-12345');
  });
});
