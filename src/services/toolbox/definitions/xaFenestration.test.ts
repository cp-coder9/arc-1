import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { CalculatorError } from '@/services/toolbox/types'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  xaFenestrationV1,
  xaFenestrationInputSchema,
  xaOpeningRowSchema,
  type XaOpeningRow,
} from './xaFenestration'

// Convenience: run the definition against the bundled seed tables.
function run(input: unknown, rows: unknown[]) {
  return runCalculator(xaFenestrationV1, input, rows, { tables: SEED_GUIDELINE_TABLES })
}

const validOpening: XaOpeningRow = {
  label: 'W1',
  orientation: 'N',
  areaM2: 4,
  glazingType: 'double_lowe',
  shading: 'overhang',
}

describe('xaOpeningRowSchema — per-opening validation', () => {
  it('accepts a valid opening row and applies the shading default', () => {
    const parsed = xaOpeningRowSchema.parse({
      label: 'W1',
      orientation: 'N',
      areaM2: 4,
      glazingType: 'double_lowe',
    })
    expect(parsed.shading).toBe('none')
  })

  it('accepts per-opening U-value / SHGC overrides', () => {
    const parsed = xaOpeningRowSchema.parse({
      label: 'D1',
      orientation: 'S',
      areaM2: 6,
      glazingType: 'custom',
      uValue: 1.6,
      shgc: 0.35,
    })
    expect(parsed.uValue).toBe(1.6)
    expect(parsed.shgc).toBe(0.35)
  })

  it('rejects an invalid orientation', () => {
    const r = xaOpeningRowSchema.safeParse({ ...validOpening, orientation: 'X' })
    expect(r.success).toBe(false)
  })

  it('rejects a non-positive area', () => {
    const r = xaOpeningRowSchema.safeParse({ ...validOpening, areaM2: 0 })
    expect(r.success).toBe(false)
  })

  it('rejects an SHGC outside 0–1', () => {
    const r = xaOpeningRowSchema.safeParse({ ...validOpening, shgc: 1.4 })
    expect(r.success).toBe(false)
  })

  it('rejects a missing label', () => {
    const r = xaOpeningRowSchema.safeParse({ ...validOpening, label: '' })
    expect(r.success).toBe(false)
  })
})

describe('xaFenestrationInputSchema — top-level validation', () => {
  it('accepts a valid building input and defaults storeys to 1', () => {
    const parsed = xaFenestrationInputSchema.parse({ climateZone: 4, netFloorAreaM2: 120 })
    expect(parsed.storeys).toBe(1)
  })

  it('rejects an out-of-range climate zone', () => {
    expect(xaFenestrationInputSchema.safeParse({ climateZone: 7, netFloorAreaM2: 120 }).success).toBe(
      false,
    )
  })

  it('rejects a non-positive net floor area', () => {
    expect(xaFenestrationInputSchema.safeParse({ climateZone: 1, netFloorAreaM2: 0 }).success).toBe(
      false,
    )
  })
})

describe('xa_fenestration_v1 — registration & wiring', () => {
  it('is registered in the definition registry under its id', () => {
    expect(getCalculatorDefinition('xa_fenestration_v1')).toBe(xaFenestrationV1)
  })

  it('references the xa_zone_limits and glazing_props tables', () => {
    expect(xaFenestrationV1.tableRefs).toEqual(['xa_zone_limits', 'glazing_props'])
    expect(xaFenestrationV1.toolId).toBe('xa_compliance_calc')
    expect(xaFenestrationV1.status).toBe('full')
  })
})

