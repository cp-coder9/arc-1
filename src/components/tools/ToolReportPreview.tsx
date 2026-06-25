// ToolReportPreview — audit-ready report preview + export / save / assign (Task 5.3)
//
// Renders a human-readable preview of a `CalculationResult` (inputs used, clause outcomes,
// aggregates, source guideline + version + status, disclaimers) and provides the three
// consistent actions every tool exposes: Save (run history), Export (PDF / CSV via the
// toolbox report layer), and Assign-to-Project — all consistent with
// `standaloneToolRunService` (Requirement 1.6).
//
// The component generates the PDF/CSV itself via the report layer (`renderCsv` /
// `buildPdfBlob`) and triggers a browser download, then notifies the parent through
// `onExported(format)` so the run can be marked exported. Save / Assign are delegated to
// the parent callbacks so the existing `StandaloneToolTilesPage` wiring (createRun /
// assignToProjectWithHandoff) continues to own persistence.
//
// Requirements:
//   1.3 — clause outcomes with cited refs/thresholds (via ClauseResultPanel).
//   1.4 — show inputs used, source guideline/version, disclaimers.
//   1.5 — export an audit-ready PDF and CSV (inputs, results, clause outcomes, source, timestamp).
//   1.6 — allow Save, Export, and Assign-to-Project.
//   6.3 — advisory + sign-off.

import React, { useState } from 'react'
import { Save, FileDown, FileSpreadsheet, FolderOpen, BookMarked } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { humanizeFieldName } from './zodFormIntrospection'
import ClauseResultPanel from './ClauseResultPanel'
import type { CalculationResult, CalculatorDefinition } from '@/services/toolbox/types'
import { renderCsv, buildPdfBlob, type ReportContext } from '@/services/toolbox/report'

export type ExportFormat = 'pdf' | 'csv'

export interface ToolReportPreviewProps {
  /** The definition that produced the result (title, source provenance, disclaimers). */
  definition: CalculatorDefinition
  /** The validated top-level inputs the run was computed against. */
  input: Record<string, unknown>
  /** The engine's calculation result. */
  result: CalculationResult
  /** ISO timestamp shown on the report + export (defaults to now at render time). */
  timestamp?: string
  /** Optional saved-run id surfaced for traceability. */
  runId?: string
  /** Whether the current run has been saved (drives the Save button state). */
  saved?: boolean
  /** Whether export is permitted for this tool. */
  canExport?: boolean
  /** Whether assign-to-project is permitted for this tool. */
  canAssign?: boolean
  /** Save the current run to history. */
  onSave?: () => void
  /** Assign the current run to a project. */
  onAssign?: () => void
  /** Notified after a successful export so the run can be marked exported. */
  onExported?: (format: ExportFormat) => void
}

/** Trigger a browser download for a Blob; safe no-op when the DOM/URL API is unavailable. */
function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'report'
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function ToolReportPreview(props: ToolReportPreviewProps) {
  const {
    definition,
    input,
    result,
    timestamp,
    runId,
    saved = false,
    canExport = true,
    canAssign = true,
    onSave,
    onAssign,
    onExported,
  } = props

  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const buildContext = (): ReportContext => ({
    definition,
    input,
    result,
    metadata: { timestamp: timestamp ?? new Date().toISOString(), runId },
  })

  const handleExportCsv = () => {
    setExportError(null)
    setExporting('csv')
    try {
      const csv = renderCsv(buildContext())
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slugify(definition.title)}.csv`)
      onExported?.('csv')
    } catch (err) {
      setExportError(`CSV export failed: ${(err as Error).message}`)
    } finally {
      setExporting(null)
    }
  }

  const handleExportPdf = async () => {
    setExportError(null)
    setExporting('pdf')
    try {
      const blob = await buildPdfBlob(buildContext())
      downloadBlob(blob, `${slugify(definition.title)}.pdf`)
      onExported?.('pdf')
    } catch (err) {
      setExportError(`PDF export failed: ${(err as Error).message}`)
    } finally {
      setExporting(null)
    }
  }

  const inputEntries = Object.entries(input ?? {})
  const aggregateEntries = Object.entries(result.aggregates ?? {})
  const disclaimers = result.disclaimers.length > 0 ? result.disclaimers : definition.disclaimers
  const sourceVersions =
    result.sourceVersions.length > 0
      ? result.sourceVersions
      : [{ guideline: definition.source.guideline, version: definition.source.version }]

  return (
    <Card data-testid="tool-report-preview">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookMarked className="h-4 w-4" aria-hidden="true" />
          Report preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Source provenance (Requirements 1.4, 3.4) */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            {definition.source.guideline} v{definition.source.version}
          </Badge>
          <Badge variant="secondary" className="uppercase">
            {definition.source.status}
          </Badge>
          <span className="text-muted-foreground">
            Generated {new Date(timestamp ?? Date.now()).toLocaleString()}
          </span>
        </div>

        {/* Inputs used (Requirement 1.4) */}
        <section className="space-y-2" aria-label="Inputs used">
          <h3 className="text-sm font-medium">Inputs used</h3>
          {inputEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inputs recorded.</p>
          ) : (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {inputEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2 text-sm">
                  <dt className="text-muted-foreground">{humanizeFieldName(key)}</dt>
                  <dd className="font-medium">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {/* Aggregates */}
        {aggregateEntries.length > 0 && (
          <section className="space-y-2" aria-label="Aggregate results">
            <h3 className="text-sm font-medium">Results</h3>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {aggregateEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2 text-sm">
                  <dt className="text-muted-foreground">{humanizeFieldName(key)}</dt>
                  <dd className="font-medium tabular-nums">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Clause outcomes (Requirements 1.3, 6.3) */}
        <ClauseResultPanel
          clauseResults={result.clauseResults}
          complianceScore={result.complianceScore}
          disclaimers={disclaimers}
        />

        {/* Source versions consumed (Requirements 1.5, 3.4) */}
        <section className="space-y-2" aria-label="Source versions">
          <h3 className="text-sm font-medium">Source versions</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {sourceVersions.map((v, i) => (
              <li key={`${v.guideline}-${i}`}>
                {v.guideline}: {v.version}
              </li>
            ))}
          </ul>
        </section>

        {exportError && (
          <p role="alert" className="text-sm text-destructive">
            {exportError}
          </p>
        )}

        {/* Actions: Save / Export / Assign (Requirement 1.6) */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button type="button" variant={saved ? 'secondary' : 'default'} disabled={saved} onClick={onSave}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {saved ? 'Saved' : 'Save run'}
          </Button>

          {canExport && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={exporting !== null}
                onClick={handleExportPdf}
              >
                <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={exporting !== null}
                onClick={handleExportCsv}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
              </Button>
            </>
          )}

          {canAssign && (
            <Button type="button" variant="outline" onClick={onAssign}>
              <FolderOpen className="mr-2 h-4 w-4" aria-hidden="true" />
              Assign to project
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
