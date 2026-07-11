/**
 * Unauthorized Access Tests — Separation of Duty & Admin Override Scenarios
 *
 * Tests that:
 * 1. A claim submitter cannot certify their own claim (7.5)
 * 2. A claim submitter cannot release their own claim (7.5)
 * 3. An admin override without documented reason (≥10 chars) is rejected (7.7)
 * 4. Separation-of-duty violations return appropriate errors (7.9)
 *
 * These tests exercise the business logic layer directly via:
 * - certifyWithSeparationOfDuty (certificationControlService)
 * - validateSeparationOfDuty (certificationControlService)
 * - canAdminOverrideSeparationOfDuty (permissionService)
 *
 * Run via: npm test
 * @see Requirements 7.5, 7.6, 7.7, 7.9
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  certifyWithSeparationOfDuty,
  validateSeparationOfDuty,
  CertificationError,
  type CertificationRequest,
} from '@/services/finance/certificationControlService';
import {
  canAdminOverrideSeparationOfDuty,
} from '@/services/permissionService';

// ─── Mock firebase-admin ──────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockCreate = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ get: mockGet, create: mockCreate, set: mockSet }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

// ─── Mock audit trail service ─────────────────────────────────────────────────

vi.mock('@/services/finance/auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('mock-audit-id'),
}));

// ─── Mock permission service (for certificationControlService's internal use) ─

const mockCanUserPerform = vi.fn();

vi.mock('@/services/permissionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/permissionService')>();
  return {
    ...actual,
    canUserPerform: (...args: unknown[]) => mockCanUserPerform(...args),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupClaimMocks(options: {
  hasPermission?: boolean;
  certifierRole?: string;
  claimExists?: boolean;
  submitterUid?: string;
} = {}) {
  const {
    hasPermission = true,
    certifierRole = 'quantity_surveyor',
    claimExists = true,
    submitterUid = 'submitter-uid-001',
  } = options;

  mockCanUserPerform.mockReturnValue(hasPermission);

  let callCount = 0;
  mockGet.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // User document (certifier)
      return {
        exists: true,
        data: () => ({ role: certifierRole, admin: false }),
      };
    }
    // Claim document
    return {
      exists: claimExists,
      data: () => claimExists ? {
        claimId: 'claim-001',
        claimantRole: 'contractor',
        claimedAmount: { currency: 'ZAR', amount: 100000 },
        linkedMilestoneId: 'ms-001',
        linkedVariationIds: [],
        submittedAtIso: '2026-01-15T10:00:00.000Z',
        disputed: false,
        submitterUid,
        claimantUid: submitterUid,
      } : undefined,
    };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Unauthorized Access: Separation-of-Duty Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Claim submitter cannot certify own claim (Req 7.5)', () => {
    it('rejects certification when certifier UID matches claim submitter UID', async () => {
      const submitterUid = 'user-alice-001';

      setupClaimMocks({
        hasPermission: true,
        submitterUid,
      });

      const request: CertificationRequest = {
        claimId: 'claim-001',
        certifierUid: submitterUid, // Same as submitter — violation
        certifiedAmount: { currency: 'ZAR', amount: 80000 },
      };

      await expect(certifyWithSeparationOfDuty(request)).rejects.toThrow(CertificationError);

      try {
        await certifyWithSeparationOfDuty(request);
      } catch (err) {
        expect(err).toBeInstanceOf(CertificationError);
        const certErr = err as CertificationError;
        expect(certErr.constraint).toBe('submitter_is_certifier');
        expect(certErr.actorA).toBe(submitterUid);
        expect(certErr.actorB).toBe(submitterUid);
      }
    });

    it('preserves claim in pre-certification state on rejection — no certificate created', async () => {
      const submitterUid = 'user-bob-002';

      setupClaimMocks({
        hasPermission: true,
        submitterUid,
      });

      const request: CertificationRequest = {
        claimId: 'claim-001',
        certifierUid: submitterUid,
        certifiedAmount: { currency: 'ZAR', amount: 60000 },
      };

      await expect(certifyWithSeparationOfDuty(request)).rejects.toThrow();

      // Verify no certificate was persisted
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('succeeds when certifier is a different user than submitter', async () => {
      setupClaimMocks({
        hasPermission: true,
        submitterUid: 'user-submitter',
      });

      const request: CertificationRequest = {
        claimId: 'claim-001',
        certifierUid: 'user-certifier', // Different UID — allowed
        certifiedAmount: { currency: 'ZAR', amount: 50000 },
      };

      const result = await certifyWithSeparationOfDuty(request);
      expect(result.certificateId).toBeDefined();
      expect(result.status).toBe('approved_for_provider_request');
    });
  });

  describe('Claim submitter cannot release own claim (Req 7.5)', () => {
    it('validateSeparationOfDuty rejects when submitter is release approver', () => {
      const submitterUid = 'user-charlie-003';
      const certifierUid = 'user-different-certifier';
      const releaserUid = submitterUid; // Same as submitter — violation

      const result = validateSeparationOfDuty(submitterUid, certifierUid, releaserUid);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].constraint).toBe('submitter_is_releaser');
      expect(result.violations[0].actorA).toBe(submitterUid);
      expect(result.violations[0].actorB).toBe(submitterUid);
    });

    it('validateSeparationOfDuty rejects when certifier is release approver', () => {
      const submitterUid = 'user-submitter';
      const certifierUid = 'user-certifier';
      const releaserUid = certifierUid; // Same as certifier — violation

      const result = validateSeparationOfDuty(submitterUid, certifierUid, releaserUid);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].constraint).toBe('certifier_is_releaser');
    });

    it('validates successfully when submitter, certifier, and releaser are all distinct', () => {
      const result = validateSeparationOfDuty('user-A', 'user-B', 'user-C');

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Admin override without documented reason is rejected (Req 7.7)', () => {
    it('rejects override when reason is empty string', async () => {
      const result = await canAdminOverrideSeparationOfDuty({
        admin: { uid: 'admin-001', role: 'platform_admin' },
        action: 'payment:manage',
        projectId: 'project-001',
        reason: '',
      });

      expect(result).toBe(false);
    });

    it('rejects override when reason is shorter than 10 characters', async () => {
      const result = await canAdminOverrideSeparationOfDuty({
        admin: { uid: 'admin-001', role: 'platform_admin' },
        action: 'payment:manage',
        projectId: 'project-001',
        reason: 'too short',
      });

      expect(result).toBe(false);
    });

    it('rejects override when reason is only whitespace (trimmed < 10 chars)', async () => {
      const result = await canAdminOverrideSeparationOfDuty({
        admin: { uid: 'admin-001', role: 'platform_admin' },
        action: 'payment:manage',
        projectId: 'project-001',
        reason: '           ', // 11 spaces, but trims to 0
      });

      expect(result).toBe(false);
    });

    it('rejects override when reason is exactly 9 characters', async () => {
      const result = await canAdminOverrideSeparationOfDuty({
        admin: { uid: 'admin-001', role: 'platform_admin' },
        action: 'payment:manage',
        projectId: 'project-001',
        reason: '123456789', // 9 chars
      });

      expect(result).toBe(false);
    });

    it('accepts override when reason is exactly 10 characters from admin user', async () => {
      const result = await canAdminOverrideSeparationOfDuty({
        admin: { uid: 'admin-001', role: 'platform_admin' },
        action: 'payment:manage',
        projectId: 'project-001',
        reason: '1234567890', // 10 chars
      });

      expect(result).toBe(true);
    });

    it('rejects override from non-admin user even with valid reason', async () => {
      const result = await canAdminOverrideSeparationOfDuty({
        admin: { uid: 'client-001', role: 'client' },
        action: 'payment:manage',
        projectId: 'project-001',
        reason: 'This is a well documented reason for override',
      });

      expect(result).toBe(false);
    });

    it('rejects override when admin field is null', async () => {
      const result = await canAdminOverrideSeparationOfDuty({
        admin: null,
        action: 'payment:manage',
        projectId: 'project-001',
        reason: 'Valid reason with enough characters',
      });

      expect(result).toBe(false);
    });

    it('accepts override when user has admin: true flag and valid reason', async () => {
      const result = await canAdminOverrideSeparationOfDuty({
        admin: { uid: 'admin-002', role: 'engineer', admin: true },
        action: 'escrow:release',
        projectId: 'project-002',
        reason: 'Emergency override due to contractor deadline',
      });

      expect(result).toBe(true);
    });

    it('no state change occurs when override is rejected — audit record not written', async () => {
      // Reset mockSet calls before this test
      mockSet.mockClear();

      await canAdminOverrideSeparationOfDuty({
        admin: { uid: 'admin-001', role: 'platform_admin' },
        action: 'payment:manage',
        projectId: 'project-001',
        reason: 'short', // Too short — should be rejected
      });

      // When override is rejected, no audit record should be written to Firestore
      // (the function returns false before reaching the audit write)
      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  describe('Separation-of-duty violations return appropriate errors (Req 7.9)', () => {
    it('CertificationError contains the violated constraint identifier', async () => {
      const submitterUid = 'user-delta-004';

      setupClaimMocks({
        hasPermission: true,
        submitterUid,
      });

      const request: CertificationRequest = {
        claimId: 'claim-001',
        certifierUid: submitterUid,
        certifiedAmount: { currency: 'ZAR', amount: 25000 },
      };

      try {
        await certifyWithSeparationOfDuty(request);
        expect.fail('Should have thrown CertificationError');
      } catch (err) {
        expect(err).toBeInstanceOf(CertificationError);
        const certErr = err as CertificationError;
        expect(certErr.constraint).toBe('submitter_is_certifier');
        expect(certErr.message).toContain('separation-of-duty violation');
        expect(certErr.message).toContain('submitter_is_certifier');
      }
    });

    it('CertificationError includes both actor UIDs for traceability', async () => {
      const submitterUid = 'user-echo-005';

      setupClaimMocks({
        hasPermission: true,
        submitterUid,
      });

      const request: CertificationRequest = {
        claimId: 'claim-001',
        certifierUid: submitterUid,
        certifiedAmount: { currency: 'ZAR', amount: 30000 },
      };

      try {
        await certifyWithSeparationOfDuty(request);
        expect.fail('Should have thrown');
      } catch (err) {
        const certErr = err as CertificationError;
        expect(certErr.actorA).toBe(submitterUid);
        expect(certErr.actorB).toBe(submitterUid);
      }
    });

    it('rejects certification when certifier lacks payment:manage permission', async () => {
      setupClaimMocks({
        hasPermission: false,
        submitterUid: 'user-submitter',
      });

      const request: CertificationRequest = {
        claimId: 'claim-001',
        certifierUid: 'user-no-permission',
        certifiedAmount: { currency: 'ZAR', amount: 40000 },
      };

      try {
        await certifyWithSeparationOfDuty(request);
        expect.fail('Should have thrown CertificationError');
      } catch (err) {
        expect(err).toBeInstanceOf(CertificationError);
        const certErr = err as CertificationError;
        expect(certErr.constraint).toBe('missing_permission');
        expect(certErr.actorA).toBe('user-no-permission');
      }
    });

    it('validateSeparationOfDuty reports multiple violations when all UIDs are identical', () => {
      const sameUid = 'user-same-all';
      const result = validateSeparationOfDuty(sameUid, sameUid, sameUid);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(3);

      const constraints = result.violations.map(v => v.constraint);
      expect(constraints).toContain('submitter_is_certifier');
      expect(constraints).toContain('certifier_is_releaser');
      expect(constraints).toContain('submitter_is_releaser');
    });

    it('validateSeparationOfDuty returns structured result with all party UIDs', () => {
      const result = validateSeparationOfDuty('sub-uid', 'cert-uid', 'rel-uid');

      expect(result.submitterUid).toBe('sub-uid');
      expect(result.certifierUid).toBe('cert-uid');
      expect(result.releaseApproverUid).toBe('rel-uid');
      expect(result.valid).toBe(true);
    });
  });
});
