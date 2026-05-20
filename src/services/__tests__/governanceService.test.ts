import { describe, expect, it } from 'vitest';
import {
  assertGovernancePrerequisites,
  buildGovernanceAuditInput,
  buildGovernanceRecord,
  buildAdminGovernanceQueueSummary,
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

  it('builds an admin governance queue summary with human gates and redaction defaults', () => {
    const now = new Date('2026-05-21T01:00:00.000Z');
    const summary = buildAdminGovernanceQueueSummary([
      {
        id: 'ai-1',
        type: 'ai_review',
        status: 'open',
        projectId: 'project-1',
        assignedRole: 'bep',
        dueAt: '2026-05-21T00:00:00.000Z',
        createdAt: '2026-05-20T00:00:00.000Z',
        aiGenerated: true,
        metadata: { findingCount: 3 },
      },
      {
        id: 'pay-1',
        type: 'payment',
        status: 'blocked',
        projectId: 'project-1',
        ownerRole: 'client',
        blockedReason: 'Escrow KYC evidence is pending',
        personalDataPresent: true,
      },
      {
        id: 'sync-closed',
        type: 'statutory_sync',
        status: 'resolved',
      },
    ], now);

    expect(summary).toMatchObject({
      generatedAt: '2026-05-21T01:00:00.000Z',
      totalOpen: 2,
      blockedCount: 1,
      overdueCount: 1,
      humanGateRequiredCount: 2,
      aiMayNotResolve: true,
    });
    expect(summary.countsByType).toMatchObject({ ai_review: 1, payment: 1, statutory_sync: 0 });
    expect(summary.items.find(item => item.id === 'pay-1')).toMatchObject({
      id: 'pay-1',
      severity: 'high',
      blocked: true,
      requiresHumanGate: true,
      aiMayNotResolve: true,
      redactedForAdminSummary: true,
    });
    expect(summary.items.find(item => item.id === 'ai-1')).toMatchObject({
      id: 'ai-1',
      severity: 'high',
      requiresHumanGate: true,
      aiMayNotResolve: true,
      redactedForAdminSummary: true,
      metadata: { findingCount: 3 },
    });
  });

  it('keeps non-sensitive admin queue summaries unredacted when explicitly marked safe', () => {
    const summary = buildAdminGovernanceQueueSummary([
      {
        id: 'audit-1',
        type: 'audit_exception',
        status: 'open',
        severity: 'critical',
        humanGateRequired: true,
        personalDataPresent: false,
      },
    ], new Date('2026-05-21T01:00:00.000Z'));

    expect(summary.criticalCount).toBe(1);
    expect(summary.items[0]).toMatchObject({
      id: 'audit-1',
      priority: 400,
      redactedForAdminSummary: false,
      aiMayNotResolve: true,
    });
  });

});
