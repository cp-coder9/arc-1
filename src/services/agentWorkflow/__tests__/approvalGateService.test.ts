/**
 * Tests for Approval Gate Service — Pack 14 Agent Orchestration
 */
import { describe, expect, it } from 'vitest';
import {
  createDefaultApprovalConfig,
  createApprovalGate,
  recordApproverDecision,
  isGateExpired,
  escalateGate,
  validateGatePermissions,
  createApprovalGatesForRecommendations,
} from '../approvalGateService';

describe('approvalGateService', () => {
  describe('createDefaultApprovalConfig', () => {
    it('creates config with safe defaults', () => {
      const config = createDefaultApprovalConfig('t1');
      expect(config.tenantId).toBe('t1');
      expect(config.autoApproveLowRisk).toBe(true);
      expect(config.autoApproveThreshold).toBe('low');
      expect(config.approvalTimeoutDays).toBe(7);
      expect(config.escalationRole).toBe('platform_admin');
    });
  });

  describe('createApprovalGate', () => {
    it('auto-approves low priority recommendations', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-1',
        tenantId: 't1',
        title: 'Low Risk Recommendation',
        rationale: 'Auto-approved',
        priority: 'low',
        requiredApproverRoles: ['architect'],
        config,
      });

      expect(gate.decision).toBe('auto_approved');
      expect(gate.autoApprovalReason).toBeTruthy();
    });

    it('creates pending gate for high priority', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-2',
        tenantId: 't1',
        title: 'High Priority Change',
        rationale: 'Requires review',
        priority: 'high',
        requiredApproverRoles: ['architect', 'client'],
        config,
      });

      expect(gate.decision).toBe('pending');
      expect(gate.approvers).toHaveLength(2);
      expect(gate.approvers[0].status).toBe('pending');
    });

    it('sets expiry based on config timeout', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-3',
        tenantId: 't1',
        title: 'Timeout Test',
        rationale: 'Testing',
        priority: 'high',
        requiredApproverRoles: ['architect'],
        config,
      });

      expect(gate.expiresAt).toBeTruthy();
      const expiryDate = new Date(gate.expiresAt!);
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      // Within a minute tolerance
      expect(Math.abs(expiryDate.getTime() - expectedExpiry.getTime())).toBeLessThan(60000);
    });
  });

  describe('recordApproverDecision', () => {
    it('approves gate when all approvers approve', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-1',
        tenantId: 't1',
        title: 'Test',
        rationale: 'Test',
        priority: 'medium',
        requiredApproverRoles: ['architect'],
        config,
      });

      const decided = recordApproverDecision(gate, 'u1', 'architect', 'approved', 'Looks good');
      expect(decided.decision).toBe('approved');
      expect(decided.approvers[0].status).toBe('approved');
      expect(decided.approvers[0].notes).toBe('Looks good');
    });

    it('rejects gate when any approver rejects', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-2',
        tenantId: 't1',
        title: 'Test',
        rationale: 'Test',
        priority: 'medium',
        requiredApproverRoles: ['architect', 'client'],
        config,
      });

      let decided = recordApproverDecision(gate, 'u1', 'architect', 'approved');
      decided = recordApproverDecision(decided, 'u2', 'client', 'rejected', 'Not acceptable');

      expect(decided.decision).toBe('rejected');
    });

    it('supports abstentions for critical voting', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-3',
        tenantId: 't1',
        title: 'Critical Decision',
        rationale: 'Critical',
        priority: 'critical',
        requiredApproverRoles: ['architect', 'client'],
        config,
      });

      let decided = recordApproverDecision(gate, 'u1', 'architect', 'approved');
      decided = recordApproverDecision(decided, 'u2', 'client', 'abstained');

      // With 1 approve and 1 abstained on critical: effective votes = 1, 1 > 0.5 → approved
      expect(decided.decision).toBe('approved');
    });
  });

  describe('isGateExpired', () => {
    it('returns true for past expiry', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-1', tenantId: 't1',
        title: 'Expired', rationale: 'Test',
        priority: 'high', requiredApproverRoles: ['architect'],
        config,
      });
      const expired = { ...gate, expiresAt: '2020-01-01T00:00:00.000Z' };
      expect(isGateExpired(expired)).toBe(true);
    });
  });

  describe('escalateGate', () => {
    it('adds escalation role to approvers', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-1', tenantId: 't1',
        title: 'Test', rationale: 'Test',
        priority: 'high', requiredApproverRoles: ['architect'],
        config,
      });

      const escalated = escalateGate(gate, 'platform_admin');
      expect(escalated.requiredApproverRoles).toContain('platform_admin');
      expect(escalated.approvers.some((a) => a.role === 'platform_admin')).toBe(true);
    });
  });

  describe('validateGatePermissions', () => {
    it('validates approvers against permitted roles', () => {
      const config = createDefaultApprovalConfig('t1');
      const gate = createApprovalGate({
        recommendationId: 'rec-1', tenantId: 't1',
        title: 'Test', rationale: 'Test',
        priority: 'medium', requiredApproverRoles: ['architect', 'platform_admin'],
        config,
      });

      const result = validateGatePermissions(gate, ['architect', 'client']);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('platform_admin'))).toBe(true);
    });
  });

  describe('createApprovalGatesForRecommendations', () => {
    it('creates gates for multiple recommendations', () => {
      const config = createDefaultApprovalConfig('t1');
      const recs = [
        { id: 'r1', scope: 'project' as const, title: 'R1', rationale: 'R1', priority: 'low' as const, recommendedActionLabel: 'Do', relatedRoute: '/', requiresHumanApproval: false },
        { id: 'r2', scope: 'project' as const, title: 'R2', rationale: 'R2', priority: 'high' as const, recommendedActionLabel: 'Do', relatedRoute: '/', requiresHumanApproval: true },
      ];

      const gates = createApprovalGatesForRecommendations(recs, 't1', config);
      expect(gates).toHaveLength(2);
      expect(gates[0].priority).toBe('low');
      expect(gates[1].priority).toBe('high');
    });
  });
});
