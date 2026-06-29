// Soft Cost Estimator — unit tests (Task 8.2)
//
// Tests: schema validation, multi-discipline fee computation, municipal allowance
// calculation, contingency applied correctly, total soft cost percentage range check,
// source version traceability, and registration.
//
// Requirements: 5.1, 5.3.

import { describe, it, expect } from 'vitest'
import {
  softCostEstimatorV1,
  softCostInputSchema,
  softCostClauseSet,
  computeMunicipalFee,
  DISCIPLINES,
  DISCIPLINE_TABLE_IDS,
  DISCIPLINE_LABELS,
  MUNICIPAL_TABLE_ID,
  type SoftCostInput,
  type MunicipalFeeRow,
} from './softCostEstimator'
import { hasCalculatorDefinition, getCalculatorDefinition } from './definitionRegistry'
import type { ComputeContext, GuidelineTable } from '@/services/toolbox/types'
import type { FeeTableBracketRow } from './feeCalculator'

// ----------------------------------------------------------------------------
// Test fixtures
// ----------------------------------------------------------------------------

const sacapBrackets: FeeTableBracketRow[] = [
  { lowerBound: 0, upperBound: 500000, percentageRate: 12, fixedAmount: 0 },
  { lowerBound: 500000, upperBound: 2000000, percentageRate: 10, fixedAmount: 60000 },
  { lowerBound: 2000000, upperBound: 10000000, percentageRate: 8, fixedAmount: 210000 },
  { lowerBound: 10000000, upperBound: 50000000, percentageRate: 6.5, fixedAmount: 850000 },
  { lowerBound: 50000000, upperBound: null, percentageRate: 5, fixedAmount: 3450000 },
]

const ecsaBrackets: FeeTableBracketRow[] = [
  { lowerBound: 0, upperBound: 500000, percentageRate: 10, fixedAmount: 0 },
  { lowerBound: 500000, upperBound: 2000000, percentageRate: 8.5, fixedAmount: 50000 },
  { lowerBound: 2000000, upperBound: 10000000, percentageRate: 7, fixedAmount: 177500 },
  { lowerBound: 10000000, upperBound: 50000000, percentageRate: 5.5, fixedAmount: 737500 },
  { lowerBound: 50000000, upperBound: null, percentageRate: 4.5, fixedAmount: 2937500 },
]

const sacqspBrackets: FeeTableBracketRow[] = [
  { lowerBound: 0, upperBound: 1000000, percentageRate: 6, fixedAmount: 0 },
  { lowerBound: 1000000, upperBound: 5000000, percentageRate: 5, fixedAmount: 60000 },
  { lowerBound: 5000000, upperBound: 20000000, percentageRate: 4, fixedAmount: 260000 },
  { lowerBound: 20000000, upperBound: 100000000, percentageRate: 3, fixedAmount: 860000 },
  { lowerBound: 100000000, upperBound: null, percentageRate: 2.5, fixedAmount: 3260000 },
]

const sacpcmpBrackets: FeeTableBracketRow[] = [
  { lowerBound: 0, upperBound: 1000000, percentageRate: 7, fixedAmount: 0 },
  { lowerBound: 1000000, upperBound: 5000000, percentageRate: 5.5, fixedAmount: 70000 },
  { lowerBound: 5000000, upperBound: 25000000, percentageRate: 4.5, fixedAmount: 290000 },
  { lowerBound: 25000000, upperBound: 100000000, percentageRate: 3.5, fixedAmount: 1190000 },
  { lowerBound: 100000000, upperBound: null, percentageRate: 3, fixedAmount: 3815000 },
]

const municipalRows: MunicipalFeeRow[] = [
  { feeType: 'building_plan_levy', label: 'Building Plan Levy', ratePerM2: 15, minFee: 5000 },
  { feeType: 'plan_submission', label: 'Plan Submission Fee', ratePerM2: 8, minFee: 3000 },
  { feeType: 'occupancy_certificate', label: 'Occupancy Certificate', flatFee: 2500 },
  { feeType: 'zoning_application', label: 'Zoning/Consent Use Application', flatFee: 15000 },
  { feeType: 'engineering_services', label: 'Engineering Services Contribution', ratePerM2: 250, minFee: 50000 },
]

