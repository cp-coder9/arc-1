// Toolbox report layer — template registry
//
// A `ReportTemplate` is registered by id and referenced from
// `CalculatorDefinition.reportTemplateId`. The default template delegates to the generic
// CSV/PDF exporters; bespoke templates (e.g. a submission-ready XA fenestration layout) can
// register under their own id and override either renderer while reusing the shared
// building blocks.
//
// Requirements: 1.4, 1.5, 3.4.

import { buildCsv } from './csvExporter'
import { buildPdf } from './pdfExporter'
import type { ReportContext, ReportTemplate } from './types'

/** The id used when a definition references no specific template (or an unknown one). */
export const DEFAULT_REPORT_TEMPLATE_ID = 'default'

/**
 * The default report template: a faithful, generic rendering of any `CalculationResult`.
 * Its `title` is left undefined so renderers fall back to the definition title at run time.
 */
export const defaultReportTemplate: ReportTemplate = {
  id: DEFAULT_REPORT_TEMPLATE_ID,
  toCsv: (ctx: ReportContext) => buildCsv(ctx),
  toPdf: (ctx: ReportContext) => buildPdf(ctx),
}

const registry = new Map<string, ReportTemplate>([[DEFAULT_REPORT_TEMPLATE_ID, defaultReportTemplate]])

/** Register (or replace) a report template by its id. */
export function registerReportTemplate(template: ReportTemplate): void {
  registry.set(template.id, template)
}

/** True when a template with the given id is registered. */
export function hasReportTemplate(id: string): boolean {
  return registry.has(id)
}

/**
 * Resolve a report template by id, falling back to the default template when the id is
 * unknown so a calculator is never left without an exporter.
 */
export function getReportTemplate(id: string | undefined): ReportTemplate {
  if (id && registry.has(id)) return registry.get(id) as ReportTemplate
  return defaultReportTemplate
}

/**
 * Render a report context to CSV using the template referenced by the definition.
 * Convenience entry point so callers need not resolve the template themselves.
 */
export function renderCsv(ctx: ReportContext): string {
  return getReportTemplate(ctx.definition.reportTemplateId).toCsv(ctx)
}

/** Render a report context to PDF bytes using the template referenced by the definition. */
export function renderPdf(ctx: ReportContext): Promise<Uint8Array> {
  return getReportTemplate(ctx.definition.reportTemplateId).toPdf(ctx)
}

/** Test/utility helper: drop all non-default templates and reset the registry. */
export function resetReportTemplates(): void {
  registry.clear()
  registry.set(DEFAULT_REPORT_TEMPLATE_ID, defaultReportTemplate)
}
