import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { CalculatorError, type GuidelineTable } from '@/services/toolbox/types'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  energyCertificateV1,
  energyCertificateInputSchema,
  resolveRatingBand,
} from './energyCertificate'

function run(input: unknown) {
  return runCalculator(energyCertificateV1, input, [], { tables: SEED_GUIDELINE_TABLES })
}

const bandsTable = SEED_GUIDELINE_TABLES.find(
  (t) => t.id === 'epc_rating_bands',
) as GuidelineTable<{ band: string; label: string; maxRatio: number | null }>

describe('energyCertificate schema validation', () => {
  it('rejects an unknown building type and a non-positive floor area', () => {
    expect(
      energyCertificateInputSchema.safeParse({
        buildingType: 'factory',
        netFloorAreaM2: 100,
        annualEnergyKwh: 1000,
      }).success,
    ).toBe(false)
    expect(
      energyCertificateInputSchema.safeParse({
        buildingType: 'office',
        netFloorAreaM2: 0,
        annualEnergyKwh: 1000,
      }).success,
    ).toBe(false)
  })
})

describe('resolveRatingBand — band cut-offs', () => {
  it('assigns the best band whose ratio bound is not exceeded', () => {
    expect(resolveRatingBand(0.4, bandsTable).band).toBe('A')
    expect(resolveRatingBand(0.75, bandsTable).band).toBe('C')
    expect(resolveRatingBand(1.0, bandsTable).band).toBe('D')
    // Open-ended worst band catches anything beyond the last bound.
    expect(resolveRatingBand(2.0, bandsTable).band).toBe('G')
  })
})

describe('energy_certificate_v1 — registration & wiring', () => {
  it('is registered under its id and references the EPC tables', () => {
    expect(getCalculatorDefinition('energy_certificate_v1')).toBe(energyCertificateV1)
    expect(energyCertificateV1.toolId).toBe('energy_certificate')
    expect(energyCertificateV1.tableRefs).toEqual(['epc_energy_thresholds', 'epc_rating_bands'])
  })
})

describe('energy_certificate_v1 — intensity + rating', () => {
  it('passes when intensity is within the building-type norm and assigns a band', () => {
    // office norm 200; 150000 / 1000 = 150 kWh/m²/yr; ratio 0.75 -> band C
    const result = run({ buildingType: 'office', netFloorAreaM2: 1000, annualEnergyKwh: 150000 })
    expect(result.aggregates.energyIntensityKwhM2Year).toBeCloseTo(150, 1)
    expect(result.aggregates.thresholdKwhM2Year).toBe(200)
    expect(result.aggregates.performanceRatio).toBeCloseTo(0.75, 3)
    expect(result.aggregates.ratingBand).toBe('C')
    const clause = result.clauseResults[0]
    expect(clause.outcome).toBe('pass')
    expect(clause.threshold).toContain('200')
    expect(result.sourceVersions).toContainEqual({
      guideline: 'epc_energy_thresholds',
      version: '2020.1',
    })
  })

  it('fails when intensity exceeds the norm and rates G', () => {
    // 300000 / 1000 = 300 kWh/m²/yr > 200; ratio 1.5 -> band G
    const result = run({ buildingType: 'office', netFloorAreaM2: 1000, annualEnergyKwh: 300000 })
    expect(result.clauseResults[0].outcome).toBe('fail')
    expect(result.aggregates.ratingBand).toBe('G')
  })

  it('uses the building-type-specific norm (education = 130)', () => {
    const result = run({ buildingType: 'education', netFloorAreaM2: 500, annualEnergyKwh: 75000 })
    // 150 kWh/m²/yr > 130 -> fail
    expect(result.aggregates.thresholdKwhM2Year).toBe(130)
    expect(result.clauseResults[0].outcome).toBe('fail')
  })

  it('throws INVALID_INPUT for an unknown building type', () => {
    expect(() => run({ buildingType: 'warehouse', netFloorAreaM2: 500, annualEnergyKwh: 1000 })).toThrow(
      CalculatorError,
    )
  })
})