describe('xa_fenestration_v1 — runs through runCalculator with seeded tables', () => {
  it('produces line results, aggregates, clause results, and source versions', () => {
    const result = run({ climateZone: 4, storeys: 1, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 4, glazingType: 'double_lowe', shading: 'overhang' },
      { label: 'W2', orientation: 'S', areaM2: 6, glazingType: 'double_lowe', shading: 'none' },
    ])

    expect(result.lineResults).toHaveLength(2)
    expect(result.aggregates.totalGlazingAreaM2).toBe(10)
    // 10 / 120 = 8.3% — within the 15% zone limit.
    expect(result.aggregates.glazingRatioPct).toBeCloseTo(8.3, 1)
    expect(result.clauseResults).toHaveLength(4)
    // Traceability: the consumed tables appear in sourceVersions (design Property 2).
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({ guideline: 'xa_zone_limits', version: '2021.1' }))
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({ guideline: 'glazing_props', version: '1.0.0' }))
    expect(result.disclaimers.length).toBeGreaterThan(0)
  })

  it('passes the glazing-ratio clause when glazing is within the zone limit', () => {
    const result = run({ climateZone: 4, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 10, glazingType: 'double_lowe' },
    ])
    const ratioClause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.1')
    expect(ratioClause?.outcome).toBe('pass')
  })

  it('fails the glazing-ratio clause when glazing exceeds the zone limit', () => {
    // 30 m² glazing on a 100 m² floor = 30% > 15% limit.
    const result = run({ climateZone: 4, netFloorAreaM2: 100 }, [
      { label: 'W1', orientation: 'N', areaM2: 30, glazingType: 'double_lowe' },
    ])
    const ratioClause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.1')
    expect(ratioClause?.outcome).toBe('fail')
  })

  it('fails the U-value clause for high-U single glazing (default from glazing_props)', () => {
    // single_clear U=5.7 > zone 4 maxUValue 3.7.
    const result = run({ climateZone: 4, netFloorAreaM2: 200 }, [
      { label: 'W1', orientation: 'N', areaM2: 5, glazingType: 'single_clear' },
    ])
    const uClause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.2')
    expect(uClause?.outcome).toBe('fail')
    expect(result.aggregates.areaWeightedUValue).toBeCloseTo(5.7, 2)
  })

  it('reports shading as advisory with a count of shaded openings', () => {
    const result = run({ climateZone: 4, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 4, glazingType: 'double_lowe', shading: 'overhang' },
      { label: 'W2', orientation: 'W', areaM2: 4, glazingType: 'double_lowe', shading: 'none' },
    ])
    const shadeClause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.4')
    expect(shadeClause?.outcome).toBe('advisory')
    expect(shadeClause?.actual).toContain('1 of 2')
  })

  it('warns and excludes unknown glazing types from thermal averages', () => {
    const result = run({ climateZone: 4, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 4, glazingType: 'mystery_glass' },
    ])
    expect(result.warnings.some((w) => w.includes('mystery_glass'))).toBe(true)
    expect(result.aggregates.areaWeightedUValue).toBe(0)
  })

  it('uses a per-opening override over the glazing_props default', () => {
    const result = run({ climateZone: 4, netFloorAreaM2: 200 }, [
      { label: 'W1', orientation: 'N', areaM2: 5, glazingType: 'single_clear', uValue: 1.5, shgc: 0.3 },
    ])
    expect(result.aggregates.areaWeightedUValue).toBeCloseTo(1.5, 2)
    expect(result.aggregates.areaWeightedShgc).toBeCloseTo(0.3, 2)
  })

  it('isolates an invalid schedule row rather than failing the run', () => {
    const result = run({ climateZone: 4, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 4, glazingType: 'double_lowe' },
      { label: 'bad', orientation: 'N', areaM2: -1, glazingType: 'double_lowe' },
    ])
    expect(result.lineResults).toHaveLength(1)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })

  it('throws INVALID_INPUT for an out-of-range climate zone', () => {
    expect(() => run({ climateZone: 9, netFloorAreaM2: 120 }, [])).toThrow(CalculatorError)
  })
})

describe('xa_fenestration_v1 — clause thresholds cite the zone-specific limit (Req 4.4)', () => {
  it('glazing-%, U-value and SHGC clauses each cite their zone limit in the threshold', () => {
    const result = run({ climateZone: 4, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 5, glazingType: 'double_lowe' },
    ])
    const ratio = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.1')
    const uClause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.2')
    const shgc = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.3')
    // zone 4 seed limits: 15% / 3.7 W/m²·K / 0.46
    expect(ratio?.threshold).toContain('15%')
    expect(ratio?.threshold).toContain('zone 4')
    expect(uClause?.threshold).toContain('3.7')
    expect(uClause?.threshold).toContain('zone 4')
    expect(shgc?.threshold).toContain('0.46')
    expect(shgc?.threshold).toContain('zone 4')
  })

  it('cites the differing SHGC limit for a different zone (zone 1 = 0.59)', () => {
    const result = run({ climateZone: 1, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 5, glazingType: 'double_lowe' },
    ])
    const shgc = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.3')
    expect(shgc?.threshold).toContain('0.59')
    expect(shgc?.threshold).toContain('zone 1')
  })

  it('reports U-value/SHGC as advisory (not a false pass) when no glazing thermal data exists', () => {
    // Unknown glazing type with no overrides => no thermal sample.
    const result = run({ climateZone: 4, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 4, glazingType: 'mystery_glass' },
    ])
    const uClause = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.2')
    const shgc = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.3')
    expect(uClause?.outcome).toBe('advisory')
    expect(uClause?.actual).toContain('no glazing U-value data')
    expect(shgc?.outcome).toBe('advisory')
    expect(shgc?.actual).toContain('no glazing SHGC data')
  })
})