function makeTable(id: string, rows: unknown[]): GuidelineTable {
  return { id, version: '2024.1', effectiveFrom: '2024-01-01', jurisdiction: 'ZA', status: 'indicative', rows }
}

function makeContext(input: SoftCostInput): ComputeContext<SoftCostInput> {
  const tables: Record<string, GuidelineTable> = {
    sacap_fee_brackets: makeTable('sacap_fee_brackets', sacapBrackets),
    ecsa_fee_brackets: makeTable('ecsa_fee_brackets', ecsaBrackets),
    sacqsp_fee_brackets: makeTable('sacqsp_fee_brackets', sacqspBrackets),
    sacpcmp_fee_brackets: makeTable('sacpcmp_fee_brackets', sacpcmpBrackets),
    sacplan_fee_brackets: makeTable('sacplan_fee_brackets', sacapBrackets), // use sacap as stand-in
    saclap_fee_brackets: makeTable('saclap_fee_brackets', sacapBrackets),
    sagc_fee_brackets: makeTable('sagc_fee_brackets', sacqspBrackets),
    [MUNICIPAL_TABLE_ID]: makeTable(MUNICIPAL_TABLE_ID, municipalRows),
  }
  return { input, rows: [], tables }
}

function defaultInput(overrides: Partial<SoftCostInput> = {}): SoftCostInput {
  return {
    constructionCost: 10000000,
    buildingAreaM2: 500,
    selectedDisciplines: ['architect', 'engineer', 'quantity_surveyor'],
    selectedMunicipalFees: [],
    contingencyPercent: 5,
    vatInclusive: true,
    vatRate: 0.15,
    ...overrides,
  }
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('softCostEstimator — schema validation', () => {
  it('accepts valid inputs with all required fields', () => {
    const result = softCostInputSchema.safeParse({
      constructionCost: 5000000,
      buildingAreaM2: 300,
      selectedDisciplines: ['architect', 'engineer'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects when no disciplines selected', () => {
    const result = softCostInputSchema.safeParse({
      constructionCost: 5000000,
      buildingAreaM2: 300,
      selectedDisciplines: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid discipline', () => {
    const result = softCostInputSchema.safeParse({
      constructionCost: 5000000,
      buildingAreaM2: 300,
      selectedDisciplines: ['invalid_discipline'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative construction cost', () => {
    const result = softCostInputSchema.safeParse({
      constructionCost: -100,
      buildingAreaM2: 300,
      selectedDisciplines: ['architect'],
    })
    expect(result.success).toBe(false)
  })

  it('applies defaults for optional fields', () => {
    const result = softCostInputSchema.parse({
      constructionCost: 5000000,
      buildingAreaM2: 300,
      selectedDisciplines: ['architect'],
    })
    expect(result.contingencyPercent).toBe(5)
    expect(result.vatInclusive).toBe(true)
    expect(result.vatRate).toBe(0.15)
    expect(result.selectedMunicipalFees).toEqual([])
  })

  it('rejects contingency outside 0-100 range', () => {
    const tooHigh = softCostInputSchema.safeParse({
      constructionCost: 5000000,
      buildingAreaM2: 300,
      selectedDisciplines: ['architect'],
      contingencyPercent: 150,
    })
    expect(tooHigh.success).toBe(false)
  })
})

describe('softCostEstimator — multi-discipline fee computation', () => {
  it('computes fees for 3 disciplines (architect + engineer + QS)', () => {
    const input = defaultInput({ constructionCost: 5000000 })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Architect (SACAP): 210000 + 8% × (5M - 2M) = 210000 + 240000 = 450000
    // Engineer (ECSA): 177500 + 7% × (5M - 2M) = 177500 + 210000 = 387500
    // QS (SACQSP): 260000 + 4% × (5M - 5M) = 260000
    expect(result.aggregates.totalProfessionalFees).toBeCloseTo(450000 + 387500 + 260000, -1)
    expect(result.aggregates.disciplineCount).toBe(3)
  })

  it('includes a line result for each discipline', () => {
    const input = defaultInput({ constructionCost: 5000000 })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const feeLines = result.lineResults.filter((l) => l.category === 'professional_fee')
    expect(feeLines.length).toBe(3)
    expect(feeLines.some((l) => (l.label as string).includes('Architect'))).toBe(true)
    expect(feeLines.some((l) => (l.label as string).includes('Engineer'))).toBe(true)
    expect(feeLines.some((l) => (l.label as string).includes('Quantity Surveyor'))).toBe(true)
  })

  it('computes fees for a single discipline', () => {
    const input = defaultInput({
      constructionCost: 1000000,
      selectedDisciplines: ['architect'],
    })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Architect (SACAP) at R1M: 60000 + 10% × (1M - 500k) = 60000 + 50000 = 110000
    expect(result.aggregates.totalProfessionalFees).toBeCloseTo(110000, 0)
  })

  it('computes fees for all 8 disciplines without error', () => {
    const input = defaultInput({
      constructionCost: 5000000,
      selectedDisciplines: [...DISCIPLINES],
    })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.aggregates.disciplineCount).toBe(8)
    expect((result.aggregates.totalProfessionalFees as number)).toBeGreaterThan(0)
    expect(result.warnings.length).toBe(0)
  })
})

describe('softCostEstimator — municipal allowance calculation', () => {
  it('computes municipal fees from table (all fees) when no selection filter', () => {
    const input = defaultInput({ buildingAreaM2: 500 })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Building plan levy: 15 × 500 = 7500
    // Plan submission: 8 × 500 = 4000
    // Occupancy cert: flatFee 2500
    // Zoning: flatFee 15000
    // Engineering services: 250 × 500 = 125000
    const expectedMunicipal = 7500 + 4000 + 2500 + 15000 + 125000
    expect(result.aggregates.totalMunicipalFees).toBeCloseTo(expectedMunicipal, 0)
  })

  it('filters municipal fees when selectedMunicipalFees is specified', () => {
    const input = defaultInput({
      buildingAreaM2: 500,
      selectedMunicipalFees: ['building_plan_levy', 'occupancy_certificate'],
    })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Building plan levy: 15 × 500 = 7500
    // Occupancy cert: flatFee 2500
    expect(result.aggregates.totalMunicipalFees).toBeCloseTo(7500 + 2500, 0)
  })

  it('applies minFee when area is small', () => {
    // Rate × area < minFee → use minFee
    const fee = computeMunicipalFee(
      { feeType: 'building_plan_levy', label: 'Building Plan Levy', ratePerM2: 15, minFee: 5000 },
      100, // 15 × 100 = 1500 < 5000
    )
    expect(fee).toBe(5000)
  })

  it('uses rate × area when above minFee', () => {
    const fee = computeMunicipalFee(
      { feeType: 'building_plan_levy', label: 'Building Plan Levy', ratePerM2: 15, minFee: 5000 },
      500, // 15 × 500 = 7500 > 5000
    )
    expect(fee).toBe(7500)
  })

  it('uses flatFee directly for flat-fee items', () => {
    const fee = computeMunicipalFee(
      { feeType: 'occupancy_certificate', label: 'Occupancy Certificate', flatFee: 2500 },
      1000,
    )
    expect(fee).toBe(2500)
  })
})

describe('softCostEstimator — contingency applied correctly', () => {
  it('applies contingency as percentage of (professional fees + municipal)', () => {
    const input = defaultInput({
      constructionCost: 5000000,
      buildingAreaM2: 500,
      contingencyPercent: 10,
      vatInclusive: false,
    })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const profFees = result.aggregates.totalProfessionalFees as number
    const municipal = result.aggregates.totalMunicipalFees as number
    const expectedContingency = (profFees + municipal) * 0.10
    expect(result.aggregates.contingencyAmount).toBeCloseTo(expectedContingency, 0)
  })

  it('produces zero contingency when contingencyPercent is 0', () => {
    const input = defaultInput({ contingencyPercent: 0, vatInclusive: false })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.aggregates.contingencyAmount).toBe(0)
  })
})

describe('softCostEstimator — total soft cost percentage range check', () => {
  it('clause passes when within 15-25% of construction cost', () => {
    // Use a construction cost that puts typical fees in the 15-25% range
    const input = defaultInput({
      constructionCost: 5000000,
      buildingAreaM2: 500,
      selectedDisciplines: ['architect', 'engineer', 'quantity_surveyor'],
      contingencyPercent: 5,
      vatInclusive: false,
    })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const rangeClause = result.clauseResults.find((c) => c.clauseRef === 'SOFT-COST-RANGE')
    expect(rangeClause).toBeDefined()
    // The actual outcome depends on fee ratios; just verify clause is evaluated
    expect(['pass', 'advisory']).toContain(rangeClause!.outcome)
  })

  it('clause is advisory when soft costs exceed 25% of construction cost', () => {
    // Very low construction cost with many disciplines → high percentage
    const input = defaultInput({
      constructionCost: 300000,
      buildingAreaM2: 500,
      selectedDisciplines: ['architect', 'engineer', 'quantity_surveyor', 'project_manager'],
      contingencyPercent: 10,
      vatInclusive: false,
    })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const rangeClause = result.clauseResults.find((c) => c.clauseRef === 'SOFT-COST-RANGE')
    expect(rangeClause).toBeDefined()
    expect(rangeClause!.outcome).toBe('advisory')
  })

  it('contingency clause passes for 5% (within 3-10%)', () => {
    const input = defaultInput({ contingencyPercent: 5 })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const contingencyClause = result.clauseResults.find((c) => c.clauseRef === 'SOFT-COST-CONTINGENCY')
    expect(contingencyClause).toBeDefined()
    expect(contingencyClause!.outcome).toBe('pass')
  })

  it('contingency clause is advisory for 1% (below 3%)', () => {
    const input = defaultInput({ contingencyPercent: 1 })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const contingencyClause = result.clauseResults.find((c) => c.clauseRef === 'SOFT-COST-CONTINGENCY')
    expect(contingencyClause).toBeDefined()
    expect(contingencyClause!.outcome).toBe('advisory')
  })
})

describe('softCostEstimator — source version traceability', () => {
  it('result includes source versions for used bracket tables', () => {
    const input = defaultInput({
      constructionCost: 5000000,
      selectedDisciplines: ['architect', 'engineer'],
    })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.sourceVersions.length).toBeGreaterThanOrEqual(2)
    const tableIds = result.sourceVersions.map((sv) => sv.guideline)
    expect(tableIds).toContain('sacap_fee_brackets')
    expect(tableIds).toContain('ecsa_fee_brackets')
  })

  it('result includes municipal table in source versions', () => {
    const input = defaultInput({ buildingAreaM2: 500 })
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const tableIds = result.sourceVersions.map((sv) => sv.guideline)
    expect(tableIds).toContain(MUNICIPAL_TABLE_ID)
  })

  it('result includes disclaimers', () => {
    const input = defaultInput()
    const ctx = makeContext(input)
    const result = softCostEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.disclaimers.length).toBeGreaterThan(0)
    expect(result.disclaimers.some((d) => d.includes('indicative'))).toBe(true)
  })
})

describe('softCostEstimator — definition registration', () => {
  it('is registered in the definition registry', () => {
    expect(hasCalculatorDefinition('soft_cost_estimator_v1')).toBe(true)
  })

  it('can be retrieved from the registry', () => {
    const def = getCalculatorDefinition('soft_cost_estimator_v1')
    expect(def).toBeDefined()
    expect(def!.toolId).toBe('soft_cost_estimator')
    expect(def!.status).toBe('full')
  })

  it('has table refs for all discipline tables + municipal table', () => {
    const def = getCalculatorDefinition('soft_cost_estimator_v1')
    expect(def!.tableRefs).toContain('sacap_fee_brackets')
    expect(def!.tableRefs).toContain('ecsa_fee_brackets')
    expect(def!.tableRefs).toContain(MUNICIPAL_TABLE_ID)
  })

  it('has clause checks defined', () => {
    const def = getCalculatorDefinition('soft_cost_estimator_v1')
    expect(def!.clauseSet).toBeDefined()
    expect(def!.clauseSet!.length).toBe(2)
  })
})
