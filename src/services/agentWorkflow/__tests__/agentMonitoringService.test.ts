/**
 * Tests for Agent Monitoring Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  createAgentMetrics,
  recordAction,
  recordRecommendation,
  detectDrift,
  generateUsageReport,
  agentHealthCheck,
} from '../agentMonitoringService';

describe('agentMonitoringService', () => {
  describe('createAgentMetrics', () => {
    it('creates empty metrics for a new agent', () => {
      const metrics = createAgentMetrics('agent-1', 'user');
      expect(metrics.agentId).toBe('agent-1');
      expect(metrics.type).toBe('user');
      expect(metrics.totalActions).toBe(0);
      expect(metrics.successfulActions).toBe(0);
      expect(metrics.failedActions).toBe(0);
      expect(metrics.averageResponseTimeMs).toBe(0);
      expect(metrics.startOfPeriod).toBeTruthy();
    });
  });

  describe('recordAction', () => {
    it('records successful action and updates average response time', () => {
      let metrics = createAgentMetrics('agent-1', 'user');
      metrics = recordAction(metrics, true, 200);

      expect(metrics.totalActions).toBe(1);
      expect(metrics.successfulActions).toBe(1);
      expect(metrics.failedActions).toBe(0);
      expect(metrics.averageResponseTimeMs).toBe(200);
      expect(metrics.lastActiveAt).toBeTruthy();
    });

    it('records failed action', () => {
      let metrics = createAgentMetrics('agent-1', 'user');
      metrics = recordAction(metrics, false, 500);

      expect(metrics.totalActions).toBe(1);
      expect(metrics.successfulActions).toBe(0);
      expect(metrics.failedActions).toBe(1);
    });

    it('calculates rolling average response time', () => {
      let metrics = createAgentMetrics('agent-1', 'user');
      metrics = recordAction(metrics, true, 100);
      metrics = recordAction(metrics, true, 300);

      expect(metrics.averageResponseTimeMs).toBe(200); // (100 + 300) / 2
    });
  });

  describe('recordRecommendation', () => {
    it('records accepted recommendation', () => {
      let metrics = createAgentMetrics('agent-1', 'user');
      metrics = recordRecommendation(metrics, true);

      expect(metrics.recommendationsGenerated).toBe(1);
      expect(metrics.recommendationsAccepted).toBe(1);
      expect(metrics.recommendationsRejected).toBe(0);
    });

    it('records rejected recommendation', () => {
      let metrics = createAgentMetrics('agent-1', 'user');
      metrics = recordRecommendation(metrics, false);

      expect(metrics.recommendationsGenerated).toBe(1);
      expect(metrics.recommendationsAccepted).toBe(0);
      expect(metrics.recommendationsRejected).toBe(1);
    });
  });

  describe('detectDrift', () => {
    it('detects success rate drift', () => {
      const previous = {
        ...createAgentMetrics('agent-1', 'user'),
        totalActions: 100,
        successfulActions: 95,
        failedActions: 5,
      };

      const current = {
        ...createAgentMetrics('agent-1', 'user'),
        totalActions: 100,
        successfulActions: 65,
        failedActions: 35,
      };

      const alerts = detectDrift(current, previous);
      const successAlert = alerts.find((a) => a.metric === 'successRate');
      expect(successAlert).toBeDefined();
      expect(successAlert!.severity).toBe('critical');
    });

    it('detects response time drift', () => {
      const previous = {
        ...createAgentMetrics('agent-1', 'user'),
        averageResponseTimeMs: 200,
      };

      const current = {
        ...createAgentMetrics('agent-1', 'user'),
        averageResponseTimeMs: 600,
      };

      const alerts = detectDrift(current, previous);
      const timeAlert = alerts.find((a) => a.metric === 'responseTime');
      expect(timeAlert).toBeDefined();
      expect(timeAlert!.severity).toBe('critical');
    });

    it('returns no alerts for stable agents', () => {
      const metrics = createAgentMetrics('agent-1', 'user');
      const alerts = detectDrift(metrics, metrics);
      expect(alerts).toEqual([]);
    });
  });

  describe('generateUsageReport', () => {
    it('generates report from metrics', () => {
      const metrics = [
        createAgentMetrics('a1', 'user'),
        createAgentMetrics('a2', 'project'),
        createAgentMetrics('a3', 'system_governance'),
      ];

      const report = generateUsageReport(metrics, []);
      expect(report.totalAgents).toBe(3);
      expect(report.period.start).toBeTruthy();
      expect(report.period.end).toBeTruthy();
      expect(report.byType.user).toBeDefined();
      expect(report.byType.project).toBeDefined();
      expect(report.byType.system_governance).toBeDefined();
    });

    it('calculates acceptance rate', () => {
      let m = createAgentMetrics('a1', 'user');
      m = recordRecommendation(m, true);
      m = recordRecommendation(m, true);
      m = recordRecommendation(m, false);

      const report = generateUsageReport([m], []);
      expect(report.totalRecommendations).toBe(3);
      expect(report.acceptanceRate).toBe(67);
    });
  });

  describe('agentHealthCheck', () => {
    it('reports healthy for new agent', () => {
      const metrics = createAgentMetrics('agent-1', 'user');
      const result = agentHealthCheck(metrics);
      expect(result.healthy).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('flags low success rate', () => {
      let metrics = createAgentMetrics('agent-1', 'user');
      for (let i = 0; i < 10; i++) {
        metrics = recordAction(metrics, false, 100);
      }

      const result = agentHealthCheck(metrics);
      expect(result.healthy).toBe(false);
      expect(result.issues.some((i) => i.includes('Success rate'))).toBe(true);
    });

    it('flags high response time', () => {
      let metrics = createAgentMetrics('agent-1', 'user');
      metrics = recordAction(metrics, true, 6000);

      const result = agentHealthCheck(metrics);
      expect(result.issues.some((i) => i.includes('response time'))).toBe(true);
    });

    it('flags low recommendation acceptance rate', () => {
      let metrics = createAgentMetrics('agent-1', 'user');
      for (let i = 0; i < 11; i++) {
        metrics = recordRecommendation(metrics, false);
      }

      const result = agentHealthCheck(metrics);
      expect(result.issues.some((i) => i.includes('acceptance'))).toBe(true);
    });
  });
});
