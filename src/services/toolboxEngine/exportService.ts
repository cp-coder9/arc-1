import { createId, iso } from './ids';
import type { ExportRecord, ToolRun } from './types';

export class ExportService {
  createJson(run: ToolRun): ExportRecord {
    return this.record(run, 'json', 'application/json', JSON.stringify(run, null, 2));
  }

  createCsv(run: ToolRun): ExportRecord {
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
    return this.record(run, 'csv', 'text/csv', rows.map((row) => row.map(csvCell).join(',')).join('\n'));
  }

  createPrintableHtml(run: ToolRun, title: string): ExportRecord {
    const body = escapeHtml(JSON.stringify({ input: run.input, output: run.output }, null, 2));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#0f172a}h1{color:#0f4c81}.card{border:1px solid #cbd5e1;border-radius:12px;padding:16px;margin:12px 0}pre{white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px}@media print{button{display:none}}</style></head><body><button onclick="print()">Print / PDF</button><h1>${escapeHtml(title)}</h1><div class="card"><b>Run:</b> ${run.id}<br><b>Tool:</b> ${run.toolId} v${run.toolVersion}<br><b>Status:</b> ${run.status}<br><b>Audit:</b> ${run.auditSnapshot?.hash ?? 'not issued'}</div><div class="card"><pre>${body}</pre></div></body></html>`;
    return this.record(run, 'html', 'text/html', html);
  }

  private record(run: ToolRun, format: ExportRecord['format'], mimeType: string, content: string): ExportRecord {
    return { id: createId('export'), format, filename: `${run.toolId}-${run.id}.${format}`, mimeType, content, createdAt: iso() };
  }
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
