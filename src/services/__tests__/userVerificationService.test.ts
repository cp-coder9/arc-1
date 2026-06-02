import { describe, expect, it, vi } from 'vitest';
import {
  applyVerificationReview,
  assertReviewStatus,
  assertVerificationSubjectType,
  buildUserVerification,
  buildVerificationQueueProjection,
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
    expect(inferVerificationProvider({ subjectType: 'bep', statutoryBody: 'ECSA' })).toBe('ecsa');
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
    expect(isActiveVerifiedVerification({ ...base, expiresAt: undefined }, { subjectType: 'bep', statutoryBody: 'SACAP' })).toBe(true);
    expect(isActiveVerifiedVerification({ ...base, expiresAt: 'not-a-date' }, { subjectType: 'bep', statutoryBody: 'SACAP' })).toBe(false);
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



  it('prioritizes verification queues across SACAP, ECSA, CIPC and manual evidence with SLA and recheck signals', () => {
    const now = new Date('2026-05-23T10:00:00.000Z');
    const queue = buildVerificationQueueProjection([
      {
        id: 'ver-bep-expiring',
        userId: 'bep-1',
        subjectType: 'bep',
        status: 'verified',
        statutoryBody: 'SACAP',
        registrationNumber: 'SACAP-123',
        submittedAt: '2026-05-01T08:00:00.000Z',
        submittedBy: 'bep-1',
        source: 'public_register',
        expiresAt: '2026-05-28T00:00:00.000Z',
        createdAt: '2026-05-01T08:00:00.000Z',
        updatedAt: '2026-05-01T08:00:00.000Z',
      },
      {
        id: 'ver-company-overdue',
        userId: 'supplier-1',
        subjectType: 'supplier',
        status: 'pending',
        statutoryBody: 'CIPC',
        source: 'document_upload',
        submittedAt: '2026-05-18T08:00:00.000Z',
        submittedBy: 'supplier-1',
        evidenceDocumentIds: ['doc-cipc'],
        createdAt: '2026-05-18T08:00:00.000Z',
        updatedAt: '2026-05-18T08:00:00.000Z',
      },
      {
        id: 'ver-ecsa-new',
        userId: 'engineer-1',
        subjectType: 'bep',
        status: 'pending',
        statutoryBody: 'ECSA',
        source: 'document_upload',
        submittedAt: '2026-05-23T09:00:00.000Z',
        submittedBy: 'engineer-1',
        registrationNumber: 'ECSA-789',
        createdAt: '2026-05-23T09:00:00.000Z',
        updatedAt: '2026-05-23T09:00:00.000Z',
      },
      {
        id: 'ver-rejected',
        userId: 'contractor-1',
        subjectType: 'contractor',
        status: 'rejected',
        statutoryBody: 'CIDB',
        source: 'document_upload',
        submittedAt: '2026-05-20T08:00:00.000Z',
        submittedBy: 'contractor-1',
        rejectionReason: 'Invalid certificate',
        createdAt: '2026-05-20T08:00:00.000Z',
        updatedAt: '2026-05-20T08:00:00.000Z',
      },
    ], { now, slaHours: 48, recheckWithinDays: 14 });

    expect(queue.summary).toEqual({ total: 4, pending: 2, overdue: 1, dueForRecheck: 1, rejected: 1 });
    expect(queue.items.map((item) => item.id)).toEqual(['ver-company-overdue', 'ver-bep-expiring', 'ver-ecsa-new', 'ver-rejected']);
    expect(queue.items[0]).toMatchObject({
      id: 'ver-company-overdue',
      provider: 'cipc',
      priority: 'urgent',
      action: 'Review uploaded evidence manually against official CIPC record',
      blocker: 'Verification has exceeded the 48 hour SLA.',
      requiresHumanReview: true,
    });
    expect(queue.items[1]).toMatchObject({
      id: 'ver-bep-expiring',
      provider: 'sacap',
      priority: 'high',
      action: 'Queue public-register recheck before verified status expires',
    });
    expect(queue.items[2]).toMatchObject({ provider: 'ecsa', priority: 'medium', action: 'Run ECSA public-register verification and route result for admin review' });
  });

  it('rejects unsupported subject and review statuses', () => {
    expect(() => assertVerificationSubjectType('architect')).toThrow('Unsupported');
    expect(() => assertReviewStatus('pending')).toThrow('Unsupported');
  });


});
