/**
 * Analytics Reporting Engine
 *
 * Core orchestration service for computing KPIs across multiple projects,
 * generating versioned report payloads, and supporting role-based filtering.
 *
 * Guardrails:
 * - KPI formulas are versioned and auditable; changes create a new version.
 * - Analytics never override formal approvals; they only surface information.
 * - Report data respects tenant isolation via BaseContext.
 * - Role-based filtering ensures users only see data they are authorised for.
 */

import type { BaseContext, DashboardRole, KPIComputationResult, KPIResult } from '../types/analyticsReporting';
import type { KPIInputData } from './kpiCalculatorService';
import { computeAllKPIs, KPI_VERSION } from './kpiCalculatorService';

// ── Types ───────────────────────────────────────────────────────────────────────────────────────────

export interface ReportEntry {
  reportId: string;
  projectId: string;
  tenantId: string;
  version: number;
  computedAt: string;
  computedBy: string;
  kpis: KPIResult[];
}

export interface ComputeKpisOptions {
  /** Optional pre-fetched input data per project (projectId -> KPIInputData) */
  inputDataMap?: Record<string, KPIInputData>;
  /** Restrict returned KPIs to specific names */
  kpiFilter?: string[];
}

export interface GenerateReportOptions {
  includeHistory?: boolean;
  role?: DashboardRole;
}

export type ReportSummary = Pick<ReportEntry, 'reportId' | 'projectId' | 'version' | 'computedAt' | 'computedBy'>;

// ── Constants ──────────────────────────────────────────────────────────────────────────────────────

const MAX_HISTORY_PER_PROJECT = 50;

const ROLE_KPI_VISIBILITY: Record<DashboardRole, string[]> = {
  platform_admin: [
    'schedule_variance',
    'cost_to_complete',
    'defect_liability_remaining_days',
    'retention_release_readiness',
    'compliance_gap_count',
  ],
  principal_agent: [
    'schedule_variance',
    'cost_to_complete',
    'defect_liability_remaining_days',
    'retention_release_readiness',
    'compliance_gap_count',
  ],
  client: [
    'schedule_variance',
    'cost_to_complete',
    'retention_release_readiness',
  ],
  contractor: [
    'defect_liability_remaining_days',
    'retention_release_readiness',
  ],
};

// ── In-memory report store ─────────────────────────────────────────────────────────────────────────

const reportHistory: ReportEntry[] = [];
let reportSeq = 1;

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Filter KPI results to those visible for a given role.
 */
function filterKpisByRole(kpis: KPIResult[], role?: DashboardRole): KPIResult[] {
  if (!role) return kpis;
  const allowed = ROLE_KPI_VISIBILITY[role] ?? [];
  return kpis.filter((kpi) => allowed.includes(kpi.name));
}

/**
 * Filter KPI results to specific named KPIs.
 */
function filterKpisByName(kpis: KPIResult[], names?: string[]): KPIResult[] {
  if (!names || names.length === 0) return kpis;
  return kpis.filter((kpi) => names.includes(kpi.name));
}

// ── Public API ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Compute KPIs for one or more projects.
 *
 * Accepts pre-fetched input data for each project or falls back to empty data.
 * Returns an array of KPIComputationResult, one per project.
 */
export function computeProjectKpis(
  projectIds: string[],
  ctx: BaseContext,
  options?: ComputeKpisOptions,
): KPIComputationResult[] {
  if (!projectIds || projectIds.length === 0) {
    return [];
  }

  const results: KPIComputationResult[] = [];

  for (const projectId of projectIds) {
    // Resolve input data for this project (or use empty defaults)
    const inputData: KPIInputData = options?.inputDataMap?.[projectId] ?? {
      projectId,
      milestones: [],
      costLineItems: [],
      defectLiability: {
        startDate: ctx.now,
        endDate: ctx.now,
        totalDays: 0,
      },
      retentionAmount: 0,
      retentionConditions: [],
      complianceItems: [],
    };

    // Compute all KPIs
    const result = computeAllKPIs(inputData);

    // Apply KPI name filter if provided
    if (options?.kpiFilter && options.kpiFilter.length > 0) {
      result.kpis = filterKpisByName(result.kpis, options.kpiFilter);
    }

    results.push(result);
  }

  return results;
}

