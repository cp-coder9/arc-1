/**
 * Agent Monitoring Service — Pack 14: Agent Orchestration Core
 *
 * Tracks agent performance metrics, detects behavior drift,
 * and reports usage analytics per agent type.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AgentMetrics {
  agentId: string;
  type: 'user' | 'project' | 'system_governance';
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  averageResponseTimeMs: number;
  recommendationsGenerated: number;
  recommendationsAccepted: number;
  recommendationsRejected: number;
  lastActiveAt?: string;
  startOfPeriod: string;
}

export interface DriftAlert {
  id: string;
  agentId: string;
  metric: string;
  previousValue: number;
  currentValue: number;
  deviationPercent: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: string;
  message: string;
}

export interface UsageReport {
  period: { start: string; end: string };
  totalAgents: number;
  activeAgents: number;
  totalActions: number;
  totalRecommendations: number;
  acceptanceRate: number;
  byType: Record<string, { count: number; actions: number; recs: number }>;
  driftAlerts: DriftAlert[];
}

// ─── Metrics Factory ──────────────────────────────────────────────────────

export function createAgentMetrics(agentId: string, type: AgentMetrics['type']): AgentMetrics {
  return {
    agentId,
    type,
    totalActions: 0,
    successfulActions: 0,
    failedActions: 0,
    averageResponseTimeMs: 0,
    recommendationsGenerated: 0,
    recommendationsAccepted: 0,
    recommendationsRejected: 0,
    startOfPeriod: new Date().toISOString(),
  };
}

// ─── Metrics Recording ────────────────────────────────────────────────────

export function recordAction(
  metrics: AgentMetrics,
  success: boolean,
  responseTimeMs: number,
): AgentMetrics {
  const totalActions = metrics.totalActions + 1;
  const successfulActions = metrics.successfulActions + (success ? 1 : 0);
  const failedActions = metrics.failedActions + (success ? 0 : 1);
  const averageResponseTimeMs =
    (metrics.averageResponseTimeMs * metrics.totalActions + responseTimeMs) /
    totalActions;

  return {
    ...metrics,
    totalActions,
    successfulActions,
    failedActions,
    averageResponseTimeMs: Math.round(averageResponseTimeMs),
    lastActiveAt: new Date().toISOString(),
  };
}

export function recordRecommendation(
  metrics: AgentMetrics,
  accepted: boolean,
): AgentMetrics {
  return {
    ...metrics,
    recommendationsGenerated: metrics.recommendationsGenerated + 1,
    recommendationsAccepted: metrics.recommendationsAccepted + (accepted ? 1 : 0),
    recommendationsRejected: metrics.recommendationsRejected + (accepted ? 0 : 1),
    lastActiveAt: new Date().toISOString(),
  };
}

// ─── Drift Detection ──────────────────────────────────────────────────────

const DRIFT_THRESHOLDS = {
  successRate: { warning: 10, critical: 25 }, // % deviation
  responseTime: { warning: 50, critical: 100 }, // % increase
  acceptanceRate: { warning: 15, critical: 30 }, // % decrease
};

export function detectDrift(
  current: AgentMetrics,
  previous: AgentMetrics,
): DriftAlert[] {
  const alerts: DriftAlert[] = [];

  // Success rate drift
  if (previous.totalActions > 10) {
    const prevSuccessRate = previous.successfulActions / previous.totalActions;
    const currSuccessRate = current.successfulActions / current.totalActions;
    const deviation = (prevSuccessRate - currSuccessRate) * 100;

    if (deviation > DRIFT_THRESHOLDS.successRate.critical) {
      alerts.push(createDriftAlert(current.agentId, 'successRate', prevSuccessRate * 100, currSuccessRate * 100, deviation, 'critical'));
    } else if (deviation > DRIFT_THRESHOLDS.successRate.warning) {
      alerts.push(createDriftAlert(current.agentId, 'successRate', prevSuccessRate * 100, currSuccessRate * 100, deviation, 'high'));
    }
  }

  // Response time drift
  if (previous.averageResponseTimeMs > 0 && current.averageResponseTimeMs > 0) {
    const increase =
      ((current.averageResponseTimeMs - previous.averageResponseTimeMs) /
        previous.averageResponseTimeMs) *
      100;
    if (increase > DRIFT_THRESHOLDS.responseTime.critical) {
      alerts.push(createDriftAlert(current.agentId, 'responseTime', previous.averageResponseTimeMs, current.averageResponseTimeMs, increase, 'critical'));
    } else if (increase > DRIFT_THRESHOLDS.responseTime.warning) {
      alerts.push(createDriftAlert(current.agentId, 'responseTime', previous.averageResponseTimeMs, current.averageResponseTimeMs, increase, 'medium'));
    }
  }

  // Acceptance rate drift
  if (previous.recommendationsGenerated > 5) {
    const prevAcceptRate =
      previous.recommendationsAccepted / previous.recommendationsGenerated;
    const currAcceptRate =
      current.recommendationsAccepted / (current.recommendationsGenerated || 1);
    const decrease = (prevAcceptRate - currAcceptRate) * 100;

    if (decrease > DRIFT_THRESHOLDS.acceptanceRate.critical) {
      alerts.push(createDriftAlert(current.agentId, 'acceptanceRate', prevAcceptRate * 100, currAcceptRate * 100, decrease, 'critical'));
    } else if (decrease > DRIFT_THRESHOLDS.acceptanceRate.warning) {
      alerts.push(createDriftAlert(current.agentId, 'acceptanceRate', prevAcceptRate * 100, currAcceptRate * 100, decrease, 'medium'));
    }
  }

  return alerts;
}

function createDriftAlert(
  agentId: string,
  metric: string,
  previousValue: number,
  currentValue: number,
  deviationPercent: number,
  severity: DriftAlert['severity'],
): DriftAlert {
  return {
    id: `drift-${agentId}-${metric}-${Date.now()}`,
    agentId,
    metric,
    previousValue: Math.round(previousValue),
    currentValue: Math.round(currentValue),
    deviationPercent: Math.round(deviationPercent),
    severity,
    detectedAt: new Date().toISOString(),
    message: `Agent ${agentId}: ${metric} deviated by ${Math.round(deviationPercent)}% (was ${Math.round(previousValue)}, now ${Math.round(currentValue)})`,
  };
}

// ─── Usage Report Generation ──────────────────────────────────────────────

export function generateUsageReport(
  allMetrics: AgentMetrics[],
  driftAlerts: DriftAlert[],
): UsageReport {
  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const byType: UsageReport['byType'] = {};
  for (const m of allMetrics) {
    if (!byType[m.type]) {
      byType[m.type] = { count: 0, actions: 0, recs: 0 };
    }
    byType[m.type].count++;
    byType[m.type].actions += m.totalActions;
    byType[m.type].recs += m.recommendationsGenerated;
  }

  const totalRecs = allMetrics.reduce((sum, m) => sum + m.recommendationsGenerated, 0);
  const totalAccepted = allMetrics.reduce((sum, m) => sum + m.recommendationsAccepted, 0);

  return {
    period: { start: thirtyDaysAgo, end: now },
    totalAgents: allMetrics.length,
    activeAgents: allMetrics.filter((m) => m.totalActions > 0).length,
    totalActions: allMetrics.reduce((sum, m) => sum + m.totalActions, 0),
    totalRecommendations: totalRecs,
    acceptanceRate: totalRecs > 0 ? Math.round((totalAccepted / totalRecs) * 100) : 0,
    byType,
    driftAlerts,
  };
}

// ─── Health Check ─────────────────────────────────────────────────────────

export function agentHealthCheck(metrics: AgentMetrics): {
  healthy: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (metrics.totalActions > 5) {
    const successRate = metrics.successfulActions / metrics.totalActions;
    if (successRate < 0.7) {
      issues.push(
        `Success rate below 70% (${Math.round(successRate * 100)}%)`,
      );
    }
  }

  if (metrics.averageResponseTimeMs > 5000) {
    issues.push(
      `High average response time: ${metrics.averageResponseTimeMs}ms`,
    );
  }

  if (
    metrics.recommendationsGenerated > 10 &&
    metrics.recommendationsAccepted / metrics.recommendationsGenerated < 0.3
  ) {
    issues.push(
      `Low recommendation acceptance rate: ${Math.round(
        (metrics.recommendationsAccepted / metrics.recommendationsGenerated) * 100,
      )}%`,
    );
  }

  return { healthy: issues.length === 0, issues };
}
