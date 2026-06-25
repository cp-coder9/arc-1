import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { CalculatorError } from '@/services/toolbox/types'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  fenestrationNV1,
  fenestrationNInputSchema,
  fenestrationNRoomSchema,
} from './fenestrationN'

function run(input: unknown, rows: unknown[]) {
  return runCalculator(fenestrationNV1, input, rows, { tables: SEED_GUIDELINE_TABLES })
}

describe('fenestrationN schema validation', () => {
  it('defaults occupancy to habitable and requires a positive floor area', () => {
    expect(fenestrationNInputSchema.parse({}).occupancyDefault).toBe('habitable')
    expect(
      fenestrationNRoomSchema.safeParse({
        roomName: 'Lounge',
        floorAreaM2: 0,
        ventilationOpeningM2: 1,
        glazedAreaM2: 2,
      }).success,
    ).toBe(false)
  })
})

describe('fenestration_n_v1 — registration & wiring', () => {
  it('is registered under its id, distinct from the XA fenestration definition', () => {
    expect(getCalculatorDefinition('fenestration_n_v1')).toBe(fenestrationNV1)
    expect(fenestrationNV1.toolId).toBe('fenestration_calc')
    expect(fenestrationNV1.source.guideline).toBe('SANS 10400-N')
    expect(fenestrationNV1.tableRefs).toEqual(['sans_10400_n_requirements'])
  })
})

describe('fenestration_n_v1 — ventilation 5% / lighting 10% checks', () => {
  it('passes both clauses when every room meets the minimums', () => {
    const result = run({ occupancyDefault: 'habitable' }, [
      { roomName: 'Bedroom', floorAreaM2: 20, ventilationOpeningM2: 1.5, glazedAreaM2: 2.5 },
      { roomName: 'Lounge', floorAreaM2: 30, ventilationOpeningM2: 2.0, glazedAreaM2: 3.5 },
    ])
    const vent = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-N 4.1')
    const light = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-N 5.1')
    expect(vent?.outcome).toBe('pass')
    expect(light?.outcome).toBe('pass')
    expect(vent?.threshold).toContain('5%')
    expect(light?.threshold).toContain('10%')
    // Per-room line results.
    expect(result.lineResults).toHaveLength(2)
    expect(result.lineResults[0].ventilation).toBe('pass')
    expect(result.lineResults[0].ventilationPct).toBeCloseTo(7.5, 1)
    // Traceability.
    expect(result.sourceVersions).toContainEqual({
      guideline: 'sans_10400_n_requirements',
      version: '2012.1',
    })
  })

  it('fails ventilation and lists the non-compliant room', () => {
    const result = run({ occupancyDefault: 'habitable' }, [
      { roomName: 'Bathroom', floorAreaM2: 8, ventilationOpeningM2: 0.2, glazedAreaM2: 1.0 },
    ])
    const vent = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-N 4.1')
    // 0.2/8 = 2.5% < 5%
    expect(vent?.outcome).toBe('fail')
    expect(vent?.note).toContain('Bathroom')
  })

  it('fails lighting when glazed area is below 10%', () => {
    const result = run({ occupancyDefault: 'habitable' }, [
      { roomName: 'Study', floorAreaM2: 20, ventilationOpeningM2: 1.5, glazedAreaM2: 1.0 },
    ])
    const light = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-N 5.1')
    // 1.0/20 = 5% < 10%
    expect(light?.outcome).toBe('fail')
  })

  it('treats non-habitable rooms as having no lighting requirement (advisory when none applicable)', () => {
    const result = run({ occupancyDefault: 'habitable' }, [
      { roomName: 'Store', floorAreaM2: 10, ventilationOpeningM2: 0.6, glazedAreaM2: 0, occupancy: 'non_habitable' },
    ])
    const light = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-N 5.1')
    expect(light?.outcome).toBe('advisory')
    expect(result.lineResults[0].lighting).toBe('n/a')
    // ventilation still applies: 0.6/10 = 6% >= 5%
    const vent = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-N 4.1')
    expect(vent?.outcome).toBe('pass')
  })

  it('isolates an invalid room row rather than failing the run', () => {
    const result = run({ occupancyDefault: 'habitable' }, [
      { roomName: 'Good', floorAreaM2: 20, ventilationOpeningM2: 1.5, glazedAreaM2: 2.5 },
      { roomName: 'Bad', floorAreaM2: -1, ventilationOpeningM2: 1, glazedAreaM2: 2 },
    ])
    expect(result.lineResults).toHaveLength(1)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })

  it('throws INVALID_INPUT for an invalid occupancy default', () => {
    expect(() => run({ occupancyDefault: 'commercial' }, [])).toThrow(CalculatorError)
  })
})
