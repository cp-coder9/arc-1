import { createId, iso } from './ids';
import type { ExportRecord, ProjectAssignment, ToolRun } from './types';
import type { CalculationResult, CalculatorDefinition } from '@/services/toolbox/types';
import { formatZAR } from './zaFormatting';

/**
 * Context provided to the HTML export renderer for user/project attribution.
 */
export interface ExportContext {
  userName: string;
  userRole: string;
  projectAssignment: ProjectAssignment;
}

/**
 * Filename pattern for export files: {toolId}_{runId}_{timestamp}.{ext}
 * - toolId: the tool identifier from the registry
 * - runId: the unique run identifier
 * - timestamp: ISO 8601 UTC timestamp (colons replaced with dashes for filesystem safety)
 * - ext: file extension matching the format (json, csv, html)
 */
export const EXPORT_FILENAME_PATTERN = '{toolId}_{runId}_{timestamp}.{ext}';

export class ExportService {
  /**
   * Produces a JSON ExportRecord containing the full ToolRun data —
   * input, output, metadata, assignment, audit info, and timestamps.
   * Requirements: 4.1, 4.5
   */
  createJson(run: ToolRun): ExportRecord {
    const exportPayload = {
      id: run.id,
      tenantId: run.tenantId,
      userId: run.userId,
      toolId: run.toolId,
      toolVersion: run.toolVersion,
      role: run.role,
      status: run.status,
      assignment: run.assignment,
      input: run.input,
      output: run.output,
      error: run.error,
      auditSnapshot: run.auditSnapshot,
      locked: run.locked,
      previewDisclaimer: run.previewDisclaimer,
      supersedesRunId: run.supersedesRunId,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      issuedAt: run.issuedAt,
    };
    return this.record(run, 'json', 'application/json', JSON.stringify(exportPayload, null, 2));
  }

  /**
   * Produces a CSV ExportRecord. When the ToolRun output has lineResults (schedule-based tools),
   * produces a header row + one data row per line item with numeric results.
   * Includes a "section" column for JBCC/GCC section references (from aggregates or definition source).
   * Falls back to field/value pairs for non-schedule tools.
   * Requirements: 4.3, 4.4, 4.5
   */
  createCsv(run: ToolRun, definition?: CalculatorDefinition): ExportRecord {
    const output = run.output as CalculationResult | undefined;

    // Detect schedule-based output (has lineResults with at least one row)
    if (output && Array.isArray(output.lineResults) && output.lineResults.length > 0) {
      return this.record(run, 'csv', 'text/csv', this.buildScheduleCsv(run, output, definition));
    }

    // Fallback: field/value pairs for non-schedule tools
    return this.record(run, 'csv', 'text/csv', this.buildFallbackCsv(run));
  }

  createPrintableHtml(run: ToolRun, title: string): ExportRecord {
    const body = escapeHtml(JSON.stringify({ input: run.input, output: run.output }, null, 2));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#0f172a}h1{color:#0f4c81}.card{border:1px solid #cbd5e1;border-radius:12px;padding:16px;margin:12px 0}pre{white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px}@media print{button{display:none}}</style></head><body><button onclick="print()">Print / PDF</button><h1>${escapeHtml(title)}</h1><div class="card"><b>Run:</b> ${run.id}<br><b>Tool:</b> ${run.toolId} v${run.toolVersion}<br><b>Status:</b> ${run.status}<br><b>Audit:</b> ${run.auditSnapshot?.hash ?? 'not issued'}</div><div class="card"><pre>${body}</pre></div></body></html>`;
    return this.record(run, 'html', 'text/html', html);
  }

