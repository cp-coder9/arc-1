/**
 * Alert Engine Service
 *
 * Evaluates alert rules against KPI results and project state triggers.
 * Fires alert events when conditions are met and manages cooldown windows
 * to prevent alert fatigue.
 *
 * Guardrails:
 * - Automated alerts are configurable per-project and must be acknowledged.
 * - Cooldown management prevents alert fatigue.
 * - Alert rules are evaluated against current KPI state, not stale data.
 * - Tenant isolation is enforced via BaseContext.
 */

import type { AlertEvent, AlertRule, BaseContext, KPIResult, Severity } from '../types/analyticsReporting';
import {
  evaluateAlertRule,
  getAlertEvents as getSchedulerAlertEvents,
  acknowledgeAlertEvent,
  getAlertRulesForProject,
} from './alertSchedulerService';
import type { WorkflowRecord } from '../types/analyticsReporting';

// ── Types ───────────────────────────────────────────────────────────────────────────────────────────

export interface ProjectTrigger {
  /** The type of trigger — maps to a record type for evaluation */
  type: string;
  /** Title of the trigger item */
  title: string;
  /** Current status */
  status: string;
  /** Additional structured data for condition evaluation */
  payload: Record<string, unknown>;
  /** List of blocker identifiers */
  blockers: string[];
}

export interface EvaluateAlertsResult {
  projectId: string;
  evaluatedAt: string;
  evaluatedBy: string;
  totalRules: number;
  triggered: number;
  throttled: number;
  events: AlertEvent[];
  details: Array<{
    ruleId: string;
    ruleName: string;
    triggered: boolean;
    throttled: boolean;
    matchedRecords: string[];
  }>;
}

