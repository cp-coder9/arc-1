import { describe, expect, it, beforeEach } from 'vitest';
import {
  toAnalyticsProjectRecord,
  storeKPIMetric,
  storeAllAnalyticsKPIMetrics,
  getAnalyticsKPIMetrics,
  getAnalyticsProjectRecord,
  getAnalyticsProjectRecords,
  resetAnalyticsProjectRecordState,
} from '../analyticsProjectRecordAdapter';
import type { BaseContext, WorkflowRecord } from '../../types/analyticsReporting';
import type { KPIResult } from '../../types/analyticsReporting';

describe('analyticsProjectRecordAdapter', () => {
  const ctx: BaseContext = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    userId: 'user-1',
    actorRole: 'platform_admin',
    now: '2026-06-10T12:00:00.000Z',
  };

  beforeEach(() => {
    resetAnalyticsProjectRecordState();
  });

  describe('toAnalyticsProjectRecord', () => {
    it('converts a WorkflowRecord to an AnalyticsProjectRecord', () => {
      const wfRecord: WorkflowRecord = {
        id: 'wf-1',
        type: 'milestone',
        title: 'Design Milestone',
        status: 'completed',
        payload: {},
        blockers: [],
        approvalsRequired: [],
      };

      const record = toAnalyticsProjectRecord(ctx, wfRecord);
      expect(record.recordId).toMatch(/^analytics-project-record-/);
      expect(record.tenantId).toBe('tenant-1');
      expect(record.moduleKey).toBe('analytics_reporting');
      expect(record.recordType).toBe('milestone');
      expect(record.status).toBe('completed');
    });

    it('attaches linked record IDs', () => {
      const wfRecord: WorkflowRecord = {
        id: 'wf-1',
        type: 'task',
        title: 'Task',
        status: 'active',
        payload: {},
        blockers: [],
        approvalsRequired: [],
      };

      const record = toAnalyticsProjectRecord(ctx, wfRecord, ['linked-1', 'linked-2']);
      expect(record.linkedRecordIds).toEqual(['linked-1', 'linked-2']);
    });
  });

  describe('storeKPIMetric', () => {
    it('stores an immutable KPI metric', () => {
      const metric = storeKPIMetric({
        name: 'schedule_variance',
        label: 'Schedule Variance',
        value: 75,
        unit: 'percent',
        calculationSource: 'computeScheduleVariance',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        recordedBy: 'user-1',
      });

      expect(metric.metricId).toMatch(/^kpi-metric-/);
      expect(metric.immutable).toBe(true);
      expect(metric.value).toBe(75);
    });

    it('accepts optional metadata and version', () => {
      const metric = storeKPIMetric({
        name: 'compliance_gap_count',
        label: 'Compliance Gaps',
        value: 3,
        unit: 'count',
        calculationSource: 'computeComplianceGapCount',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        recordedBy: 'user-1',
        version: 2,
        metadata: { gapBreakdown: { expired: 1, missing: 2 } },
      });

      expect(metric.version).toBe(2);
      expect(metric.metadata).toBeDefined();
    });
  });

  describe('storeAllAnalyticsKPIMetrics', () => {
    it('stores all KPI results from a computation', () => {
      const kpiResults: KPIResult[] = [
        { name: 'schedule_variance', label: 'Schedule Variance', plannedMilestones: 4, completedOnTime: 3, delayed: 1, variancePercent: 50, unit: 'percent' },
        { name: 'cost_to_complete', label: 'Cost to Complete', budgetedAmount: 1_000_000, committedAmount: 500_000, actualSpend: 300_000, remainingBudget: 700_000, percentComplete: 30, unit: 'ZAR' },
      ];

      const metrics = storeAllAnalyticsKPIMetrics(kpiResults, ctx);
      expect(metrics).toHaveLength(2);
      expect(metrics[0].name).toBe('schedule_variance');
      expect(metrics[1].name).toBe('cost_to_complete');
      expect(metrics.every((m) => m.immutable)).toBe(true);
    });
  });

  describe('getAnalyticsKPIMetrics', () => {
    it('filters by project', () => {
      storeKPIMetric({ name: 'schedule_variance', label: 'SV', value: 50, unit: 'percent', calculationSource: 'test', projectId: 'p1', tenantId: 't1', recordedBy: 'u1' });
      storeKPIMetric({ name: 'schedule_variance', label: 'SV', value: 75, unit: 'percent', calculationSource: 'test', projectId: 'p2', tenantId: 't1', recordedBy: 'u1' });

      const metrics = getAnalyticsKPIMetrics({ projectId: 'p1' });
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(50);
    });

    it('filters by KPI name', () => {
      storeKPIMetric({ name: 'schedule_variance', label: 'SV', value: 50, unit: 'percent', calculationSource: 'test', projectId: 'p1', tenantId: 't1', recordedBy: 'u1' });
      storeKPIMetric({ name: 'compliance_gap_count', label: 'CG', value: 2, unit: 'count', calculationSource: 'test', projectId: 'p1', tenantId: 't1', recordedBy: 'u1' });

      const metrics = getAnalyticsKPIMetrics({ name: 'compliance_gap_count' });
      expect(metrics).toHaveLength(1);
    });
  });

  describe('getAnalyticsProjectRecord', () => {
    it('finds a record by ID', () => {
      const wfRecord: WorkflowRecord = { id: 'wf-1', type: 'note', title: 'Note', status: 'ready', payload: {}, blockers: [], approvalsRequired: [] };
      const record = toAnalyticsProjectRecord(ctx, wfRecord);

      const found = getAnalyticsProjectRecord(record.recordId);
      expect(found?.title).toBe('Note');
    });

    it('returns undefined for non-existent record', () => {
      expect(getAnalyticsProjectRecord('nonexistent')).toBeUndefined();
    });
  });

  describe('getAnalyticsProjectRecords', () => {
    it('returns all records for a project', () => {
      const wf1: WorkflowRecord = { id: 'wf-1', type: 'note', title: 'Note 1', status: 'ready', payload: {}, blockers: [], approvalsRequired: [] };
      const wf2: WorkflowRecord = { id: 'wf-2', type: 'note', title: 'Note 2', status: 'ready', payload: {}, blockers: [], approvalsRequired: [] };

      toAnalyticsProjectRecord(ctx, wf1);
      toAnalyticsProjectRecord({ ...ctx, projectId: 'other-project' }, wf2);

      const records = getAnalyticsProjectRecords('project-1');
      expect(records).toHaveLength(1);
      expect(records[0].title).toBe('Note 1');
    });
  });
});
