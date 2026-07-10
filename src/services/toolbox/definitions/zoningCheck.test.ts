import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  zoningCheckV1,
  zoningInputSchema,
} from './zoningCheck'

function run(input: unknown) {
  return runCalculator(zoningCheckV1, input, [], { tables: SEED_GUIDELINE_TABLES })
}

describe('zoningCheck schema validation', () => {
  it('accepts valid input', () => {
    const result = zoningInputSchema.safeParse({
      zoningScheme: 'residential_1',
      plotAreaM2: 1000,
      buildingFootprintM2: 300,
      totalFloorAreaM2: 500,
      numberOfStoreys: 2,
      buildingHeightM: 7,
      frontSetbackM: 5,
      sideSetbackM: 2,
      rearSetbackM: 4,
      parkingSpaces: 2,
      numberOfUnits: 1,
    })
    expect(result.success).toBe(true)
  })

  it('rejects zero plot area', () => {
    const result = zoningInputSchema.safeParse({
      zoningScheme: 'residential_1',
      plotAreaM2: 0,
      buildingFootprintM2: 300,
      totalFloorAreaM2: 500,
      numberOfStoreys: 2,
      buildingHeightM: 7,
      frontSetbackM: 5,
      sideSetbackM: 2,
      rearSetbackM: 4,
      parkingSpaces: 2,
      numberOfUnits: 1,
    })
    expect(result.success).toBe(false)
  })
})

describe('zoning_check_v1 — registration', () => {
  it('is registered with correct toolId and table refs', () => {
    expect(getCalculatorDefinition('zoning_check_v1')).toBe(zoningCheckV1)
    expect(zoningCheckV1.toolId).toBe('zoning_check')
    expect(zoningCheckV1.method).toBe('clauseSet')
    expect(zoningCheckV1.status).toBe('full')
    expect(zoningCheckV1.tableRefs).toContain('zoning_scheme_parameters')
  })
})

describe('zoning_check_v1 — clause checks', () => {
  it('passes all clauses for a compliant residential_1 development', () => {
    const result = run({
      zoningScheme: 'residential_1',
      plotAreaM2: 1000,
      buildingFootprintM2: 400, // 40% < 50% max
      totalFloorAreaM2: 500, // FAR 0.5 < 0.6 max
      numberOfStoreys: 2,
      buildingHeightM: 7, // < 8m max
      frontSetbackM: 5, // >= 4m min
      sideSetbackM: 2, // >= 1.5m min
      rearSetbackM: 4, // >= 3m min
      parkingSpaces: 2,
      numberOfUnits: 1,
    })
    expect(result.complianceScore).toBe(100)
    expect(result.clauseResults.every((c) => c.outcome === 'pass')).toBe(true)
    expect(result.disclaimers.length).toBeGreaterThan(0)
  })

  it('fails coverage and FAR for an overdeveloped plot', () => {
    const result = run({
      zoningScheme: 'residential_1',
      plotAreaM2: 500,
      buildingFootprintM2: 300, // 60% > 50% max
      totalFloorAreaM2: 400, // FAR 0.8 > 0.6 max
      numberOfStoreys: 2,
      buildingHeightM: 7,
      frontSetbackM: 5,
      sideSetbackM: 2,
      rearSetbackM: 4,
      parkingSpaces: 2,
      numberOfUnits: 1,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Zoning 2.1')?.outcome).toBe('fail')
    expect(result.clauseResults.find((c) => c.clauseRef === 'Zoning 2.2')?.outcome).toBe('fail')
    expect(result.complianceScore).toBeLessThan(100)
  })

  it('fails height and setback for business_1 zone', () => {
    const result = run({
      zoningScheme: 'business_1',
      plotAreaM2: 2000,
      buildingFootprintM2: 1000, // 50% < 80% max
      totalFloorAreaM2: 3000, // FAR 1.5 < 2.0 max
      numberOfStoreys: 5, // > 4 max storeys
      buildingHeightM: 18, // > 15m max
      frontSetbackM: 0,
      sideSetbackM: 0,
      rearSetbackM: 2, // < 3m min
      parkingSpaces: 10,
      numberOfUnits: 10,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Zoning 2.3')?.outcome).toBe('fail')
    expect(result.clauseResults.find((c) => c.clauseRef === 'Zoning 2.4')?.outcome).toBe('fail')
  })

  it('fails parking provision', () => {
    const result = run({
      zoningScheme: 'residential_1',
      plotAreaM2: 1000,
      buildingFootprintM2: 300,
      totalFloorAreaM2: 500,
      numberOfStoreys: 2,
      buildingHeightM: 7,
      frontSetbackM: 5,
      sideSetbackM: 2,
      rearSetbackM: 4,
      parkingSpaces: 1, // need 2 (2/unit × 1 unit)
      numberOfUnits: 1,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Zoning 2.5')?.outcome).toBe('fail')
  })

  it('throws for unknown zoning scheme', () => {
    expect(() =>
      run({
        zoningScheme: 'unknown_zone',
        plotAreaM2: 1000,
        buildingFootprintM2: 300,
        totalFloorAreaM2: 500,
        numberOfStoreys: 2,
        buildingHeightM: 7,
        frontSetbackM: 5,
        sideSetbackM: 2,
        rearSetbackM: 4,
        parkingSpaces: 2,
        numberOfUnits: 1,
      }),
    ).toThrow()
  })
})

describe('zoning_check_v1 — source traceability', () => {
  it('includes source version in result', () => {
    const result = run({
      zoningScheme: 'residential_1',
      plotAreaM2: 1000,
      buildingFootprintM2: 400,
      totalFloorAreaM2: 500,
      numberOfStoreys: 2,
      buildingHeightM: 7,
      frontSetbackM: 5,
      sideSetbackM: 2,
      rearSetbackM: 4,
      parkingSpaces: 2,
      numberOfUnits: 1,
    })
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({
      guideline: 'zoning_scheme_parameters',
      version: '2024.1',
    }))
  })
})
