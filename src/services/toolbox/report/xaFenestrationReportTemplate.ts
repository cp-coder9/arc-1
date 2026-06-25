// SANS 10400-XA fenestration — submission-ready report template
//
// A bespoke `ReportTemplate` (id `xa_fenestration_report`, referenced by the
// `xa_fenestration_v1` definition) that renders a professional, municipal-submission-ready
// PDF for the XA fenestration exemplar. It reuses the shared `PdfWriter` building block from
// `pdfExporter.ts` (auto-paginating text cursor + outcome colours) but lays out a bespoke
// structure:
//
//   - title/header banner with the building summary (climate zone, storeys, net floor area);
//   - a prominent ADVISORY banner up top (governance — never presented as a certificate);
//   - the per-opening fenestration schedule table;
//   - per-storey summaries (from `groupAggregates`) plus the whole-building rollup;
//   - clause-by-clause pass/fail/advisory with the zone-specific threshold + actual;
//   - the source guideline + version + status (provenance);
//   - a closing ADVISORY + professional sign-off block with a name/registration/date area.
//
// CSV delegates to the generic `buildCsv` (the audit-trail CSV already carries inputs,
// schedule rows, group aggregates, clause outcomes, source versions, and disclaimers).
//
// Requirements: 4.5 (submission-ready PDF; advisory + professional sign-off required),
// NFR governance (advisory + sign-off + audit notices on every compliance output).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ClauseResult } from '../types'
import { buildCsv } from './csvExporter'
import { HEADING_SIZE, LINE_GAP, OUTCOME_COLOR, PdfWriter, TITLE_SIZE } from './pdfExporter'
import { registerReportTemplate } from './reportTemplateRegistry'
import type { ReportContext, ReportTemplate } from './types'

/** The id this template registers under; matches `xaFenestrationV1.reportTemplateId`. */
export const XA_FENESTRATION_REPORT_TEMPLATE_ID = 'xa_fenestration_report'

const ADVISORY_AMBER = rgb(0.78, 0.5, 0.05)
const HEADER_NAVY = rgb(0.06, 0.12, 0.24)

/** Read a top-level input field defensively (the context type is generic). */
function inputField(ctx: ReportContext, key: string): string | number | undefined {
  const input = ctx.input as Record<string, unknown> | undefined
  const value = input?.[key]
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number' || typeof value === 'string') return value
  return JSON.stringify(value)
}

/**
 * Build the submission-ready XA fenestration PDF (bytes), reusing the shared `PdfWriter`.
 */
