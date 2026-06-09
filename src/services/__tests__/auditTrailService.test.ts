import { describe, expect, it, beforeEach } from 'vitest';
import {
  audit,
  getAuditRecords,
  assertAuditImmutableUpdateAttempt,
  exportAuditRecords,
  resetAuditState,
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

  beforeEach(() => {
    resetAuditState();
  });

  describe('audit', () => {
    it('creates an immutable audit record', () => {
      const record = audit(ctx, 'analytics_kpi_computed', 'project-1');
      expect(record.auditId).toMatch(/^audit-/);
      expect(record.actorId).toBe('user-1');
      expect(record.action).toBe('analytics_kpi_computed');
      expect(record.sourceObjectId).toBe('project-1');
      expect(record.immutable).toBe(true);
    });

    it('accepts optional metadata', () => {
      const record = audit(ctx, 'export_requested', 'project-1', { format: 'csv', recordCount: 42 });
      expect(record.metadata).toEqual({ format: 'csv', recordCount: 42 });
    });

    it('uses provided timestamp', () => {
      const record = audit(ctx, 'action', 'obj-1');
      expect(record.createdAt).toBe('2026-06-10T12:00:00.000Z');
    });
  });

  describe('getAuditRecords', () => {
    it('filters by actor', () => {
      audit(ctx, 'action-1', 'obj-1');
      audit({ ...ctx, userId: 'user-2' }, 'action-2', 'obj-2');

      const records = getAuditRecords({ actorId: 'user-1' });
      expect(records).toHaveLength(1);
      expect(records[0].actorId).toBe('user-1');
    });

    it('filters by action', () => {
      audit(ctx, 'kpi_computed', 'obj-1');
      audit(ctx, 'export_requested', 'obj-2');

      const records = getAuditRecords({ action: 'kpi' });
      expect(records).toHaveLength(1);
      expect(records[0].action).toBe('kpi_computed');
    });

    it('filters by source object', () => {
      audit(ctx, 'action', 'project-A');
      audit(ctx, 'action', 'project-B');

      const records = getAuditRecords({ sourceObjectId: 'project-A' });
      expect(records).toHaveLength(1);
    });

    it('filters by time range', () => {
      audit(ctx, 'action', 'obj-1');
      const records = getAuditRecords({ since: '2026-06-11T00:00:00.000Z' });
      expect(records).toHaveLength(0);
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        audit(ctx, 'action', `obj-${i}`);
      }
      const records = getAuditRecords({ limit: 3 });
      expect(records).toHaveLength(3);
    });
  });

  describe('assertAuditImmutableUpdateAttempt', () => {
    it('throws for any changed keys', () => {
      expect(() => assertAuditImmutableUpdateAttempt(['action'])).toThrow(/immutable/);
      expect(() => assertAuditImmutableUpdateAttempt(['actorId', 'createdAt'])).toThrow(/immutable/);
    });

    it('does not throw for empty changed keys', () => {
      expect(() => assertAuditImmutableUpdateAttempt([])).not.toThrow();
    });
  });

  describe('exportAuditRecords', () => {
    it('exports all audit records as array', () => {
      audit(ctx, 'action-1', 'obj-1');
      audit(ctx, 'action-2', 'obj-2');

      const exported = exportAuditRecords();
      expect(exported).toHaveLength(2);
      expect(exported[0].immutable).toBe(true);
    });
  });
});
