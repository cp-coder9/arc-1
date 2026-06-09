/**
 * Architex Analytics & Reporting Pack — Type Definitions
 * Module Key: analytics_reporting
 *
 * Guardrails:
 * - Analytics never override formal approvals; they only surface information.
 * - Export APIs respect tenant isolation and POPIA data-retention policies.
 * - Automated alerts are configurable per-project and must be acknowledged before proceeding.
 * - KPI formulas are versioned and auditable; changes create a new version rather than mutating history.
 * - Observability data is retained for a configurable retention window and never includes raw personal content.
 */

import type { Priority, ProjectPhase, ProductModuleKey, ProjectRecordType } from './architexMasterTypes';

// ── Base types ──────────────────────────────────────────────────────────────────

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface BaseContext {
  tenantId: string;
  projectId: string;
  userId: string;
  actorRole: string;
  now: string;
}

// ── Workflow Record (unified shape shared across packs) ─────────────────────────

export interface WorkflowRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  blockers: string[];
  approvalsRequired: string[];
}

// ── KPI Metrics ─────────────────────────────────────────────────────────────────

export type KPIName =
  | 'schedule_variance'
  | 'cost_to_complete'
  | 'defect_liability_remaining_days'
  | 'retention_release_readiness'
  | 'compliance_gap_count';

export interface KPIMetric {
  metricId: string;
  name: KPIName;
  label: string;
  value: number;
  unit: string;
  version: number;
  calculationSource: string;
  projectId: string;
  tenantId: string;
  recordedAt: string;
  recordedBy: string;
  metadata?: Record<string, unknown>;
  immutable: true;
}

export interface ScheduleVarianceKPI {
  name: 'schedule_variance';
  label: 'Schedule Variance';
  plannedMilestones: number;
  completedOnTime: number;
  delayed: number;
  variancePercent: number;
  unit: 'percent';
}

export interface CostToCompleteKPI {
  name: 'cost_to_complete';
  label: 'Cost to Complete';
  budgetedAmount: number;
  committedAmount: number;
  actualSpend: number;
  remainingBudget: number;
  percentComplete: number;
  unit: 'ZAR';
}

export interface DefectLiabilityKPI {
  name: 'defect_liability_remaining_days';
  label: 'Defect Liability Remaining';
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  isExpired: boolean;
  unit: 'days';
}

export interface RetentionReleaseKPI {
  name: 'retention_release_readiness';
  label: 'Retention Release Readiness';
  totalRetentionAmount: number;
  releasableAmount: number;
  conditionsMet: number;
  totalConditions: number;
  isReadyForRelease: boolean;
  unit: 'ZAR';
}

export interface ComplianceGapKPI {
  name: 'compliance_gap_count';
  label: 'Compliance Gap Count';
  expiredRegistrations: number;
  lapsedInsurance: number;
  missingDocuments: number;
  totalGaps: number;
  unit: 'count';
}

export type KPIResult = ScheduleVarianceKPI | CostToCompleteKPI | DefectLiabilityKPI | RetentionReleaseKPI | ComplianceGapKPI;

export interface KPIComputationResult {
  projectId: string;
  computedAt: string;
  kpis: KPIResult[];
  version: number;
}

// ── Dashboard Widgets ───────────────────────────────────────────────────────────

export type WidgetType = 'kpi_card' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'alert_list' | 'table' | 'status_badge';

export type DashboardRole = 'platform_admin' | 'principal_agent' | 'client' | 'contractor';

export interface DashboardWidget {
  widgetId: string;
  type: WidgetType;
  title: string;
  description?: string;
  dataSource: string; // e.g., 'kpi:schedule_variance', 'alerts:all', 'observability:latency'
  refreshIntervalMs: number; // 0 for static, >0 for auto-refresh
  visibleToRoles: DashboardRole[];
  layout: {
    row: number;
    col: number;
    width: number; // in grid units (1-12)
    height: number; // in grid units
  };
  config?: Record<string, unknown>;
}

export interface DashboardPayload {
  role: DashboardRole;
  generatedAt: string;
  widgets: DashboardWidget[];
  data: Record<string, unknown>; // widgetId -> resolved data payload
}

// ── Alert Rules & Events ────────────────────────────────────────────────────────

export interface AlertRule {
  ruleId: string;
  name: string;
  description: string;
  condition: AlertCondition;
  severity: Severity;
  recipientRole: string;
  requiresAcknowledgement: boolean;
  cooldownMinutes: number; // minimum minutes between repeat alerts
  enabled: boolean;
  projectId?: string; // undefined = tenant-wide
  tenantId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertCondition {
  type: 'blocker_present' | 'status_check' | 'date_check' | 'threshold_exceeded' | 'field_comparison';
  field?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AlertEvent {
  eventId: string;
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  recipientRole: string;
  sourceObjectId: string;
  projectId: string;
  tenantId: string;
  firedAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

// ── Export Jobs ─────────────────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'json';
export type ExportScope = 'project' | 'tenant';

export interface ExportJob {
  jobId: string;
  format: ExportFormat;
  scope: ExportScope;
  projectId?: string;
  tenantId: string;
  filters: ExportFilters;
  generatedUri?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedBy: string;
  requestedAt: string;
  completedAt?: string;
  recordCount?: number;
  error?: string;
}

export interface ExportFilters {
  recordTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  severity?: Severity[];
  status?: string[];
  limit?: number;
}

// ── Observability ───────────────────────────────────────────────────────────────

export type ObservabilityMetricType = 'latency' | 'error_count' | 'memory_boundary_violation' | 'request_count';

export interface ObservabilityMetric {
  metricId: string;
  type: ObservabilityMetricType;
  serviceName: string;
  moduleKey: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
  recordedAt: string;
  ttlDays: number;
}

export interface ObservabilitySnapshot {
  generatedAt: string;
  metrics: {
    totalRequests: number;
    averageLatencyMs: number;
    errorCount: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    memoryViolations: number;
    servicesByErrorRate: Array<{ service: string; errors: number; requests: number; rate: number }>;
  };
}

// ── Agent Recommendations (analytics-specific) ──────────────────────────────────

export interface AnalyticsAgentOutput {
  outputId: string;
  agentKey: string;
  title: string;
  rationale: string;
  sourceObjectId: string;
  severity: Severity;
  kpiName?: KPIName;
  recommendedAction?: string;
  urgency: 'immediate' | 'this_week' | 'this_month' | 'advisory';
}
