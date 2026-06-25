import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { xaFenestrationV1, type XaOpeningRow } from '@/services/toolbox/definitions/xaFenestration'
import { buildCsv } from './csvExporter'
import { getReportTemplate, registerReportTemplate } from './reportTemplateRegistry'
import type { ReportContext } from './types'
import {
  XA_FENESTRATION_REPORT_TEMPLATE_ID,
  buildXaFenestrationPdf,
  xaFenestrationReportTemplate,
} from './xaFenestrationReportTemplate'

// ----------------------------------------------------------------------------
// Helpers — run the real xa_fenestration_v1 definition through the engine, then
// build a ReportContext for the bespoke submission template.
// ----------------------------------------------------------------------------

function run(input: unknown, rows: unknown[]) {
  return runCalculator(xaFenestrationV1, input, rows, { tables: SEED_GUIDELINE_TABLES })
}

const SINGLE_STOREY_ROWS: XaOpeningRow[] = [
  { label: 'W1', orientation: 'N', areaM2: 6, glazingType: 'double_lowe', shading: 'overhang' },
  { label: 'W2', orientation: 'S', areaM2: 4, glazingType: 'single_clear', shading: 'none' },
]

const MULTI_STOREY_ROWS = [
  { label: 'G1', orientation: 'N', areaM2: 6, glazingType: 'double_lowe', shading: 'overhang', storey: 'Ground' },
  { label: 'G2', orientation: 'S', areaM2: 4, glazingType: 'double_lowe', shading: 'none', storey: 'Ground' },
  { label: 'F1', orientation: 'W', areaM2: 5, glazingType: 'double_lowe', shading: 'fin', storey: 'First' },
]

const METADATA = {
  timestamp: '2024-06-15T10:30:00.000Z',
  runId: 'run_xa_001',
  preparedBy: 'A. Energy Professional',
  projectRef: 'PRJ-XA-77',
}

function makeContext(
  input: Record<string, unknown> = { climateZone: 4, storeys: 1, netFloorAreaM2: 120 },
  rows: unknown[] = SINGLE_STOREY_ROWS,
): ReportContext {
  const result = run(input, rows)
  return {
    definition: xaFenestrationV1 as unknown as ReportContext['definition'],
    input,
    result,
    metadata: METADATA,
  }
}

// ----------------------------------------------------------------------------
// Registration — the bespoke template resolves under 'xa_fenestration_report'
// and matches the id the definition references.
// ----------------------------------------------------------------------------

describe('xaFenestrationReportTemplate — registration', () => {
  it('is registered under the xa_fenestration_report id', () => {
    expect(XA_FENESTRATION_REPORT_TEMPLATE_ID).toBe('xa_fenestration_report')
    // Importing this module registers the bespoke template; re-register defensively in case
    // another suite reset the registry first.
    registerReportTemplate(xaFenestrationReportTemplate)
    const resolved = getReportTemplate('xa_fenestration_report')
    expect(resolved).toBe(xaFenestrationReportTemplate)
    expect(resolved.id).toBe('xa_fenestration_report')
  })

  it('is the template the xa_fenestration_v1 definition points at', () => {
    expect(xaFenestrationV1.reportTemplateId).toBe('xa_fenestration_report')
  })
})

// ----------------------------------------------------------------------------
// PDF — submission-ready bytes that pdf-lib can parse back (smoke + structural).
// ----------------------------------------------------------------------------

describe('buildXaFenestrationPdf — submission PDF', () => {
  it('produces non-empty PDF bytes with a %PDF header', async () => {
    const bytes = await buildXaFenestrationPdf(makeContext())
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(500)
    const header = new TextDecoder().decode(bytes.slice(0, 5))
    expect(header).toBe('%PDF-')
  })

  it('produces a parseable PDF with at least one page', async () => {
    const bytes = await buildXaFenestrationPdf(makeContext())
    const parsed = await PDFDocument.load(bytes)
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('renders the multi-storey result (per-storey summaries path) without error', async () => {
    const ctx = makeContext(
      { climateZone: 4, storeys: 2, netFloorAreaM2: 200, storeyFloorAreasM2: { Ground: 120, First: 80 } },
      MULTI_STOREY_ROWS,
    )
    expect((ctx.result.groupAggregates ?? []).length).toBe(2)
    const bytes = await buildXaFenestrationPdf(ctx)
    const parsed = await PDFDocument.load(bytes)
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('renders via the registered template toPdf (same id the definition uses)', async () => {
    registerReportTemplate(xaFenestrationReportTemplate)
    const ctx = makeContext()
    const bytes = await getReportTemplate(ctx.definition.reportTemplateId).toPdf(ctx)
    expect(bytes.length).toBeGreaterThan(500)
  })
})

// ----------------------------------------------------------------------------
// CSV — delegates to the generic audit-trail exporter; the advisory + sign-off
// governance content is exercised via the disclaimers section.
// ----------------------------------------------------------------------------

describe('xaFenestrationReportTemplate.toCsv — advisory + governance content', () => {
  it('includes the advisory / professional sign-off disclaimers', () => {
    const csv = xaFenestrationReportTemplate.toCsv(makeContext())
    expect(csv).toContain('Disclaimers')
    expect(csv).toContain('Advisory only')
    expect(csv).toContain('sign off') // "...must review and sign off the fenestration design..."
  })

  it('includes the source guideline name, version and status (Requirement 3.4)', () => {
    const csv = xaFenestrationReportTemplate.toCsv(makeContext())
    expect(csv).toContain('Source Guideline,SANS 10400-XA')
    expect(csv).toContain('Source Version,2021')
    expect(csv).toContain('Source Status,mandatory')
  })

  it('matches the generic buildCsv output (CSV delegates to the default exporter)', () => {
    const ctx = makeContext()
    expect(xaFenestrationReportTemplate.toCsv(ctx)).toBe(buildCsv(ctx))
  })

  it('carries per-storey group aggregates for a multi-storey building', () => {
    const ctx = makeContext(
      { climateZone: 4, storeys: 2, netFloorAreaM2: 200, storeyFloorAreasM2: { Ground: 120, First: 80 } },
      MULTI_STOREY_ROWS,
    )
    const csv = xaFenestrationReportTemplate.toCsv(ctx)
    expect(csv).toContain('Group Aggregates')
    expect(csv).toContain('storey,Ground')
    expect(csv).toContain('storey,First')
  })
})
