import { describe, expect, it, vi } from 'vitest';
import {
  buildVerificationBadge,
  getBadgeProvenanceLevel,
  compareProvenance,
  getHighestProvenance,
  isBadgeExpired,
  toDisplayBadge,
  getDisplayBadgesForEntity,
  getEntityVerificationSummary,
  BADGE_DISPLAY_CONFIG,
} from '../verificationBadgeService';

describe('verificationBadgeService', () => {
  it('builds a verification badge with provenance', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const badge = buildVerificationBadge({
      badgeType: 'professional_registration_verified',
      entityId: 'prof-1',
      entityType: 'professional',
      provenance: 'externally_verified',
      evidenceReference: 'SACAP-12345',
      issuedBy: 'system',
    });

    expect(badge).toMatchObject({
      badgeType: 'professional_registration_verified',
      entityId: 'prof-1',
      provenance: 'externally_verified',
      immutable: true,
    });
    vi.useRealTimers();
  });

  it('rejects invalid badge types', () => {
    expect(() =>
      buildVerificationBadge({
        badgeType: 'invalid_badge' as any,
        entityId: 'e-1',
        entityType: 'professional',
        provenance: 'self_declared',
      }),
    ).toThrow(/Invalid badge type/);
  });

  it('rejects invalid provenance', () => {
    expect(() =>
      buildVerificationBadge({
        badgeType: 'identity_verified',
        entityId: 'e-1',
        entityType: 'professional',
        provenance: 'verified_by_god' as any,
      }),
    ).toThrow(/Invalid badge provenance/);
  });

  it('rejects invalid expiry dates on badges', () => {
    expect(() =>
      buildVerificationBadge({
        badgeType: 'identity_verified',
        entityId: 'e-1',
        entityType: 'professional',
        provenance: 'document_uploaded',
        expiresAt: 'not-valid',
      }),
    ).toThrow(/expiresAt/);
  });

  it('ranks provenance levels correctly', () => {
    expect(getBadgeProvenanceLevel('self_declared')).toBe(0);
    expect(getBadgeProvenanceLevel('document_uploaded')).toBe(1);
    expect(getBadgeProvenanceLevel('manually_reviewed')).toBe(2);
    expect(getBadgeProvenanceLevel('externally_verified')).toBe(3);
  });

  it('compares provenance levels', () => {
    expect(compareProvenance('externally_verified', 'self_declared')).toBeGreaterThan(0);
    expect(compareProvenance('self_declared', 'externally_verified')).toBeLessThan(0);
    expect(compareProvenance('manually_reviewed', 'manually_reviewed')).toBe(0);
  });

  it('finds highest provenance from array', () => {
    expect(getHighestProvenance(['self_declared', 'document_uploaded', 'externally_verified'])).toBe('externally_verified');
    expect(getHighestProvenance(['self_declared'])).toBe('self_declared');
  });

  it('detects expired badges', () => {
    const expired = { expiresAt: '2025-01-01T00:00:00.000Z' } as any;
    const active = { expiresAt: '2027-06-10T00:00:00.000Z' } as any;
    const noExpiry = { expiresAt: undefined } as any;

    expect(isBadgeExpired(expired, new Date('2026-06-10T00:00:00.000Z'))).toBe(true);
    expect(isBadgeExpired(active, new Date('2026-06-10T00:00:00.000Z'))).toBe(false);
    expect(isBadgeExpired(noExpiry)).toBe(false);
  });

  it('converts to display badge with config', () => {
    const badge = buildVerificationBadge({
      badgeType: 'insurance_verified',
      entityId: 'prof-1',
      entityType: 'professional',
      provenance: 'externally_verified',
    });
    const display = toDisplayBadge(badge);
    expect(display.badgeType).toBe('insurance_verified');
    expect(display.color).toBe('green');
    expect(display.icon).toBe('🛡️');
    expect(display.isExpired).toBe(false);
  });

  it('returns best badges per type for entity display', () => {
    const badges = [
      buildVerificationBadge({ badgeType: 'identity_verified', entityId: 'e-1', entityType: 'professional', provenance: 'self_declared' }),
      buildVerificationBadge({ badgeType: 'identity_verified', entityId: 'e-1', entityType: 'professional', provenance: 'externally_verified' }),
      buildVerificationBadge({ badgeType: 'professional_registration_verified', entityId: 'e-1', entityType: 'professional', provenance: 'document_uploaded' }),
    ];

    const display = getDisplayBadgesForEntity(badges);
    // Should have 2 badges (one per type, highest provenance)
    expect(display).toHaveLength(2);
    const identityBadge = display.find((b) => b.badgeType === 'identity_verified');
    expect(identityBadge?.provenance).toBe('externally_verified');
    expect(identityBadge?.color).toBe('green');
  });

  it('returns verification summary for an entity', () => {
    const badges = [
      buildVerificationBadge({ badgeType: 'identity_verified', entityId: 'e-1', entityType: 'professional', provenance: 'externally_verified' }),
    ];

    const summary = getEntityVerificationSummary(badges);
    expect(summary.identity_verified.hasBadge).toBe(true);
    expect(summary.identity_verified.provenance).toBe('externally_verified');
    expect(summary.professional_registration_verified.hasBadge).toBe(false);
    expect(summary.professional_registration_verified.provenance).toBeNull();
    expect(summary.insurance_verified.hasBadge).toBe(false);
    expect(summary.compliance_verified.hasBadge).toBe(false);
  });

  it('defines display config for all badge type + provenance combinations', () => {
    const badgeTypes = ['identity_verified', 'professional_registration_verified', 'insurance_verified', 'compliance_verified'] as const;
    const provenances = ['self_declared', 'document_uploaded', 'manually_reviewed', 'externally_verified'] as const;

    for (const bt of badgeTypes) {
      for (const p of provenances) {
        expect(BADGE_DISPLAY_CONFIG[bt][p]).toBeDefined();
        expect(BADGE_DISPLAY_CONFIG[bt][p].icon).toBeTruthy();
        expect(BADGE_DISPLAY_CONFIG[bt][p].color).toBeTruthy();
      }
    }
  });
});