  /**
   * Produces a branded HTML ExportRecord with full Architex branding.
   * Uses the definition's reportTemplateId and includes:
   * - Header: Architex branding, tool name, run date
   * - Context: user name/role, project assignment
   * - Input parameters table
   * - Results: lineResults table + aggregates summary
   * - Clause outcomes: pass/fail/advisory table with clauseRef citations
   * - Source versions: table id, version, effectiveFrom, status
   * - Standard disclaimer
   *
   * Monetary values are formatted using formatZAR (en-ZA locale).
   * Requirements: 4.2, 8.6, 9.5, 9.6
   */
  createHtml(run: ToolRun, definition: CalculatorDefinition, context: ExportContext): ExportRecord {
    const output = run.output as CalculationResult | undefined;
    const runDate = run.createdAt ? new Date(run.createdAt).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) : 'N/A';

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(definition.title)} — Architex Report</title>
<style>
:root {
  --teal: #19B7B0;
  --deep: #167E79;
  --ink: #102033;
  --muted: #657287;
  --border: rgba(16,32,51,.09);
  --aqua: #DFF5F2;
  --green: #4ADE80;
  --amber: #F5A623;
  --red: #d95747;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Geist", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--ink);
  line-height: 1.5;
  padding: 40px;
  max-width: 900px;
  margin: 0 auto;
  background: #fff;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid var(--teal);
  padding-bottom: 16px;
  margin-bottom: 32px;
}
.header .brand {
  font-size: 22px;
  font-weight: 700;
  color: var(--teal);
  letter-spacing: -0.5px;
}
.header .brand span {
  color: var(--ink);
}
.header .meta {
  text-align: right;
  font-size: 12px;
  color: var(--muted);
}
.header .meta .tool-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}
h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--deep);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 28px;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 20px;
}
thead th {
  background: var(--aqua);
  color: var(--deep);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
tbody td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
tbody tr:last-child td {
  border-bottom: none;
}
.context-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 24px;
  font-size: 13px;
  margin-bottom: 20px;
}
.context-grid .label {
  font-weight: 600;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
}
.context-grid .value {
  color: var(--ink);
}
.aggregates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.agg-card {
  background: var(--aqua);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
}
.agg-card .agg-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.agg-card .agg-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  margin-top: 2px;
}
.outcome-pass { color: var(--green); font-weight: 600; }
.outcome-fail { color: var(--red); font-weight: 600; }
.outcome-advisory { color: var(--amber); font-weight: 600; }
.disclaimer {
  margin-top: 32px;
  padding: 16px;
  background: rgba(16,32,51,.03);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}
.preview-banner {
  background: rgba(245,166,35,.08);
  border: 1px solid rgba(245,166,35,.18);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--amber);
  margin-bottom: 20px;
}
@media print {
  body { padding: 20px; }
  .header { page-break-after: avoid; }
  table { page-break-inside: avoid; }
}
</style>
</head>
<body>
${this.buildHtmlHeader(definition, runDate)}
${run.previewDisclaimer ? `<div class="preview-banner">${escapeHtml(run.previewDisclaimer)}</div>` : ''}
${this.buildHtmlContext(context, run)}
${this.buildHtmlInputParams(run)}
${this.buildHtmlResults(output)}
${this.buildHtmlAggregates(output)}
${this.buildHtmlClauseOutcomes(output)}
${this.buildHtmlSourceVersions(output)}
${this.buildHtmlDisclaimers(definition)}
</body>
</html>`;

    return this.record(run, 'html', 'text/html', html);
  }

  // ---------------------------------------------------------------------------
  // HTML export section builders
  // ---------------------------------------------------------------------------

  private buildHtmlHeader(definition: CalculatorDefinition, runDate: string): string {
    return `<div class="header">
  <div class="brand">Architex<span>OS</span></div>
  <div class="meta">
    <div class="tool-name">${escapeHtml(definition.title)}</div>
    <div>Report Template: ${escapeHtml(definition.reportTemplateId)}</div>
    <div>${escapeHtml(runDate)}</div>
  </div>
</div>`;
  }

  private buildHtmlContext(context: ExportContext, run: ToolRun): string {
    const assignment = context.projectAssignment;
    let assignmentText = 'None (standalone)';
    if (assignment.mode === 'internal-project') {
      assignmentText = `${assignment.projectName ?? assignment.projectId ?? 'Unknown project'}`;
    } else if (assignment.mode === 'external-reference') {
      assignmentText = `External: ${assignment.externalReference ?? ''}`;
      if (assignment.notes) {
        assignmentText += ` — ${assignment.notes}`;
      }
    }

    return `<h2>Report Context</h2>
<div class="context-grid">
  <div><span class="label">User</span><div class="value">${escapeHtml(context.userName)}</div></div>
  <div><span class="label">Role</span><div class="value">${escapeHtml(context.userRole)}</div></div>
  <div><span class="label">Project Assignment</span><div class="value">${escapeHtml(assignmentText)}</div></div>
  <div><span class="label">Run ID</span><div class="value" style="font-family:monospace;font-size:11px;">${escapeHtml(run.id)}</div></div>
