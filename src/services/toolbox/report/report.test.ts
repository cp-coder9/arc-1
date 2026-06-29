import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { PDFDocument } from 'pdf-lib'
import type { CalculationResult, CalculatorDefinition } from '../types'
import { buildCsv } from './csvExporter'
import { buildPdf, buildPdfBlob } from './pdfExporter'
import {
  DEFAULT_REPORT_TEMPLATE_ID,
  getReportTemplate,
  hasReportTemplate,
  registerReportTemplate,
  renderCsv,
  renderPdf,
  resetReportTemplates,
} from './reportTemplateRegistry'
import type { ReportContext, ReportTemplate } from './types'

// ----------------------------------------------------------------------------
// Fixtures — a fenestration-style result with inputs, line rows, aggregates,
// clause outcomes, source versions, and disclaimers.
// ----------------------------------------------------------------------------

interface FenInput {
  floorAreaM2: number
  storeys: number
}

function makeDefinition(): CalculatorDefinition<FenInput> {
  return {
    id: 'xa_fenestration_v1',
    toolId: 'fenestration_calc',
    title: 'SANS 10400-XA Fenestration Compliance',
    method: 'clauseSet',
    inputSchema: z.object({ floorAreaM2: z.number().positive(), storeys: z.number().int().positive() }),
    tableRefs: ['xa_zone_limits'],
    compute: () => makeResult(),
    reportTemplateId: 'default',
    source: {
      guideline: 'SANS 10400-XA',
      version: '2024.1',
      status: 'mandatory',
      url: 'https://example.org/sans-10400-xa',
    },
    disclaimers: ['Advisory only — professional sign-off required.'],
    status: 'full',
  }
}

function makeResult(): CalculationResult {
  return {
    lineResults: [
      { label: 'North window', orientation: 'N', glazingAreaM2: 9 },
      { label: 'East window', orientation: 'E', glazingAreaM2: 6 },
    ],
    aggregates: { totalGlazingM2: 15, glazingRatio: 0.15 },
    clauseResults: [
      {
        clauseRef: 'SANS 10400-XA 4.3.2',
        label: 'Glazing area within prescriptive limit',
        outcome: 'pass',
        threshold: '<= 20%',
        actual: '15.0%',
      },
      {
        clauseRef: 'SANS 10400-XA 4.3.3',
        label: 'U-value within zone limit',
        outcome: 'fail',
        threshold: '<= 3.5',
        actual: '4.1',
        note: 'Specify double glazing to comply.',
      },
    ],
    complianceScore: 50,
    sourceVersions: [{ guideline: 'xa_zone_limits', version: '2024.1' }],
    disclaimers: ['Advisory only — professional sign-off required.'],
    warnings: ['Row 3 excluded: missing U-value.'],
  }
}

const METADATA = {
  timestamp: '2024-06-15T10:30:00.000Z',
  runId: 'run_abc123',
  preparedBy: 'A. Architect',
  projectRef: 'PRJ-001',
}

function makeContext(): ReportContext {
  return {
    definition: makeDefinition() as unknown as CalculatorDefinition,
    input: { floorAreaM2: 100, storeys: 2 },
    result: makeResult(),
    metadata: METADATA,
  }
}

// ----------------------------------------------------------------------------
// CSV exporter — must contain inputs, results, clause outcomes, source version,
// timestamp, and disclaimer (Requirements 1.4, 1.5, 3.4).
// ----------------------------------------------------------------------------

