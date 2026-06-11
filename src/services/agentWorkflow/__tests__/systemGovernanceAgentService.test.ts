/**
 * Tests for System Governance Agent Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  createGovernanceRule,
  checkRateLimit,
  detectAbuse,
  runComplianceCheck,
  DEFAULT_GOVERNANCE_RULES,
} from '../systemGovernanceAgentService';

describe('systemGovernanceAgentService', () => {
  describe('createGovernanceRule', () => {
    it('creates an enabled rule with ID', () => {
      const rule = createGovernanceRule({
        name: 'Test Rate Limit',
        description: 'Limits test actions',
        appliesTo: 'all',
        ruleType: 'rate_limit',
        threshold: 100,
        windowSeconds: 60,
        action: 'throttle',
      });

      expect(rule.id).toBe('gov-rule-test_rate_limit');
      expect(rule.enabled).toBe(true);
      expect(rule.appliesTo).toBe('all');
    });
  });

  describe('DEFAULT_GOVERNANCE_RULES', () => {
    it('includes all required default rules', () => {
      const names = DEFAULT_GOVERNANCE_RULES.map((r) => r.name);
      expect(names).toContain('API Rate Limit per User');
      expect(names).toContain('Agent Action Rate Limit');
      expect(names).toContain('Critical Approval Required');
      expect(names).toContain('Audit Log Retention');
    });

    it('all default rules are enabled', () => {
      expect(DEFAULT_GOVERNANCE_RULES.every((r) => r.enabled)).toBe(true);
    });
  });

  describe('checkRateLimit', () => {
    it('allows first request within limit', () => {
      const result = checkRateLimit({
        tenantId: 't1',
        actorId: 'u1',
        action: 'api_call',
        limit: 10,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('blocks when limit is exceeded', () => {
      const params = {
        tenantId: 't1',
        actorId: 'u1',
        action: 'api_call_2',
        limit: 3,
        windowSeconds: 60,
      };

      // Use up all requests
      checkRateLimit(params); // → remaining 2
      checkRateLimit(params); // → remaining 1
      checkRateLimit(params); // → remaining 0
      const result = checkRateLimit(params); // Should block

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('separates counters by key (tenant:actor:action)', () => {
      const r1 = checkRateLimit({
        tenantId: 't1', actorId: 'u1', action: 'read',
        limit: 5, windowSeconds: 60,
      });
      const r2 = checkRateLimit({
        tenantId: 't1', actorId: 'u2', action: 'read',
        limit: 5, windowSeconds: 60,
      });

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r1.remaining).toBe(4);
      expect(r2.remaining).toBe(4);
    });

    it('returns resetAt timestamp', () => {
      const result = checkRateLimit({
        tenantId: 't1', actorId: 'u1', action: 'write',
        limit: 5, windowSeconds: 60,
      });

      expect(result.resetAt).toBeTruthy();
      expect(new Date(result.resetAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('detectAbuse', () => {
    it('detects rapid-fire actions from same actor', () => {
      const now = new Date().toISOString();
      const activityLog = Array.from({ length: 60 }, (_, i) => ({
        actorId: 'u1',
        action: 'api_call',
        timestamp: now,
      }));

      const result = detectAbuse(activityLog);
      expect(result.detected).toBe(true);
      expect(result.evidence.some((e) => e.type === 'rapid_fire')).toBe(true);
    });

    it('detects repeated identical action patterns', () => {
      const now = new Date().toISOString();
      const activityLog = Array.from({ length: 40 }, (_, i) => ({
        actorId: 'u1',
        action: 'same_action',
        timestamp: now,
      }));

      const result = detectAbuse(activityLog);
      expect(result.detected).toBe(true);
      expect(result.evidence.some((e) => e.type === 'repeated_action')).toBe(true);
    });

    it('returns no abuse for normal activity', () => {
      const now = new Date().toISOString();
      const activityLog = Array.from({ length: 5 }, (_, i) => ({
        actorId: 'u1',
        action: `action_${i}`,
        timestamp: now,
      }));

      const result = detectAbuse(activityLog);
      expect(result.detected).toBe(false);
      expect(result.recommendedAction).toBe('none');
    });

    it('recommends block for severe abuse (> 50 occurrences)', () => {
      const now = new Date().toISOString();
      const activityLog = Array.from({ length: 60 }, (_, i) => ({
        actorId: 'u1',
        action: 'api_call',
        timestamp: now,
      }));

      const result = detectAbuse(activityLog);
      expect(result.detected).toBe(true);
      expect(result.recommendedAction).toBe('block');
    });
  });

  describe('runComplianceCheck', () => {
    it('passes when approval gate is enabled', () => {
      const result = runComplianceCheck({
        tenantId: 't1',
        checkType: 'agent_approval_gate',
        criteria: { approvalGateEnabled: true },
      });

      expect(result.passed).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('fails when approval gate is disabled', () => {
      const result = runComplianceCheck({
        tenantId: 't1',
        checkType: 'agent_approval_gate',
        criteria: { approvalGateEnabled: false },
      });

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('critical');
    });

    it('passes audit trail with sufficient records', () => {
      const result = runComplianceCheck({
        tenantId: 't1',
        checkType: 'audit_trail_complete',
        criteria: { auditRecordCount: 10, expectedMinimum: 5 },
      });

      expect(result.passed).toBe(true);
    });

    it('fails incomplete audit trail', () => {
      const result = runComplianceCheck({
        tenantId: 't1',
        checkType: 'audit_trail_complete',
        criteria: { auditRecordCount: 2, expectedMinimum: 10 },
      });

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('high');
    });

    it('passes when no cross-tenant access', () => {
      const result = runComplianceCheck({
        tenantId: 't1',
        checkType: 'tenant_isolation',
        criteria: { crossTenantAccessCount: 0 },
      });

      expect(result.passed).toBe(true);
    });

    it('fails when cross-tenant access detected', () => {
      const result = runComplianceCheck({
        tenantId: 't1',
        checkType: 'tenant_isolation',
        criteria: { crossTenantAccessCount: 3 },
      });

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('critical');
    });
  });
});
