import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  CalculatorError,
  type CalculationResult,
  type CalculatorDefinition,
  type GuidelineTable,
} from '../types'
import { runCalculator } from './runCalculator'

interface DemoInput {
  floorAreaM2: number
}
interface DemoRow {
  label: string
  areaM2: number
}

const zoneLimitsV1: GuidelineTable<{ zone: number; maxGlazingRatio: number }> = {
  id: 'demo_zone_limits',
  version: '1.0.0',
  effectiveFrom: '2023-01-01',
  supersededBy: '2.0.0',
  jurisdiction: 'ZA',
  rows: [{ zone: 1, maxGlazingRatio: 0.12 }],
}
const zoneLimitsV2: GuidelineTable<{ zone: number; maxGlazingRatio: number }> = {
  id: 'demo_zone_limits',
  version: '2.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [{ zone: 1, maxGlazingRatio: 0.15 }],
}
const allTables = [zoneLimitsV1, zoneLimitsV2]

/** A demo definition that sums valid rows and reads its threshold from the resolved table. */
function makeDef(): CalculatorDefinition<DemoInput, DemoRow> {
  const def: CalculatorDefinition<DemoInput, DemoRow> = {
    id: 'demo_v1',
    toolId: 'demo_tool',
    title: 'Demo Calculator',
    method: 'clauseSet',
    inputSchema: z.object({ floorAreaM2: z.number().positive() }),
    scheduleSchema: z.object({ label: z.string(), areaM2: z.number().nonnegative() }),
    tableRefs: ['demo_zone_limits'],
    clauseSet: [
      {
        clauseRef: 'DEMO 1.1',
        label: 'Glazing within limit',
        evaluate: (ctx) => {
          const table = ctx.tables.demo_zone_limits as GuidelineTable<{ maxGlazingRatio: number }>
          const limit = table.rows[0].maxGlazingRatio
          const totalArea = ctx.rows.reduce((s, r) => s + r.areaM2, 0)
          const ratio = ctx.input.floorAreaM2 > 0 ? totalArea / ctx.input.floorAreaM2 : 0
          return {
            outcome: ratio <= limit ? 'pass' : 'fail',
            threshold: `<= ${limit}`,
            actual: ratio.toFixed(2),
          }
        },
      },
    ],
    compute: (ctx): CalculationResult => {
      const total = ctx.rows.reduce((sum, r) => sum + r.areaM2, 0)
      const clauseResults = (def.clauseSet ?? []).map((c) => ({
        clauseRef: c.clauseRef,
        label: c.label,
        ...c.evaluate(ctx),
      }))
      return {
        lineResults: ctx.rows.map((r) => ({ label: r.label, areaM2: r.areaM2 })),
        aggregates: { totalAreaM2: total },
        clauseResults,
        sourceVersions: [],
        disclaimers: ['Advisory only — professional sign-off required.'],
        warnings: [],
      }
    },
    reportTemplateId: 'demo_report',
    source: { guideline: 'Demo Guideline', version: '1.0.0', status: 'mandatory' },
    disclaimers: ['Advisory only — professional sign-off required.'],
    status: 'full',
  }
  return def
}

describe('runCalculator — core flow', () => {
  it('validates input, resolves the latest table, runs compute, and aggregates', () => {
    const result = runCalculator(
      makeDef(),
      { floorAreaM2: 100 },
      [
        { label: 'A', areaM2: 5 },
        { label: 'B', areaM2: 8 },
      ],
      { tables: allTables },
    )
    expect(result.aggregates.totalAreaM2).toBe(13)
    expect(result.lineResults).toHaveLength(2)
    // Latest table version (2.0.0, limit 0.15) → 13/100 = 0.13 ≤ 0.15 → pass.
    expect(result.clauseResults[0]).toMatchObject({ clauseRef: 'DEMO 1.1', outcome: 'pass' })
  })

  it('guarantees resolved table versions appear in sourceVersions (traceability)', () => {
    const result = runCalculator(makeDef(), { floorAreaM2: 100 }, [], { tables: allTables })
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({ guideline: 'demo_zone_limits', version: '2.0.0' }))
  })

  it('pins the table version when requested (deterministic replay)', () => {
    const result = runCalculator(
      makeDef(),
      { floorAreaM2: 100 },
      [{ label: 'A', areaM2: 14 }],
      { tables: allTables, pinnedVersions: { demo_zone_limits: '1.0.0' } },
    )
    // Pinned v1 limit is 0.12 → 14/100 = 0.14 > 0.12 → fail (latest would have passed).
    expect(result.clauseResults[0].outcome).toBe('fail')
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({ guideline: 'demo_zone_limits', version: '1.0.0' }))
  })
})

describe('runCalculator — schedule row isolation', () => {
  it('excludes invalid rows from aggregates and warns, without failing the run', () => {
    const result = runCalculator(
      makeDef(),
      { floorAreaM2: 100 },
      [
        { label: 'A', areaM2: 5 },
        { label: 'B', areaM2: -3 }, // invalid: negative area
        { label: 123, areaM2: 4 }, // invalid: label not a string
      ],
      { tables: allTables },
    )
    expect(result.aggregates.totalAreaM2).toBe(5)
    expect(result.lineResults).toHaveLength(1)
    expect(result.warnings.length).toBe(2)
    expect(result.warnings[0]).toContain('Row 2 excluded')
  })
})

describe('runCalculator — failures', () => {
  it('throws INVALID_INPUT when top-level inputs fail schema validation', () => {
    try {
      runCalculator(makeDef(), { floorAreaM2: -1 }, [], { tables: allTables })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalculatorError)
      expect((e as CalculatorError).code).toBe('INVALID_INPUT')
    }
  })

  it('propagates MISSING_TABLE when a consumed table is unavailable', () => {
    try {
      runCalculator(makeDef(), { floorAreaM2: 100 }, [], { tables: [] })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalculatorError)
      expect((e as CalculatorError).code).toBe('MISSING_TABLE')
    }
  })

  it('wraps compute exceptions as COMPUTE_FAILED', () => {
    const def = makeDef()
    def.compute = () => {
      throw new Error('boom')
    }
    try {
      runCalculator(def, { floorAreaM2: 100 }, [], { tables: allTables })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalculatorError)
      expect((e as CalculatorError).code).toBe('COMPUTE_FAILED')
    }
  })
})
