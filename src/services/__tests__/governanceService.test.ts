import { describe, expect, it } from 'vitest';
import {
  assertGovernancePrerequisites,
  buildGovernanceAuditInput,
  buildGovernanceRecord,
  getMissingGovernancePrerequisites,
  hasActiveGovernanceRecord,
  type GovernanceRecord,
} from '../governanceService';

const actor = { uid: 'user-1', role: 'client' as const, email: 'client@example.com' };

function record(overrides: Partial<GovernanceRecord> = {}): GovernanceRecord {
  return buildGovernanceRecord({
    type: 'terms_acceptance',
    subjectUserId: 'user-1',
    actor,
    version: '2026-05-20',
    createdAt: '2026-05-20T13:00:00.000Z',
    ...overrides,
  });
}

describe('governanceService', () => {
  it('builds immutable terms, privacy, and AI acknowledgement records with default purposes', () => {
    expect(record()).toMatchObject({
      type: 'terms_acceptance',
      purpose: 'platform_terms',
      status: 'active',
      immutable: true,
    });

    expect(record({ type: 'privacy_consent' })).toMatchObject({ purpose: 'popia_processing' });
    expect(record({ type: 'ai_acknowledgement' })).toMatchObject({ purpose: 'ai_advisory_limitations' });
  });

  it('requires durable KYC evidence before enabling high-risk payment governance', () => {
    expect(() => record({ type: 'kyc_evidence' })).toThrow(/KYC evidence/);
    expect(record({ type: 'kyc_evidence', evidenceHash: 'sha256:abc' })).toMatchObject({
      type: 'kyc_evidence',
      purpose: 'payment_kyc',
      evidenceHash: 'sha256:abc',
    });
  });

  it('builds audit input for governance records', () => {
    const audit = buildGovernanceAuditInput(record({ type: 'ai_acknowledgement', projectId: 'project-1' }));

    expect(audit).toMatchObject({
      category: 'ai',
      action: 'governance.ai_acknowledgement.active',
      immutable: true,
      target: { type: 'ai_acknowledgement', id: 'user-1', projectId: 'project-1' },
    });
  });

  it('detects missing active prerequisites and ignores expired or withdrawn records', () => {
    const now = new Date('2026-05-20T13:00:00.000Z');
    const records = [
      record({ type: 'terms_acceptance' }),
      record({ type: 'privacy_consent', status: 'withdrawn' }),
      record({ type: 'ai_acknowledgement', expiresAt: '2026-05-20T12:59:00.000Z' }),
      record({ type: 'kyc_evidence', evidenceUri: 'blob://kyc.pdf', expiresAt: '2026-05-21T00:00:00.000Z' }),
    ];

    expect(hasActiveGovernanceRecord(records, 'terms_acceptance', now)).toBe(true);
    expect(hasActiveGovernanceRecord(records, 'privacy_consent', now)).toBe(false);
    expect(hasActiveGovernanceRecord(records, 'ai_acknowledgement', now)).toBe(false);
    expect(hasActiveGovernanceRecord(records, 'kyc_evidence', now)).toBe(true);

    expect(getMissingGovernancePrerequisites(records, [
      'terms_acceptance',
      'privacy_consent',
      'ai_acknowledgement',
      'kyc_evidence',
    ], now)).toEqual(['privacy_consent', 'ai_acknowledgement']);
  });

  it('throws a 409-style error when governance prerequisites are missing', () => {
    expect(() => assertGovernancePrerequisites([], ['terms_acceptance'])).toThrow(/Missing governance prerequisites/);
  });
});
