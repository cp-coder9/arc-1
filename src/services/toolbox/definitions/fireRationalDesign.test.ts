import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  fireRationalDesignV1,
  fireRationalInputSchema,
} from './fireRationalDesign'

function run(input: unknown) {
  return runCalculator(fireRationalDesignV1, input, [], { tables: SEED_GUIDELINE_TABLES })
}

describe('fireRationalDesign schema validation', () => {
  it('accepts valid input', () => {
    const result = fireRationalInputSchema.safeParse({
      designFireLoadMJm2: 300,
      compartmentLengthM: 10,
      compartmentWidthM: 8,
      compartmentHeightM: 3,
      ventilationOpeningAreaM2: 5,
      structuralFireResistanceMin: 90,
      fireRegime: 'fuel_controlled',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid fire regime', () => {
    const result = fireRationalInputSchema.safeParse({
      designFireLoadMJm2: 300,
      compartmentLengthM: 10,
      compartmentWidthM: 8,
      compartmentHeightM: 3,
      ventilationOpeningAreaM2: 5,
      structuralFireResistanceMin: 90,
      fireRegime: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects zero compartment dimensions', () => {
    const result = fireRationalInputSchema.safeParse({
      designFireLoadMJm2: 300,
      compartmentLengthM: 0,
      compartmentWidthM: 8,
      compartmentHeightM: 3,
      ventilationOpeningAreaM2: 5,
      structuralFireResistanceMin: 90,
      fireRegime: 'fuel_controlled',
    })
    expect(result.success).toBe(false)
  })
})

describe('fire_rational_design_v1 — registration', () => {
  it('is registered with correct toolId and shared table refs (Req 6.4)', () => {
    expect(getCalculatorDefinition('fire_rational_design_v1')).toBe(fireRationalDesignV1)
    expect(fireRationalDesignV1.toolId).toBe('fire_rational_design')
    expect(fireRationalDesignV1.method).toBe('clauseSet')
    expect(fireRationalDesignV1.status).toBe('full')
    // Shares sans_10400_t_thresholds with fire_compliance_check_v1
    expect(fireRationalDesignV1.tableRefs).toContain('sans_10400_t_thresholds')
    expect(fireRationalDesignV1.tableRefs).toContain('fire_rational_parameters')
  })
})

describe('fire_rational_design_v1 — clause checks', () => {
  it('passes all clauses for adequate fire resistance', () => {
    // 300 MJ/m² = moderate category: baseDuration 42 + 0.08*300 = 66 min
    const result = run({
      designFireLoadMJm2: 300,
      compartmentLengthM: 10,
      compartmentWidthM: 8,
      compartmentHeightM: 3,
      ventilationOpeningAreaM2: 8,
      structuralFireResistanceMin: 90,
      fireRegime: 'fuel_controlled',
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Rational Fire 3.1')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'Rational Fire 3.2')?.outcome).toBe('pass')
    expect(result.aggregates.calculatedDurationMin).toBe(66)
    expect(result.aggregates.resistanceAdequacy).toBe('Adequate')
    expect(result.disclaimers.length).toBeGreaterThan(0)
  })

  it('fails when structural resistance is below calculated duration', () => {
    // 800 MJ/m² = high category: baseDuration 66 + 0.1*800 = 146 min
    const result = run({
      designFireLoadMJm2: 800,
      compartmentLengthM: 10,
      compartmentWidthM: 8,
      compartmentHeightM: 3,
      ventilationOpeningAreaM2: 5,
      structuralFireResistanceMin: 60, // below 146 min
      fireRegime: 'ventilation_controlled',
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Rational Fire 3.2')?.outcome).toBe('fail')
    expect(result.aggregates.resistanceAdequacy).toBe('Inadequate')
    expect(result.complianceScore).toBeLessThan(100)
  })

  it('classifies fire load correctly for low category', () => {
    // 100 MJ/m² = low category
    const result = run({
      designFireLoadMJm2: 100,
      compartmentLengthM: 5,
      compartmentWidthM: 5,
      compartmentHeightM: 3,
      ventilationOpeningAreaM2: 4,
      structuralFireResistanceMin: 120,
      fireRegime: 'fuel_controlled',
    })
    expect(result.aggregates.fireLoadCategory).toBe('Low fire load')
  })

  it('gives advisory when declared regime does not match ventilation factor', () => {
    // Large ventilation opening relative to compartment → fuel-controlled territory
    // but declaring ventilation_controlled
    const result = run({
      designFireLoadMJm2: 300,
      compartmentLengthM: 5,
      compartmentWidthM: 5,
      compartmentHeightM: 3,
      ventilationOpeningAreaM2: 10, // high ventilation
      structuralFireResistanceMin: 120,
      fireRegime: 'ventilation_controlled',
    })
    const ventClause = result.clauseResults.find((c) => c.clauseRef === 'Rational Fire 3.3')
    expect(ventClause?.outcome).toBe('advisory')
  })
})

describe('fire_rational_design_v1 — source traceability', () => {
  it('includes source version in result', () => {
    const result = run({
      designFireLoadMJm2: 300,
      compartmentLengthM: 10,
      compartmentWidthM: 8,
      compartmentHeightM: 3,
      ventilationOpeningAreaM2: 5,
      structuralFireResistanceMin: 90,
      fireRegime: 'fuel_controlled',
    })
    expect(result.sourceVersions).toContainEqual({
      guideline: 'fire_rational_parameters',
      version: '2012.1',
    })
  })
})
