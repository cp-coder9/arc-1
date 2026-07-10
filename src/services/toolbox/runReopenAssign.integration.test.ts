import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import {
  type CalculationResult,
  type CalculatorDefinition,
  type GuidelineTable,
} from './types'
import { runCalculator } from './engine/runCalculator'
import { toRunSnapshot } from './runSnapshot'
import { restoreRunForReopen } from './restoreRun'
import { __resetToolRunRecordSeq } from './toolRunProjectAdapter'
import { StandaloneToolRunService } from '@/services/tools/standaloneToolRunService'

// ----------------------------------------------------------------------------
// Task 4.3 — integration: run → save → reopen → assign.
//
// Exercises Requirement 9.2 (re-open a saved run, restore inputs/schedule rows for
// editing AS A NEW VERSION, deterministic recompute via pinned guideline versions) and
// Requirement 9.3 (assigning to a project records the project/job reference AND creates a
// project-record / document-adapter entry from the run). A version-pinned fixture proves
// the restore round-trips deterministically even after the table is superseded.
// ----------------------------------------------------------------------------

interface FenInput {
  floorAreaM2: number
}
interface FenRow {
  label: string
  glazingAreaM2: number
}
type ZoneRow = { zone: number; maxGlazingRatio: number }

const zoneLimitsV1: GuidelineTable<ZoneRow> = {
  id: 'xa_zone_limits',
  version: '2023.1',
  effectiveFrom: '2023-01-01',
  supersededBy: '2024.1',
  jurisdiction: 'ZA',
  status: 'mandatory',
  rows: [{ zone: 1, maxGlazingRatio: 0.12 }],
}
const zoneLimitsV2: GuidelineTable<ZoneRow> = {
  id: 'xa_zone_limits',
  version: '2024.1',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  status: 'mandatory',
  rows: [{ zone: 1, maxGlazingRatio: 0.2 }],
}
const allTables: GuidelineTable[] = [zoneLimitsV1, zoneLimitsV2]

function makeDef(): CalculatorDefinition<FenInput, FenRow> {
  const def: CalculatorDefinition<FenInput, FenRow> = {
    id: 'xa_fenestration_test_v1',
    toolId: 'fenestration_calc',
    title: 'Fenestration (test)',
    method: 'clauseSet',
    inputSchema: z.object({ floorAreaM2: z.number().positive() }),
    scheduleSchema: z.object({ label: z.string(), glazingAreaM2: z.number().nonnegative() }),
    tableRefs: ['xa_zone_limits'],
    clauseSet: [
      {
        clauseRef: 'SANS 10400-XA 4.3.2',
        label: 'Glazing area within prescriptive limit',
        evaluate: (ctx) => {
          const table = ctx.tables.xa_zone_limits as GuidelineTable<ZoneRow>
          const limit = table.rows[0].maxGlazingRatio
          const totalGlazing = ctx.rows.reduce((s, r) => s + r.glazingAreaM2, 0)
          const ratio = totalGlazing / ctx.input.floorAreaM2
          return {
            outcome: ratio <= limit ? 'pass' : 'fail',
            threshold: `<= ${(limit * 100).toFixed(0)}%`,
            actual: `${(ratio * 100).toFixed(1)}%`,
          }
        },
      },
    ],
    compute: (ctx): CalculationResult => {
      const totalGlazing = ctx.rows.reduce((s, r) => s + r.glazingAreaM2, 0)
      const ratio = totalGlazing / ctx.input.floorAreaM2
      const clauseResults = (def.clauseSet ?? []).map((c) => ({
        clauseRef: c.clauseRef,
        label: c.label,
        ...c.evaluate(ctx),
      }))
      return {
        lineResults: ctx.rows.map((r) => ({ label: r.label, glazingAreaM2: r.glazingAreaM2 })),
        aggregates: { totalGlazingM2: totalGlazing, glazingRatio: Number(ratio.toFixed(4)) },
        clauseResults,
        sourceVersions: [],
        disclaimers: ['Advisory only — professional sign-off required.'],
        warnings: [],
      }
    },
    reportTemplateId: 'xa_fenestration_report',
    source: { guideline: 'SANS 10400-XA', version: '2024.1', status: 'mandatory' },
    disclaimers: ['Advisory only — professional sign-off required.'],
    status: 'full',
  }
  return def
}

const INPUT: FenInput = { floorAreaM2: 100 }
// 15 m² glazing on 100 m² floor = 0.15 ratio: passes v2 (limit 0.20), fails v1 (limit 0.12).
const ROWS: FenRow[] = [
  { label: 'North window', glazingAreaM2: 9 },
  { label: 'East window', glazingAreaM2: 6 },
]

// In-memory localStorage so the run service round-trips regardless of the jsdom shim.
function installMemoryLocalStorage(): void {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  })
}

function makeService(): StandaloneToolRunService {
  installMemoryLocalStorage()
  localStorage.clear()
  __resetToolRunRecordSeq()
  return new StandaloneToolRunService()
}

