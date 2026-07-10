import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { CalculatorError } from '@/services/toolbox/types'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  rvalueCalcV1,
  rvalueInputSchema,
  rvalueLayerSchema,
  computeAssemblyRValue,
  type MaterialRow,
} from './rvalue'
import type { GuidelineTable } from '@/services/toolbox/types'

function run(input: unknown, rows: unknown[]) {
  return runCalculator(rvalueCalcV1, input, rows, { tables: SEED_GUIDELINE_TABLES })
}

const materialTable = SEED_GUIDELINE_TABLES.find(
  (t) => t.id === 'material_r_values',
) as GuidelineTable<MaterialRow>

describe('rvalueLayerSchema / rvalueInputSchema validation', () => {
  it('accepts a valid layer and rejects a non-positive thickness', () => {
    expect(
      rvalueLayerSchema.safeParse({ label: 'Brick', material: 'brick_clay', thicknessMm: 110 })
        .success,
    ).toBe(true)
    expect(
      rvalueLayerSchema.safeParse({ label: 'Brick', material: 'brick_clay', thicknessMm: 0 })
        .success,
    ).toBe(false)
  })

  it('rejects an out-of-range climate zone and an invalid element type', () => {
    expect(rvalueInputSchema.safeParse({ climateZone: 8, elementType: 'wall' }).success).toBe(false)
    expect(rvalueInputSchema.safeParse({ climateZone: 4, elementType: 'door' }).success).toBe(false)
  })
})

describe('computeAssemblyRValue — layer math', () => {
  it('computes R = thickness/conductivity for a conductivity-based layer', () => {
    const { layerRValue, layers } = computeAssemblyRValue(
      [{ label: 'Brick', material: 'brick_clay', thicknessMm: 110 }],
      materialTable,
    )
    // 0.110 / 0.84 = 0.1310 -> 0.131
    expect(layers[0].rValue).toBeCloseTo(0.131, 3)
    expect(layerRValue).toBeCloseTo(0.131, 3)
  })

  it('uses a fixed material R-value (air gap) over thickness/conductivity', () => {
    const { layers } = computeAssemblyRValue(
      [{ label: 'Air', material: 'air_gap_25mm', thicknessMm: 25 }],
      materialTable,
    )
    expect(layers[0].rValue).toBeCloseTo(0.17, 3)
  })

  it('prefers a per-layer override and flags unknown materials', () => {
    const { layers, warnings } = computeAssemblyRValue(
      [
        { label: 'Custom', material: 'mystery', thicknessMm: 50, conductivity: 0.05 },
        { label: 'Unknown', material: 'mystery', thicknessMm: 50 },
      ],
      materialTable,
    )
    // 0.05/0.05 = 1.0 from the override
    expect(layers[0].rValue).toBeCloseTo(1.0, 3)
    expect(layers[0].matched).toBe(true)
    expect(layers[1].matched).toBe(false)
    expect(warnings.some((w) => w.includes('mystery'))).toBe(true)
  })
})

describe('rvalue_calc_v1 — registration & wiring', () => {
  it('is registered under its id and references the shared tables', () => {
    expect(getCalculatorDefinition('rvalue_calc_v1')).toBe(rvalueCalcV1)
    expect(rvalueCalcV1.toolId).toBe('rvalue_calc')
    expect(rvalueCalcV1.tableRefs).toEqual(['material_r_values', 'xa_rvalue_minimums'])
  })
})

describe('rvalue_calc_v1 — runs through runCalculator with seeded tables', () => {
  it('passes the deemed-to-satisfy clause for an insulated wall (zone 4)', () => {
    const result = run({ climateZone: 4, elementType: 'wall' }, [
      { label: 'Outer brick', material: 'brick_clay', thicknessMm: 110 },
      { label: 'Cavity', material: 'air_gap_25mm', thicknessMm: 25 },
      { label: 'Plaster', material: 'cement_plaster', thicknessMm: 15 },
    ])
    // layers: 0.131 + 0.170 + 0.021 = 0.322; total = 0.13 + 0.322 + 0.04 = 0.492
    expect(result.aggregates.totalRValue).toBeCloseTo(0.492, 2)
    expect(result.aggregates.minRequiredRValue).toBe(0.35)
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2')
    expect(clause?.outcome).toBe('pass')
    expect(clause?.threshold).toContain('0.35')
    expect(clause?.threshold).toContain('zone 4')
    // Traceability: both consumed tables appear in sourceVersions (design Property 2).
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({ guideline: 'xa_rvalue_minimums', version: '2021.1' }))
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({ guideline: 'material_r_values', version: '1.0.0' }))
  })

  it('fails when a thin uninsulated wall misses the minimum', () => {
    const result = run({ climateZone: 4, elementType: 'wall' }, [
      { label: 'Plaster only', material: 'cement_plaster', thicknessMm: 15 },
    ])
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes a well-insulated roof and fails an under-insulated one (zone 4 min 3.7)', () => {
    const pass = run({ climateZone: 4, elementType: 'roof' }, [
      { label: 'Insulation', material: 'mineral_wool', thicknessMm: 150 },
    ])
    // 0.15/0.04 = 3.75; total = 0.1 + 3.75 + 0.04 = 3.89
    expect(pass.aggregates.totalRValue).toBeCloseTo(3.89, 2)
    expect(
      pass.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2')?.outcome,
    ).toBe('pass')

    const fail = run({ climateZone: 4, elementType: 'roof' }, [
      { label: 'Thin insulation', material: 'mineral_wool', thicknessMm: 80 },
    ])
    expect(
      fail.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2')?.outcome,
    ).toBe('fail')
  })

  it('reports advisory (not a false pass) when no layers are entered', () => {
    const result = run({ climateZone: 4, elementType: 'wall' }, [])
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2')
    expect(clause?.outcome).toBe('advisory')
  })

  it('isolates an invalid layer row rather than failing the run', () => {
    const result = run({ climateZone: 4, elementType: 'wall' }, [
      { label: 'Good', material: 'brick_clay', thicknessMm: 110 },
      { label: 'Bad', material: 'brick_clay', thicknessMm: -5 },
    ])
    expect(result.lineResults).toHaveLength(1)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })

  it('throws INVALID_INPUT for an out-of-range climate zone', () => {
    expect(() => run({ climateZone: 9, elementType: 'wall' }, [])).toThrow(CalculatorError)
  })

  it('cites a different zone minimum for the roof element (zone 3 = 2.7)', () => {
    const result = run({ climateZone: 3, elementType: 'roof' }, [
      { label: 'Insulation', material: 'mineral_wool', thicknessMm: 120 },
    ])
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2')
    expect(clause?.threshold).toContain('2.7')
    expect(clause?.threshold).toContain('zone 3')
  })
})
