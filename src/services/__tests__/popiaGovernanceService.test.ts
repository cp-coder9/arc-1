import { describe, expect, it, vi } from 'vitest';
import {
  buildDataProcessingRegisterEntry,
  buildConsentRecord,
  assertValidConsent,
  getMissingConsents,
  buildDataSubjectRequest,
  getDataSubjectRequestSla,
  buildBreachNotification,
  isBreachNotificationOverdue,
  POPIA_RESPONSE_DAYS,
  DATA_RETENTION_PERIODS,
} from '../popiaGovernanceService';

describe('popiaGovernanceService', () => {
  // ── Data Processing Register ────────────────────────────────────────────────

  it('builds a data processing register entry', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const entry = buildDataProcessingRegisterEntry({
      purpose: 'professional_verification',
      description: 'Processing professional body registration data for verification',
      dataCategories: ['professional_credentials', 'personal_identifying'],
      dataSubjectCategories: ['registered_professionals'],
      legalBasis: 'legal_obligation',
    });

    expect(entry).toMatchObject({
      purpose: 'professional_verification',
      legalBasis: 'legal_obligation',
      dpoApproved: false,
      immutable: true,
    });
    expect(entry.dataCategories).toHaveLength(2);
    vi.useRealTimers();
  });

  it('requires data categories and subject categories', () => {
    expect(() =>
      buildDataProcessingRegisterEntry({
        purpose: 'platform_operation',
        description: 'Test',
        dataCategories: [],
        dataSubjectCategories: [],
        legalBasis: 'consent',
      }),
    ).toThrow(/At least one data category/);
  });

  it('rejects invalid purposes', () => {
    expect(() =>
      buildDataProcessingRegisterEntry({
        purpose: 'invalid_purpose' as any,
        description: 'Test',
        dataCategories: ['personal_identifying'],
        dataSubjectCategories: ['users'],
        legalBasis: 'consent',
      }),
    ).toThrow(/Invalid data processing purpose/);
  });

  // ── Consent Management ──────────────────────────────────────────────────────

  it('builds a consent record with POPIA metadata', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const consent = buildConsentRecord({
      userId: 'user-1',
      purpose: 'professional_verification',
      consentVersion: '2026-05-v1',
    });

    expect(consent).toMatchObject({
      userId: 'user-1',
      purpose: 'professional_verification',
      status: 'granted',
      consentVersion: '2026-05-v1',
      popiaNoticeProvided: true,
      immutable: true,
    });
    expect(consent.metadata.popiaSection).toBe('Section 11 (Consent)');
    vi.useRealTimers();
  });

  it('asserts valid consent for granted records', () => {
    const consent = buildConsentRecord({
      userId: 'user-1',
      purpose: 'platform_operation',
      consentVersion: 'v1',
    });
    expect(() => assertValidConsent(consent)).not.toThrow();
  });

  it('throws for never_granted consent', () => {
    expect(() =>
      assertValidConsent({
        status: 'never_granted',
        purpose: 'platform_operation',
        expiresAt: undefined,
      }),
    ).toThrow(/never been granted/);
  });

  it('throws for withdrawn consent', () => {
    expect(() =>
      assertValidConsent({
        status: 'withdrawn',
        purpose: 'platform_operation',
        expiresAt: undefined,
      }),
    ).toThrow(/withdrawn/);
  });

  it('throws for expired consent', () => {
    expect(() =>
      assertValidConsent({
        status: 'granted',
        purpose: 'platform_operation',
        expiresAt: '2025-01-01T00:00:00.000Z',
      }),
    ).toThrow(/expired/);
  });

  it('finds missing consents from a list of required purposes', () => {
    const consent = buildConsentRecord({ userId: 'u-1', purpose: 'platform_operation', consentVersion: 'v1' });
    const missing = getMissingConsents(
      [consent],
      ['platform_operation', 'professional_verification', 'payment_processing'],
    );
    expect(missing).toEqual(['professional_verification', 'payment_processing']);
  });

  // ── Data Subject Requests ───────────────────────────────────────────────────

  it('builds a data subject request with SLA tracking', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const request = buildDataSubjectRequest({
      userId: 'user-1',
      requestType: 'access',
      description: 'Requesting all personal data held by the platform',
    });

    expect(request).toMatchObject({
      userId: 'user-1',
      requestType: 'access',
      status: 'received',
      identityVerified: false,
    });
    expect(request.metadata.sla).toContain(`${POPIA_RESPONSE_DAYS} days`);
    vi.useRealTimers();
  });

  it('tracks SLA for data subject requests', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const request = buildDataSubjectRequest({
      userId: 'user-1',
      requestType: 'erase',
      description: 'Request to delete account data',
    });

    // Due in 30 days from now
    const sla = getDataSubjectRequestSla(request, new Date('2026-06-10T10:00:00.000Z'));
    expect(sla.daysRemaining).toBe(30);
    expect(sla.isOverdue).toBe(false);

    // Overdue after due date
    const slaOverdue = getDataSubjectRequestSla(request, new Date('2026-07-15T00:00:00.000Z'));
    expect(slaOverdue.isOverdue).toBe(true);
    vi.useRealTimers();
  });

  // ── Breach Notifications ────────────────────────────────────────────────────

  it('builds a breach notification with IBA requirements', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const breach = buildBreachNotification({
      breachType: 'unauthorized_access',
      description: 'Unauthorized access to professional verification records',
      severity: 'high',
      dataCategories: ['professional_credentials', 'personal_identifying'],
      affectedDataSubjects: 150,
    });

    expect(breach).toMatchObject({
      breachType: 'unauthorized_access',
      severity: 'high',
      affectedDataSubjects: 150,
      ibaNotified: false,
      dataSubjectsNotified: false,
      immutable: true,
    });
    expect(breach.metadata.mustNotifyIba).toBe(true);
    vi.useRealTimers();
  });

  it('detects overdue breach notifications', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const breach = buildBreachNotification({
      breachType: 'data_leak',
      description: 'Leaked PI insurance documents',
      severity: 'critical',
      dataCategories: ['financial_information'],
      affectedDataSubjects: 500,
    });

    // Check 100 hours after discovery
    const status = isBreachNotificationOverdue(breach, new Date('2026-06-14T14:00:00.000Z'));
    expect(status.ibaOverdue).toBe(true); // Over 72 hours
    expect(status.hoursSinceDiscovery).toBeGreaterThan(72);
  });

  it('rejects invalid breach severities', () => {
    expect(() =>
      buildBreachNotification({
        breachType: 'test',
        description: 'Test',
        severity: 'extreme' as any,
        dataCategories: ['personal_identifying'],
        affectedDataSubjects: 1,
      }),
    ).toThrow(/Invalid breach severity/);
  });

  it('requires at least one data subject to be affected', () => {
    expect(() =>
      buildBreachNotification({
        breachType: 'test',
        description: 'Test',
        severity: 'low',
        dataCategories: ['personal_identifying'],
        affectedDataSubjects: 0,
      }),
    ).toThrow(/affectedDataSubjects/);
  });

  // ── Constants ───────────────────────────────────────────────────────────────

  it('defines retention periods for all processing purposes', () => {
    expect(DATA_RETENTION_PERIODS.project_management).toBe(15 * 365); // 15 years
    expect(DATA_RETENTION_PERIODS.payment_processing).toBe(7 * 365);
    expect(DATA_RETENTION_PERIODS.platform_operation).toBe(7 * 365);
    expect(DATA_RETENTION_PERIODS.communication).toBe(3 * 365);
  });
});