describe('Task 4.3 — run → save → reopen → assign (Req 9.2, 9.3)', () => {
  let service: StandaloneToolRunService

  beforeEach(() => {
    service = makeService()
  })

  it('restores inputs/rows from a saved run and recomputes deterministically as a new version', () => {
    // 1. RUN — compute pinned to the (older) 2023.1 table, then save with a snapshot.
    const def = makeDef()
    const original = runCalculator(def, INPUT, ROWS, {
      tables: allTables,
      pinnedVersions: { xa_zone_limits: '2023.1' },
    })
    expect(original.clauseResults[0].outcome).toBe('fail') // limit 0.12, ratio 0.15

    const snapshot = toRunSnapshot(def, original, ROWS)
    // 2. SAVE — persist the run with its framework snapshot.
    const saved = service.createRun({
      toolId: def.toolId,
      toolLabel: 'XA Fenestration Calculator',
      category: 'compliance',
      userId: 'user-1',
      role: 'energy_professional',
      input: INPUT as unknown as Record<string, unknown>,
      output: original.aggregates,
      snapshot,
    })
    expect(saved.version).toBe(1)

    // 3. REOPEN — restore editable state from the saved run.
    const restored = restoreRunForReopen(saved)
    expect(restored.input).toEqual(INPUT)
    expect(restored.scheduleRows).toEqual(ROWS)
    expect(restored.pinnedVersions).toEqual({ xa_zone_limits: '2023.1' })
    expect(restored.sourceRunId).toBe(saved.runId)

    // Recompute with the restored pins — must reproduce the original outcome exactly,
    // even though 2024.1 is now the "latest" table (Property 1, determinism).
    const replay = runCalculator(def, restored.input, restored.scheduleRows, {
      tables: allTables,
      pinnedVersions: restored.pinnedVersions,
    })
    expect(replay.clauseResults).toEqual(original.clauseResults)
    expect(replay.aggregates).toEqual(original.aggregates)

    // Save the edited result AS A NEW VERSION — bumps version, links lineage.
    const reopened = service.reopenAsNewVersion(saved.runId, {
      output: replay.aggregates,
      snapshot: toRunSnapshot(def, replay, restored.scheduleRows),
    })
    expect(reopened).not.toBeNull()
    expect(reopened?.version).toBe(2)
    expect(reopened?.previousRunId).toBe(saved.runId)
    expect(reopened?.scheduleRows).toEqual(ROWS)
    // The parent run is left intact (immutable history).
    expect(service.getRunById(saved.runId)?.version).toBe(1)
  })

  it('assigns the reopened run to a project, recording the ref AND creating adapter entries', () => {
    const def = makeDef()
    const result = runCalculator(def, INPUT, ROWS, {
      tables: allTables,
      pinnedVersions: { xa_zone_limits: '2023.1' },
    })
    const saved = service.createRun({
      toolId: def.toolId,
      toolLabel: 'XA Fenestration Calculator',
      category: 'compliance',
      userId: 'user-1',
      role: 'energy_professional',
      input: INPUT as unknown as Record<string, unknown>,
      output: result.aggregates,
      snapshot: toRunSnapshot(def, result, ROWS),
    })
    const reopened = service.reopenAsNewVersion(saved.runId)
    expect(reopened).not.toBeNull()

    // 4. ASSIGN — record project/job ref and create the project-record + document entry.
    const handoffResult = service.assignToProjectWithHandoff(reopened!.runId, {
      runId: reopened!.runId,
      projectName: 'Riverside House',
      jobRef: 'JOB-2024-017',
      notes: 'XA fenestration pre-check for municipal submission',
    })

    expect(handoffResult).not.toBeNull()
    const { run, handoff } = handoffResult!

    // Project/job reference recorded on the run (Req 9.3).
    expect(run.assignedToProject).toBe('Riverside House')
    expect(run.assignedToJobRef).toBe('JOB-2024-017')

    // Project-record entry created from the run.
    expect(handoff.projectRecord.recordType).toBe('tool_run')
    expect(handoff.projectRecord.projectName).toBe('Riverside House')
    expect(handoff.projectRecord.jobRef).toBe('JOB-2024-017')
    expect(handoff.projectRecord.sourceRunId).toBe(reopened!.runId)
    expect(handoff.projectRecord.calculatorDefinitionId).toBe('xa_fenestration_test_v1')
    expect(handoff.projectRecord.guidelineVersions).toContainEqual(expect.objectContaining({
      guideline: 'xa_zone_limits',
      version: '2023.1',
    }))
    expect(handoff.projectRecord.clauseResults).toEqual(result.clauseResults)

    // Document-adapter entry created from the run.
    expect(handoff.documentOutput.kind).toBe('tool_run_report')
    expect(handoff.documentOutput.projectId).toBe('Riverside House')
    expect(handoff.documentOutput.sourceRevisionId).toBe(`run-${reopened!.runId}-v${run.version}`)

    // References persisted back onto the run and round-tripped through storage.
    expect(run.projectRecordId).toBe(handoff.projectRecord.recordId)
    expect(run.documentId).toBe(handoff.documentOutput.documentId)
    const reloaded = service.getRunById(reopened!.runId)
    expect(reloaded?.projectRecordId).toBe(handoff.projectRecord.recordId)
    expect(reloaded?.documentId).toBe(handoff.documentOutput.documentId)
  })

  it('returns null for reopen/assign of an unknown run', () => {
    expect(service.reopenAsNewVersion('does-not-exist')).toBeNull()
    expect(
      service.assignToProjectWithHandoff('does-not-exist', {
        runId: 'does-not-exist',
        projectName: 'X',
        jobRef: 'Y',
      }),
    ).toBeNull()
  })
})