describe('buildCsv', () => {
  it('includes inputs used', () => {
    const csv = buildCsv(makeContext())
    expect(csv).toContain('Inputs')
    expect(csv).toContain('floorAreaM2,100')
    expect(csv).toContain('storeys,2')
  })

  it('includes line results and aggregates', () => {
    const csv = buildCsv(makeContext())
    expect(csv).toContain('Line Results')
    expect(csv).toContain('North window')
    expect(csv).toContain('Aggregates')
    expect(csv).toContain('totalGlazingM2,15')
  })

  it('includes clause outcomes with cited ref, threshold and actual', () => {
    const csv = buildCsv(makeContext())
    expect(csv).toContain('Clause Outcomes')
    expect(csv).toContain('SANS 10400-XA 4.3.2')
    expect(csv).toContain('pass')
    expect(csv).toContain('fail')
    expect(csv).toContain('<= 20%')
    expect(csv).toContain('15.0%')
  })

  it('includes the source guideline name, version and status (Requirement 3.4)', () => {
    const csv = buildCsv(makeContext())
    expect(csv).toContain('Source Guideline,SANS 10400-XA')
    expect(csv).toContain('Source Version,2024.1')
    expect(csv).toContain('Source Status,mandatory')
    // The consumed table version is also surfaced.
    expect(csv).toContain('xa_zone_limits,2024.1')
  })

  it('includes the generation timestamp (Requirement 1.5)', () => {
    const csv = buildCsv(makeContext())
    expect(csv).toContain('Generated,2024-06-15T10:30:00.000Z')
  })

  it('includes the disclaimer (Requirements 1.4, 1.5)', () => {
    const csv = buildCsv(makeContext())
    expect(csv).toContain('Disclaimers')
    expect(csv).toContain('Advisory only — professional sign-off required.')
  })

  it('escapes fields containing commas, quotes, and newlines per RFC 4180', () => {
    const ctx = makeContext()
    ctx.result.clauseResults[1].note = 'Comma, "quote", and\nnewline'
    const csv = buildCsv(ctx)
    expect(csv).toContain('"Comma, ""quote"", and\nnewline"')
  })

  it('falls back to definition disclaimers when the result has none', () => {
    const ctx = makeContext()
    ctx.result.disclaimers = []
    const csv = buildCsv(ctx)
    expect(csv).toContain('Advisory only — professional sign-off required.')
  })

  it('includes grouped sub-rollups (per-storey) when present', () => {
    const ctx = makeContext()
    ctx.result.groupAggregates = [
      { group: 'storey', key: 'Ground', label: 'Storey Ground', values: { glazingAreaM2: 10, glazingRatioPct: 8.3 } },
      { group: 'storey', key: 'First', label: 'Storey First', values: { glazingAreaM2: 5, glazingRatioPct: 6.3 } },
    ]
    const csv = buildCsv(ctx)
    expect(csv).toContain('Group Aggregates')
    expect(csv).toContain('storey,Ground,Storey Ground')
    expect(csv).toContain('storey,First,Storey First')
  })
})

// ----------------------------------------------------------------------------
// PDF exporter — smoke-level: produces non-empty, well-formed PDF bytes that
// pdf-lib can parse back, with the expected page structure.
// ----------------------------------------------------------------------------

describe('buildPdf', () => {
  it('produces non-empty PDF bytes with a %PDF header', async () => {
    const bytes = await buildPdf(makeContext())
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(500)
    const header = new TextDecoder().decode(bytes.slice(0, 5))
    expect(header).toBe('%PDF-')
  })

  it('produces a parseable PDF with at least one page', async () => {
    const bytes = await buildPdf(makeContext())
    const parsed = await PDFDocument.load(bytes)
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('paginates when there are many line results', async () => {
    const ctx = makeContext()
    ctx.result.lineResults = Array.from({ length: 120 }, (_, i) => ({
      label: `Opening ${i + 1}`,
      orientation: 'N',
      glazingAreaM2: i,
    }))
    const bytes = await buildPdf(ctx)
    const parsed = await PDFDocument.load(bytes)
    expect(parsed.getPageCount()).toBeGreaterThan(1)
  })

  it('does not throw on inputs/disclaimers with non-WinAnsi characters', async () => {
    const ctx = makeContext()
    ctx.result.disclaimers = ['Disclaimer with emoji 🚧 and symbols ≤ ≥']
    await expect(buildPdf(ctx)).resolves.toBeInstanceOf(Uint8Array)
  })

  it('buildPdfBlob returns an application/pdf Blob', async () => {
    const blob = await buildPdfBlob(makeContext())
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(500)
  })
})

// ----------------------------------------------------------------------------
// Report template registry — registered-by-id abstraction referenced by
// CalculatorDefinition.reportTemplateId.
// ----------------------------------------------------------------------------

describe('reportTemplateRegistry', () => {
  it('resolves the default template and falls back for unknown ids', () => {
    resetReportTemplates()
    expect(hasReportTemplate(DEFAULT_REPORT_TEMPLATE_ID)).toBe(true)
    expect(getReportTemplate('nope').id).toBe(DEFAULT_REPORT_TEMPLATE_ID)
  })

  it('renders via the template referenced by the definition', async () => {
    resetReportTemplates()
    const csv = renderCsv(makeContext())
    expect(csv).toContain('SANS 10400-XA Fenestration Compliance')
    const bytes = await renderPdf(makeContext())
    expect(bytes.length).toBeGreaterThan(500)
  })

  it('registers and resolves a bespoke template by id', () => {
    resetReportTemplates()
    const custom: ReportTemplate = {
      id: 'xa_fenestration_report',
      title: 'XA Submission Pack',
      toCsv: () => 'CUSTOM_CSV',
      toPdf: async () => new Uint8Array([1, 2, 3]),
    }
    registerReportTemplate(custom)
    expect(hasReportTemplate('xa_fenestration_report')).toBe(true)

    const ctx = makeContext()
    ;(ctx.definition as { reportTemplateId: string }).reportTemplateId = 'xa_fenestration_report'
    expect(renderCsv(ctx)).toBe('CUSTOM_CSV')
    resetReportTemplates()
    // After reset the bespoke template is gone, fallback applies.
    expect(hasReportTemplate('xa_fenestration_report')).toBe(false)
  })
})
