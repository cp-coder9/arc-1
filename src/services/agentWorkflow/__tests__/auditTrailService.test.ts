/**
 * Tests for Audit Trail Service — Pack 14 Agent Orchestration
 */
import { describe, expect, it } from 'vitest';
import {
  createAuditRecord,
  createAuditBatch,
  queryAuditRecords,
  summarizeAuditRecords,
} from '../auditTrailService';

describe('auditTrailService', () => {
  const baseCtx = {
    actorId: 'user-1',
    actorRole: 'architect' as const,
    tenantId: 't1',
    projectId: 'p1',
  };

  describe('createAuditRecord', () => {
    it('creates a record with all required fields', () => {
      const record = createAuditRecord({
        ...baseCtx,
        action: 'agent_recommendation_generated',
        sourceObjectType: 'recommendation',
        sourceObjectId: 'rec-1',
        detail: 'Generated recommendation for project p1',
      });

      expect(record.id).toMatch(/^audit-agent-/);
      expect(record.action).toBe('agent_recommendation_generated');
      expect(record.actorId).toBe('user-1');
      expect(record.tenantId).toBe('t1');
      expect(record.createdAt).toBeTruthy();
    });

    it('assigns correct severity per action type', () => {
      const critical = createAuditRecord({
        ...baseCtx,
        action: 'memory_boundary_violation',
        sourceObjectType: 'memory',
        sourceObjectId: 'mem-1',
        detail: 'Cross-tenant access attempt',
      });

      expect(critical.severity).toBe('critical');

      const low = createAuditRecord({
        ...baseCtx,
        action: 'agent_identity_created',
        sourceObjectType: 'agent',
        sourceObjectId: 'agent-1',
        detail: 'Created agent identity',
      });

      expect(low.severity).toBe('low');
    });

    it('allows explicit severity override', () => {
      const record = createAuditRecord({
        ...baseCtx,
        action: 'agent_identity_created',
        sourceObjectType: 'agent',
        sourceObjectId: 'agent-1',
        detail: 'High-priority identity creation',
        severity: 'high',
      });

      expect(record.severity).toBe('high');
    });

    it('assigns unique sequential IDs', () => {
      const r1 = createAuditRecord({ ...baseCtx, action: 'event_routed', sourceObjectType: 'event', sourceObjectId: 'e1', detail: 'd' });
      const r2 = createAuditRecord({ ...baseCtx, action: 'event_routed', sourceObjectType: 'event', sourceObjectId: 'e2', detail: 'd' });

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('createAuditBatch', () => {
    it('creates multiple records with shared context', () => {
      const records = createAuditBatch(baseCtx, [
        { action: 'agent_recommendation_generated', sourceObjectType: 'rec', sourceObjectId: 'r1', detail: 'Generated rec 1' },
        { action: 'agent_recommendation_approved', sourceObjectType: 'rec', sourceObjectId: 'r1', detail: 'Approved rec 1' },
        { action: 'approval_gate_passed', sourceObjectType: 'gate', sourceObjectId: 'g1', detail: 'Gate passed' },
      ]);

      expect(records).toHaveLength(3);
      expect(records[0].tenantId).toBe('t1');
      expect(records[1].tenantId).toBe('t1');
    });
  });

  describe('queryAuditRecords', () => {
    const records = [
      createAuditRecord({ ...baseCtx, action: 'event_routed', sourceObjectType: 'event', sourceObjectId: 'e1', detail: 'Routed event', severity: 'low' }),
      createAuditRecord({ ...baseCtx, action: 'abuse_detected', sourceObjectType: 'event', sourceObjectId: 'e2', detail: 'Abuse found', severity: 'critical' }),
      createAuditRecord({ ...baseCtx, actorId: 'user-2', action: 'policy_updated', sourceObjectType: 'policy', sourceObjectId: 'pol-1', detail: 'Updated policy', severity: 'medium' }),
    ];

    it('filters by tenant', () => {
      const result = queryAuditRecords(records, { tenantId: 't1' });
      expect(result).toHaveLength(3);
    });

    it('filters by action', () => {
      const result = queryAuditRecords(records, { action: 'abuse_detected' });
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('critical');
    });

    it('filters by minimum severity', () => {
      const result = queryAuditRecords(records, { minSeverity: 'high' });
      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('abuse_detected');
    });

    it('applies limit', () => {
      const result = queryAuditRecords(records, { limit: 2 });
      expect(result).toHaveLength(2);
    });
  });

  describe('summarizeAuditRecords', () => {
    it('generates summary with counts', () => {
      const records = [
        createAuditRecord({ ...baseCtx, action: 'event_routed', sourceObjectType: 'event', sourceObjectId: 'e1', detail: 'd' }),
        createAuditRecord({ ...baseCtx, action: 'event_routed', sourceObjectType: 'event', sourceObjectId: 'e2', detail: 'd' }),
        createAuditRecord({ ...baseCtx, action: 'compliance_check_failed', sourceObjectType: 'check', sourceObjectId: 'c1', detail: 'd', severity: 'critical' }),
      ];

      const summary = summarizeAuditRecords(records);
      expect(summary.totalRecords).toBe(3);
      expect(summary.byAction.event_routed).toBe(2);
      expect(summary.byAction.compliance_check_failed).toBe(1);
      expect(summary.bySeverity.critical).toBe(1);
    });
  });
});