export interface AlertSummary {
  eventId: string;
  title: string;
  description: string;
  severity: Severity;
  sourceObjectId: string;
  firedAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────────────────────────

const ALERT_KPI_THRESHOLDS: Record<string, { field: string; operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number; severity: Severity; message: string }> = {
  schedule_variance: {
    field: 'variancePercent',
    operator: 'lt',
    value: -20,
    severity: 'high',
    message: 'Schedule variance is critically low (below -20%). Immediate attention required.',
  },
  cost_to_complete: {
    field: 'remainingBudget',
    operator: 'lt',
    value: 0,
    severity: 'critical',
    message: 'Project is over budget. Remaining budget is negative.',
  },
  defect_liability_remaining_days: {
    field: 'remainingDays',
    operator: 'lte',
    value: 0,
    severity: 'high',
    message: 'Defect liability period has expired or is at zero days.',
  },
  retention_release_readiness: {
    field: 'isReadyForRelease',
    operator: 'eq',
    value: 1,
    severity: 'medium',
    message: 'Retention release conditions are met. Ready for release.',
  },
  compliance_gap_count: {
    field: 'totalGaps',
    operator: 'gt',
    value: 3,
    severity: 'high',
    message: 'Compliance gaps exceed threshold of 3. Review required.',
  },
};

// ── In-memory stores ──────────────────────────────────────────────────────────────────────────────

const activeAlertCache = new Map<string, AlertEvent[]>(); // projectId -> active events

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Convert a ProjectTrigger to a WorkflowRecord so the scheduler can evaluate it.
 */
function triggerToWorkflowRecord(trigger: ProjectTrigger): WorkflowRecord {
  return {
    id: `trigger-${trigger.type}-${trigger.title.replace(/[^a-zA-Z0-9]/g, '-')}`,
    type: trigger.type,
    title: trigger.title,
    status: trigger.status,
    payload: trigger.payload,
    blockers: trigger.blockers,
    approvalsRequired: [],
  };
}

/**
 * Evaluate built-in KPI-based alert thresholds.
 * Returns synthetic alert events for KPIs that exceed defined thresholds.
 */
function evaluateKpiThresholds(
  kpis: KPIResult[],
  projectId: string,
  tenantId: string,
): AlertEvent[] {
  const events: AlertEvent[] = [];
  let seq = 1;

  for (const kpi of kpis) {
    const threshold = ALERT_KPI_THRESHOLDS[kpi.name];
    if (!threshold) continue;

    const record = kpi as unknown as Record<string, unknown>;
    const fieldValue = record[threshold.field];

    if (fieldValue === undefined || fieldValue === null) continue;

    let triggered = false;
    const numValue = Number(fieldValue);

    switch (threshold.operator) {
      case 'gt':
        triggered = numValue > threshold.value;
        break;
      case 'gte':
        triggered = numValue >= threshold.value;
        break;
      case 'lt':
        triggered = numValue < threshold.value;
        break;
      case 'lte':
        triggered = numValue <= threshold.value;
        break;
      case 'eq':
        triggered = numValue === threshold.value;
        break;
    }

    if (triggered) {
      events.push({
        eventId: `kpi-alert-${Date.now()}-${seq++}`,
        ruleId: `kpi-threshold-${kpi.name}`,
        title: `${kpi.label} — Threshold Breached`,
        description: threshold.message,
        severity: threshold.severity,
        recipientRole: 'platform_admin',
        sourceObjectId: projectId,
        projectId,
        tenantId,
        firedAt: new Date().toISOString(),
        acknowledged: false,
      });
    }
  }

  return events;
}

/**
 * Check if a KPI-based alert is within the cooldown window (don't re-fire).
 */
function isKpiAlertInCooldown(projectId: string, kpiName: string, cooldownMinutes: number): boolean {
  const cacheKey = `${projectId}:${kpiName}`;
  const cache = activeAlertCache.get(projectId);
  if (!cache) return false;

  const lastEvent = cache.find((e) => e.ruleId === `kpi-threshold-${kpiName}`);
  if (!lastEvent) return false;

  const elapsed = Date.now() - new Date(lastEvent.firedAt).getTime();
  return elapsed < cooldownMinutes * 60 * 1000;
}

// ── Public API ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate all alert rules for a project against the given triggers and KPI data.
 *
 * This is the primary entry point for triggering alerts. It:
 * 1. Fetches applicable alert rules for the project
 * 2. Evaluates each rule against the provided triggers (via scheduler service)
 * 3. Evaluates built-in KPI threshold alerts
 * 4. Respects cooldown windows on KPI alerts
 * 5. Returns a comprehensive evaluation result
 */
export function evaluateProjectAlerts(
  projectId: string,
  triggers: ProjectTrigger[],
  ctx: BaseContext,
  kpis?: KPIResult[],
): EvaluateAlertsResult {
  const evaluatedAt = new Date().toISOString();
  const details: EvaluateAlertsResult['details'] = [];
  const events: AlertEvent[] = [];

  // Convert triggers to WorkflowRecords
  const workflowRecords = triggers.map(triggerToWorkflowRecord);

  // Step 1: Evaluate all scheduled alert rules for this project
  const rules = getAlertRulesForProject(projectId);

  for (const rule of rules) {
    const result = evaluateAlertRule(rule, workflowRecords);
    details.push({
      ruleId: rule.ruleId,
      ruleName: rule.name,
      triggered: result.triggered && !result.throttled,
      throttled: result.throttled,
      matchedRecords: result.matchedRecords,
    });

    if (result.event) {
      events.push(result.event);
    }
  }

  // Step 2: Evaluate KPI thresholds
  if (kpis && kpis.length > 0) {
    const kpiAlertEvents = evaluateKpiThresholds(kpis, projectId, ctx.tenantId);

    for (const alertEvent of kpiAlertEvents) {
      // Check cooldown for KPI alerts (default 60 minutes)
      const kpiName = alertEvent.ruleId.replace('kpi-threshold-', '');
      if (isKpiAlertInCooldown(projectId, kpiName, 60)) {
        details.push({
          ruleId: alertEvent.ruleId,
          ruleName: alertEvent.title,
          triggered: false,
          throttled: true,
          matchedRecords: [],
        });
        continue;
      }

      events.push(alertEvent);

      details.push({
        ruleId: alertEvent.ruleId,
        ruleName: alertEvent.title,
        triggered: true,
        throttled: false,
        matchedRecords: [projectId],
      });
    }
  }

  // Update the alert cache for the project
  const existing = activeAlertCache.get(projectId) || [];
  activeAlertCache.set(projectId, [...existing, ...events]);

  // Prune old cache entries (keep last 24 hours)
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  activeAlertCache.set(
    projectId,
    (activeAlertCache.get(projectId) || []).filter(
      (e) => new Date(e.firedAt).getTime() >= twentyFourHoursAgo,
    ),
  );

  return {
    projectId,
    evaluatedAt,
    evaluatedBy: ctx.userId,
    totalRules: rules.length + Object.keys(ALERT_KPI_THRESHOLDS).length,
    triggered: details.filter((d) => d.triggered).length,
    throttled: details.filter((d) => d.throttled).length,
    events,
    details,
  };
}

/**
 * Acknowledge an alert event.
 *
 * Delegates to the underlying scheduler service and returns the updated event.
 */
export function acknowledgeAlert(
  alertId: string,
  userId: string,
): AlertEvent | undefined {
  return acknowledgeAlertEvent(alertId, userId);
}

/**
 * Get active (unacknowledged) alerts for a project.
 *
 * Returns alerts from both the scheduler service and the local cache,
 * filtered by project scope.
 */
export function getActiveAlerts(
  projectId: string,
  ctx: BaseContext,
  options?: {
    severity?: Severity;
    limit?: number;
  },
): AlertSummary[] {
  // Get unacknowledged events from the scheduler
  const schedulerEvents = getSchedulerAlertEvents({
    projectId,
    unacknowledgedOnly: true,
  });

  // Get any unacknowledged KPI threshold events from the local cache
  const cachedAlerts = (activeAlertCache.get(projectId) || []).filter(
    (e) => !e.acknowledged,
  );

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: AlertEvent[] = [];

  for (const event of [...schedulerEvents, ...cachedAlerts]) {
    if (!seen.has(event.eventId)) {
      seen.add(event.eventId);
      merged.push(event);
    }
  }

  // Apply severity filter
  let filtered = merged;
  if (options?.severity) {
    filtered = filtered.filter((e) => e.severity === options.severity);
  }

  // Sort newest first
  filtered.sort((a, b) => new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime());

  // Apply limit
  if (options?.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered.map((e) => ({
    eventId: e.eventId,
    title: e.title,
    description: e.description,
    severity: e.severity,
    sourceObjectId: e.sourceObjectId,
    firedAt: e.firedAt,
    acknowledged: e.acknowledged,
    acknowledgedBy: e.acknowledgedBy,
    acknowledgedAt: e.acknowledgedAt,
  }));
}

/**
 * Get a count of active alerts for a project.
 */
export function getActiveAlertCount(
  projectId: string,
  ctx: BaseContext,
): number {
  return getActiveAlerts(projectId, ctx).length;
}

/**
 * Get all configured KPI threshold definitions.
 */
export function getKpiThresholdDefinitions(): Array<{
  kpiName: string;
  field: string;
  operator: string;
  value: number;
  severity: Severity;
  description: string;
}> {
  return Object.entries(ALERT_KPI_THRESHOLDS).map(([kpiName, config]) => ({
    kpiName,
    field: config.field,
    operator: config.operator,
    value: config.value,
    severity: config.severity,
    description: config.message,
  }));
}

// ── Reset (for testing) ───────────────────────────────────────────────────────────────────────────

export function resetAlertEngineState(): void {
  activeAlertCache.clear();
}
