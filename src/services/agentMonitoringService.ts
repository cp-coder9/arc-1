import type { WorkflowRecord, Severity } from '../types/agentOrchestration';

interface AgentMetric {
  metricId: string;
  agentKey: string;
  metricName: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface AgentAlert {
  alertId: string;
  agentKey: string;
  metricName: string;
  threshold: number;
  actualValue: number;
  severity: Severity;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

interface AgentHealthCheck {
  agentKey: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastHeartbeat: string;
  errorRate: number;
  averageLatencyMs: number;
}

const metrics: AgentMetric[] = [];
const alerts: AgentAlert[] = [];
const healthChecks = new Map<string, AgentHealthCheck>();
let seq = 1;

export function createAgentMonitoringRecord(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `agentMonitoring-${seq++}`,
    type: 'agentMonitoring',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function recordMetric(params: {
  agentKey: string;
  metricName: string;
  value: number;
  unit: string;
}): AgentMetric {
  const metric: AgentMetric = {
    metricId: `metric-${seq++}`,
    agentKey: params.agentKey,
    metricName: params.metricName,
    value: params.value,
    unit: params.unit,
    timestamp: new Date().toISOString(),
  };
  metrics.push(metric);
  return metric;
}

export function recordHeartbeat(agentKey: string): AgentHealthCheck {
  const existing = healthChecks.get(agentKey) ?? {
    agentKey,
    status: 'healthy' as const,
    lastHeartbeat: '',
    errorRate: 0,
    averageLatencyMs: 0,
  };
  existing.lastHeartbeat = new Date().toISOString();
  existing.status = 'healthy';
  healthChecks.set(agentKey, existing);
  return existing;
}

export function checkAgentHealth(agentKey: string): AgentHealthCheck {
  const check = healthChecks.get(agentKey);
  if (!check) return { agentKey, status: 'unhealthy', lastHeartbeat: '', errorRate: 1, averageLatencyMs: 0 };

  const now = Date.now();
  const heartbeat = new Date(check.lastHeartbeat).getTime();
  const msSinceHeartbeat = now - heartbeat;

  if (msSinceHeartbeat > 300000) {
    check.status = 'unhealthy';
  } else if (msSinceHeartbeat > 120000) {
    check.status = 'degraded';
  }

  return check;
}

export function evaluateThreshold(params: {
  agentKey: string;
  metricName: string;
  value: number;
  threshold: number;
  severity: Severity;
  message: string;
}): AgentAlert | undefined {
  if (params.value <= params.threshold) return undefined;

  const alert: AgentAlert = {
    alertId: `alert-${seq++}`,
    agentKey: params.agentKey,
    metricName: params.metricName,
    threshold: params.threshold,
    actualValue: params.value,
    severity: params.severity,
    message: params.message,
    timestamp: new Date().toISOString(),
    acknowledged: false,
  };
  alerts.push(alert);
  return alert;
}

export function acknowledgeAlert(alertId: string): AgentAlert | undefined {
  const alert = alerts.find((a) => a.alertId === alertId);
  if (!alert) return undefined;
  alert.acknowledged = true;
  return alert;
}

export function getRecentMetrics(agentKey: string, limitCount = 10): AgentMetric[] {
  return metrics
    .filter((m) => m.agentKey === agentKey)
    .reverse()
    .slice(0, limitCount);
}

export function getUnacknowledgedAlerts(): AgentAlert[] {
  return alerts.filter((a) => !a.acknowledged);
}