</div>`;
  }

  private buildHtmlInputParams(run: ToolRun): string {
    const input = run.input;
    if (!input || typeof input !== 'object') return '';

    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0) return '';

    const rows = entries.map(([key, value]) => {
      const displayValue = this.formatHtmlValue(value);
      return `    <tr><td style="font-weight:500;">${escapeHtml(key)}</td><td>${escapeHtml(displayValue)}</td></tr>`;
    }).join('\n');

    return `<h2>Input Parameters</h2>
<table>
  <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
  }

  private buildHtmlResults(output: CalculationResult | undefined): string {
    if (!output || !Array.isArray(output.lineResults) || output.lineResults.length === 0) return '';

    // Collect all column keys from lineResults
    const allKeys = new Set<string>();
    for (const row of output.lineResults) {
      for (const key of Object.keys(row)) {
        allKeys.add(key);
      }
    }
    const columns = [...allKeys].sort();

    const headerCells = columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const dataRows = output.lineResults.map(row => {
      const cells = columns.map(col => {
        const val = row[col];
        const display = this.formatHtmlCellValue(col, val);
        return `<td>${escapeHtml(display)}</td>`;
      }).join('');
      return `    <tr>${cells}</tr>`;
    }).join('\n');

    return `<h2>Results</h2>
<table>
  <thead><tr>${headerCells}</tr></thead>
  <tbody>
${dataRows}
  </tbody>
</table>`;
  }

  private buildHtmlAggregates(output: CalculationResult | undefined): string {
    if (!output || !output.aggregates) return '';

    const entries = Object.entries(output.aggregates);
    if (entries.length === 0) return '';

    const cards = entries.map(([key, value]) => {
      const display = this.formatHtmlCellValue(key, value);
      return `  <div class="agg-card"><div class="agg-label">${escapeHtml(key)}</div><div class="agg-value">${escapeHtml(display)}</div></div>`;
    }).join('\n');

    return `<h2>Aggregates Summary</h2>
<div class="aggregates">
${cards}
</div>`;
  }

  private buildHtmlClauseOutcomes(output: CalculationResult | undefined): string {
    if (!output || !Array.isArray(output.clauseResults) || output.clauseResults.length === 0) return '';

    const rows = output.clauseResults.map(clause => {
      const outcomeClass = `outcome-${clause.outcome}`;
      return `    <tr>
      <td>${escapeHtml(clause.clauseRef)}</td>
      <td>${escapeHtml(clause.label)}</td>
      <td class="${outcomeClass}">${escapeHtml(clause.outcome.toUpperCase())}</td>
      <td>${escapeHtml(clause.threshold)}</td>
      <td>${escapeHtml(clause.actual)}</td>
      <td>${escapeHtml(clause.note ?? '')}</td>
    </tr>`;
    }).join('\n');

    return `<h2>Clause Outcomes</h2>
<table>
  <thead><tr><th>Clause Ref</th><th>Label</th><th>Outcome</th><th>Threshold</th><th>Actual</th><th>Note</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
  }

  private buildHtmlSourceVersions(output: CalculationResult | undefined): string {
    if (!output || !Array.isArray(output.sourceVersions) || output.sourceVersions.length === 0) return '';

    const rows = output.sourceVersions.map(sv => {
      return `    <tr>
      <td>${escapeHtml(sv.guideline)}</td>
      <td>${escapeHtml(sv.version)}</td>
      <td>${escapeHtml(sv.effectiveFrom ?? 'N/A')}</td>
      <td>${escapeHtml(sv.status ?? 'N/A')}</td>
    </tr>`;
    }).join('\n');

    return `<h2>Source Versions</h2>
<table>
  <thead><tr><th>Table ID</th><th>Version</th><th>Effective From</th><th>Status</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
  }

  private buildHtmlDisclaimers(definition: CalculatorDefinition): string {
    const standardDisclaimer = 'Results are advisory only. Professional sign-off is required before regulatory submission. This tool does not constitute certification.';

    const allDisclaimers = [
      ...(definition.disclaimers ?? []),
      standardDisclaimer,
    ];

    const disclaimerHtml = allDisclaimers
      .map(d => `<p>${escapeHtml(d)}</p>`)
      .join('\n  ');

    return `<div class="disclaimer">
  ${disclaimerHtml}
</div>`;
  }

  /**
   * Formats a value for display in the HTML input parameters table.
   */
  private formatHtmlValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Formats a cell value for HTML results tables.
   * Detects monetary fields (amount, cost, fee, total, etc.) and formats with formatZAR.
   */
  private formatHtmlCellValue(key: string, value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      // Detect monetary fields by key name
      const monetaryKeys = /amount|cost|fee|total|price|value|subtotal|vat|disbursement|contingency|payable|retention|budget|rate$/i;
      if (monetaryKeys.test(key)) {
        return formatZAR(value);
      }
      // Format other numbers normally (2dp for decimals)
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    if (typeof value === 'string') return value;
    return String(value);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds CSV content with one header row and one data row per schedule line item.
   * Columns: item, description, unit, quantity, rate, amount, section
   * Additional columns from lineResults (labourCost, materialCost, plantCost, etc.) are appended.
   */
  private buildScheduleCsv(
    run: ToolRun,
    output: CalculationResult,
    definition?: CalculatorDefinition,
  ): string {
    const lineResults = output.lineResults;

    // Determine JBCC/GCC section reference from aggregates or definition source
    const section = this.resolveSection(output, definition);

    // Collect all unique keys across all line results for dynamic columns
    const baseColumns = ['item', 'description', 'unit', 'quantity', 'rate', 'amount', 'section'];
    const extraKeys = new Set<string>();
    for (const row of lineResults) {
      for (const key of Object.keys(row)) {
        if (!baseColumns.includes(key) && key !== 'section') {
          extraKeys.add(key);
        }
      }
    }
    const extraColumns = [...extraKeys].sort();

    // Build header
    const headers = [...baseColumns, ...extraColumns];
    const rows: string[][] = [headers];

    // Build data rows
    for (let i = 0; i < lineResults.length; i++) {
      const lineRow = lineResults[i];
      const dataRow = [
        String(i + 1),                                     // item number
        String(lineRow['description'] ?? ''),              // description
        String(lineRow['unit'] ?? ''),                     // unit
        String(lineRow['quantity'] ?? ''),                 // quantity
        String(lineRow['rate'] ?? ''),                     // rate
        String(lineRow['amount'] ?? ''),                   // amount
        section,                                           // JBCC/GCC section
      ];
      // Append extra columns
      for (const key of extraColumns) {
        dataRow.push(String(lineRow[key] ?? ''));
      }
      rows.push(dataRow);
    }

    return rows.map((row) => row.map(csvCell).join(',')).join('\n');
  }

  /**
   * Fallback CSV: field/value format for tools without schedule line items.
   */
  private buildFallbackCsv(run: ToolRun): string {
    const rows = [
      ['field', 'value'],
      ['runId', run.id],
      ['tenantId', run.tenantId],
      ['userId', run.userId],
      ['toolId', run.toolId],
      ['toolVersion', run.toolVersion],
      ['status', run.status],
      ['assignmentMode', run.assignment.mode],
      ['projectName', run.assignment.projectName ?? ''],
      ['externalReference', run.assignment.externalReference ?? ''],
      ['input', JSON.stringify(run.input)],
      ['output', JSON.stringify(run.output ?? {})],
      ['auditHash', run.auditSnapshot?.hash ?? ''],
    ];
    return rows.map((row) => row.map(csvCell).join(',')).join('\n');
  }

  /**
   * Resolves the JBCC/GCC section reference for BoQ tools.
   * Checks output aggregates first (where section is stored during compute),
   * then falls back to the definition source guideline name.
   */
  private resolveSection(output: CalculationResult, definition?: CalculatorDefinition): string {
    // BoQ tools store section in aggregates (from BoQInput.section)
    if (output.aggregates && typeof output.aggregates['section'] === 'string') {
      return output.aggregates['section'];
    }
    // Fall back to definition source guideline reference (e.g. "JBCC/NEC Schedule of Quantities")
    if (definition?.source?.guideline) {
      return definition.source.guideline;
    }
    return '';
  }

  private record(run: ToolRun, format: ExportRecord['format'], mimeType: string, content: string): ExportRecord {
    const timestamp = iso().replace(/:/g, '-');
    return { id: createId('export'), format, filename: `${run.toolId}_${run.id}_${timestamp}.${format}`, mimeType, content, createdAt: iso() };
  }
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