describe('xa_fenestration_v1 — per-storey rollups (Req 4.3)', () => {
  const multiStoreyRows = [
    { label: 'G1', orientation: 'N', areaM2: 6, glazingType: 'double_lowe', shading: 'overhang', storey: 'Ground' },
    { label: 'G2', orientation: 'S', areaM2: 4, glazingType: 'double_lowe', shading: 'none', storey: 'Ground' },
    { label: 'F1', orientation: 'W', areaM2: 5, glazingType: 'double_lowe', shading: 'fin', storey: 'First' },
  ]

  it('produces a per-storey summary for each storey plus the whole-building rollup', () => {
    const result = run(
      {
        climateZone: 4,
        storeys: 2,
        netFloorAreaM2: 200,
        storeyFloorAreasM2: { Ground: 120, First: 80 },
      },
      multiStoreyRows,
    )

    // Whole-building rollup (Req 4.3 — alongside per-storey).
    expect(result.aggregates.totalGlazingAreaM2).toBe(15)
    expect(result.aggregates.glazingRatioPct).toBeCloseTo(7.5, 1)
    expect(result.aggregates.storeysWithOpenings).toBe(2)

    // Per-storey breakdown.
    const groups = result.groupAggregates ?? []
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => g.group === 'storey')).toBe(true)

    const ground = groups.find((g) => g.key === 'Ground')!
    expect(ground.values.openingCount).toBe(2)
    expect(ground.values.glazingAreaM2).toBe(10)
    // ratio against the storey's own declared floor area: 10 / 120 = 8.3%
    expect(ground.values.glazingRatioPct).toBeCloseTo(8.3, 1)
    expect(ground.values.floorAreaBasis).toBe('declared')
    expect(ground.values.areaWeightedUValue).toBeCloseTo(1.8, 2)
    expect(ground.values.areaWeightedShgc).toBeCloseTo(0.4, 2)
    expect(ground.values.shadedCount).toBe(1)

    const first = groups.find((g) => g.key === 'First')!
    expect(first.values.openingCount).toBe(1)
    expect(first.values.glazingAreaM2).toBe(5)
    // 5 / 80 = 6.3%
    expect(first.values.glazingRatioPct).toBeCloseTo(6.3, 1)
    expect(first.values.shadedCount).toBe(1)
  })

  it('assumes an even floor-area split (with a warning) when per-storey areas are absent', () => {
    const result = run({ climateZone: 4, storeys: 2, netFloorAreaM2: 200 }, multiStoreyRows)
    const groups = result.groupAggregates ?? []
    const ground = groups.find((g) => g.key === 'Ground')!
    // even split: 200 / 2 storeys present = 100 m² each → 10 / 100 = 10.0%
    expect(ground.values.floorAreaM2).toBe(100)
    expect(ground.values.glazingRatioPct).toBeCloseTo(10.0, 1)
    expect(ground.values.floorAreaBasis).toBe('assumed (even split)')
    expect(result.warnings.some((w) => w.includes('even split'))).toBe(true)
  })

  it('does not emit per-storey groups for a single-storey building', () => {
    const result = run({ climateZone: 4, storeys: 1, netFloorAreaM2: 120 }, [
      { label: 'W1', orientation: 'N', areaM2: 6, glazingType: 'double_lowe', storey: 'Ground' },
      { label: 'W2', orientation: 'S', areaM2: 4, glazingType: 'double_lowe', storey: 'Ground' },
    ])
    expect(result.groupAggregates ?? []).toHaveLength(0)
    expect(result.aggregates.storeysWithOpenings).toBe(1)
  })

  it('groups openings without a storey label under "Unassigned"', () => {
    const result = run({ climateZone: 4, storeys: 2, netFloorAreaM2: 200 }, [
      { label: 'A', orientation: 'N', areaM2: 6, glazingType: 'double_lowe', storey: 'Ground' },
      { label: 'B', orientation: 'S', areaM2: 4, glazingType: 'double_lowe' },
    ])
    const groups = result.groupAggregates ?? []
    expect(groups.map((g) => g.key).sort()).toEqual(['Ground', 'Unassigned'])
  })

  it('accepts numeric storey labels and stringifies them as group keys', () => {
    const result = run({ climateZone: 4, storeys: 2, netFloorAreaM2: 200 }, [
      { label: 'A', orientation: 'N', areaM2: 6, glazingType: 'double_lowe', storey: 0 },
      { label: 'B', orientation: 'S', areaM2: 4, glazingType: 'double_lowe', storey: 1 },
    ])
    const groups = result.groupAggregates ?? []
    expect(groups.map((g) => g.key).sort()).toEqual(['0', '1'])
  })
})
