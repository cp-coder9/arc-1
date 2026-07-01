import type { BomExportRecord, ExportFormat, ExportTemplate } from './types';
import { getProject } from './bomBuilderService';

// ── Helpers ─────────────────────────────────────────────────────────────────

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ── Template file name generation ───────────────────────────────────────────

const templateFileNames: Record<ExportTemplate, string> = {
  full_bom: 'Full_BoM',
  priced_boq: 'Priced_BoQ',
  trade_package: 'Trade_Package_Schedule',
  procurement_schedule: 'Procurement_Schedule',
  qs_cost_report: 'QS_Cost_Report',
  cashflow_forecast: 'Cashflow_Forecast',
};

const formatExtensions: Record<ExportFormat, string> = {
  pdf: '.pdf',
  xlsx: '.xlsx',
  csv: '.csv',
  ms_project: '.xml',
};

// ── Public API ──────────────────────────────────────────────────────────────

export function generateExport(
  projectId: string,
  template: ExportTemplate,
  format: ExportFormat,
  generatedBy: string = 'system',
): BomExportRecord {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Validate template/format compatibility
  if (template === 'cashflow_forecast' && format === 'csv') {
    throw new Error('Cashflow forecast export is not available in CSV format');
  }

  const fileName = `${templateFileNames[template]}_${project.name.replace(/\s+/g, '_')}_${project.revision}${formatExtensions[format]}`;

  const record: BomExportRecord = {
    id: uid('exp'),
    template,
    format,
    generatedAt: now(),
    generatedBy,
    fileName,
    certified: !!project.qsSignOff,
  };

  project.exports.push(record);
  return record;
}

export function getExportHistory(projectId: string): BomExportRecord[] {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  return [...project.exports].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );
}

export function certifyExport(projectId: string, exportId: string, documentRegisterId?: string): BomExportRecord {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const record = project.exports.find((e) => e.id === exportId);
  if (!record) throw new Error(`Export record ${exportId} not found`);

  if (!project.qsSignOff) {
    throw new Error('Cannot certify export: QS sign-off has not been completed');
  }

  record.certified = true;
  if (documentRegisterId) {
    record.documentRegisterId = documentRegisterId;
  }

  return record;
}

// ── Testing utility ─────────────────────────────────────────────────────────

export function _resetSeq(): void {
  seq = 0;
}
