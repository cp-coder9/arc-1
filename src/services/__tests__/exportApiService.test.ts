import { describe, expect, it, beforeEach } from 'vitest';
import {
  exportRecords,
  exportAlerts,
  exportAuditTrail,
  createExportJob,
  getExportJob,
  generateExportFilename,
  resetExportState,
} from '../exportApiService';
import type { ExportableRecord, ExportableAlert, ExportableAuditEntry } from '../exportApiService';

describe('exportApiService', () => {
  beforeEach(() => {
    resetExportState();
  });

  // ── Record Export ──────────────────────────────────────────────────────────
  describe('exportRecords', () => {
    it('exports records as JSON', () => {
      const records: ExportableRecord[] = [
        { id: '1', type: 'milestone', title: 'M1', status: 'completed' },
        { id: '2', type: 'task', title: 'T1', status: 'in_progress' },
      ];

      const result = exportRecords({ format: 'json', records });
      expect(result.recordCount).toBe(2);
      expect(result.format).toBe('json');
      const parsed = JSON.parse(result.content);
      expect(parsed).toHaveLength(2);
    });

    it('exports records as CSV', () => {
      const records: ExportableRecord[] = [
        { id: '1', type: 'milestone', title: 'M1', status: 'completed' },
      ];

      const result = exportRecords({ format: 'csv', records });
      expect(result.recordCount).toBe(1);
      expect(result.content).toContain('id,type,title,status');
      expect(result.content).toContain('1,milestone,M1,completed');
    });

    it('escapes CSV special characters', () => {
      const records: ExportableRecord[] = [
        { id: '1', type: 'note', title: 'Hello, "World"', status: 'ready' },
      ];

      const result = exportRecords({ format: 'csv', records });
      expect(result.content).toContain('"Hello, ""World"""');
    });

    it('filters records by type', () => {
      const records: ExportableRecord[] = [
        { id: '1', type: 'milestone', title: 'M1', status: 'completed' },
        { id: '2', type: 'task', title: 'T1', status: 'in_progress' },
      ];

      const result = exportRecords({
        format: 'json',
        records,
        filters: { recordTypes: ['milestone'] },
      });
      expect(result.recordCount).toBe(1);
    });

    it('filters by date range', () => {
      const records: ExportableRecord[] = [
        { id: '1', type: 'note', title: 'Old', status: 'done', createdAt: '2026-01-01T00:00:00Z' },
        { id: '2', type: 'note', title: 'New', status: 'done', createdAt: '2026-06-01T00:00:00Z' },
      ];

      const result = exportRecords({
        format: 'json',
        records,
        filters: { dateFrom: '2026-03-01T00:00:00Z' },
      });
      expect(result.recordCount).toBe(1);
    });

    it('respects limit', () => {
      const records: ExportableRecord[] = Array.from({ length: 20 }, (_, i) => ({
        id: String(i), type: 'task', title: `Task ${i}`, status: 'ready',
      }));

      const result = exportRecords({ format: 'json', records, filters: { limit: 5 } });
      expect(result.recordCount).toBe(5);
    });
  });

  // ── Alert Export ───────────────────────────────────────────────────────────
  describe('exportAlerts', () => {
    it('exports alerts as CSV', () => {
      const alerts: ExportableAlert[] = [
        { eventId: 'e1', title: 'Alert 1', severity: 'high', recipientRole: 'admin', projectId: 'p1', firedAt: '2026-06-01T00:00:00Z', acknowledged: false },
      ];

      const result = exportAlerts({ format: 'csv', alerts });
      expect(result.recordCount).toBe(1);
      expect(result.content).toContain('eventId,title,severity');
      expect(result.content).toContain('e1,Alert 1,high');
    });

    it('exports alerts as JSON', () => {
      const alerts: ExportableAlert[] = [
        { eventId: 'e1', title: 'Alert 1', severity: 'high', recipientRole: 'admin', projectId: 'p1', firedAt: '2026-06-01T00:00:00Z', acknowledged: false },
      ];

      const result = exportAlerts({ format: 'json', alerts });
      const parsed = JSON.parse(result.content);
      expect(parsed).toHaveLength(1);
    });
  });

  // ── Audit Export ───────────────────────────────────────────────────────────
  describe('exportAuditTrail', () => {
    it('exports audit entries as CSV', () => {
      const audits: ExportableAuditEntry[] = [
        { auditId: 'a1', actorId: 'user-1', action: 'login', sourceObjectId: 'session-1', createdAt: '2026-06-01T00:00:00Z' },
      ];

      const result = exportAuditTrail({ format: 'csv', audits });
      expect(result.recordCount).toBe(1);
      expect(result.content).toContain('auditId,actorId,action');
    });
  });

  // ── Export Jobs ────────────────────────────────────────────────────────────
  describe('createExportJob', () => {
    it('creates a pending export job', () => {
      const job = createExportJob({
        format: 'csv',
        scope: 'project',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        filters: { limit: 100 },
        requestedBy: 'user-1',
      });

      expect(job.jobId).toMatch(/^export-/);
      expect(job.status).toBe('pending');
      expect(job.format).toBe('csv');
    });
  });

  describe('getExportJob', () => {
    it('retrieves a created job', () => {
      const job = createExportJob({
        format: 'json',
        scope: 'tenant',
        tenantId: 'tenant-1',
        filters: {},
        requestedBy: 'user-1',
      });

      const found = getExportJob(job.jobId);
      expect(found).toBeDefined();
      expect(found?.status).toBe('pending');
    });
  });

  // ── Filename Generation ────────────────────────────────────────────────────
  describe('generateExportFilename', () => {
    it('generates CSV filename with date', () => {
      const filename = generateExportFilename('records', 'csv', 'project-1');
      expect(filename).toMatch(/^architex_records_project-1_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('generates JSON filename without scope', () => {
      const filename = generateExportFilename('alerts', 'json');
      expect(filename).toMatch(/^architex_alerts_\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  // ── Empty Export ───────────────────────────────────────────────────────────
  it('handles empty records gracefully', () => {
    const result = exportRecords({ format: 'csv', records: [] });
    expect(result.recordCount).toBe(0);
    expect(result.content).toBe('');
  });
});
