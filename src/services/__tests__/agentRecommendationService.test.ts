import { describe, expect, it, beforeEach } from 'vitest';
import {
  recommend,
  getRecommendations,
  resetRecommendationState,
} from '../agentRecommendationService';
import type { WorkflowRecord } from '../../types/analyticsReporting';
import type { KPIResult } from '../../types/analyticsReporting';

describe('agentRecommendationService', () => {
  beforeEach(() => {
    resetRecommendationState();
  });

  describe('recommend', () => {
    it('recommends resolving blockers on blocked records', () => {
      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'retention', title: 'Retention Hold', status: 'blocked', payload: {}, blockers: ['retention_release_pending'], approvalsRequired: ['principal_agent'] },
      ];

      const outputs = recommend('analytics_agent', 'Review retention alerts', records);
      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs[0].title).toContain('Resolve blocker');
      expect(outputs[0].severity).toBe('high');
      expect(outputs[0].recommendedAction).toBeDefined();
    });

    it('recommends action for negative schedule variance', () => {
      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'milestone', title: 'Delayed Milestone', status: 'delayed', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const kpiResults: KPIResult[] = [
        { name: 'schedule_variance', label: 'Schedule Variance', plannedMilestones: 5, completedOnTime: 1, delayed: 4, variancePercent: -80, unit: 'percent' },
      ];

      const outputs = recommend('analytics_agent', 'Schedule review', records, kpiResults);
      expect(outputs.some((o) => o.kpiName === 'schedule_variance')).toBe(true);
    });

    it('recommends immediate action for compliance gaps', () => {
      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Task', status: 'ready', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const kpiResults: KPIResult[] = [
        { name: 'compliance_gap_count', label: 'Compliance Gap Count', expiredRegistrations: 2, lapsedInsurance: 1, missingDocuments: 2, totalGaps: 5, unit: 'count' },
      ];

      const outputs = recommend('analytics_agent', 'Compliance check', records, kpiResults);
      const complianceRec = outputs.find((o) => o.kpiName === 'compliance_gap_count');
      expect(complianceRec).toBeDefined();
      expect(complianceRec?.urgency).toBe('immediate');
      expect(complianceRec?.severity).toBe('critical');
    });

    it('recommends retention release when ready', () => {
      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'retention', title: 'Retention', status: 'ready', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const kpiResults: KPIResult[] = [
        { name: 'retention_release_readiness', label: 'Retention Release Readiness', totalRetentionAmount: 500_000, releasableAmount: 500_000, conditionsMet: 3, totalConditions: 3, isReadyForRelease: true, unit: 'ZAR' },
      ];

      const outputs = recommend('analytics_agent', 'Retention check', records, kpiResults);
      const retentionRec = outputs.find((o) => o.kpiName === 'retention_release_readiness');
      expect(retentionRec).toBeDefined();
      expect(retentionRec?.recommendedAction).toContain('retention release');
    });

    it('provides advisory when nothing is wrong', () => {
      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'milestone', title: 'Done', status: 'completed', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const outputs = recommend('analytics_agent', 'All clear check', records);
      expect(outputs).toHaveLength(1);
      expect(outputs[0].severity).toBe('low');
      expect(outputs[0].urgency).toBe('advisory');
    });
  });

  describe('getRecommendations', () => {
    it('filters by severity', () => {
      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Blocked Task', status: 'blocked', payload: {}, blockers: ['blocker'], approvalsRequired: [] },
        { id: 'rec-2', type: 'task', title: 'OK Task', status: 'ready', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const kpiResults: KPIResult[] = [
        { name: 'compliance_gap_count', label: 'CG', expiredRegistrations: 5, lapsedInsurance: 0, missingDocuments: 0, totalGaps: 5, unit: 'count' },
      ];

      recommend('agent', 'Test', records, kpiResults);

      const critical = getRecommendations({ severity: 'critical' });
      expect(critical.length).toBeGreaterThan(0);
      expect(critical.every((r) => r.severity === 'critical')).toBe(true);

      const high = getRecommendations({ severity: 'high' });
      expect(high.length).toBeGreaterThan(0);
      expect(high.every((r) => r.severity === 'high')).toBe(true);
    });

    it('filters by urgency', () => {
      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Blocked', status: 'blocked', payload: {}, blockers: ['blocker'], approvalsRequired: [] },
      ];

      recommend('agent', 'Test', records);

      const immediate = getRecommendations({ urgency: 'this_week' });
      expect(immediate.length).toBeGreaterThan(0);
    });

    it('respects limit', () => {
      const records: WorkflowRecord[] = [
        { id: 'r1', type: 'task', title: 'T1', status: 'blocked', payload: {}, blockers: ['b1'], approvalsRequired: [] },
        { id: 'r2', type: 'task', title: 'T2', status: 'blocked', payload: {}, blockers: ['b2'], approvalsRequired: [] },
        { id: 'r3', type: 'task', title: 'T3', status: 'blocked', payload: {}, blockers: ['b3'], approvalsRequired: [] },
      ];

      recommend('agent', 'Test', records);
      const limited = getRecommendations({ limit: 2 });
      expect(limited).toHaveLength(2);
    });
  });
});
