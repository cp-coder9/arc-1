import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  CalculatorError,
  type CalculatorDefinition,
  type CalculationResult,
  type ClauseCheckDef,
  type ComputeContext,
  type GuidelineTable,
} from './types'

describe('CalculatorError', () => {
  it('carries a typed code and is an instanceof Error and CalculatorError', () => {
    const err = new CalculatorError('MISSING_TABLE_VERSION', 'no version', { tableId: 'xa_zone_limits' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(CalculatorError)
    expect(err.name).toBe('CalculatorError')
    expect(err.code).toBe('MISSING_TABLE_VERSION')
    expect(err.details).toEqual({ tableId: 'xa_zone_limits' })
    expect(err.message).toBe('no version')
  })

  it('is throwable and catchable by code', () => {
    const thrower = () => {
      throw new CalculatorError('MISSING_TABLE', 'table missing')
    }
    try {
      thrower()
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalculatorError)
      expect((e as CalculatorError).code).toBe('MISSING_TABLE')
    }
  })
})

describe('CalculatorDefinition contract', () => {
  // A minimal, well-typed definition proves the contract is authorable end-to-end.
  interface DemoInput {
    floorAreaM2: number
  }
  interface DemoRow {
    label: string
    areaM2: number
  }

  const zoneLimits: GuidelineTable<{ zone: number; maxGlazingRatio: number }> = {
    id: 'demo_zone_limits',
    version: '1.0.0',
    effectiveFrom: '2024-01-01',
    jurisdiction: 'ZA',
    status: 'mandatory',
    rows: [{ zone: 1, maxGlazingRatio: 0.15 }],
  }

  const clauseCheck: ClauseCheckDef<DemoInput, DemoRow> = {
    clauseRef: 'DEMO 1.1',
    label: 'Floor area present',
    evaluate: (ctx) => ({
      outcome: ctx.input.floorAreaM2 > 0 ? 'pass' : 'fail',
      threshold: '> 0',
      actual: String(ctx.input.floorAreaM2),
    }),
  }

  const def: CalculatorDefinition<DemoInput, DemoRow> = {
    id: 'demo_v1',
    toolId: 'demo_tool',
    title: 'Demo Calculator',
    method: 'clauseSet',
    inputSchema: z.object({ floorAreaM2: z.number() }),
    scheduleSchema: z.object({ label: z.string(), areaM2: z.number() }),
    tableRefs: ['demo_zone_limits'],
    clauseSet: [clauseCheck],
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
        sourceVersions: [{ guideline: 'Demo Guideline', version: '1.0.0' }],
        disclaimers: ['Advisory only — professional sign-off required.'],
        warnings: [],
      }
    },
    reportTemplateId: 'demo_report',
    source: { guideline: 'Demo Guideline', version: '1.0.0', status: 'mandatory' },
    disclaimers: ['Advisory only — professional sign-off required.'],
    status: 'full',
  }

  it('validates inputs via its Zod inputSchema', () => {
    expect(() => def.inputSchema.parse({ floorAreaM2: 100 })).not.toThrow()
    expect(() => def.inputSchema.parse({ floorAreaM2: 'oops' })).toThrow()
  })

  it('computes a CalculationResult with pinned source versions and disclaimers', () => {
    const ctx: ComputeContext<DemoInput, DemoRow> = {
      input: { floorAreaM2: 100 },
      rows: [
        { label: 'A', areaM2: 10 },
        { label: 'B', areaM2: 15 },
      ],
      tables: { demo_zone_limits: zoneLimits },
    }
    const result = def.compute(ctx)
    expect(result.aggregates.totalAreaM2).toBe(25)
    expect(result.lineResults).toHaveLength(2)
    expect(result.clauseResults[0]).toMatchObject({ clauseRef: 'DEMO 1.1', outcome: 'pass' })
    expect(result.sourceVersions).toEqual([{ guideline: 'Demo Guideline', version: '1.0.0' }])
    expect(result.disclaimers.length).toBeGreaterThan(0)
  })
})
