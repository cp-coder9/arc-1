import { describe, expect, it, beforeEach } from 'vitest';
import {
  recordMetric,
  recordLatency,
  recordError,
  recordRequest,
  recordMemoryViolation,
  getMetrics,
  getMetricCount,
  computeHealthSnapshot,
  pruneExpiredMetrics,
  resetObservabilityState,
} from '../observabilityService';

describe('observabilityService', () => {
  beforeEach(() => {
    resetObservabilityState();
  });

  // ── Metric Recording ───────────────────────────────────────────────────────
  describe('recordMetric', () => {
    it('records a metric with default TTL', () => {
      const metric = recordMetric({
        type: 'latency',
        serviceName: 'kpiCalculator',
        moduleKey: 'analytics_reporting',
        value: 42,
        unit: 'ms',
      });

      expect(metric.metricId).toMatch(/^obs-/);
      expect(metric.type).toBe('latency');
      expect(metric.value).toBe(42);
      expect(metric.ttlDays).toBe(30);
      expect(metric.immutable).toBeUndefined(); // KPIMetric has immutable, ObservabilityMetric doesn't
    });

    it('records a metric with custom TTL and tags', () => {
      const metric = recordMetric({
        type: 'error_count',
        serviceName: 'alertScheduler',
        moduleKey: 'analytics_reporting',
        value: 1,
        unit: 'count',
        tags: { severity: 'high' },
        ttlDays: 7,
      });

      expect(metric.ttlDays).toBe(7);
      expect(metric.tags).toEqual({ severity: 'high' });
    });
  });

  describe('convenience recorders', () => {
    it('recordLatency records in ms', () => {
      const metric = recordLatency('dashboard', 'analytics_reporting', 120);
      expect(metric.type).toBe('latency');
      expect(metric.value).toBe(120);
      expect(metric.unit).toBe('ms');
    });

    it('recordError records count 1', () => {
      const metric = recordError('kpiCalculator', 'analytics_reporting');
      expect(metric.type).toBe('error_count');
      expect(metric.value).toBe(1);
    });

    it('recordRequest records count 1', () => {
      const metric = recordRequest('exportApi', 'analytics_reporting');
      expect(metric.type).toBe('request_count');
      expect(metric.value).toBe(1);
    });

    it('recordMemoryViolation records byte delta', () => {
      const metric = recordMemoryViolation('agentOrchestrator', 'agent_orchestration', 600, 512);
      expect(metric.type).toBe('memory_boundary_violation');
      expect(metric.value).toBe(88); // 600 - 512
      expect(metric.tags?.memoryLimit).toBe('512');
      expect(metric.tags?.memoryUsed).toBe('600');
    });
  });

  // ── Querying ───────────────────────────────────────────────────────────────
  describe('getMetrics', () => {
    it('filters by type', () => {
      recordLatency('svc1', 'mod1', 10);
      recordError('svc1', 'mod1');
      recordLatency('svc2', 'mod1', 20);

      const latencyMetrics = getMetrics({ type: 'latency' });
      expect(latencyMetrics).toHaveLength(2);
      expect(latencyMetrics.every((m) => m.type === 'latency')).toBe(true);
    });

    it('filters by service name', () => {
      recordLatency('svc-a', 'mod1', 10);
      recordLatency('svc-b', 'mod1', 20);

      const metrics = getMetrics({ serviceName: 'svc-a' });
      expect(metrics).toHaveLength(1);
      expect(metrics[0].serviceName).toBe('svc-a');
    });

    it('filters by time window', () => {
      recordLatency('svc1', 'mod1', 10);
      const since = new Date(Date.now() + 1000).toISOString(); // future

      const metrics = getMetrics({ since });
      expect(metrics).toHaveLength(0);
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        recordLatency('svc1', 'mod1', i);
      }

      const metrics = getMetrics({ limit: 3 });
      expect(metrics).toHaveLength(3);
    });
  });

  describe('getMetricCount', () => {
    it('returns count of metrics', () => {
      recordLatency('svc1', 'mod1', 10);
      recordError('svc1', 'mod1');
      expect(getMetricCount()).toBe(2);
    });
  });

  // ── Health Snapshot ────────────────────────────────────────────────────────
  describe('computeHealthSnapshot', () => {
    it('computes empty snapshot when no metrics', () => {
      const snapshot = computeHealthSnapshot();
      expect(snapshot.metrics.totalRequests).toBe(0);
      expect(snapshot.metrics.averageLatencyMs).toBe(0);
      expect(snapshot.metrics.errorCount).toBe(0);
    });

    it('computes latency percentiles', () => {
      for (let i = 0; i < 100; i++) {
        recordLatency('svc1', 'analytics_reporting', i + 1); // 1..100
      }

      const snapshot = computeHealthSnapshot();
      expect(snapshot.metrics.averageLatencyMs).toBeGreaterThan(0);
      expect(snapshot.metrics.p95LatencyMs).toBeGreaterThan(0);
      expect(snapshot.metrics.p99LatencyMs).toBeGreaterThan(0);
    });

    it('computes error rates by service', () => {
      recordError('svc-errors', 'analytics_reporting');
      recordError('svc-errors', 'analytics_reporting');
      recordRequest('svc-errors', 'analytics_reporting');
      recordRequest('svc-errors', 'analytics_reporting');
      recordRequest('svc-errors', 'analytics_reporting');
      recordRequest('svc-errors', 'analytics_reporting'); // 4 requests, 2 errors = 50%

      const snapshot = computeHealthSnapshot();
      const errorService = snapshot.metrics.servicesByErrorRate.find((s) => s.service === 'svc-errors');
      expect(errorService).toBeDefined();
      expect(errorService?.errors).toBe(2);
      expect(errorService?.requests).toBe(4);
    });
  });

  // ── Pruning ────────────────────────────────────────────────────────────────
  describe('pruneExpiredMetrics', () => {
    it('removes expired metrics', () => {
      const metric = recordMetric({
        type: 'latency',
        serviceName: 'svc1',
        moduleKey: 'mod1',
        value: 10,
        unit: 'ms',
        ttlDays: 0, // expired immediately
      });

      const pruned = pruneExpiredMetrics();
      expect(pruned).toBe(1);
      expect(getMetricCount()).toBe(0);
    });
  });
});
