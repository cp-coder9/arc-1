/**
 * Unit tests for approvalStateMachine
 */
import {
  createApprovalRequest,
  evaluateApprovalStatus,
  recordApproval,
  getPendingSignatories,
  getTimeRemaining,
  getAuthorityRule,
  isRoleAuthorized,
  computeExpiryDate,
  APPROVAL_EXPIRY_DAYS,
  type ApprovalRequest,
} from './approvalStateMachine';
import type { UserRole } from '@/types';

describe('approvalStateMachine', () => {
  const now = '2025-01-15T10:00:00.000Z';

  describe('createApprovalRequest', () => {
    it('creates a pending request with all signatories in pending state', () => {
      const req = createApprovalRequest(
        'req-001',
        'payment_certification',
        'proj-001',
        'cert-001',
        'payment_certificate',
        ['quantity_surveyor', 'architect'] as UserRole[],
        now,
      );

      expect(req.status).toBe('pending');
      expect(req.signatories).toHaveLength(2);
      expect(req.signatories.every((s) => s.status === 'pending')).toBe(true);
      expect(req.requestId).toBe('req-001');
      expect(req.requiredSignatories).toEqual(['quantity_surveyor', 'architect']);
    });

    it('computes expiry date 14 days from initiation', () => {
      const req = createApprovalRequest(
        'req-002',
        'variation_approval',
        'proj-001',
        'var-001',
        'variation',
        ['architect', 'client'] as UserRole[],
        '2025-01-01T00:00:00.000Z',
      );

      const expected = new Date('2025-01-15T00:00:00.000Z').toISOString();
      expect(req.expiresAt).toBe(expected);
    });
  });

  describe('evaluateApprovalStatus', () => {
    it('returns pending when < N approvals and < 14 days', () => {
      const req = createApprovalRequest(
        'req-003',
        'payment_certification',
        'proj-001',
        'cert-002',
        'payment_certificate',
        ['quantity_surveyor', 'architect'] as UserRole[],
        now,
      );

      const result = evaluateApprovalStatus(req, now);
      expect(result.status).toBe('pending');
    });

    it('returns approved when all approvals received', () => {
      const req = createApprovalRequest(
        'req-004',
        'payment_certification',
        'proj-001',
        'cert-003',
        'payment_certificate',
        ['quantity_surveyor', 'architect'] as UserRole[],
        now,
      );

      // Manually set both signatories to approved
      req.signatories[0].status = 'approved';
      req.signatories[0].respondedAt = now;
      req.signatories[1].status = 'approved';
      req.signatories[1].respondedAt = now;

      const result = evaluateApprovalStatus(req, now);
      expect(result.status).toBe('approved');
      expect(result.resolvedAt).toBeDefined();
    });

    it('returns rejected when any signatory rejects', () => {
      const req = createApprovalRequest(
        'req-005',
        'variation_approval',
        'proj-001',
        'var-002',
        'variation',
        ['architect', 'quantity_surveyor', 'client'] as UserRole[],
        now,
      );

      // One approval + one rejection
      req.signatories[0].status = 'approved';
      req.signatories[1].status = 'rejected';
      req.signatories[1].respondedAt = now;

      const result = evaluateApprovalStatus(req, now);
      expect(result.status).toBe('rejected');
    });

    it('returns expired when 14 days have elapsed', () => {
      const initiatedAt = '2025-01-01T00:00:00.000Z';
      const req = createApprovalRequest(
        'req-006',
        'payment_certification',
        'proj-001',
        'cert-004',
        'payment_certificate',
        ['quantity_surveyor', 'architect'] as UserRole[],
        initiatedAt,
      );

      // 15 days later
      const futureTime = '2025-01-16T00:00:00.000Z';
      const result = evaluateApprovalStatus(req, futureTime);
      expect(result.status).toBe('expired');
      expect(result.signatories.every((s) => s.status === 'expired')).toBe(true);
    });

    it('rejection takes precedence over expiry', () => {
      const initiatedAt = '2025-01-01T00:00:00.000Z';
      const req = createApprovalRequest(
        'req-007',
        'payment_certification',
        'proj-001',
        'cert-005',
        'payment_certificate',
        ['quantity_surveyor', 'architect'] as UserRole[],
        initiatedAt,
      );

      req.signatories[0].status = 'rejected';
      req.signatories[0].respondedAt = '2025-01-02T00:00:00.000Z';

      // Even though 14 days have also passed
      const futureTime = '2025-01-16T00:00:00.000Z';
      const result = evaluateApprovalStatus(req, futureTime);
      expect(result.status).toBe('rejected');
    });
  });

  describe('recordApproval', () => {
    it('records an approval and updates status', () => {
      const req = createApprovalRequest(
        'req-008',
        'payment_certification',
        'proj-001',
        'cert-006',
        'payment_certificate',
        ['quantity_surveyor', 'architect'] as UserRole[],
        now,
      );

      const updated = recordApproval(req, {
        role: 'quantity_surveyor' as UserRole,
        userId: 'user-qs-001',
        decision: 'approved',
        timestamp: now,
      });

      expect(updated.signatories[0].status).toBe('approved');
      expect(updated.signatories[0].userId).toBe('user-qs-001');
      expect(updated.status).toBe('pending'); // Still need architect
    });

    it('transitions to approved when all signatories approve', () => {
      let req = createApprovalRequest(
        'req-009',
        'payment_certification',
        'proj-001',
        'cert-007',
        'payment_certificate',
        ['quantity_surveyor', 'architect'] as UserRole[],
        now,
      );

      req = recordApproval(req, {
        role: 'quantity_surveyor' as UserRole,
        userId: 'user-qs-001',
        decision: 'approved',
        timestamp: now,
      });

      req = recordApproval(req, {
        role: 'architect' as UserRole,
        userId: 'user-arch-001',
        decision: 'approved',
        timestamp: now,
      });

      expect(req.status).toBe('approved');
    });

    it('transitions to rejected on any rejection', () => {
      const req = createApprovalRequest(
        'req-010',
        'variation_approval',
        'proj-001',
        'var-003',
        'variation',
        ['architect', 'quantity_surveyor', 'client'] as UserRole[],
        now,
      );

      const updated = recordApproval(req, {
        role: 'client' as UserRole,
        userId: 'user-client-001',
        decision: 'rejected',
        timestamp: now,
      });

      expect(updated.status).toBe('rejected');
    });
  });

  describe('getPendingSignatories', () => {
    it('returns only pending signatories', () => {
      const req = createApprovalRequest(
        'req-011',
        'variation_approval',
        'proj-001',
        'var-004',
        'variation',
        ['architect', 'quantity_surveyor', 'client'] as UserRole[],
        now,
      );

      req.signatories[0].status = 'approved';

      const pending = getPendingSignatories(req);
      expect(pending).toHaveLength(2);
      expect(pending[0].role).toBe('quantity_surveyor');
      expect(pending[1].role).toBe('client');
    });
  });

  describe('getTimeRemaining', () => {
    it('returns positive milliseconds when not expired', () => {
      const req = createApprovalRequest(
        'req-012',
        'payment_certification',
        'proj-001',
        'cert-008',
        'payment_certificate',
        ['quantity_surveyor'] as UserRole[],
        '2025-01-01T00:00:00.000Z',
      );

      const remaining = getTimeRemaining(req, new Date('2025-01-10T00:00:00.000Z'));
      expect(remaining).toBeGreaterThan(0);
      // Should be about 5 days remaining
      expect(remaining).toBe(5 * 24 * 60 * 60 * 1000);
    });

    it('returns 0 when already expired', () => {
      const req = createApprovalRequest(
        'req-013',
        'payment_certification',
        'proj-001',
        'cert-009',
        'payment_certificate',
        ['quantity_surveyor'] as UserRole[],
        '2025-01-01T00:00:00.000Z',
      );

      const remaining = getTimeRemaining(req, new Date('2025-01-20T00:00:00.000Z'));
      expect(remaining).toBe(0);
    });
  });

  describe('getAuthorityRule', () => {
    it('returns the rule for known action types', () => {
      const rule = getAuthorityRule('payment_certification');
      expect(rule).toBeDefined();
      expect(rule!.requiredRoles).toContain('quantity_surveyor');
      expect(rule!.multiParty).toBe(true);
    });

    it('returns undefined for unknown action types', () => {
      expect(getAuthorityRule('unknown_action')).toBeUndefined();
    });
  });

  describe('isRoleAuthorized', () => {
    it('returns true for authorized roles', () => {
      expect(isRoleAuthorized('payment_certification', 'quantity_surveyor' as UserRole)).toBe(true);
      expect(isRoleAuthorized('payment_certification', 'architect' as UserRole)).toBe(true);
    });

    it('returns false for unauthorized roles', () => {
      expect(isRoleAuthorized('payment_certification', 'client' as UserRole)).toBe(false);
      expect(isRoleAuthorized('contract_termination', 'contractor' as UserRole)).toBe(false);
    });
  });

  describe('APPROVAL_EXPIRY_DAYS', () => {
    it('is 14', () => {
      expect(APPROVAL_EXPIRY_DAYS).toBe(14);
    });
  });
});
