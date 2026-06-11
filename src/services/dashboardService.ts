/**
 * Dashboard Service
 * Builds widget payloads from KPI results with role-specific configurations.
 *
 * Supports:
 * - Role-specific dashboards (admin, professional, client, contractor)
 * - Configurable widget layout
 * - Real-time refresh capability
 */

import type {
  DashboardPayload,
  DashboardRole,
  DashboardWidget,
  WidgetType,
} from '../types/analyticsReporting';
import type { KPIResult } from '../types/analyticsReporting';

// ── Widget blueprint definitions ────────────────────────────────────────────────

interface WidgetBlueprint {
  widgetId: string;
  type: WidgetType;
  title: string;
  description: string;
  dataSource: string;
  refreshIntervalMs: number;
  layout: { row: number; col: number; width: number; height: number };
  roles: DashboardRole[];
}

const KPI_WIDGET_BLUEPRINTS: WidgetBlueprint[] = [
  {
    widgetId: 'kpi_schedule_variance',
    type: 'kpi_card',
    title: 'Schedule Variance',
    description: 'Planned vs actual milestone completion',
    dataSource: 'kpi:schedule_variance',
    refreshIntervalMs: 300_000, // 5 minutes
    layout: { row: 0, col: 0, width: 4, height: 2 },
    roles: ['platform_admin', 'principal_agent', 'client'],
  },
  {
    widgetId: 'kpi_cost_to_complete',
    type: 'kpi_card',
    title: 'Cost to Complete',
    description: 'Budget vs committed vs actual spend',
    dataSource: 'kpi:cost_to_complete',
    refreshIntervalMs: 300_000,
    layout: { row: 0, col: 4, width: 4, height: 2 },
    roles: ['platform_admin', 'principal_agent', 'client'],
  },
  {
    widgetId: 'kpi_defect_liability',
    type: 'kpi_card',
    title: 'Defect Liability',
    description: 'Remaining days in defect liability period',
    dataSource: 'kpi:defect_liability_remaining_days',
    refreshIntervalMs: 86_400_000, // 24 hours
    layout: { row: 2, col: 0, width: 4, height: 2 },
    roles: ['platform_admin', 'principal_agent', 'contractor'],
  },
  {
    widgetId: 'kpi_retention_release',
    type: 'kpi_card',
    title: 'Retention Release',
    description: 'Retention release readiness status',
    dataSource: 'kpi:retention_release_readiness',
    refreshIntervalMs: 300_000,
    layout: { row: 2, col: 4, width: 4, height: 2 },
    roles: ['platform_admin', 'principal_agent', 'client', 'contractor'],
  },
  {
    widgetId: 'kpi_compliance_gaps',
    type: 'kpi_card',
    title: 'Compliance Gaps',
    description: 'Expired registrations, lapsed insurance, missing documents',
    dataSource: 'kpi:compliance_gap_count',
    refreshIntervalMs: 3_600_000, // 1 hour
    layout: { row: 4, col: 0, width: 4, height: 2 },
    roles: ['platform_admin', 'principal_agent'],
  },
  {
    widgetId: 'alert_list',
    type: 'alert_list',
    title: 'Active Alerts',
    description: 'Unacknowledged analytics alerts',
    dataSource: 'alerts:unacknowledged',
    refreshIntervalMs: 60_000, // 1 minute
    layout: { row: 4, col: 4, width: 8, height: 3 },
    roles: ['platform_admin', 'principal_agent', 'client'],
  },
];

const OBSERVABILITY_WIDGETS: WidgetBlueprint[] = [
  {
    widgetId: 'obs_request_count',
    type: 'line_chart',
    title: 'Request Volume',
    description: 'API requests over time',
    dataSource: 'observability:request_count',
    refreshIntervalMs: 60_000,
    layout: { row: 0, col: 0, width: 6, height: 3 },
    roles: ['platform_admin'],
  },
  {
    widgetId: 'obs_latency',
    type: 'line_chart',
    title: 'Average Latency',
    description: 'P50/P95/P99 latency in milliseconds',
    dataSource: 'observability:latency',
    refreshIntervalMs: 60_000,
    layout: { row: 0, col: 6, width: 6, height: 3 },
    roles: ['platform_admin'],
  },
  {
    widgetId: 'obs_error_rate',
    type: 'bar_chart',
    title: 'Error Rate by Service',
    description: 'Error count per service module',
    dataSource: 'observability:error_count',
    refreshIntervalMs: 300_000,
    layout: { row: 3, col: 0, width: 6, height: 3 },
    roles: ['platform_admin'],
  },
  {
    widgetId: 'obs_memory_violations',
    type: 'status_badge',
    title: 'Memory Boundary Status',
    description: 'Memory-boundary violation alerts from Pack 14',
    dataSource: 'observability:memory_boundary_violation',
    refreshIntervalMs: 60_000,
    layout: { row: 3, col: 6, width: 6, height: 3 },
    roles: ['platform_admin'],
  },
];

