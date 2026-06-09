/**
 * Observability Service
 *
 * Records latency metrics, error counts, and memory-boundary violations
 * for the analytics layer. Provides platform health snapshots.
 *
 * Guardrails:
 * - Observability data is retained for a configurable window.
 * - Never includes raw personal content.
 */

import type {
  ObservabilityMetric,
  ObservabilityMetricType,
  ObservabilitySnapshot,
} from '../types/analyticsReporting';

// ── Config ──────────────────────────────────────────────────────────────────────

const DEFAULT_TTL_DAYS = 30;
const MAX_METRICS_STORE = 100_000; // Prevent unbounded growth

// ── In-memory store ─────────────────────────────────────────────────────────────

const metrics: ObservabilityMetric[] = [];
let metricSeq = 1;

// ── Recording ───────────────────────────────────────────────────────────────────

export function recordMetric(params: {
  type: ObservabilityMetricType;
  serviceName: string;
  moduleKey: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
  ttlDays?: number;
}): ObservabilityMetric {
  const metric: ObservabilityMetric = {
    metricId: `obs-${metricSeq++}`,
    type: params.type,
    serviceName: params.serviceName,
    moduleKey: params.moduleKey,
    value: params.value,
    unit: params.unit,
    tags: params.tags || {},
    recordedAt: new Date().toISOString(),
    ttlDays: params.ttlDays || DEFAULT_TTL_DAYS,
  };

  metrics.push(metric);

  // Prune old metrics beyond MAX_METRICS_STORE
  if (metrics.length > MAX_METRICS_STORE) {
    metrics.splice(0, metrics.length - MAX_METRICS_STORE);
  }

  return metric;
}

/**
 * Record a latency measurement in milliseconds.
 */
export function recordLatency(
  serviceName: string,
  moduleKey: string,
  latencyMs: number,
  tags?: Record<string, string>,
): ObservabilityMetric {
  return recordMetric({
    type: 'latency',
    serviceName,
    moduleKey,
    value: latencyMs,
    unit: 'ms',
    tags,
  });
}

/**
 * Record an error occurrence.
 */
export function recordError(
  serviceName: string,
  moduleKey: string,
  tags?: Record<string, string>,
): ObservabilityMetric {
  return recordMetric({
    type: 'error_count',
    serviceName,
    moduleKey,
    value: 1,
    unit: 'count',
    tags,
  });
}

/**
 * Record a memory-boundary violation (from Pack 14 agent orchestration).
 */
export function recordMemoryViolation(
  serviceName: string,
  moduleKey: string,
  memoryBytes: number,
  limitBytes: number,
  tags?: Record<string, string>,
): ObservabilityMetric {
  return recordMetric({
    type: 'memory_boundary_violation',
    serviceName,
    moduleKey,
    value: memoryBytes - limitBytes, // How far over the boundary
    unit: 'bytes',
    tags: { ...tags, memoryLimit: String(limitBytes), memoryUsed: String(memoryBytes) },
  });
}

/**
 * Record a request count.
 */
export function recordRequest(
  serviceName: string,
  moduleKey: string,
  tags?: Record<string, string>,
): ObservabilityMetric {
  return recordMetric({
    type: 'request_count',
    serviceName,
    moduleKey,
    value: 1,
    unit: 'count',
    tags,
  });
}

// ── Querying ────────────────────────────────────────────────────────────────────

export function getMetrics(options?: {
  type?: ObservabilityMetricType;
  serviceName?: string;
  moduleKey?: string;
  since?: string;
  limit?: number;
}): ObservabilityMetric[] {
  let filtered = [...metrics];

  if (options?.type) {
    filtered = filtered.filter((m) => m.type === options.type);
  }
  if (options?.serviceName) {
    filtered = filtered.filter((m) => m.serviceName === options.serviceName);
  }
  if (options?.moduleKey) {
    filtered = filtered.filter((m) => m.moduleKey === options.moduleKey);
  }
  if (options?.since) {
    const sinceDate = new Date(options.since).getTime();
    filtered = filtered.filter((m) => new Date(m.recordedAt).getTime() >= sinceDate);
  }
  if (options?.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

export function getMetricCount(options?: {
  type?: ObservabilityMetricType;
  since?: string;
}): number {
  return getMetrics(options).length;
}

// ── Platform Health Snapshot ────────────────────────────────────────────────────

export function computeHealthSnapshot(options?: {
  since?: string;
}): ObservabilitySnapshot {
  const relevant = getMetrics({ since: options?.since });

  const latencyMetrics = relevant.filter((m) => m.type === 'latency');
  const errorMetrics = relevant.filter((m) => m.type === 'error_count');
  const requestMetrics = relevant.filter((m) => m.type === 'request_count');
  const memoryViolations = relevant.filter((m) => m.type === 'memory_boundary_violation');

  // Latency percentiles
  const latencies = latencyMetrics.map((m) => m.value).sort((a, b) => a - b);

  const averageLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length)
      : 0;

  const p95Index = Math.ceil(latencies.length * 0.95) - 1;
  const p99Index = Math.ceil(latencies.length * 0.99) - 1;
  const p95LatencyMs = latencies.length > 0 ? latencies[Math.max(0, p95Index)] : 0;
  const p99LatencyMs = latencies.length > 0 ? latencies[Math.max(0, p99Index)] : 0;

  // Service-level error rates
  const serviceStats = new Map<string, { errors: number; requests: number }>();
  for (const m of errorMetrics) {
    const key = m.serviceName;
    const existing = serviceStats.get(key) || { errors: 0, requests: 0 };
    existing.errors += m.value;
    serviceStats.set(key, existing);
  }
  for (const m of requestMetrics) {
    const key = m.serviceName;
    const existing = serviceStats.get(key) || { errors: 0, requests: 0 };
    existing.requests += m.value;
    serviceStats.set(key, existing);
  }

  const servicesByErrorRate = [...serviceStats.entries()]
    .map(([service, stats]) => ({
      service,
      errors: stats.errors,
      requests: stats.requests,
      rate: stats.requests > 0 ? Math.round((stats.errors / stats.requests) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      totalRequests: requestMetrics.reduce((sum, m) => sum + m.value, 0),
      averageLatencyMs,
      errorCount: errorMetrics.reduce((sum, m) => sum + m.value, 0),
      p95LatencyMs,
      p99LatencyMs,
      memoryViolations: memoryViolations.length,
      servicesByErrorRate,
    },
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────────────────

/**
 * Prune metrics older than the TTL window.
 */
export function pruneExpiredMetrics(): number {
  const now = new Date();
  const initialCount = metrics.length;

  const remaining = metrics.filter((m) => {
    const recordedAt = new Date(m.recordedAt);
    const ageDays = (now.getTime() - recordedAt.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays < m.ttlDays;
  });

  metrics.length = 0;
  metrics.push(...remaining);

  return initialCount - metrics.length;
}

// ── Reset (for testing) ─────────────────────────────────────────────────────────

export function resetObservabilityState(): void {
  metrics.length = 0;
  metricSeq = 1;
}
