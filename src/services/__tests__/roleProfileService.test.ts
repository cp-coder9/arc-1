import { describe, expect, it } from 'vitest';
import { buildDirectoryProfile, getRoleProfileCompletion, sanitizeRoleProfileUpdate } from '../roleProfileService';

describe('roleProfileService', () => {
  it('allows only role-specific fields and blocks privilege escalation', () => {
    const sanitized = sanitizeRoleProfileUpdate('bep', {
      displayName: 'BEP One',
      disciplines: ['architecture'],
      role: 'admin',
      isAdmin: true,
      verificationStatus: 'verified',
      trustScore: 100,
    });

    expect(sanitized).toEqual({ displayName: 'BEP One', disciplines: ['architecture'] });
  });

  it('builds safe verified directory projections', () => {
    const directoryProfile = buildDirectoryProfile(
      { uid: 'bep-1', displayName: 'BEP One', role: 'architect' },
      { region: 'Western Cape', disciplines: ['architecture'], bio: 'Registered professional', verificationStatus: 'rejected' },
      { status: 'verified', checkedAt: '2026-01-01T00:00:00.000Z' },
    );

    expect(directoryProfile).toMatchObject({
      userId: 'bep-1',
      role: 'bep',
      verified: true,
      verificationStatus: 'verified',
      disciplines: ['architecture'],
      visibility: 'directory',
    });
    expect(directoryProfile).not.toHaveProperty('email');
  });

  it('keeps backend.html role-specific payment, verification, and signing fields in the allowlist', () => {
    const client = sanitizeRoleProfileUpdate('client', {
      idNumber: '8001015009087',
      companyRegistrationNumber: '2024/123456/07',
      billingAddress: '1 Main Road',
      digitalSignatureStatus: 'pending',
      ownerAddress: 'Erf 10',
      bankingDetails: { accountLast4: '1234' },
      role: 'admin',
    });
    expect(client).toMatchObject({
      idNumber: '8001015009087',
      companyRegistrationNumber: '2024/123456/07',
      billingAddress: '1 Main Road',
      digitalSignatureStatus: 'pending',
      ownerAddress: 'Erf 10',
      bankingDetails: { accountLast4: '1234' },
    });
    expect(client).not.toHaveProperty('role');

    const contractor = sanitizeRoleProfileUpdate('contractor', {
      cidbNumber: 'CIDB-1',
      nhbrcNumber: 'NHBRC-1',
      healthSafetyFiles: ['h-and-s.pdf'],
      bankingDetails: { accountLast4: '5678' },
      plantCapacity: ['TLB'],
      labourCapacity: 18,
      verificationStatus: 'verified',
    });
    expect(contractor).toMatchObject({
      cidbNumber: 'CIDB-1',
      nhbrcNumber: 'NHBRC-1',
      healthSafetyFiles: ['h-and-s.pdf'],
      bankingDetails: { accountLast4: '5678' },
      plantCapacity: ['TLB'],
      labourCapacity: 18,
    });
    expect(contractor).not.toHaveProperty('verificationStatus');

    const supplier = sanitizeRoleProfileUpdate('supplier', {
      tradeCategories: ['windows'],
      warrantySupport: true,
      productSupportContact: 'support@example.com',
      packageTypes: ['fenestration'],
      deliveryRegions: ['Western Cape'],
      bankingDetails: { accountLast4: '2468' },
      trustScore: 100,
    });
    expect(supplier).toMatchObject({
      tradeCategories: ['windows'],
      warrantySupport: true,
      productSupportContact: 'support@example.com',
      packageTypes: ['fenestration'],
      deliveryRegions: ['Western Cape'],
      bankingDetails: { accountLast4: '2468' },
    });
    expect(supplier).not.toHaveProperty('trustScore');
  });


  it('separates backend.html subcontractor execution fields from supplier product fulfilment fields', () => {
    const subcontractor = sanitizeRoleProfileUpdate('subcontractor', {
      assignedPackageScopes: ['Fire detection package'],
      shopDrawingCapabilities: ['layout drawings', 'coordination markups'],
      sampleSubmissionCapabilities: ['material boards'],
      rfiContactEmail: 'rfi@subcontractor.example',
      closeOutEvidenceTypes: ['commissioning certificate', 'as-built drawings'],
      catalogueApiEndpoint: 'https://supplier.example/api/catalogue',
      warrantyTermsUrl: 'https://supplier.example/warranty',
      standardLeadTimeDays: 14,
    });

    expect(subcontractor).toMatchObject({
      assignedPackageScopes: ['Fire detection package'],
      shopDrawingCapabilities: ['layout drawings', 'coordination markups'],
      sampleSubmissionCapabilities: ['material boards'],
      rfiContactEmail: 'rfi@subcontractor.example',
      closeOutEvidenceTypes: ['commissioning certificate', 'as-built drawings'],
    });
    expect(subcontractor).not.toHaveProperty('catalogueApiEndpoint');
    expect(subcontractor).not.toHaveProperty('warrantyTermsUrl');
    expect(subcontractor).not.toHaveProperty('standardLeadTimeDays');

    const supplier = sanitizeRoleProfileUpdate('supplier', {
      catalogueApiEndpoint: 'https://supplier.example/api/catalogue',
      standardLeadTimeDays: 14,
      deliveryNoteContact: 'dispatch@supplier.example',
      warrantyTermsUrl: 'https://supplier.example/warranty',
      assignedPackageScopes: ['Fire detection package'],
      shopDrawingCapabilities: ['coordination markups'],
      rfiContactEmail: 'rfi@subcontractor.example',
    });

    expect(supplier).toMatchObject({
      catalogueApiEndpoint: 'https://supplier.example/api/catalogue',
      standardLeadTimeDays: 14,
      deliveryNoteContact: 'dispatch@supplier.example',
      warrantyTermsUrl: 'https://supplier.example/warranty',
    });
    expect(supplier).not.toHaveProperty('assignedPackageScopes');
    expect(supplier).not.toHaveProperty('shopDrawingCapabilities');
    expect(supplier).not.toHaveProperty('rfiContactEmail');
  });

  it('computes role-profile completion blockers for onboarding and command centre warnings', () => {
    const completion = getRoleProfileCompletion('bep', {
      displayName: 'BEP One',
      disciplines: ['architecture'],
      statutoryBody: 'SACAP',
      registrationNumber: 'PR-1',
      digitalSignatureStatus: 'active',
    });

    expect(completion.isComplete).toBe(false);
    expect(completion.missingFields).toEqual(expect.arrayContaining(['professionalIndemnity', 'practiceDetails', 'taxNumber']));
    expect(completion.blockers).toContain('Profile incomplete: professionalIndemnity, practiceDetails, taxNumber');
  });

});
