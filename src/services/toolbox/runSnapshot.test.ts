import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  type CalculationResult,
  type CalculatorDefinition,
  type GuidelineTable,
} from './types'
import { runCalculator } from './engine/runCalculator'
import { toRunSnapshot, pinnedVersionsFromSnapshot } from './runSnapshot'

// ----------------------------------------------------------------------------
// Test fixtures: a calculator whose threshold lives ONLY in a versioned table.
// The compute reads `maxGlazingRatio` from the resolved table — never a constant —
// so a version change MUST change the outcome (design Property 2).
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

// ----------------------------------------------------------------------------
// Requirement 10.4 / Property 2 — engine reads the value from the versioned
// table, NOT a hard-coded constant. Proof: swapping the pinned table version
// (with all other inputs identical) flips the clause outcome.
// **Validates: Requirements 3.1, 10.4**
// ----------------------------------------------------------------------------

describe('Property 2 — no hidden constants (Requirement 10.4)', () => {
  it('changes the clause outcome when the guideline table version changes', () => {
    const onLatest = runCalculator(makeDef(), INPUT, ROWS, { tables: allTables })
    const onV1 = runCalculator(makeDef(), INPUT, ROWS, {
      tables: allTables,
      pinnedVersions: { xa_zone_limits: '2023.1' },
    })

    // Same inputs, different table version -> different result. The threshold can only
    // come from the table, so this proves it is not a baked-in constant.
    expect(onLatest.clauseResults[0].outcome).toBe('pass') // limit 0.20, ratio 0.15
    expect(onV1.clauseResults[0].outcome).toBe('fail') // limit 0.12, ratio 0.15
    expect(onLatest.clauseResults[0].threshold).not.toBe(onV1.clauseResults[0].threshold)
  })

  it('traces every consumed table version in sourceVersions', () => {
    const result = runCalculator(makeDef(), INPUT, ROWS, { tables: allTables })
    // Default resolution picks the latest non-superseded version (2024.1).
    expect(result.sourceVersions).toContainEqual({ guideline: 'xa_zone_limits', version: '2024.1' })
  })
})

// ----------------------------------------------------------------------------
// Requirement 3.3 / Property 1 — version pinning determinism. Snapshotting a run
// then recomputing it with its pinned guidelineVersions reproduces identical
// clauseResults and aggregates, even after the table is superseded by a new version.
// **Validates: Requirements 3.3, 10.4**
// ----------------------------------------------------------------------------

describe('Property 1 — version pinning determinism (Requirement 3.3)', () => {
  it('snapshots guidelineVersions from CalculationResult.sourceVersions into the run', () => {
    const result = runCalculator(makeDef(), INPUT, ROWS, {
      tables: allTables,
      pinnedVersions: { xa_zone_limits: '2023.1' },
    })
    const snapshot = toRunSnapshot(makeDef(), result, ROWS)

    expect(snapshot.calculatorDefinitionId).toBe('xa_fenestration_test_v1')
    expect(snapshot.scheduleRows).toEqual(ROWS)
    expect(snapshot.guidelineVersions).toContainEqual({ guideline: 'xa_zone_limits', version: '2023.1' })
    expect(snapshot.clauseResults).toEqual(result.clauseResults)
  })

  it('reproduces identical clauseResults and aggregates when replayed with pinned versions', () => {
    // Original run pinned to the (now older) 2023.1 table.
    const original = runCalculator(makeDef(), INPUT, ROWS, {
      tables: allTables,
      pinnedVersions: { xa_zone_limits: '2023.1' },
    })
    const snapshot = toRunSnapshot(makeDef(), original, ROWS)

    // Time passes; a newer table version (2024.1) exists and is the default "latest".
    // Replaying from the snapshot's pins must NOT drift to the newer version.
    const replay = runCalculator(makeDef(), INPUT, snapshot.scheduleRows, {
      tables: allTables,
      pinnedVersions: pinnedVersionsFromSnapshot(snapshot.guidelineVersions),
    })

    expect(replay.clauseResults).toEqual(original.clauseResults)
    expect(replay.aggregates).toEqual(original.aggregates)
    expect(replay.sourceVersions).toEqual(original.sourceVersions)
  })

  it('a default (unpinned) recompute can differ once the table is superseded — pinning is what guarantees determinism', () => {
    const original = runCalculator(makeDef(), INPUT, ROWS, {
      tables: allTables,
      pinnedVersions: { xa_zone_limits: '2023.1' },
    })
    const unpinnedReplay = runCalculator(makeDef(), INPUT, ROWS, { tables: allTables })

    // Sanity guard for the determinism test above: without pinning, the outcome can change.
    expect(original.clauseResults[0].outcome).toBe('fail')
    expect(unpinnedReplay.clauseResults[0].outcome).toBe('pass')
  })

  it('pinnedVersionsFromSnapshot round-trips guideline ids back to a pin map', () => {
    const pins = pinnedVersionsFromSnapshot([
      { guideline: 'xa_zone_limits', version: '2023.1' },
      { guideline: 'glazing_props', version: '1.0.0' },
    ])
    expect(pins).toEqual({ xa_zone_limits: '2023.1', glazing_props: '1.0.0' })
  })
})
