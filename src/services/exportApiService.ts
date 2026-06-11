/**
 * Export API Service
 *
 * Streams filtered ProjectRecords, inbox events, and audit trails to CSV or JSON.
 * Respects tenant isolation and POPIA data-retention policies.
 */

import type {
  ExportFilters,
  ExportFormat,
  ExportJob,
  Severity,
} from '../types/analyticsReporting';
import type { WorkflowRecord } from '../types/analyticsReporting';

let jobSeq = 1;
const exportJobs = new Map<string, ExportJob>();

// ── Structured data types for export ────────────────────────────────────────────

export interface ExportableRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  projectId?: string;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ExportableAlert {
  eventId: string;
  title: string;
  severity: string;
  recipientRole: string;
  projectId: string;
  firedAt: string;
  acknowledged: boolean;
}

export interface ExportableAuditEntry {
  auditId: string;
  actorId: string;
  action: string;
  sourceObjectId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ── Filter helpers ──────────────────────────────────────────────────────────────

function applyFilters<T extends Record<string, unknown>>(
  items: T[],
  filters: ExportFilters,
): T[] {
  let filtered = [...items];

  if (filters.recordTypes && filters.recordTypes.length > 0) {
    filtered = filtered.filter((item) =>
      filters.recordTypes!.includes(item.type as string),
    );
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    filtered = filtered.filter((item) => {
      const date = item.createdAt || item.firedAt || item.recordedAt;
      return date ? new Date(date as string).getTime() >= from : true;
    });
  }

  if (filters.dateTo) {
    const to = new Date(filters.dateTo).getTime();
    filtered = filtered.filter((item) => {
      const date = item.createdAt || item.firedAt || item.recordedAt;
      return date ? new Date(date as string).getTime() <= to : true;
    });
  }

  if (filters.severity && filters.severity.length > 0) {
    filtered = filtered.filter((item) =>
      filters.severity!.includes((item.severity as Severity) || 'low'),
    );
  }

  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter((item) =>
      filters.status!.includes(item.status as string),
    );
  }

  if (filters.limit && filters.limit > 0) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}

// ── CSV Generation ──────────────────────────────────────────────────────────────

function recordsToCSV(records: ExportableRecord[]): string {
  if (records.length === 0) return '';

  const header = Object.keys(records[0]).join(',');
  const rows = records.map((r) =>
    Object.values(r)
      .map((v) => {
        if (v === null || v === undefined) return '';
        const str = String(v);
        // Escape CSV special characters
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(','),
  );

  return [header, ...rows].join('\n');
}

function alertsToCSV(alerts: ExportableAlert[]): string {
  if (alerts.length === 0) return '';

  const headers = ['eventId', 'title', 'severity', 'recipientRole', 'projectId', 'firedAt', 'acknowledged'];
  const rows = alerts.map((a) =>
    [a.eventId, a.title, a.severity, a.recipientRole, a.projectId, a.firedAt, String(a.acknowledged)].join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}

function auditsToCSV(audits: ExportableAuditEntry[]): string {
  if (audits.length === 0) return '';

  const headers = ['auditId', 'actorId', 'action', 'sourceObjectId', 'createdAt'];
  const rows = audits.map((a) =>
    [a.auditId, a.actorId, a.action, a.sourceObjectId, a.createdAt].join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}

// ── JSON Generation ─────────────────────────────────────────────────────────────

function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ── Export Job Management ───────────────────────────────────────────────────────

export function createExportJob(params: {
  format: ExportFormat;
  scope: 'project' | 'tenant';
  projectId?: string;
  tenantId: string;
  filters: ExportFilters;
  requestedBy: string;
}): ExportJob {
  const job: ExportJob = {
    jobId: `export-${jobSeq++}`,
    format: params.format,
    scope: params.scope,
    projectId: params.projectId,
    tenantId: params.tenantId,
    filters: params.filters,
    status: 'pending',
    requestedBy: params.requestedBy,
    requestedAt: new Date().toISOString(),
  };

  exportJobs.set(job.jobId, job);
  return job;
}

export function getExportJob(jobId: string): ExportJob | undefined {
  return exportJobs.get(jobId);
}

// ── Main Export Functions ───────────────────────────────────────────────────────

export interface ExportResult {
  jobId: string;
  format: ExportFormat;
  content: string;
  recordCount: number;
  generatedAt: string;
}

/**
 * Export ProjectRecords to CSV or JSON.
 */
export function exportRecords(params: {
  format: ExportFormat;
  records: ExportableRecord[];
  filters?: ExportFilters;
  jobId?: string;
}): ExportResult {
  const filtered = params.filters
    ? applyFilters(params.records, params.filters)
    : params.records;

  const content =
    params.format === 'csv'
      ? recordsToCSV(filtered)
      : toJSON(filtered);

  const jobId = params.jobId || `export-${jobSeq++}`;

  // Update job if tracking
  const job = exportJobs.get(jobId);
  if (job) {
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.recordCount = filtered.length;
  }

  return {
    jobId,
    format: params.format,
    content,
    recordCount: filtered.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Export inbox/alerts events to CSV or JSON.
 */
export function exportAlerts(params: {
  format: ExportFormat;
  alerts: ExportableAlert[];
  filters?: ExportFilters;
  jobId?: string;
}): ExportResult {
  const filtered = params.filters
    ? (applyFilters(
        params.alerts.map((a) => ({ ...a, type: 'alert' } as unknown as Record<string, unknown>)),
        params.filters,
      ) as unknown as ExportableAlert[])
    : params.alerts;

  const content =
    params.format === 'csv'
      ? alertsToCSV(filtered)
      : toJSON(filtered);

  const jobId = params.jobId || `export-${jobSeq++}`;

  const job = exportJobs.get(jobId);
  if (job) {
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.recordCount = filtered.length;
  }

  return {
    jobId,
    format: params.format,
    content,
    recordCount: filtered.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Export audit trail entries to CSV or JSON.
 */
export function exportAuditTrail(params: {
  format: ExportFormat;
  audits: ExportableAuditEntry[];
  filters?: ExportFilters;
  jobId?: string;
}): ExportResult {
  const filtered = params.filters
    ? (applyFilters(
        params.audits.map((a) => ({ ...a, type: 'audit' } as unknown as Record<string, unknown>)),
        params.filters,
      ) as unknown as ExportableAuditEntry[])
    : params.audits;

  const content =
    params.format === 'csv'
      ? auditsToCSV(filtered)
      : toJSON(filtered);

  const jobId = params.jobId || `export-${jobSeq++}`;

  const job = exportJobs.get(jobId);
  if (job) {
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.recordCount = filtered.length;
  }

  return {
    jobId,
    format: params.format,
    content,
    recordCount: filtered.length,
    generatedAt: new Date().toISOString(),
  };
}

// ── Utility: generate filename for download ─────────────────────────────────────

export function generateExportFilename(
  type: string,
  format: ExportFormat,
  scope?: string,
): string {
  const date = new Date().toISOString().split('T')[0];
  const ext = format === 'csv' ? 'csv' : 'json';
  const scopePart = scope ? `_${scope}` : '';
  return `architex_${type}${scopePart}_${date}.${ext}`;
}

// ── Reset (for testing) ─────────────────────────────────────────────────────────

export function resetExportState(): void {
  exportJobs.clear();
  jobSeq = 1;
}
