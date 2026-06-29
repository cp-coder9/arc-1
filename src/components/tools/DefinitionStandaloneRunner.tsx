// DefinitionStandaloneRunner — definition-driven standalone tool path (Task 5.3)
//
// Composes the Toolbox Capability Framework UI for a tool whose `calculatorDefinitionId`
// resolves to a registered `CalculatorDefinition`:
//   • `DefinitionToolRunner` renders the typed Zod form and runs the engine live.
//   • `ScheduleGrid` (when the definition declares a `scheduleSchema`) edits line items.
//   • `ToolReportPreview` (which embeds `ClauseResultPanel`) shows the audit-ready report
//     and wires Save (run history), Export (PDF/CSV), and Assign-to-Project.
//
// Save / Export / Assign delegate to the same parent callbacks the legacy runner uses, so
// the existing `StandaloneToolTilesPage` persistence wiring (createRun / markExported /
// assignToProject) is reused unchanged — consistent with `standaloneToolRunService`
// (Requirement 1.6).
//
// Requirements: 1.3, 1.6, 6.3.

import React, { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { StandaloneToolDef, StandaloneToolRun } from '@/types/standaloneToolTypes'
import type { CalculationResult, CalculatorDefinition } from '@/services/toolbox/types'
import DefinitionToolRunner from './DefinitionToolRunner'
import ScheduleGrid from './ScheduleGrid'
import ToolReportPreview, { type ExportFormat } from './ToolReportPreview'

export interface DefinitionStandaloneRunnerProps {
  definition: CalculatorDefinition
  tool: StandaloneToolDef
  onBack: () => void
  onSave: (input: Record<string, unknown>, output: Record<string, unknown>) => void
  onAssign: (run: StandaloneToolRun) => void
  onExport: (run: StandaloneToolRun, format: 'pdf' | 'csv' | 'json') => void
  latestRun: StandaloneToolRun | null
}

/** Flatten a `CalculationResult` into the legacy `output` record shape persisted by the runner. */
function resultToOutput(result: CalculationResult): Record<string, unknown> {
  const output: Record<string, unknown> = { ...result.aggregates }
  if (typeof result.complianceScore === 'number') output.complianceScore = result.complianceScore
  if (result.clauseResults.length > 0) {
    output.clauseSummary = result.clauseResults
      .map((c) => `${c.clauseRef}: ${c.outcome}`)
      .join('; ')
  }
  return output
}

export default function DefinitionStandaloneRunner(props: DefinitionStandaloneRunnerProps) {
  const { definition, tool, onBack, onSave, onAssign, onExport, latestRun } = props

  const [rows, setRows] = useState<unknown[]>([])
  const [input, setInput] = useState<Record<string, unknown>>({})
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [saved, setSaved] = useState(false)

  const handleRun = (runInput: Record<string, unknown>, runResult: CalculationResult) => {
    setInput(runInput)
    setResult(runResult)
    setSaved(false)
  }

  const handleResultChange = (next: CalculationResult | null) => {
    if (next === null) {
      setResult(null)
      setSaved(false)
    }
  }

  const handleSave = () => {
    if (!result) return
    onSave(input, resultToOutput(result))
    setSaved(true)
  }

  const handleAssign = () => {
    if (latestRun) onAssign(latestRun)
  }

  const handleExported = (format: ExportFormat) => {
    // The report layer has already generated + downloaded the file; mark the run exported
    // through the parent so run history reflects it (consistent with markExported).
    if (latestRun) onExport(latestRun, format)
  }

  const renderResult = (computed: CalculationResult) => (
    <ToolReportPreview
      definition={definition}
      input={input}
      result={computed}
      runId={latestRun?.runId}
      saved={saved}
      canExport={tool.canExport}
      canAssign={tool.canAssignToProject}
      onSave={handleSave}
      onAssign={handleAssign}
      onExported={handleExported}
    />
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to tools"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div>
          <h3 className="text-lg font-bold">{tool.label}</h3>
          <p className="text-sm text-muted-foreground">
            Standalone mode — clause-aware calculator with audit-ready report
          </p>
        </div>
      </div>

      <DefinitionToolRunner
        definition={definition}
        scheduleRows={rows}
        onRun={handleRun}
        onResult={handleResultChange}
        renderResult={renderResult}
      >
        {definition.scheduleSchema && (
          <div className="mt-4">
            <ScheduleGrid
              scheduleSchema={definition.scheduleSchema}
              onRowsChange={setRows}
              title="Schedule"
            />
          </div>
        )}
      </DefinitionToolRunner>
    </div>
  )
}
