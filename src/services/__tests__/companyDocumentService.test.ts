import { describe, expect, it, vi } from 'vitest';
import {
  buildCompanyDocument,
  getDocumentLifecycle,
  getPublicVerificationStatus,
  getEntityPublicVerificationSummary,
  assertDocumentValid,
} from '../companyDocumentService';

describe('companyDocumentService', () => {
  it('builds a valid company document record', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const doc = buildCompanyDocument({
      entityId: 'company-1',
      entityType: 'company',
      documentType: 'cipc_registration',
      title: 'CIPC Registration Certificate',
      documentUrl: 'https://files.public.blob.vercel-storage.com/cipc-cert.pdf',
      referenceNumber: 'CIPC-2025-001234',
      expiresAt: '2027-06-10T00:00:00.000Z',
    });

    expect(doc).toMatchObject({
      entityId: 'company-1',
      entityType: 'company',
      documentType: 'cipc_registration',
      status: 'pending_review',
      immutable: true,
      verificationSource: 'document_upload',
    });
    vi.useRealTimers();
  });

  it('requires either documentUrl or evidenceHash', () => {
    expect(() =>
      buildCompanyDocument({
        entityId: 'company-1',
        entityType: 'company',
        documentType: 'cipc_registration',
        title: 'Test',
      }),
    ).toThrow(/documentUrl or evidenceHash/);
  });

  it('allows evidenceHash as alternative to documentUrl', () => {
    const doc = buildCompanyDocument({
      entityId: 'company-1',
      entityType: 'company',
      documentType: 'tax_clearance',
      title: 'Tax Clearance',
      evidenceHash: 'sha256:abc123',
    });
    expect(doc.evidenceHash).toBe('sha256:abc123');
    expect(doc.documentUrl).toBeUndefined();
  });

  it('rejects invalid entity types', () => {
    expect(() =>
      buildCompanyDocument({
        entityId: 'e-1',
        entityType: 'individual' as any,
        documentType: 'cipc_registration',
        title: 'Test',
        documentUrl: 'https://example.com/doc.pdf',
      }),
    ).toThrow(/Invalid entity type/);
  });

  it('rejects invalid document types', () => {
    expect(() =>
      buildCompanyDocument({
        entityId: 'e-1',
        entityType: 'company',
        documentType: 'invalid_type' as any,
        title: 'Test',
        documentUrl: 'https://example.com/doc.pdf',
      }),
    ).toThrow(/Invalid document type/);
  });

  it('rejects invalid expiry dates', () => {
    expect(() =>
      buildCompanyDocument({
        entityId: 'e-1',
        entityType: 'company',
        documentType: 'cipc_registration',
        title: 'Test',
        documentUrl: 'https://example.com/doc.pdf',
        expiresAt: 'bad-date',
      }),
    ).toThrow(/expiresAt/);
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  it('detects active document (no expiry)', () => {
    const doc = { documentType: 'cipc_registration' as const, status: 'active' as const, expiresAt: undefined };
    const lifecycle = getDocumentLifecycle(doc);
    expect(lifecycle.status).toBe('active');
    expect(lifecycle.isExpired).toBe(false);
    expect(lifecycle.requiresAction).toBe(false);
  });

  it('detects expired document', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const doc = { documentType: 'tax_clearance' as const, status: 'active' as const, expiresAt: '2026-01-01T00:00:00.000Z' };
    const lifecycle = getDocumentLifecycle(doc);
    expect(lifecycle.status).toBe('expired');
    expect(lifecycle.isExpired).toBe(true);
    expect(lifecycle.requiresAction).toBe(true);
    vi.useRealTimers();
  });

  it('detects expiring-soon document', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const doc = { documentType: 'pi_insurance' as const, status: 'active' as const, expiresAt: '2026-06-25T00:00:00.000Z' };
    const lifecycle = getDocumentLifecycle(doc);
    expect(lifecycle.status).toBe('expiring_soon');
    expect(lifecycle.isExpiringSoon).toBe(true);
    vi.useRealTimers();
  });

  it('handles rejected and superseded statuses', () => {
    const rejected = getDocumentLifecycle({ documentType: 'cipc_registration' as const, status: 'rejected' as const, expiresAt: undefined });
    expect(rejected.status).toBe('rejected');
    expect(rejected.requiresAction).toBe(true);

    const superseded = getDocumentLifecycle({ documentType: 'cipc_registration' as const, status: 'superseded' as const, expiresAt: undefined });
    expect(superseded.status).toBe('superseded');
    expect(superseded.requiresAction).toBe(true);
  });

  // ── Public Verification Status ──────────────────────────────────────────────

  it('returns redacted public verification status', () => {
    const doc = { documentType: 'pi_insurance' as const, status: 'active' as const, expiresAt: '2027-06-10T00:00:00.000Z', verificationSource: 'manual_admin_review' as const };
    const status = getPublicVerificationStatus(doc);
    expect(status.documentType).toBe('pi_insurance');
    expect(status.hasDocument).toBe(true);
    expect(status.isVerified).toBe(true);
    // Document URL/exposure details are NOT in the public status
    expect((status as any).documentUrl).toBeUndefined();
  });

  it('shows unverified status for document_upload source', () => {
    const doc = { documentType: 'cipc_registration' as const, status: 'active' as const, expiresAt: undefined, verificationSource: 'document_upload' as const };
    const status = getPublicVerificationStatus(doc);
    expect(status.isVerified).toBe(false);
  });

  it('computes entity public verification summary', () => {
    const docs = [
      { documentType: 'cipc_registration' as const, status: 'active' as const, expiresAt: '2027-06-10T00:00:00.000Z', verificationSource: 'public_register' as const },
      { documentType: 'tax_clearance' as const, status: 'active' as const, expiresAt: '2027-06-10T00:00:00.000Z', verificationSource: 'document_upload' as const },
    ];
    const summary = getEntityPublicVerificationSummary(docs);
    expect(summary.overall).toBe('partial');
    expect(summary.checks).toHaveLength(2);
  });

  it('labels fully verified entities correctly', () => {
    const docs = [
      { documentType: 'cipc_registration' as const, status: 'active' as const, expiresAt: '2027-06-10T00:00:00.000Z', verificationSource: 'public_register' as const },
    ];
    const summary = getEntityPublicVerificationSummary(docs);
    expect(summary.overall).toBe('verified');
  });

  // ── Assertions ──────────────────────────────────────────────────────────────

  it('asserts document valid without throwing for active docs', () => {
    expect(() =>
      assertDocumentValid({
        documentType: 'cipc_registration',
        status: 'active',
        expiresAt: '2027-06-10T00:00:00.000Z',
        title: 'Valid Doc',
      }),
    ).not.toThrow();
  });

  it('throws for expired documents', () => {
    expect(() =>
      assertDocumentValid({
        documentType: 'tax_clearance',
        status: 'active',
        expiresAt: '2025-01-01T00:00:00.000Z',
        title: 'Expired Doc',
      }),
    ).toThrow(/expired/);
  });

  it('throws for rejected documents', () => {
    expect(() =>
      assertDocumentValid({
        documentType: 'tax_clearance',
        status: 'rejected',
        expiresAt: undefined,
        title: 'Rejected Doc',
      }),
    ).toThrow(/rejected/);
  });
});
