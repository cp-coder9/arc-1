// Toolbox report layer — public surface
//
// Turns a `CalculationResult` (plus definition, inputs, and run metadata) into audit-ready
// CSV and PDF outputs. Callers import from this single path.
//
// Design reference: design.md "Report layer". Requirements: 1.4, 1.5, 3.4.

export type { ReportMetadata, ReportContext, ReportTemplate } from './types'
export { buildCsv } from './csvExporter'
export { buildPdf, buildPdfBlob } from './pdfExporter'
export {
  DEFAULT_REPORT_TEMPLATE_ID,
  defaultReportTemplate,
  registerReportTemplate,
  hasReportTemplate,
  getReportTemplate,
  renderCsv,
  renderPdf,
  resetReportTemplates,
} from './reportTemplateRegistry'

// Bespoke templates — importing this module registers them into the template registry so
// `getReportTemplate(id)` resolves them (e.g. the XA fenestration submission layout).
export {
  xaFenestrationReportTemplate,
  buildXaFenestrationPdf,
  XA_FENESTRATION_REPORT_TEMPLATE_ID,
} from './xaFenestrationReportTemplate'
