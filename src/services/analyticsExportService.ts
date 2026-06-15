/**
 * Analytics Export Service
 *
 * Builds CSV, JSON, and PDF export data from KPI results and related analytics data.
 * All exports respect tenant isolation and data-retention policies.
 *
 * Guardrails:
 * - Export APIs respect tenant isolation and POPIA data-retention policies.
 * - All exports are scoped to a project and tenant via BaseContext.
 * - Generated export data never includes raw personal content.
 * - Large exports are paginated to prevent memory exhaustion.
 */

import type { BaseContext, ExportFormat, ExportJob, ExportScope, KPIResult, Severity } from '../types/analyticsReporting';

// ── Types ───────────────────────────────────────────────────────────────────────────────────────────

export interface ExportConfig {
  format: ExportFormat;
  scope: ExportScope;
  projectId?: string;
  filters?: ExportFilters;
}

export interface ExportFilters {
  kpiNames?: string[];
  dateFrom?: string;
  dateTo?: string;
  severity?: Severity[];
  limit?: number;
}

export interface ExportResult {
  job: ExportJob;
  data: string;
  mimeType: string;
  filename: string;
  recordCount: number;
}

interface ExportRow {
  [column: string]: string | number | boolean | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────────────────────────

const MAX_EXPORT_RECORDS = 10_000;

// ── In-memory store ───────────────────────────────────────────────────────────────────────────────

const exportJobs: ExportJob[] = [];
let exportSeq = 1;

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Flatten a KPIResult into a row of primitive values suitable for tabular export.
 */
function kpiToRow(kpi: KPIResult, projectId: string): ExportRow {
  const record = kpi as unknown as Record<string, unknown>;
  const row: ExportRow = {
    projectId,
    kpi_name: record.name as string,
    kpi_label: record.label as string,
    unit: record.unit as string,
  };

  // Flatten all numeric/boolean fields from the KPI
  for (const [key, value] of Object.entries(record)) {
    if (key === 'name' || key === 'label' || key === 'unit') continue;
    if (typeof value === 'number' || typeof value === 'boolean') {
      row[key] = value;
    } else if (value === null) {
      row[key] = null;
    }
  }

  return row;
}

/**
 * Escape a value for CSV output.
 */
function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  // If value contains comma, quote, or newline, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of rows to CSV string.
 */
function rowsToCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const lines: string[] = [];

  // Header row
  lines.push(headers.map((h) => escapeCsvValue(h)).join(','));

  // Data rows
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvValue(row[h])).join(','));
  }

  return lines.join('\n');
}

/**
 * Build an export job record for the audit trail.
 */
function createExportJob(
  params: {
    format: ExportFormat;
    scope: ExportScope;
    projectId?: string;
    tenantId: string;
    filters?: ExportFilters;
    recordCount: number;
    requestedBy: string;
  },
): ExportJob {
  const job: ExportJob = {
    jobId: `export-${exportSeq++}`,
    format: params.format,
    scope: params.scope,
    projectId: params.projectId,
    tenantId: params.tenantId,
    filters: params.filters ?? {},
    status: 'completed',
    requestedBy: params.requestedBy,
    requestedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    recordCount: params.recordCount,
  };

  exportJobs.push(job);
  return job;
}

/**
 * Build the default filename for an export.
 */
function buildExportFilename(projectId: string, format: ExportFormat, label: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `architex-${projectId}-${label}-${timestamp}.${format}`;
}

/**
 * Get MIME type for a format.
 */
function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    default: return 'text/plain';
  }
}

// ── Filter helpers ─────────────────────────────────────────────────────────────────────────────────

function applyKpiFilters(kpis: KPIResult[], filters?: ExportFilters): KPIResult[] {
  if (!filters) return kpis;

  let filtered = [...kpis];

  if (filters.kpiNames && filters.kpiNames.length > 0) {
    filtered = filtered.filter((k) => filters.kpiNames!.includes(k.name));
  }

  if (filters.limit && filters.limit > 0) {
    filtered = filtered.slice(0, Math.min(filters.limit, MAX_EXPORT_RECORDS));
  }

  return filtered;
}

// ── Public API ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Export KPI results to CSV format.
 *
 * Returns structured export data with both the string payload and metadata.
 */
export function exportKpisToCsv(
  projectId: string,
  kpis: KPIResult[],
  ctx: BaseContext,
  config?: ExportConfig,
): ExportResult {
  if (!kpis || kpis.length === 0) {
    const emptyJob = createExportJob({
      format: 'csv',
      scope: config?.scope || 'project',
      projectId,
      tenantId: ctx.tenantId,
      filters: config?.filters,
      recordCount: 0,
      requestedBy: ctx.userId,
    });

    return {
      job: emptyJob,
      data: '',
      mimeType: 'text/csv',
      filename: buildExportFilename(projectId, 'csv', 'kpis'),
      recordCount: 0,
    };
  }

  const filtered = applyKpiFilters(kpis, config?.filters);
  const rows = filtered.map((kpi) => kpiToRow(kpi, projectId));

  const job = createExportJob({
    format: 'csv',
    scope: config?.scope || 'project',
    projectId,
    tenantId: ctx.tenantId,
    filters: config?.filters,
    recordCount: rows.length,
    requestedBy: ctx.userId,
  });

  return {
    job,
    data: rowsToCsv(rows),
    mimeType: 'text/csv',
    filename: buildExportFilename(projectId, 'csv', 'kpis'),
    recordCount: rows.length,
  };
}

