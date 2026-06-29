// Feasibility Estimator — unit tests (Task 8.2)
//
// Tests: schema validation, total development cost computation, revenue vs cost
// (surplus/deficit), contingency clause check, professional fee % clause check,
// and registration.
//
// Requirements: 5.1, 5.3.

import { describe, it, expect } from 'vitest'
import {
  feasibilityEstimatorV1,
  feasibilityInputSchema,
  feasibilityClauseSet,
  type FeasibilityInput,
} from './feasibilityEstimator'
import { MUNICIPAL_TABLE_ID, type MunicipalFeeRow } from './softCostEstimator'
import { hasCalculatorDefinition, getCalculatorDefinition } from './definitionRegistry'
import type { ComputeContext, GuidelineTable } from '@/services/toolbox/types'

// ----------------------------------------------------------------------------
// Test fixtures
// ----------------------------------------------------------------------------

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

function makeContext(input: FeasibilityInput): ComputeContext<FeasibilityInput> {
  const tables: Record<string, GuidelineTable> = {
    [MUNICIPAL_TABLE_ID]: makeTable(MUNICIPAL_TABLE_ID, municipalRows),
  }
  return { input, rows: [], tables }
}

function defaultInput(overrides: Partial<FeasibilityInput> = {}): FeasibilityInput {
  return {
    landCost: 2000000,
    constructionAreaM2: 500,
    constructionRatePerM2: 15000,
    contingencyPercent: 7.5,
    professionalFeePercent: 12,
    municipalAllowance: 150000,
    useMunicipalTable: false,
    financeCosts: 500000,
    marketingCosts: 200000,
    legalCosts: 100000,
    isDeveloperFeasibility: false,
    sellingPricePerM2: 0,
    grossLettableAreaM2: 0,
    targetProfitMarginPercent: 20,
    vatInclusive: false,
    vatRate: 0.15,
    ...overrides,
  }
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('feasibilityEstimator — schema validation', () => {
  it('accepts valid inputs with all required fields', () => {
    const result = feasibilityInputSchema.safeParse({
      landCost: 1000000,
      constructionAreaM2: 300,
      constructionRatePerM2: 12000,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative land cost', () => {
    const result = feasibilityInputSchema.safeParse({
      landCost: -100,
      constructionAreaM2: 300,
      constructionRatePerM2: 12000,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative construction area', () => {
    const result = feasibilityInputSchema.safeParse({
      landCost: 1000000,
      constructionAreaM2: -50,
      constructionRatePerM2: 12000,
    })
    expect(result.success).toBe(false)
  })

  it('applies defaults for optional fields', () => {
    const result = feasibilityInputSchema.parse({
      landCost: 1000000,
      constructionAreaM2: 300,
      constructionRatePerM2: 12000,
    })
    expect(result.contingencyPercent).toBe(7.5)
    expect(result.professionalFeePercent).toBe(12)
    expect(result.financeCosts).toBe(0)
    expect(result.marketingCosts).toBe(0)
    expect(result.isDeveloperFeasibility).toBe(false)
    expect(result.vatInclusive).toBe(false)
  })

  it('rejects contingency outside 0-100 range', () => {
    const result = feasibilityInputSchema.safeParse({
      landCost: 1000000,
      constructionAreaM2: 300,
      constructionRatePerM2: 12000,
      contingencyPercent: 110,
    })
    expect(result.success).toBe(false)
  })

  it('rejects professionalFeePercent outside 0-100', () => {
    const result = feasibilityInputSchema.safeParse({
      landCost: 1000000,
      constructionAreaM2: 300,
      constructionRatePerM2: 12000,
      professionalFeePercent: -5,
    })
    expect(result.success).toBe(false)
  })
})

describe('feasibilityEstimator — total development cost computation', () => {
  it('computes correct total development cost (no VAT)', () => {
    const input = defaultInput()
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Construction: 500 × 15000 = 7,500,000
    // Contingency: 7,500,000 × 7.5% = 562,500
    // Professional fees: 7,500,000 × 12% = 900,000
    // Municipal: 150,000 (lump sum)
    // Finance: 500,000
    // Marketing: 200,000
    // Legal: 100,000
    // Total = 2,000,000 + 7,500,000 + 562,500 + 900,000 + 150,000 + 500,000 + 200,000 + 100,000 = 11,912,500
    expect(result.aggregates.constructionCost).toBeCloseTo(7500000, 0)
    expect(result.aggregates.contingencyAmount).toBeCloseTo(562500, 0)
    expect(result.aggregates.professionalFees).toBeCloseTo(900000, 0)
    expect(result.aggregates.totalDevCost).toBeCloseTo(11912500, 0)
  })

  it('computes cost per m²', () => {
    const input = defaultInput()
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const totalDevCost = result.aggregates.totalDevCost as number
    const expectedCostPerM2 = totalDevCost / 500
    expect(result.aggregates.costPerM2).toBeCloseTo(expectedCostPerM2, 0)
  })

  it('includes VAT when vatInclusive is true', () => {
    const input = defaultInput({ vatInclusive: true, vatRate: 0.15 })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect((result.aggregates.vatAmount as number)).toBeGreaterThan(0)
    // Total with VAT > total without VAT
    const noVatInput = defaultInput({ vatInclusive: false })
    const noVatResult = feasibilityEstimatorV1.compute(makeContext(noVatInput) as ComputeContext<Record<string, unknown>, Record<string, unknown>>)
    expect((result.aggregates.totalDevCost as number)).toBeGreaterThan(noVatResult.aggregates.totalDevCost as number)
  })

  it('uses municipal table when useMunicipalTable is true', () => {
    const input = defaultInput({ useMunicipalTable: true, municipalAllowance: 0, constructionAreaM2: 500 })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Expected: building_plan_levy: 7500, plan_submission: 4000, occupancy: 2500, zoning: 15000, engineering: 125000
    const expectedMunicipal = 7500 + 4000 + 2500 + 15000 + 125000
    expect(result.aggregates.municipalFees).toBeCloseTo(expectedMunicipal, 0)
  })
})

describe('feasibilityEstimator — revenue vs cost (surplus/deficit)', () => {
  it('computes positive surplus when revenue exceeds cost', () => {
    const input = defaultInput({
      isDeveloperFeasibility: true,
      sellingPricePerM2: 35000,
      grossLettableAreaM2: 450,
    })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Revenue: 35000 × 450 = 15,750,000
    // Total dev cost: ~11,912,500
    expect(result.aggregates.totalRevenue).toBeCloseTo(15750000, 0)
    expect((result.aggregates.surplus as number)).toBeGreaterThan(0)
    expect((result.aggregates.profitMarginPercent as number)).toBeGreaterThan(0)
  })

  it('computes negative surplus (deficit) when cost exceeds revenue', () => {
    const input = defaultInput({
      isDeveloperFeasibility: true,
      sellingPricePerM2: 15000,
      grossLettableAreaM2: 450,
    })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Revenue: 15000 × 450 = 6,750,000 < total dev cost ~11.9M
    expect((result.aggregates.surplus as number)).toBeLessThan(0)
  })

  it('uses constructionAreaM2 when grossLettableAreaM2 is 0', () => {
    const input = defaultInput({
      isDeveloperFeasibility: true,
      sellingPricePerM2: 30000,
      grossLettableAreaM2: 0,
      constructionAreaM2: 500,
    })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.aggregates.gla).toBe(500)
    expect(result.aggregates.totalRevenue).toBeCloseTo(30000 * 500, 0)
  })

  it('does not include revenue lines when not a developer feasibility', () => {
    const input = defaultInput({ isDeveloperFeasibility: false })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.aggregates.totalRevenue).toBe(0)
    expect(result.aggregates.surplus).toBe(0)
    const revenueLines = result.lineResults.filter((l) => l.category === 'revenue')
    expect(revenueLines.length).toBe(0)
  })
})

describe('feasibilityEstimator — contingency clause check', () => {
  it('passes when contingency is within 5-10%', () => {
    const input = defaultInput({ contingencyPercent: 7.5 })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-CONTINGENCY-RANGE')
    expect(clause).toBeDefined()
    expect(clause!.outcome).toBe('pass')
  })

  it('advisory when contingency below 5%', () => {
    const input = defaultInput({ contingencyPercent: 3 })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-CONTINGENCY-RANGE')
    expect(clause!.outcome).toBe('advisory')
  })

  it('advisory when contingency above 10%', () => {
    const input = defaultInput({ contingencyPercent: 15 })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-CONTINGENCY-RANGE')
    expect(clause!.outcome).toBe('advisory')
  })
})

describe('feasibilityEstimator — professional fee % clause check', () => {
  it('passes when professional fee % is within 8-18%', () => {
    const input = defaultInput({ professionalFeePercent: 12 })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-PROFESSIONAL-FEE-RANGE')
    expect(clause).toBeDefined()
    expect(clause!.outcome).toBe('pass')
  })

  it('advisory when professional fee % below 8%', () => {
    const input = defaultInput({ professionalFeePercent: 5 })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-PROFESSIONAL-FEE-RANGE')
    expect(clause!.outcome).toBe('advisory')
  })

  it('advisory when professional fee % above 18%', () => {
    const input = defaultInput({ professionalFeePercent: 22 })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-PROFESSIONAL-FEE-RANGE')
    expect(clause!.outcome).toBe('advisory')
  })
})

describe('feasibilityEstimator — feasibility surplus clause check', () => {
  it('passes when surplus is positive (developer feasibility)', () => {
    const input = defaultInput({
      isDeveloperFeasibility: true,
      sellingPricePerM2: 35000,
      grossLettableAreaM2: 450,
    })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-SURPLUS-POSITIVE')
    expect(clause).toBeDefined()
    expect(clause!.outcome).toBe('pass')
  })

  it('fails when surplus is negative (developer feasibility)', () => {
    const input = defaultInput({
      isDeveloperFeasibility: true,
      sellingPricePerM2: 15000,
      grossLettableAreaM2: 450,
    })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-SURPLUS-POSITIVE')
    expect(clause!.outcome).toBe('fail')
  })

  it('passes (N/A) when not a developer feasibility', () => {
    const input = defaultInput({ isDeveloperFeasibility: false })
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const clause = result.clauseResults.find((c) => c.clauseRef === 'FEAS-SURPLUS-POSITIVE')
    expect(clause!.outcome).toBe('pass')
  })
})

describe('feasibilityEstimator — definition registration', () => {
  it('is registered in the definition registry', () => {
    expect(hasCalculatorDefinition('feasibility_estimator_v1')).toBe(true)
  })

  it('can be retrieved from the registry', () => {
    const def = getCalculatorDefinition('feasibility_estimator_v1')
    expect(def).toBeDefined()
    expect(def!.toolId).toBe('feasibility_estimator')
    expect(def!.status).toBe('full')
  })

  it('has municipal table ref', () => {
    const def = getCalculatorDefinition('feasibility_estimator_v1')
    expect(def!.tableRefs).toContain(MUNICIPAL_TABLE_ID)
  })

  it('has clause checks defined', () => {
    const def = getCalculatorDefinition('feasibility_estimator_v1')
    expect(def!.clauseSet).toBeDefined()
    expect(def!.clauseSet!.length).toBe(3)
  })

  it('has source info with indicative status', () => {
    const def = getCalculatorDefinition('feasibility_estimator_v1')
    expect(def!.source.status).toBe('indicative')
  })

  it('has disclaimers (advisory invariant — Property 5)', () => {
    const input = defaultInput()
    const ctx = makeContext(input)
    const result = feasibilityEstimatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.disclaimers.length).toBeGreaterThan(0)
    expect(result.disclaimers.some((d) => d.includes('indicative'))).toBe(true)
  })
})
