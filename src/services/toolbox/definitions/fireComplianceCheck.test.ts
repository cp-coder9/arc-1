import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { CalculatorError } from '@/services/toolbox/types'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  fireComplianceCheckV1,
  fireComplianceInputSchema,
} from './fireComplianceCheck'

function run(input: unknown) {
  return runCalculator(fireComplianceCheckV1, input, [], { tables: SEED_GUIDELINE_TABLES })
}

describe('fireComplianceCheck schema validation', () => {
  it('accepts valid input', () => {
    const result = fireComplianceInputSchema.safeParse({
      occupancyClass: 'G1',
      floorAreaM2: 500,
      numberOfStoreys: 2,
      travelDistanceM: 30,
      fireResistanceRatingMin: 60,
      exitWidthMm: 1200,
      occupantCount: 100,
      sprinklered: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing occupancy class', () => {
    const result = fireComplianceInputSchema.safeParse({
      occupancyClass: '',
      floorAreaM2: 500,
      numberOfStoreys: 2,
      travelDistanceM: 30,
      fireResistanceRatingMin: 60,
      exitWidthMm: 1200,
      occupantCount: 100,
      sprinklered: false,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative floor area', () => {
    const result = fireComplianceInputSchema.safeParse({
      occupancyClass: 'G1',
      floorAreaM2: -100,
      numberOfStoreys: 2,
      travelDistanceM: 30,
      fireResistanceRatingMin: 60,
      exitWidthMm: 1200,
      occupantCount: 100,
      sprinklered: false,
    })
    expect(result.success).toBe(false)
  })
})

describe('fire_compliance_check_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('fire_compliance_check_v1')).toBe(fireComplianceCheckV1)
    expect(fireComplianceCheckV1.toolId).toBe('fire_compliance_check')
    expect(fireComplianceCheckV1.method).toBe('clauseSet')
    expect(fireComplianceCheckV1.status).toBe('full')
  })

  it('references the shared sans_10400_t_thresholds table (Req 6.4)', () => {
    expect(fireComplianceCheckV1.tableRefs).toContain('sans_10400_t_thresholds')
  })
})

describe('fire_compliance_check_v1 — clause checks', () => {
  it('passes all clauses for a compliant G1 office building', () => {
    const result = run({
      occupancyClass: 'G1',
      floorAreaM2: 2000,
      numberOfStoreys: 3,
      travelDistanceM: 40,
      fireResistanceRatingMin: 60,
      exitWidthMm: 1000,
      occupantCount: 200,
      sprinklered: false,
    })
    expect(result.complianceScore).toBe(100)
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.5')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.6')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.3')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.4')?.outcome).toBe('pass')
    // Sprinkler is advisory for G1 (not required)
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.7')?.outcome).toBe('advisory')
    expect(result.disclaimers.length).toBeGreaterThan(0)
  })

  it('fails travel distance and exit width for a non-compliant A1 entertainment venue', () => {
    const result = run({
      occupancyClass: 'A1',
      floorAreaM2: 2000,
      numberOfStoreys: 1,
      travelDistanceM: 50, // exceeds 45m limit
      fireResistanceRatingMin: 120,
      exitWidthMm: 500, // 7mm/person × 200 = 1400mm required
      occupantCount: 200,
      sprinklered: true,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.5')?.outcome).toBe('fail')
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.6')?.outcome).toBe('fail')
    expect(result.complianceScore).toBeLessThan(100)
  })

  it('fails sprinkler clause for A1 when not sprinklered', () => {
    const result = run({
      occupancyClass: 'A1',
      floorAreaM2: 1000,
      numberOfStoreys: 1,
      travelDistanceM: 30,
      fireResistanceRatingMin: 120,
      exitWidthMm: 2000,
      occupantCount: 100,
      sprinklered: false,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.7')?.outcome).toBe('fail')
  })

  it('handles H4 dwelling house with no compartment area limit', () => {
    const result = run({
      occupancyClass: 'H4',
      floorAreaM2: 800,
      numberOfStoreys: 2,
      travelDistanceM: 20,
      fireResistanceRatingMin: 30,
      exitWidthMm: 500,
      occupantCount: 10,
      sprinklered: false,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'SANS 10400-T 4.4')?.outcome).toBe('pass')
    expect(result.aggregates.maxCompartmentAreaM2).toBe('No limit')
  })

  it('throws for unknown occupancy class', () => {
    expect(() =>
      run({
        occupancyClass: 'Z9',
        floorAreaM2: 500,
        numberOfStoreys: 1,
        travelDistanceM: 30,
        fireResistanceRatingMin: 60,
        exitWidthMm: 1000,
        occupantCount: 50,
        sprinklered: false,
      }),
    ).toThrow()
  })
})

describe('fire_compliance_check_v1 — source traceability', () => {
  it('includes source version in result', () => {
    const result = run({
      occupancyClass: 'G1',
      floorAreaM2: 1000,
      numberOfStoreys: 2,
      travelDistanceM: 30,
      fireResistanceRatingMin: 60,
      exitWidthMm: 1000,
      occupantCount: 100,
      sprinklered: false,
    })
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({
      guideline: 'sans_10400_t_thresholds',
      version: '2012.1',
    }))
  })
})
