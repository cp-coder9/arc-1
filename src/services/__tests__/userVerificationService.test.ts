import { describe, expect, it, vi } from 'vitest';
import {
  applyVerificationReview,
  assertReviewStatus,
  assertVerificationSubjectType,
  buildUserVerification,
  getVerificationLifecycle,
  inferVerificationProvider,
  isActiveVerifiedVerification,
  normalizeRegistrationNumber,
  normalizeStatutoryBody,
  queueVerificationRecheck,
} from '../userVerificationService';

describe('userVerificationService', () => {
  it('normalizes registration inputs and infers providers', () => {
    expect(normalizeRegistrationNumber('  SACAP   123  ')).toBe('SACAP 123');
    expect(normalizeStatutoryBody(' sacap ')).toBe('SACAP');
    expect(inferVerificationProvider({ subjectType: 'bep', statutoryBody: 'SACAP' })).toBe('sacap');
    expect(inferVerificationProvider({ subjectType: 'contractor' })).toBe('cidb');
    expect(inferVerificationProvider({ subjectType: 'supplier' })).toBe('cipc');
  });

  it('builds a pending persistent verification record by default', () => {
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    const verification = buildUserVerification({
      userId: 'user-1',
      submittedBy: 'user-1',
      subjectType: 'contractor',
      registrationNumber: ' CIDB 123 ',
      statutoryBody: 'cidb',
      evidenceUrls: ['https://files.public.blob.vercel-storage.com/cert.pdf'],
    });

    expect(verification).toMatchObject({
      userId: 'user-1',
      submittedBy: 'user-1',
      subjectType: 'contractor',
      status: 'pending',
      source: 'document_upload',
      registrationNumber: 'CIDB 123',
      statutoryBody: 'CIDB',
      submittedAt: '2026-01-02T03:04:05.000Z',
      createdAt: '2026-01-02T03:04:05.000Z',
    });
    vi.useRealTimers();
  });

  it('stores provider verification results and marks verified records', () => {
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    const verification = buildUserVerification({
      userId: 'user-1',
      submittedBy: 'user-1',
      subjectType: 'bep',
      statutoryBody: 'SACAP',
    }, {
      provider: 'sacap',
      status: 'verified',
      source: 'public_register',
      details: { category: 'Professional Architect' },
    });

    expect(verification.status).toBe('verified');
    expect(verification.lastVerifiedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(verification.metadata?.providerResult).toMatchObject({ provider: 'sacap', status: 'verified' });
    vi.useRealTimers();
  });

  it('copies evidence arrays so later caller mutations cannot alter persisted verification records', () => {
    const evidenceUrls = ['https://files.public.blob.vercel-storage.com/cert.pdf'];
    const evidenceDocumentIds = ['doc-1'];
    const verification = buildUserVerification({
      userId: 'user-1',
      submittedBy: 'user-1',
      subjectType: 'bep',
      evidenceUrls,
      evidenceDocumentIds,
    });

    evidenceUrls.push('https://files.public.blob.vercel-storage.com/later.pdf');
    evidenceDocumentIds.push('doc-2');

    expect(verification.evidenceUrls).toEqual(['https://files.public.blob.vercel-storage.com/cert.pdf']);
    expect(verification.evidenceDocumentIds).toEqual(['doc-1']);
    expect(verification.evidenceUrls).not.toBe(evidenceUrls);
    expect(verification.evidenceDocumentIds).not.toBe(evidenceDocumentIds);
  });

  it('applies audited admin review decisions and requires rejection reasons', () => {
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    const base = buildUserVerification({ userId: 'user-1', submittedBy: 'user-1', subjectType: 'supplier' });
    expect(() => applyVerificationReview(base, { status: 'rejected', reviewedBy: 'admin-1' })).toThrow('rejection reason');

    const reviewed = applyVerificationReview(base, {
      status: 'verified',
      reviewedBy: 'admin-1',
      metadata: { adminOverrideReason: 'Documents checked against public registry' },
    });
    expect(reviewed.status).toBe('verified');
    expect(reviewed.reviewedBy).toBe('admin-1');
    expect(reviewed.lastVerifiedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(reviewed.metadata.adminOverrideReason).toBe('Documents checked against public registry');
    vi.useRealTimers();
  });



  it('recognizes only active verified records for gated marketplace access', () => {
    const base = {
      status: 'verified' as const,
      subjectType: 'bep' as const,
      statutoryBody: 'SACAP',
      expiresAt: '2026-02-01T00:00:00.000Z',
    };

    expect(isActiveVerifiedVerification(base, { subjectType: 'bep', statutoryBody: 'SACAP', now: new Date('2026-01-15T00:00:00.000Z') })).toBe(true);
    expect(isActiveVerifiedVerification({ ...base, status: 'pending' }, { subjectType: 'bep', statutoryBody: 'SACAP' })).toBe(false);
    expect(isActiveVerifiedVerification(base, { subjectType: 'contractor', statutoryBody: 'SACAP' })).toBe(false);
    expect(isActiveVerifiedVerification(base, { subjectType: 'bep', statutoryBody: 'CIDB' })).toBe(false);
    expect(isActiveVerifiedVerification(base, { subjectType: 'bep', statutoryBody: 'SACAP', now: new Date('2026-03-01T00:00:00.000Z') })).toBe(false);
  });


  it('classifies verification lifecycle and queues rechecks', () => {
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    const active = { status: 'verified' as const, expiresAt: '2026-03-01T00:00:00.000Z' };
    const dueSoon = { status: 'verified' as const, expiresAt: '2026-01-20T00:00:00.000Z' };
    const expired = { status: 'verified' as const, expiresAt: '2025-12-31T00:00:00.000Z' };

    expect(getVerificationLifecycle(active).lifecycleStatus).toBe('active');
    expect(getVerificationLifecycle(dueSoon)).toMatchObject({ lifecycleStatus: 'due_for_recheck', isDueForRecheck: true });
    expect(getVerificationLifecycle(expired)).toMatchObject({ lifecycleStatus: 'expired', isExpired: true });

    const queued = queueVerificationRecheck({ id: 'ver-1', status: 'verified', metadata: { existing: true } }, 'admin-1');
    expect(queued).toMatchObject({ status: 'pending', metadata: { existing: true, verificationAgentStatus: 'queued', recheckRequestedBy: 'admin-1', previousStatus: 'verified' } });
    vi.useRealTimers();
  });


  it('rejects unsupported subject and review statuses', () => {
    expect(() => assertVerificationSubjectType('architect')).toThrow('Unsupported');
    expect(() => assertReviewStatus('pending')).toThrow('Unsupported');
  });
});