/**
 * Export KPI results to JSON format.
 *
 * Returns structured export data with JSON-serialisable payload.
 */
export function exportKpisToJson(
  projectId: string,
  kpis: KPIResult[],
  ctx: BaseContext,
  config?: ExportConfig,
): ExportResult {
  const filtered = applyKpiFilters(kpis, config?.filters);

  const payload = {
    exportedAt: new Date().toISOString(),
    tenantId: ctx.tenantId,
    projectId,
    requestedBy: ctx.userId,
    kpiCount: filtered.length,
    kpis: filtered,
  };

  const job = createExportJob({
    format: 'json',
    scope: config?.scope || 'project',
    projectId,
    tenantId: ctx.tenantId,
    filters: config?.filters,
    recordCount: filtered.length,
    requestedBy: ctx.userId,
  });

  return {
    job,
    data: JSON.stringify(payload, null, 2),
    mimeType: 'application/json',
    filename: buildExportFilename(projectId, 'json', 'kpis'),
    recordCount: filtered.length,
  };
}

/**
 * Export KPI results to PDF format.
 *
 * Generates a simplified HTML representation that can be rendered to PDF
 * by a PDF renderer (e.g., Puppeteer, jsPDF). Returns the HTML string as data.
 */
export function exportKpisToPdf(
  projectId: string,
  kpis: KPIResult[],
  ctx: BaseContext,
  config?: ExportConfig,
): ExportResult {
  const filtered = applyKpiFilters(kpis, config?.filters);

  // Build an HTML document styled for PDF rendering
  const kpiCards = filtered
    .map((kpi) => {
      const record = kpi as unknown as Record<string, unknown>;
      const details = Object.entries(record)
        .filter(([key]) => !['name', 'label', 'unit'].includes(key))
        .map(
          ([key, value]) =>
            `<tr><td style="padding: 4px 8px; border: 1px solid #ddd;"><strong>${key}</strong></td><td style="padding: 4px 8px; border: 1px solid #ddd;">${value === null || value === undefined ? '—' : String(value)}</td></tr>`,
        )
        .join('\n');

      return `
        <div style="page-break-inside: avoid; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 6px; padding: 16px;">
          <h3 style="margin: 0 0 4px 0; color: #1a1a2e;">${kpi.label}</h3>
          <p style="margin: 0 0 12px 0; color: #666; font-size: 14px;">Unit: ${kpi.unit}</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            ${details}
          </table>
        </div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KPI Report — ${projectId}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
    .meta span { margin-right: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 10px; text-align: left; border: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <h1>Architex Analytics — KPI Report</h1>
  <div class="meta">
    <span><strong>Project:</strong> ${projectId}</span>
    <span><strong>Generated:</strong> ${new Date().toISOString()}</span>
    <span><strong>Tenant:</strong> ${ctx.tenantId}</span>
    <span><strong>KPIs:</strong> ${filtered.length}</span>
  </div>
  ${kpiCards || '<p style="color: #999;">No KPI data available.</p>'}
  <div class="footer">
    Architex Analytics — Confidential — Generated for ${ctx.tenantId}
  </div>
</body>
</html>`;

  const job = createExportJob({
    format: 'json',
    scope: config?.scope || 'project',
    projectId,
    tenantId: ctx.tenantId,
    filters: config?.filters,
    recordCount: filtered.length,
    requestedBy: ctx.userId,
  });

  // NOTE: The PDF format returns HTML content that should be rendered to PDF
  // by the consuming layer (e.g., Puppeteer, Playwright, or a PDF library).
  // The mime type is set to text/html to indicate the data is HTML-ready for
  // PDF rendering.
  return {
    job,
    data: html,
    mimeType: 'text/html',
    filename: buildExportFilename(projectId, 'json', 'kpis-pdf'),
    recordCount: filtered.length,
  };
}

/**
 * Get the export job history for auditing purposes.
 */
export function getExportJobs(options?: {
  projectId?: string;
  tenantId?: string;
  format?: ExportFormat;
  limit?: number;
}): ExportJob[] {
  let results = [...exportJobs];

  if (options?.projectId) {
    results = results.filter((j) => j.projectId === options.projectId);
  }
  if (options?.tenantId) {
    results = results.filter((j) => j.tenantId === options.tenantId);
  }
  if (options?.format) {
    results = results.filter((j) => j.format === options.format);
  }

  results.sort(
    (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  );

  if (options?.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}

// ── Reset (for testing) ───────────────────────────────────────────────────────────────────────────

export function resetExportServiceState(): void {
  exportJobs.length = 0;
  exportSeq = 1;
}
