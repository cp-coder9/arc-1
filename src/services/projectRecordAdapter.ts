/**
 * ProjectRecord Adapter
 *
 * Converts WorkflowRecords into full ProjectRecords and stores KPI metrics
 * as immutable kpi_metric records (recordType='kpi_metric') attached to ProjectRecords.
 */

import type { BaseContext, WorkflowRecord } from '../types/analyticsReporting';
import type { KPIMetric, KPIName, KPIResult } from '../types/analyticsReporting';

export interface ProjectRecord {
  recordId: string;
  tenantId: string;
  projectId: string;
  moduleKey: string;
  recordType: string;
  title: string;
  status: string;
  payload: WorkflowRecord;
  linkedRecordIds: string[];
  audit: {
    createdBy: string;
    createdAt: string;
  };
}

let seq = 1;
const projectRecords: ProjectRecord[] = [];
const kpiMetrics: KPIMetric[] = [];
let kpiSeq = 1;

/**
 * Convert a WorkflowRecord into a ProjectRecord.
 */
export function toProjectRecord(
  ctx: BaseContext,
  record: WorkflowRecord,
  linked: string[] = [],
): ProjectRecord {
  const projectRecord: ProjectRecord = {
    recordId: `project-record-${seq++}`,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    moduleKey: 'analytics_reporting',
    recordType: record.type,
    title: record.title,
    status: record.status,
    payload: record,
    linkedRecordIds: linked,
    audit: {
      createdBy: ctx.userId,
      createdAt: ctx.now || new Date().toISOString(),
    },
  };

  projectRecords.push(projectRecord);
  return projectRecord;
}

/**
 * Store a KPI result as an immutable kpi_metric record.
 */
export function storeKPIMetric(params: {
  name: KPIName;
  label: string;
  value: number;
  unit: string;
  calculationSource: string;
  projectId: string;
  tenantId: string;
  recordedBy: string;
  version?: number;
  metadata?: Record<string, unknown>;
}): KPIMetric {
  const metric: KPIMetric = {
    metricId: `kpi-metric-${kpiSeq++}`,
    name: params.name,
    label: params.label,
    value: params.value,
    unit: params.unit,
    version: params.version || 1,
    calculationSource: params.calculationSource,
    projectId: params.projectId,
    tenantId: params.tenantId,
    recordedAt: new Date().toISOString(),
    recordedBy: params.recordedBy,
    metadata: params.metadata,
    immutable: true,
  };

  kpiMetrics.push(metric);
  return metric;
}

/**
 * Store all KPIs from a computation result as immutable records.
 */
export function storeAllKPIMetrics(
  kpiResults: KPIResult[],
  ctx: BaseContext,
): KPIMetric[] {
  return kpiResults.map((kpi) =>
    storeKPIMetric({
      name: kpi.name,
      label: kpi.label,
      value: typeof kpi === 'object' ? (kpi as unknown as Record<string, unknown>).value as number || 0 : 0,
      unit: kpi.unit,
      calculationSource: `kpiCalculatorService.computeAllKPIs`,
      projectId: ctx.projectId,
      tenantId: ctx.tenantId,
      recordedBy: ctx.userId,
    }),
  );
}

/**
 * Get KPI metrics for a project.
 */
export function getKPIMetrics(options: {
  projectId?: string;
  tenantId?: string;
  name?: KPIName;
  since?: string;
  limit?: number;
}): KPIMetric[] {
  let filtered = [...kpiMetrics];

  if (options.projectId) {
    filtered = filtered.filter((m) => m.projectId === options.projectId);
  }
  if (options.tenantId) {
    filtered = filtered.filter((m) => m.tenantId === options.tenantId);
  }
  if (options.name) {
    filtered = filtered.filter((m) => m.name === options.name);
  }
  if (options.since) {
    const sinceDate = new Date(options.since).getTime();
    filtered = filtered.filter((m) => new Date(m.recordedAt).getTime() >= sinceDate);
  }
  if (options.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered.sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
  );
}

/**
 * Get a ProjectRecord by ID.
 */
export function getProjectRecord(recordId: string): ProjectRecord | undefined {
  return projectRecords.find((r) => r.recordId === recordId);
}

/**
 * Get all ProjectRecords for a given project.
 */
export function getProjectRecords(projectId: string): ProjectRecord[] {
  return projectRecords.filter((r) => r.projectId === projectId);
}

// ── Reset (for testing) ─────────────────────────────────────────────────────────

export function resetProjectRecordState(): void {
  projectRecords.length = 0;
  kpiMetrics.length = 0;
  seq = 1;
  kpiSeq = 1;
}
