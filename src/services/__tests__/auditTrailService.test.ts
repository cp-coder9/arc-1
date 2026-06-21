import { describe, expect, it } from 'vitest';
import {
  audit,
  queryAudit,
  getAuditSummary,
  createAuditEntry,
  createAuditTrail,
} from '../auditTrailService';
import type { BaseContext } from '../../types/analyticsReporting';

describe('auditTrailService', () => {
  const ctx: BaseContext = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    userId: 'user-1',
    actorRole: 'platform_admin',
    now: '2026-06-10T12:00:00.000Z',
  };

  describe('audit', () => {
    it('creates an audit record', () => {
      const record = audit(ctx, 'analytics_kpi_computed', 'project-1');
      expect(record.auditId).toMatch(/^audit-/);
      expect(record.actorId).toBe('user-1');
      expect(record.action).toBe('analytics_kpi_computed');
      expect(record.sourceObjectId).toBe('project-1');
    });

    it('uses provided timestamp', () => {
      const record = audit(ctx, 'action', 'obj-1');
      expect(record.createdAt).toBe('2026-06-10T12:00:00.000Z');
    });
  });

  describe('queryAudit', () => {
    it('filters by actor', () => {
      audit(ctx, 'action-1', 'obj-1');
      audit({ ...ctx, userId: 'user-2' }, 'action-2', 'obj-2');

      const records = queryAudit(undefined, 'user-1');
      expect(records.some((r) => r.actorId === 'user-1')).toBe(true);
      expect(records.some((r) => r.actorId !== 'user-1')).toBe(false);
    });

    it('filters by source object', () => {
      audit(ctx, 'action', 'project-A');
      audit(ctx, 'action', 'project-B');

      const records = queryAudit('project-A');
      expect(records).toHaveLength(1);
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        audit(ctx, 'action', `obj-${i}`);
      }
      const records = queryAudit(undefined, undefined, 3);
      expect(records).toHaveLength(3);
    });
  });

  describe('getAuditSummary', () => {
    it('returns summary with valid structure', () => {
      const summary = getAuditSummary();
      expect(summary.totalRecords).toBeGreaterThanOrEqual(0);
      expect(summary.uniqueActors).toBeGreaterThanOrEqual(0);
      expect(summary.uniqueActions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createAuditEntry', () => {
    it('creates a record with actorId and action', () => {
      const record = createAuditEntry({ actorId: 'user-1', action: 'test_action', sourceObjectId: 'obj-1' });
      expect(record.auditId).toMatch(/^audit-/);
      expect(record.action).toBe('test_action');
      expect(record.createdAt).toBeTruthy();
    });
  });

  describe('createAuditTrail', () => {
    it('returns 3 audit records for submission readiness', () => {
      const records = createAuditTrail({ classification: 'standard', complexityScore: 5 }, {}, 'proj-1');
      expect(records).toHaveLength(3);
      expect(records[0].action).toBe('project_complexity_classified');
      expect(records[1].action).toBe('municipal_readiness_assessed');
      expect(records[2].action).toBe('human_approval_required');
    });
  });
});
