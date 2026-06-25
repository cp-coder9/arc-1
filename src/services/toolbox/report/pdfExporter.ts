// Toolbox report layer — PDF exporter (pdf-lib)
//
// Produces an audit-ready PDF from a `CalculationResult` using pdf-lib (the same dependency
// used by `closeoutService`/`pdfGenerationService`). The PDF carries the inputs used, the
// per-row/aggregate results, clause outcomes (pass/fail/advisory), the source guideline +
// version + status, the generation timestamp, and the disclaimer(s).
//
// Requirements: 1.4, 1.5, 3.4, NFR governance (advisory + sign-off).

import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ClauseResult } from '../types'
import type { ReportContext } from './types'

export const MARGIN = 56
export const TITLE_SIZE = 18
export const HEADING_SIZE = 12
export const BODY_SIZE = 10
export const LINE_GAP = 4

// Outcome colours mirror the clause panel semantics (pass = green, fail = red, advisory = amber).
export const OUTCOME_COLOR: Record<ClauseResult['outcome'], ReturnType<typeof rgb>> = {
  pass: rgb(0.13, 0.55, 0.27),
  fail: rgb(0.75, 0.16, 0.16),
  advisory: rgb(0.78, 0.5, 0.05),
}

/**
 * A simple top-down text cursor that paginates automatically: when the cursor drops below
 * the bottom margin it appends a fresh A4 page and resets to the top.
 *
 * Exported as a shared building block so bespoke report templates (e.g. the XA fenestration
 * submission layout) can reuse the same paginating cursor instead of re-implementing it.
 */
export class PdfWriter {
  private page: PDFPage
  private y: number
  readonly width: number
  readonly bottom = MARGIN

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = doc.addPage(PageSizes.A4)
    const { width, height } = this.page.getSize()
    this.width = width
    this.y = height - MARGIN
  }

  private ensureSpace(lineHeight: number): void {
    if (this.y - lineHeight < this.bottom) {
      this.page = this.doc.addPage(PageSizes.A4)
      this.y = this.page.getSize().height - MARGIN
    }
  }

  /** Draw a single line of text, wrapping to the page width, and advance the cursor. */
  text(
    value: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {},
  ): void {
    const size = opts.size ?? BODY_SIZE
    const font = opts.bold ? this.bold : this.font
    const indent = opts.indent ?? 0
    const maxWidth = this.width - MARGIN * 2 - indent
    const lineHeight = size + LINE_GAP
    for (const line of wrap(value, font, size, maxWidth)) {
      this.ensureSpace(lineHeight)
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y - size,
        size,
        font,
        color: opts.color ?? rgb(0.1, 0.1, 0.1),
      })
      this.y -= lineHeight
    }
  }

  /** Blank vertical space. */
  gap(amount = BODY_SIZE): void {
    this.y -= amount
  }

  heading(value: string): void {
    this.gap(LINE_GAP)
    this.text(value, { size: HEADING_SIZE, bold: true, color: rgb(0.06, 0.12, 0.24) })
  }
}

/** Word-wrap a string to a maximum width given a font + size. Empty input yields one blank line. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  // Sanitise characters StandardFonts (WinAnsi) cannot encode to avoid pdf-lib throwing.
  const safe = text.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?')
  if (safe.length === 0) return ['']
  const words = safe.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Build an audit-ready PDF (as bytes) from a report context.
 */
export async function buildPdf(ctx: ReportContext): Promise<Uint8Array> {
  const { definition, input, result, metadata } = ctx
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new PdfWriter(doc, font, bold)

  // --- Title + provenance (Requirements 1.5 timestamp, 3.4 source) ---
  w.text(definition.title, { size: TITLE_SIZE, bold: true, color: rgb(0.06, 0.12, 0.24) })
  w.gap(LINE_GAP)
  w.text(
    `Source: ${definition.source.guideline} v${definition.source.version} (${definition.source.status})`,
    { bold: true },
  )
  if (definition.source.url) w.text(definition.source.url)
  w.text(`Generated: ${metadata.timestamp}`)
  if (metadata.runId) w.text(`Run ID: ${metadata.runId}`)
  if (metadata.preparedBy) w.text(`Prepared by: ${metadata.preparedBy}`)
  if (metadata.projectRef) w.text(`Project: ${metadata.projectRef}`)
  if (typeof result.complianceScore === 'number') {
    w.text(`Compliance score: ${result.complianceScore}`)
  }

  // --- Inputs used (Requirement 1.4) ---
  w.heading('Inputs')
  const inputEntries = Object.entries(input ?? {})
  if (inputEntries.length === 0) {
    w.text('No inputs recorded.', { indent: 8 })
  } else {
    for (const [key, value] of inputEntries) {
      w.text(`${key}: ${formatValue(value)}`, { indent: 8 })
    }
  }

  // --- Clause outcomes (Requirements 1.3, 1.5) ---
  w.heading('Clause Outcomes')
  if (result.clauseResults.length === 0) {
    w.text('No clause checks for this calculator.', { indent: 8 })
  } else {
    for (const c of result.clauseResults) {
      w.text(`[${c.outcome.toUpperCase()}] ${c.clauseRef} — ${c.label}`, {
        bold: true,
        color: OUTCOME_COLOR[c.outcome] ?? rgb(0.1, 0.1, 0.1),
        indent: 8,
      })
      w.text(`Threshold: ${c.threshold}   Actual: ${c.actual}`, { indent: 16 })
      if (c.note) w.text(`Note: ${c.note}`, { indent: 16 })
    }
  }

  // --- Line results ---
  if (result.lineResults.length > 0) {
    w.heading('Line Results')
    result.lineResults.forEach((row, i) => {
      const cells = Object.entries(row)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ')
      w.text(`${i + 1}. ${cells}`, { indent: 8 })
    })
  }

  // --- Aggregates ---
  const aggregateEntries = Object.entries(result.aggregates ?? {})
  if (aggregateEntries.length > 0) {
    w.heading('Aggregates')
    for (const [key, value] of aggregateEntries) {
      w.text(`${key}: ${value}`, { indent: 8 })
    }
  }

  // --- Source versions consumed (Requirements 1.5, 3.4) ---
  w.heading('Source Versions')
  if (result.sourceVersions.length === 0) {
    w.text('None recorded.', { indent: 8 })
  } else {
    for (const v of result.sourceVersions) {
      w.text(`${v.guideline}: ${v.version}`, { indent: 8 })
    }
  }

  // --- Warnings / exclusions (Requirement 1.4) ---
  if (result.warnings.length > 0) {
    w.heading('Warnings / Exclusions')
    for (const warning of result.warnings) w.text(`- ${warning}`, { indent: 8 })
  }

  // --- Disclaimers (Requirements 1.4, 1.5; NFR governance) ---
  w.heading('Disclaimers')
  const disclaimers = result.disclaimers.length > 0 ? result.disclaimers : definition.disclaimers
  if (disclaimers.length === 0) {
    w.text('Advisory only — professional sign-off required.', { indent: 8 })
  } else {
    for (const d of disclaimers) w.text(`- ${d}`, { indent: 8 })
  }

  return doc.save()
}

/** Convenience wrapper returning a `Blob` (for browser download). */
export async function buildPdfBlob(ctx: ReportContext): Promise<Blob> {
  const bytes = await buildPdf(ctx)
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