// ── Role-specific dashboard configurations ──────────────────────────────────────

const ROLE_DASHBOARD_CONFIGS: Record<DashboardRole, { widgets: string[]; label: string }> = {
  platform_admin: {
    label: 'Platform Admin Analytics',
    widgets: [
      'kpi_schedule_variance',
      'kpi_cost_to_complete',
      'kpi_defect_liability',
      'kpi_retention_release',
      'kpi_compliance_gaps',
      'alert_list',
      'obs_request_count',
      'obs_latency',
      'obs_error_rate',
      'obs_memory_violations',
    ],
  },
  principal_agent: {
    label: 'Professional Analytics',
    widgets: [
      'kpi_schedule_variance',
      'kpi_cost_to_complete',
      'kpi_defect_liability',
      'kpi_retention_release',
      'kpi_compliance_gaps',
      'alert_list',
    ],
  },
  client: {
    label: 'Project Analytics',
    widgets: [
      'kpi_schedule_variance',
      'kpi_cost_to_complete',
      'kpi_retention_release',
      'alert_list',
    ],
  },
  contractor: {
    label: 'Site Analytics',
    widgets: [
      'kpi_defect_liability',
      'kpi_retention_release',
    ],
  },
};

// ── All widget blueprints registry ──────────────────────────────────────────────

const ALL_WIDGETS: WidgetBlueprint[] = [...KPI_WIDGET_BLUEPRINTS, ...OBSERVABILITY_WIDGETS];
const WIDGET_MAP = new Map<string, WidgetBlueprint>(ALL_WIDGETS.map((w) => [w.widgetId, w]));

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Build a complete dashboard payload for a given role.
 * Resolves KPI data into widget payloads.
 */
export function buildDashboard(
  role: DashboardRole,
  options?: {
    kpiData?: Record<string, KPIResult>;
    alertCount?: number;
    observabilityData?: Record<string, unknown>;
    customWidgets?: DashboardWidget[];
  },
): DashboardPayload {
  const config = ROLE_DASHBOARD_CONFIGS[role];
  const widgets: DashboardWidget[] = [];
  const data: Record<string, unknown> = {};

  for (const widgetId of config.widgets) {
    const blueprint = WIDGET_MAP.get(widgetId);
    if (!blueprint) continue;

    const widget: DashboardWidget = {
      widgetId: blueprint.widgetId,
      type: blueprint.type,
      title: blueprint.title,
      description: blueprint.description,
      dataSource: blueprint.dataSource,
      refreshIntervalMs: blueprint.refreshIntervalMs,
      visibleToRoles: blueprint.roles,
      layout: { ...blueprint.layout },
    };

    widgets.push(widget);

    // Attach resolved data
    if (blueprint.dataSource.startsWith('kpi:') && options?.kpiData) {
      const kpiName = blueprint.dataSource.replace('kpi:', '');
      data[widgetId] = options.kpiData[kpiName] ?? null;
    } else if (blueprint.dataSource.startsWith('alerts:') && options?.alertCount !== undefined) {
      data[widgetId] = { count: options.alertCount, type: 'alert_list' };
    } else if (blueprint.dataSource.startsWith('observability:') && options?.observabilityData) {
      const metricKey = blueprint.dataSource.replace('observability:', '');
      data[widgetId] = options.observabilityData[metricKey] ?? null;
    }
  }

  // Append any custom widgets
  if (options?.customWidgets) {
    for (const w of options.customWidgets) {
      widgets.push(w);
      data[w.widgetId] = w.config ?? null;
    }
  }

  return {
    role,
    generatedAt: new Date().toISOString(),
    widgets,
    data,
  };
}

/**
 * Get available widget blueprints for a role.
 */
export function getAvailableWidgets(role: DashboardRole): WidgetBlueprint[] {
  return ALL_WIDGETS.filter((w) => w.roles.includes(role));
}

/**
 * Get the role-specific dashboard configuration.
 */
export function getDashboardConfig(role: DashboardRole) {
  return ROLE_DASHBOARD_CONFIGS[role];
}

/**
 * Build a custom widget layout by overriding default positions.
 */
export function buildCustomLayout(
  widgets: DashboardWidget[],
  layoutOverrides: Record<string, Partial<DashboardWidget['layout']>>,
): DashboardWidget[] {
  return widgets.map((w) => {
    const override = layoutOverrides[w.widgetId];
    if (override) {
      return { ...w, layout: { ...w.layout, ...override } };
    }
    return w;
  });
}

/**
 * Check if a dashboard needs refresh based on widget refresh intervals.
 */
export function needsRefresh(
  lastGeneratedAt: string,
  widgets: DashboardWidget[],
): boolean {
  const lastTime = new Date(lastGeneratedAt).getTime();
  const now = Date.now();

  // Dashboard needs refresh if any widget's refresh interval has elapsed
  return widgets.some((w) => {
    if (w.refreshIntervalMs === 0) return false; // Static widget
    return now - lastTime >= w.refreshIntervalMs;
  });
}