export async function buildXaFenestrationPdf(ctx: ReportContext): Promise<Uint8Array> {
  const { definition, result, metadata } = ctx
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new PdfWriter(doc, font, bold)

  // --- Title + prominent advisory banner (governance) ---
  w.text('FENESTRATION COMPLIANCE REPORT', {
    size: TITLE_SIZE,
    bold: true,
    color: HEADER_NAVY,
  })
  w.text(definition.title, { size: HEADING_SIZE, bold: true, color: HEADER_NAVY })
  w.gap(LINE_GAP)
  w.text(
    'ADVISORY ONLY — NOT A STATUTORY CERTIFICATE. A REGISTERED PROFESSIONAL MUST REVIEW AND SIGN OFF BEFORE MUNICIPAL SUBMISSION.',
    { bold: true, color: ADVISORY_AMBER },
  )

  // --- Building summary ---
  w.heading('Building')
  const zone = inputField(ctx, 'climateZone')
  if (zone !== undefined) w.text(`Climate zone: ${zone}`, { indent: 8 })
  const storeys = inputField(ctx, 'storeys')
  if (storeys !== undefined) w.text(`Storeys: ${storeys}`, { indent: 8 })
  const floorArea = inputField(ctx, 'netFloorAreaM2')
  if (floorArea !== undefined) w.text(`Net floor area: ${floorArea} m2`, { indent: 8 })

  // --- Provenance (source guideline + version + status, timestamp, preparer, project) ---
  w.heading('Provenance')
  w.text(
    `Source: ${definition.source.guideline} v${definition.source.version} (${definition.source.status})`,
    { bold: true, indent: 8 },
  )
  if (definition.source.url) w.text(definition.source.url, { indent: 8 })
  w.text(`Generated: ${metadata.timestamp}`, { indent: 8 })
  if (metadata.runId) w.text(`Run ID: ${metadata.runId}`, { indent: 8 })
  if (metadata.preparedBy) w.text(`Prepared by: ${metadata.preparedBy}`, { indent: 8 })
  if (metadata.projectRef) w.text(`Project: ${metadata.projectRef}`, { indent: 8 })

  // --- Fenestration schedule (per-opening table) ---
  w.heading('Fenestration Schedule')
  if (result.lineResults.length === 0) {
    w.text('No openings recorded.', { indent: 8 })
  } else {
    result.lineResults.forEach((row, i) => {
      const cells = Object.entries(row)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ')
      w.text(`${i + 1}. ${cells}`, { indent: 8 })
    })
  }

  // --- Per-storey summaries (from groupAggregates) ---
  const groups = result.groupAggregates ?? []
  if (groups.length > 0) {
    w.heading('Per-Storey Summaries')
    for (const g of groups) {
      w.text(g.label ?? `${g.group} ${g.key}`, { bold: true, indent: 8 })
      const cells = Object.entries(g.values)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ')
      w.text(cells, { indent: 16 })
    }
  }

  // --- Whole-building rollup ---
  const aggregateEntries = Object.entries(result.aggregates ?? {})
  if (aggregateEntries.length > 0) {
    w.heading('Whole-Building Rollup')
    for (const [key, value] of aggregateEntries) {
      w.text(`${key}: ${value}`, { indent: 8 })
    }
  }

  // --- Clause-by-clause compliance with zone thresholds ---
  w.heading('Clause Compliance')
  if (result.clauseResults.length === 0) {
    w.text('No clause checks for this calculator.', { indent: 8 })
  } else {
    for (const c of result.clauseResults) {
      const outcome = c.outcome as ClauseResult['outcome']
      w.text(`[${outcome.toUpperCase()}] ${c.clauseRef} — ${c.label}`, {
        bold: true,
        color: OUTCOME_COLOR[outcome] ?? rgb(0.1, 0.1, 0.1),
        indent: 8,
      })
      w.text(`Threshold: ${c.threshold}   Actual: ${c.actual}`, { indent: 16 })
      if (c.note) w.text(`Note: ${c.note}`, { indent: 16 })
    }
  }
  if (typeof result.complianceScore === 'number') {
    w.gap(LINE_GAP)
    w.text(`Compliance score: ${result.complianceScore} / 100`, { bold: true, indent: 8 })
  }

  // --- Source guideline versions consumed (traceability) ---
  w.heading('Source Guideline Versions')
  if (result.sourceVersions.length === 0) {
    w.text('None recorded.', { indent: 8 })
  } else {
    for (const v of result.sourceVersions) w.text(`${v.guideline}: ${v.version}`, { indent: 8 })
  }

  // --- Warnings / exclusions ---
  if (result.warnings.length > 0) {
    w.heading('Warnings / Exclusions')
    for (const warning of result.warnings) w.text(`- ${warning}`, { indent: 8 })
  }

  // --- Advisory + disclaimers ---
  w.heading('Advisory & Disclaimers')
  const disclaimers =
    result.disclaimers.length > 0 ? result.disclaimers : definition.disclaimers
  if (disclaimers.length === 0) {
    w.text('- Advisory only — professional sign-off required.', { indent: 8 })
  } else {
    for (const d of disclaimers) w.text(`- ${d}`, { indent: 8 })
  }

  // --- Professional sign-off block (name / registration / date) ---
  w.heading('Professional Sign-Off')
  w.text(
    'I, the undersigned registered professional, confirm that I have reviewed this fenestration assessment and accept professional responsibility for the design submitted for municipal approval.',
    { indent: 8 },
  )
  w.gap(HEADING_SIZE)
  w.text('Name: ______________________________', { indent: 8 })
  w.gap(LINE_GAP)
  w.text('Professional registration no.: ______________________________', { indent: 8 })
  w.gap(LINE_GAP)
  w.text('Signature: ______________________________', { indent: 8 })
  w.gap(LINE_GAP)
  w.text('Date: ______________________________', { indent: 8 })

  return doc.save()
}

/**
 * The bespoke XA fenestration report template. CSV delegates to the generic audit-trail CSV
 * exporter; PDF uses the bespoke submission layout above.
 */
export const xaFenestrationReportTemplate: ReportTemplate = {
  id: XA_FENESTRATION_REPORT_TEMPLATE_ID,
  title: 'SANS 10400-XA Fenestration Submission Report',
  toCsv: (ctx: ReportContext) => buildCsv(ctx),
  toPdf: (ctx: ReportContext) => buildXaFenestrationPdf(ctx),
}

// Register at module load so `getReportTemplate('xa_fenestration_report')` resolves the
// bespoke template wherever the report layer is imported.
registerReportTemplate(xaFenestrationReportTemplate)