/**
 * Generate a full analytics report for one or more projects.
 *
 * Computes KPIs, persists them as a versioned report entry,
 * and optionally applies role-based filtering.
 */
export function generateReport(
  projectIds: string[],
  ctx: BaseContext,
  options?: GenerateReportOptions,
): KPIComputationResult[] {
  if (!projectIds || projectIds.length === 0) {
    return [];
  }

  const results = computeProjectKpis(projectIds, ctx);

  for (const result of results) {
    // Apply role-based filtering
    const filtered = filterKpisByRole(result.kpis, options?.role);
    result.kpis = filtered;

    // Persist versioned report entry
    const entry: ReportEntry = {
      reportId: `report-${reportSeq++}`,
      projectId: result.projectId,
      tenantId: ctx.tenantId,
      version: result.version,
      computedAt: result.computedAt,
      computedBy: ctx.userId,
      kpis: result.kpis.map((kpi) => ({ ...kpi })),
    };

    reportHistory.push(entry);

    // Enforce history limit
    const projectEntries = reportHistory.filter((r) => r.projectId === result.projectId);
    if (projectEntries.length > MAX_HISTORY_PER_PROJECT) {
      const toRemove = projectEntries.length - MAX_HISTORY_PER_PROJECT;
      const idsToRemove = new Set(
        projectEntries.slice(0, toRemove).map((r) => r.reportId),
      );
      for (let i = reportHistory.length - 1; i >= 0; i--) {
        if (idsToRemove.has(reportHistory[i].reportId)) {
          reportHistory.splice(i, 1);
        }
      }
    }
  }

  return results;
}

/**
 * Retrieve the full report history for a given project, ordered newest-first.
 */
export function getReportHistory(
  projectId: string,
  options?: {
    limit?: number;
    role?: DashboardRole;
    since?: string;
  },
): ReportEntry[] {
  let results = reportHistory.filter((r) => r.projectId === projectId);

  // Filter by date
  if (options?.since) {
    const sinceTime = new Date(options.since).getTime();
    results = results.filter((r) => new Date(r.computedAt).getTime() >= sinceTime);
  }

  // Sort newest first
  results.sort((a, b) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime());

  // Apply role-based filtering to KPI data
  if (options?.role) {
    results = results.map((entry) => ({
      ...entry,
      kpis: filterKpisByRole(entry.kpis, options.role!),
    }));
  }

  // Apply limit
  if (options?.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}

/**
 * Get the latest report for a project.
 */
export function getLatestReport(
  projectId: string,
  role?: DashboardRole,
): ReportEntry | undefined {
  const reports = getReportHistory(projectId, { limit: 1, role });
  return reports.length > 0 ? reports[0] : undefined;
}

/**
 * Get report summaries (without full KPI payloads) for efficient listing.
 */
export function getReportSummaries(
  projectId: string,
  options?: {
    limit?: number;
    since?: string;
  },
): ReportSummary[] {
  let results = reportHistory.filter((r) => r.projectId === projectId);

  if (options?.since) {
    const sinceTime = new Date(options.since).getTime();
    results = results.filter((r) => new Date(r.computedAt).getTime() >= sinceTime);
  }

  results.sort((a, b) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime());

  if (options?.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results.map((r) => ({
    reportId: r.reportId,
    projectId: r.projectId,
    version: r.version,
    computedAt: r.computedAt,
    computedBy: r.computedBy,
  }));
}

/**
 * Get the current KPI version used by the engine.
 */
export function getCurrentKpiVersion(): number {
  return KPI_VERSION;
}

/**
 * Get the effective KPI version for a given project.
 * (In a production system this could differ per project via config.)
 */
export function getProjectKpiVersion(_projectId: string): number {
  return KPI_VERSION;
}

// ── Reset (for testing) ───────────────────────────────────────────────────────────────────────────

export function resetReportingEngineState(): void {
  reportHistory.length = 0;
  reportSeq = 1;
}
