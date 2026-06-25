import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { CalculatorError } from '@/services/toolbox/types'
import { getCalculatorDefinition } from './definitionRegistry'
import { xaEnergyComplianceV1, xaEnergyInputSchema } from './xaEnergyCompliance'
// Import triggers the xa_fenestration_v1 registration side-effect (needed for co-existence test).
import './xaFenestration'

function run(input: unknown) {
  return runCalculator(xaEnergyComplianceV1, input, [], { tables: SEED_GUIDELINE_TABLES })
}

describe('xaEnergy schema validation', () => {
  it('requires positive R-values and floor area', () => {
    expect(
      xaEnergyInputSchema.safeParse({
        climateZone: 4,
        roofRValue: 0,
        wallRValue: 0.5,
        totalGlazingAreaM2: 10,
        netFloorAreaM2: 100,
      }).success,
    ).toBe(false)
  })
})

describe('xa_energy_compliance_v1 — registration & shared-table reuse', () => {
  it('is registered, bound to xa_compliance_calc, and reuses the shared tables', () => {
    expect(getCalculatorDefinition('xa_energy_compliance_v1')).toBe(xaEnergyComplianceV1)
    expect(xaEnergyComplianceV1.toolId).toBe('xa_compliance_calc')
    // Reuses the same threshold tables as rvalue_calc_v1 and xa_fenestration_v1 (Req 6.4).
    expect(xaEnergyComplianceV1.tableRefs).toEqual(['xa_rvalue_minimums', 'xa_zone_limits'])
  })

  it('does not displace the pre-existing xa_fenestration_v1 definition', () => {
    // Both definitions remain independently registered; routing is via calculatorDefinitionId.
    expect(getCalculatorDefinition('xa_fenestration_v1')?.id).toBe('xa_fenestration_v1')
  })
})

describe('xa_energy_compliance_v1 — envelope + glazing checks', () => {
  it('passes all clauses for a compliant building (zone 4)', () => {
    const result = run({
      climateZone: 4,
      roofRValue: 4.0,
      wallRValue: 0.5,
      totalGlazingAreaM2: 10,
      netFloorAreaM2: 100,
    })
    expect(result.complianceScore).toBe(100)
    const roof = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2.1')
    const wall = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2.2')
    const glazing = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.1')
    expect(roof?.outcome).toBe('pass')
    expect(wall?.outcome).toBe('pass')
    expect(glazing?.outcome).toBe('pass')
    expect(roof?.threshold).toContain('3.7')
    expect(glazing?.threshold).toContain('15%')
    expect(result.aggregates.glazingRatioPct).toBeCloseTo(10.0, 1)
    expect(result.sourceVersions).toContainEqual({ guideline: 'xa_rvalue_minimums', version: '2021.1' })
    expect(result.sourceVersions).toContainEqual({ guideline: 'xa_zone_limits', version: '2021.1' })
  })

  it('fails roof insulation and glazing ratio when out of limits', () => {
    const result = run({
      climateZone: 4,
      roofRValue: 2.0,
      wallRValue: 0.5,
      totalGlazingAreaM2: 30,
      netFloorAreaM2: 100,
    })
    const roof = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.2.1')
    const glazing = result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-XA 4.3.1')
    expect(roof?.outcome).toBe('fail')
    expect(glazing?.outcome).toBe('fail')
    expect(result.aggregates.glazingRatioPct).toBeCloseTo(30.0, 1)
  })

  it('throws INVALID_INPUT for an out-of-range climate zone', () => {
    expect(() =>
      run({ climateZone: 0, roofRValue: 4, wallRValue: 0.5, totalGlazingAreaM2: 10, netFloorAreaM2: 100 }),
    ).toThrow(CalculatorError)
  })
})
