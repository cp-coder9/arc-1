import { describe, expect, it, vi } from 'vitest';
import {
  buildProfessionalRegistration,
  getRegistrationLifecycle,
  assertActiveRegistration,
  buildRegistrationQueueProjection,
  normalizeProfessionalBody,
  canActAsPrincipalAgent,
  PROFESSIONAL_BODIES,
  MINIMUM_PI_COVERAGE,
} from '../professionalRegistrationService';

describe('professionalRegistrationService', () => {
  // ── Builder ────────────────────────────────────────────────────────────────

  it('builds an immutable professional registration record with validation', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));

    const record = buildProfessionalRegistration({
      userId: 'user-1',
      professionalBody: 'SACAP',
      registrationNumber: 'SACAP-12345',
      category: 'Professional Architect',
      expiryDate: '2027-06-10T00:00:00.000Z',
    });

    expect(record).toMatchObject({
      userId: 'user-1',
      professionalBody: 'SACAP',
      registrationNumber: 'SACAP-12345',
      category: 'Professional Architect',
      status: 'pending',
      immutable: true,
      createdAt: '2026-06-10T10:00:00.000Z',
    });
    vi.useRealTimers();
  });

  it('normalizes registration numbers to uppercase', () => {
    const record = buildProfessionalRegistration({
      userId: 'user-1',
      professionalBody: 'ECSA',
      registrationNumber: ' ecsa-789 ',
      category: 'Professional Engineer',
      expiryDate: '2027-06-10T00:00:00.000Z',
    });
    expect(record.registrationNumber).toBe('ECSA-789');
    expect(record.professionalBody).toBe('ECSA');
  });

  it('rejects unsupported professional bodies', () => {
    expect(() =>
      buildProfessionalRegistration({
        userId: 'user-1',
        professionalBody: 'HPCSA' as any,
        registrationNumber: 'HP-123',
        category: 'Professional Architect' as any,
        expiryDate: '2027-06-10T00:00:00.000Z',
      }),
    ).toThrow(/Unsupported professional body/);
  });

  it('rejects invalid expiry dates', () => {
    expect(() =>
      buildProfessionalRegistration({
        userId: 'user-1',
        professionalBody: 'SACAP',
        registrationNumber: 'SACAP-123',
        category: 'Professional Architect',
        expiryDate: 'not-a-date',
      }),
    ).toThrow(/expiryDate must be a valid ISO date/);
  });

  it('rejects missing required fields', () => {
    expect(() =>
      buildProfessionalRegistration({
        userId: '',
        professionalBody: 'SACAP',
        registrationNumber: 'SACAP-123',
        category: 'Professional Architect',
        expiryDate: '2027-06-10T00:00:00.000Z',
      }),
    ).toThrow(/userId is required/);
  });

  it('supports all 5 professional bodies', () => {
    const bodies = ['SACAP', 'ECSA', 'SACQSP', 'SACLAP', 'SACPCMP'] as const;
    for (const body of bodies) {
      const record = buildProfessionalRegistration({
        userId: 'user-1',
        professionalBody: body,
        registrationNumber: `${body}-001`,
        category: 'Professional Architect' as any,
        expiryDate: '2027-06-10T00:00:00.000Z',
      });
      expect(record.professionalBody).toBe(body);
    }
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  it('classifies active registration correctly', () => {
    const lifecycle = getRegistrationLifecycle({
      status: 'active',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(lifecycle.status).toBe('active');
    expect(lifecycle.requiresAction).toBe(false);
    expect(lifecycle.isExpired).toBe(false);
  });

  it('detects expiring-soon registration (within 30 days)', () => {
    const lifecycle = getRegistrationLifecycle({
      status: 'active',
      expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(lifecycle.status).toBe('expiring_soon');
    expect(lifecycle.isExpiringSoon).toBe(true);
    expect(lifecycle.requiresAction).toBe(true);
    expect(lifecycle.daysUntilExpiry).toBeGreaterThan(0);
  });

  it('detects due-for-renewal registration (within 90 days)', () => {
    const lifecycle = getRegistrationLifecycle({
      status: 'active',
      expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(lifecycle.status).toBe('due_for_renewal');
    expect(lifecycle.isDueForRenewal).toBe(true);
  });

  it('detects expired registration', () => {
    const lifecycle = getRegistrationLifecycle({
      status: 'active',
      expiryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(lifecycle.status).toBe('expired');
    expect(lifecycle.isExpired).toBe(true);
    expect(lifecycle.requiresAction).toBe(true);
  });

  it('detects suspended registration', () => {
    const lifecycle = getRegistrationLifecycle({
      status: 'suspended',
      expiryDate: '2027-06-10T00:00:00.000Z',
    });
    expect(lifecycle.status).toBe('suspended');
    expect(lifecycle.requiresAction).toBe(true);
  });

  it('detects expired and lapsed statuses', () => {
    const expiredLifecycle = getRegistrationLifecycle({
      status: 'expired',
      expiryDate: '2025-06-10T00:00:00.000Z',
    });
    expect(expiredLifecycle.status).toBe('expired');
    expect(expiredLifecycle.isExpired).toBe(true);

    const lapsedLifecycle = getRegistrationLifecycle({
      status: 'lapsed',
      expiryDate: '2025-06-10T00:00:00.000Z',
    });
    expect(lapsedLifecycle.status).toBe('expired');
    expect(lapsedLifecycle.isExpired).toBe(true);
  });

  it('handles pending and candidate statuses', () => {
    const pending = getRegistrationLifecycle({
      status: 'pending',
      expiryDate: '2027-06-10T00:00:00.000Z',
    });
    expect(pending.status).toBe('pending');
    expect(pending.requiresAction).toBe(true);

    const candidate = getRegistrationLifecycle({
      status: 'candidate',
      expiryDate: '2027-06-10T00:00:00.000Z',
    });
    expect(candidate.status).toBe('candidate');
    expect(candidate.requiresAction).toBe(false);
    expect(candidate.actionLabel).toContain('supervised');
  });

  // ── Assertions ──────────────────────────────────────────────────────────────

  it('asserts active registration without throwing', () => {
    expect(() =>
      assertActiveRegistration({
        status: 'active',
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ).not.toThrow();
  });

  it('allows candidate registration when allowCandidate is true', () => {
    expect(() =>
      assertActiveRegistration(
        { status: 'candidate', expiryDate: '2027-06-10T00:00:00.000Z' },
        { allowCandidate: true },
      ),
    ).not.toThrow();
  });

  it('throws for suspended registration', () => {
    expect(() =>
      assertActiveRegistration({
        status: 'suspended',
        expiryDate: '2027-06-10T00:00:00.000Z',
      }),
    ).toThrow(/suspended/);
  });

  it('throws for expired registration', () => {
    expect(() =>
      assertActiveRegistration({
        status: 'active',
        expiryDate: '2025-01-01T00:00:00.000Z',
      }),
    ).toThrow(/expired/);
  });

  // ── Queue Projection ────────────────────────────────────────────────────────

  it('prioritizes registration queue correctly', () => {
    const now = new Date('2026-06-10T10:00:00.000Z');
    const registrations = [
      buildProfessionalRegistration({
        userId: 'user-1',
        professionalBody: 'SACAP',
        registrationNumber: 'SACAP-ACTIVE',
        category: 'Professional Architect',
        status: 'active',
        expiryDate: '2027-12-31T00:00:00.000Z',
      }),
      buildProfessionalRegistration({
        userId: 'user-2',
        professionalBody: 'ECSA',
        registrationNumber: 'ECSA-EXPIRING',
        category: 'Professional Engineer',
        status: 'active',
        expiryDate: '2026-06-25T00:00:00.000Z', // Expiring in 15 days
      }),
      buildProfessionalRegistration({
        userId: 'user-3',
        professionalBody: 'SACAP',
        registrationNumber: 'SACAP-EXPIRED',
        category: 'Professional Architect',
        status: 'expired',
        expiryDate: '2025-12-31T00:00:00.000Z',
      }),
      buildProfessionalRegistration({
        userId: 'user-4',
        professionalBody: 'SACPCMP',
        registrationNumber: 'SACPCMP-SUSPENDED',
        category: 'Professional Construction Manager',
        status: 'suspended',
        expiryDate: '2027-06-10T00:00:00.000Z',
      }),
    ];

    const queue = buildRegistrationQueueProjection(registrations, { now });
    expect(queue.summary.total).toBe(4);
    expect(queue.summary.expired).toBeGreaterThanOrEqual(1);
    expect(queue.summary.expiringSoon).toBeGreaterThanOrEqual(1);
    expect(queue.summary.suspended).toBeGreaterThanOrEqual(1);

    // Urgent items (expired/suspended) should be first
    const firstTwo = queue.items.slice(0, 2);
    expect(firstTwo.some((i) => i.priority === 'urgent')).toBe(true);
  });

  // ── Utilities ────────────────────────────────────────────────────────────────

  it('normalizes professional body strings', () => {
    expect(normalizeProfessionalBody('sacap')).toBe('SACAP');
    expect(normalizeProfessionalBody(' Ecsa ')).toBe('ECSA');
    expect(normalizeProfessionalBody('')).toBeUndefined();
    expect(normalizeProfessionalBody('UNKNOWN')).toBeUndefined();
  });

  it('checks principal agent eligibility', () => {
    const active = { professionalBody: 'SACAP' as const, status: 'active' as const, expiryDate: '2027-06-10T00:00:00.000Z' };
    const expired = { professionalBody: 'SACAP' as const, status: 'active' as const, expiryDate: '2025-01-01T00:00:00.000Z' };
    const suspended = { professionalBody: 'SACAP' as const, status: 'suspended' as const, expiryDate: '2027-06-10T00:00:00.000Z' };

    expect(canActAsPrincipalAgent(active)).toBe(true);
    expect(canActAsPrincipalAgent(expired)).toBe(false);
    expect(canActAsPrincipalAgent(suspended)).toBe(false);
  });

  // ── Constants ────────────────────────────────────────────────────────────────

  it('defines all 5 professional bodies', () => {
    expect(PROFESSIONAL_BODIES).toHaveLength(5);
    expect(PROFESSIONAL_BODIES).toContain('SACAP');
    expect(PROFESSIONAL_BODIES).toContain('ECSA');
    expect(PROFESSIONAL_BODIES).toContain('SACQSP');
    expect(PROFESSIONAL_BODIES).toContain('SACLAP');
    expect(PROFESSIONAL_BODIES).toContain('SACPCMP');
  });

  it('defines minimum PI coverage for all bodies', () => {
    expect(MINIMUM_PI_COVERAGE.SACAP).toBe(2_000_000);
    expect(MINIMUM_PI_COVERAGE.ECSA).toBe(3_000_000);
    expect(MINIMUM_PI_COVERAGE.SACQSP).toBe(1_000_000);
    expect(MINIMUM_PI_COVERAGE.SACLAP).toBe(1_000_000);
    expect(MINIMUM_PI_COVERAGE.SACPCMP).toBe(2_000_000);
  });
});
