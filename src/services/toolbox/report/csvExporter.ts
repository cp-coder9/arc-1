// Toolbox report layer — CSV exporter
//
// Produces an audit-ready CSV from a `CalculationResult`, containing the inputs used, the
// per-row/aggregate results, clause outcomes, the source guideline + version + status, the
// generation timestamp, and the disclaimer(s).
//
// Requirements: 1.4, 1.5, 3.4.

import type { ReportContext } from './types'

/**
 * Escape a single CSV field per RFC 4180: wrap in double-quotes and double any embedded
 * quotes when the value contains a comma, quote, or newline.
 */
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Join a row of values into a single CSV line. */
function csvRow(values: unknown[]): string {
  return values.map(csvField).join(',')
}

/**
 * Build an audit-ready CSV string from a report context.
 *
 * Sections (blank-line separated) so the single file carries the whole audit trail:
 *  - Report header (tool, definition id, source guideline/version/status, timestamp)
 *  - Inputs used
 *  - Line results (schedule rows), columns derived from the union of row keys
 *  - Aggregates
 *  - Clause outcomes (clause ref, label, outcome, threshold, actual, note)
 *  - Source versions consumed
 *  - Disclaimers
 */
export function buildCsv(ctx: ReportContext): string {
  const { definition, input, result, metadata } = ctx
  const lines: string[] = []

  // --- Header / provenance (Requirements 1.5 timestamp, 3.4 source name+version+status) ---
  lines.push(csvRow(['Architex Toolbox Report']))
  lines.push(csvRow(['Tool', definition.title]))
  lines.push(csvRow(['Definition', definition.id]))
  lines.push(csvRow(['Source Guideline', definition.source.guideline]))
  lines.push(csvRow(['Source Version', definition.source.version]))
  lines.push(csvRow(['Source Status', definition.source.status]))
  if (definition.source.url) lines.push(csvRow(['Source URL', definition.source.url]))
  lines.push(csvRow(['Generated', metadata.timestamp]))
  if (metadata.runId) lines.push(csvRow(['Run ID', metadata.runId]))
  if (metadata.preparedBy) lines.push(csvRow(['Prepared By', metadata.preparedBy]))
  if (metadata.projectRef) lines.push(csvRow(['Project Reference', metadata.projectRef]))
  if (typeof result.complianceScore === 'number') {
    lines.push(csvRow(['Compliance Score', result.complianceScore]))
  }

  // --- Inputs used (Requirement 1.4) ---
  lines.push('')
  lines.push(csvRow(['Inputs']))
  lines.push(csvRow(['Field', 'Value']))
  for (const [key, value] of Object.entries(input ?? {})) {
    lines.push(csvRow([key, formatValue(value)]))
  }

  // --- Line results (schedule rows) ---
  if (result.lineResults.length > 0) {
    lines.push('')
    lines.push(csvRow(['Line Results']))
    const columns = unionKeys(result.lineResults)
    lines.push(csvRow(columns))
    for (const row of result.lineResults) {
      lines.push(csvRow(columns.map((c) => row[c] ?? '')))
    }
  }

  // --- Aggregates ---
  const aggregateEntries = Object.entries(result.aggregates ?? {})
  if (aggregateEntries.length > 0) {
    lines.push('')
    lines.push(csvRow(['Aggregates']))
    lines.push(csvRow(['Key', 'Value']))
    for (const [key, value] of aggregateEntries) {
      lines.push(csvRow([key, value]))
    }
  }

  // --- Grouped sub-rollups (per-storey / per-zone, when present) ---
  const groupAggregates = result.groupAggregates ?? []
  if (groupAggregates.length > 0) {
    lines.push('')
    lines.push(csvRow(['Group Aggregates']))
    const valueColumns = unionKeys(groupAggregates.map((g) => g.values))
    lines.push(csvRow(['Group', 'Key', 'Label', ...valueColumns]))
    for (const g of groupAggregates) {
      lines.push(
        csvRow([g.group, g.key, g.label ?? '', ...valueColumns.map((c) => g.values[c] ?? '')]),
      )
    }
  }

  // --- Clause outcomes (Requirement 1.5) ---
  lines.push('')
  lines.push(csvRow(['Clause Outcomes']))
  lines.push(csvRow(['Clause', 'Label', 'Outcome', 'Threshold', 'Actual', 'Note']))
  for (const c of result.clauseResults) {
    lines.push(csvRow([c.clauseRef, c.label, c.outcome, c.threshold, c.actual, c.note ?? '']))
  }

  // --- Source versions consumed (Requirements 1.5, 3.4) ---
  lines.push('')
  lines.push(csvRow(['Source Versions']))
  lines.push(csvRow(['Guideline', 'Version']))
  for (const v of result.sourceVersions) {
    lines.push(csvRow([v.guideline, v.version]))
  }

  // --- Warnings (exclusions / soft issues, Requirement 1.4) ---
  if (result.warnings.length > 0) {
    lines.push('')
    lines.push(csvRow(['Warnings / Exclusions']))
    for (const w of result.warnings) lines.push(csvRow([w]))
  }

  // --- Disclaimers (Requirement 1.4, 1.5) ---
  lines.push('')
  lines.push(csvRow(['Disclaimers']))
  const disclaimers = result.disclaimers.length > 0 ? result.disclaimers : definition.disclaimers
  for (const d of disclaimers) lines.push(csvRow([d]))

  return lines.join('\r\n')
}

/** Stable union of keys across all rows, preserving first-seen order. */
function unionKeys(rows: Array<Record<string, unknown>>): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys
}

/** Format an input value for a CSV cell; objects/arrays are JSON-encoded. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
