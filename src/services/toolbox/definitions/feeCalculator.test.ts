// Professional Fee Calculator — unit tests (Task 8.1)
//
// Tests: schema validation, bracket fee lookup per council, stage apportioning,
// VAT calculation, complexity factor, additional services + disbursements,
// monotonic fee property (design Property 4), source version traceability
// (design Property 2), and registration in the definition registry.
//
// Requirements: 5.1, 5.2, 3.1, 10.1.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  feeCalculatorV1,
  feeCalculatorInputSchema,
  feeCalculatorClauseSet,
  computeBracketBaseFee,
  computeStageShare,
  selectBracketRow,
  COUNCILS,
  COUNCIL_TABLE_IDS,
  FEE_STAGES_TABLE_ID,
  type FeeCalculatorInput,
  type FeeTableBracketRow,
  type FeeStageRow,
} from './feeCalculator'
import { hasCalculatorDefinition, getCalculatorDefinition } from './definitionRegistry'
import type { ComputeContext, GuidelineTable } from '@/services/toolbox/types'

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

const feeStages: FeeStageRow[] = [
  { stage: 'Stage 1: Inception', percentage: 5 },
  { stage: 'Stage 2: Concept & Viability', percentage: 15 },
  { stage: 'Stage 3: Design Development', percentage: 20 },
  { stage: 'Stage 4: Documentation', percentage: 25 },
  { stage: 'Stage 5: Procurement', percentage: 5 },
  { stage: 'Stage 6: Construction', percentage: 25 },
  { stage: 'Stage 7: Close-out', percentage: 5 },
]

function makeTable(id: string, rows: unknown[]): GuidelineTable {
  return { id, version: '2024.1', effectiveFrom: '2024-01-01', jurisdiction: 'ZA', status: 'recommended', rows }
}

function makeContext(input: FeeCalculatorInput): ComputeContext<FeeCalculatorInput> {
  const tables: Record<string, GuidelineTable> = {
    [COUNCIL_TABLE_IDS[input.council]]: makeTable(COUNCIL_TABLE_IDS[input.council], getBracketsForCouncil(input.council)),
    [FEE_STAGES_TABLE_ID]: makeTable(FEE_STAGES_TABLE_ID, feeStages),
  }
  return { input, rows: [], tables }
}

function getBracketsForCouncil(council: string): FeeTableBracketRow[] {
  switch (council) {
    case 'SACAP': return sacapBrackets
    case 'ECSA': return ecsaBrackets
    case 'SACQSP': return sacqspBrackets
    default: return sacapBrackets // For brevity, use SACAP as fallback
  }
}

function defaultInput(overrides: Partial<FeeCalculatorInput> = {}): FeeCalculatorInput {
  return {
    council: 'SACAP',
    valueForFeePurposes: 5000000,
    selectedStages: [],
    complexityFactor: 1,
    additionalServicesAmount: 0,
    disbursements: 0,
    statutoryFees: 0,
    vatInclusive: true,
    vatRate: 0.15,
    discountPercent: 0,
    ...overrides,
  }
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('feeCalculator — schema validation', () => {
  it('accepts valid inputs', () => {
    const result = feeCalculatorInputSchema.safeParse({
      council: 'SACAP',
      valueForFeePurposes: 1000000,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid council', () => {
    const result = feeCalculatorInputSchema.safeParse({
      council: 'INVALID',
      valueForFeePurposes: 1000000,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative value for fee purposes', () => {
    const result = feeCalculatorInputSchema.safeParse({
      council: 'SACAP',
      valueForFeePurposes: -100,
    })
    expect(result.success).toBe(false)
  })

  it('rejects complexity factor out of range', () => {
    const tooLow = feeCalculatorInputSchema.safeParse({ council: 'SACAP', valueForFeePurposes: 1000000, complexityFactor: 0.1 })
    const tooHigh = feeCalculatorInputSchema.safeParse({ council: 'SACAP', valueForFeePurposes: 1000000, complexityFactor: 5 })
    expect(tooLow.success).toBe(false)
    expect(tooHigh.success).toBe(false)
  })

  it('applies defaults for optional fields', () => {
    const result = feeCalculatorInputSchema.parse({ council: 'ECSA', valueForFeePurposes: 2000000 })
    expect(result.selectedStages).toEqual([])
    expect(result.complexityFactor).toBe(1)
    expect(result.additionalServicesAmount).toBe(0)
    expect(result.disbursements).toBe(0)
    expect(result.vatInclusive).toBe(true)
    expect(result.vatRate).toBe(0.15)
    expect(result.discountPercent).toBe(0)
  })
})

describe('feeCalculator — bracket fee lookup', () => {
  it('selects the correct bracket for SACAP at R300k (first bracket)', () => {
    const bracket = selectBracketRow(sacapBrackets, 300000)
    expect(bracket.percentageRate).toBe(12)
    expect(bracket.lowerBound).toBe(0)
  })

  it('selects the correct bracket for SACAP at R1M (second bracket)', () => {
    const bracket = selectBracketRow(sacapBrackets, 1000000)
    expect(bracket.percentageRate).toBe(10)
    expect(bracket.lowerBound).toBe(500000)
  })

  it('selects the top bracket for SACAP at R100M', () => {
    const bracket = selectBracketRow(sacapBrackets, 100000000)
    expect(bracket.percentageRate).toBe(5)
    expect(bracket.lowerBound).toBe(50000000)
  })

  it('computes base fee for SACAP at R300k (first bracket: 12% × 300k)', () => {
    const fee = computeBracketBaseFee(sacapBrackets, 300000)
    expect(fee).toBeCloseTo(36000, 2) // 12% × 300000
  })

  it('computes base fee for SACAP at R1M (second bracket: 60k + 10% × (1M - 500k))', () => {
    const fee = computeBracketBaseFee(sacapBrackets, 1000000)
    // 60000 + 10% × 500000 = 60000 + 50000 = 110000
    expect(fee).toBeCloseTo(110000, 2)
  })

  it('computes base fee for ECSA at R3M (third bracket: 177500 + 7% × (3M - 2M))', () => {
    const fee = computeBracketBaseFee(ecsaBrackets, 3000000)
    // 177500 + 7% × 1000000 = 177500 + 70000 = 247500
    expect(fee).toBeCloseTo(247500, 2)
  })

  it('computes base fee for SACQSP at R2M (second bracket: 60k + 5% × (2M - 1M))', () => {
    const fee = computeBracketBaseFee(sacqspBrackets, 2000000)
    // 60000 + 5% × 1000000 = 60000 + 50000 = 110000
    expect(fee).toBeCloseTo(110000, 2)
  })
})

describe('feeCalculator — stage apportioning', () => {
  it('returns 100% when no stages are selected', () => {
    expect(computeStageShare(feeStages, [])).toBe(100)
  })

  it('returns the correct share for a single stage', () => {
    expect(computeStageShare(feeStages, ['Stage 1: Inception'])).toBe(5)
  })

  it('sums percentages for multiple stages', () => {
    const selected = ['Stage 1: Inception', 'Stage 2: Concept & Viability', 'Stage 3: Design Development']
    expect(computeStageShare(feeStages, selected)).toBe(40) // 5 + 15 + 20
  })

  it('all stages sum to 100', () => {
    const all = feeStages.map((s) => s.stage)
    expect(computeStageShare(feeStages, all)).toBe(100)
  })

  it('ignores invalid/unknown stage names', () => {
    expect(computeStageShare(feeStages, ['NonExistentStage'])).toBe(0)
  })
})

describe('feeCalculator — compute function', () => {
  it('computes full fee for SACAP at R5M with all stages', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    // Base fee: 210000 + 8% × (5M - 2M) = 210000 + 240000 = 450000
    expect(result.aggregates.baseFee).toBeCloseTo(450000, 0)
    expect(result.aggregates.total).toBeGreaterThan(0)
    expect(result.lineResults.length).toBeGreaterThan(0)
  })

  it('applies VAT correctly', () => {
    const input = defaultInput({ valueForFeePurposes: 1000000, vatInclusive: true, vatRate: 0.15 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const fee = result.aggregates.feeAfterDiscount as number
    const expectedVat = Math.round((fee + 0) * 0.15 * 100) / 100 // fee + disbursements
    expect(result.aggregates.vatAmount).toBeCloseTo(expectedVat, 0)
  })

  it('excludes VAT when vatInclusive is false', () => {
    const input = defaultInput({ valueForFeePurposes: 1000000, vatInclusive: false })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.aggregates.vatAmount).toBe(0)
  })

  it('applies complexity factor', () => {
    const baseInput = defaultInput({ valueForFeePurposes: 2000000, complexityFactor: 1 })
    const complexInput = defaultInput({ valueForFeePurposes: 2000000, complexityFactor: 1.5 })

    const baseResult = feeCalculatorV1.compute(makeContext(baseInput) as ComputeContext<Record<string, unknown>, Record<string, unknown>>)
    const complexResult = feeCalculatorV1.compute(makeContext(complexInput) as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const baseFee = baseResult.aggregates.professionalFee as number
    const complexFee = complexResult.aggregates.professionalFee as number
    expect(complexFee).toBeCloseTo(baseFee * 1.5, 0)
  })

  it('applies stage apportioning correctly', () => {
    const allStages = defaultInput({ valueForFeePurposes: 5000000, selectedStages: [] })
    const halfStages = defaultInput({
      valueForFeePurposes: 5000000,
      selectedStages: ['Stage 3: Design Development', 'Stage 4: Documentation'], // 20 + 25 = 45%
    })

    const allResult = feeCalculatorV1.compute(makeContext(allStages) as ComputeContext<Record<string, unknown>, Record<string, unknown>>)
    const halfResult = feeCalculatorV1.compute(makeContext(halfStages) as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const allFee = allResult.aggregates.professionalFee as number
    const halfFee = halfResult.aggregates.professionalFee as number
    expect(halfFee).toBeCloseTo(allFee * 0.45, 0)
  })

  it('adds additional services to the fee', () => {
    const input = defaultInput({ valueForFeePurposes: 1000000, additionalServicesAmount: 50000 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const feeAfterDiscount = result.aggregates.feeAfterDiscount as number
    const baseFee = result.aggregates.baseFee as number
    // feeAfterDiscount = baseFee + 50000 (no discount)
    expect(feeAfterDiscount).toBeCloseTo(baseFee + 50000, 0)
  })

  it('adds disbursements to total', () => {
    const input = defaultInput({ valueForFeePurposes: 1000000, disbursements: 25000 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.aggregates.disbursements).toBe(25000)
    // Total includes disbursements
    const total = result.aggregates.total as number
    const feeAfterDiscount = result.aggregates.feeAfterDiscount as number
    const vatAmount = result.aggregates.vatAmount as number
    expect(total).toBeCloseTo(feeAfterDiscount + 25000 + vatAmount, 0)
  })

  it('applies discount correctly', () => {
    const input = defaultInput({ valueForFeePurposes: 2000000, discountPercent: 10, discountReason: 'Repeat client' })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const baseFee = result.aggregates.baseFee as number
    const discountAmount = result.aggregates.discountAmount as number
    expect(discountAmount).toBeCloseTo(baseFee * 0.1, 0)
  })
})

describe('feeCalculator — monotonic fee property (Property 4)', () => {
  it('increasing value never decreases the base fee for SACAP', () => {
    const values = [100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000]
    let prevFee = 0
    for (const value of values) {
      const fee = computeBracketBaseFee(sacapBrackets, value)
      expect(fee).toBeGreaterThanOrEqual(prevFee)
      prevFee = fee
    }
  })

  it('increasing value never decreases the base fee for ECSA', () => {
    const values = [100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000]
    let prevFee = 0
    for (const value of values) {
      const fee = computeBracketBaseFee(ecsaBrackets, value)
      expect(fee).toBeGreaterThanOrEqual(prevFee)
      prevFee = fee
    }
  })

  it('increasing value never decreases the base fee for SACQSP', () => {
    const values = [100000, 1000000, 5000000, 20000000, 100000000, 200000000]
    let prevFee = 0
    for (const value of values) {
      const fee = computeBracketBaseFee(sacqspBrackets, value)
      expect(fee).toBeGreaterThanOrEqual(prevFee)
      prevFee = fee
    }
  })
})

describe('feeCalculator — source version traceability (Property 2)', () => {
  it('result includes source versions for bracket and stage tables', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.sourceVersions.length).toBeGreaterThanOrEqual(2)
    const tableIds = result.sourceVersions.map((sv) => sv.guideline)
    expect(tableIds).toContain('sacap_fee_brackets')
    expect(tableIds).toContain('fee_stages')
  })

  it('result includes disclaimers with council name', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.disclaimers.length).toBeGreaterThan(0)
    expect(result.disclaimers.some((d) => d.includes('SACAP'))).toBe(true)
  })

  it('result includes version in disclaimers', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    expect(result.disclaimers.some((d) => d.includes('2024.1'))).toBe(true)
  })
})

describe('feeCalculator — clause checks', () => {
  it('fee guideline range clause passes with valid input', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const rangeClause = result.clauseResults.find((c) => c.clauseRef === 'FEE-GUIDELINE-RANGE')
    expect(rangeClause).toBeDefined()
    expect(rangeClause!.outcome).toBe('pass')
  })

  it('stage sum clause passes when all stages selected', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const stageClause = result.clauseResults.find((c) => c.clauseRef === 'FEE-STAGE-SUM')
    expect(stageClause).toBeDefined()
    expect(stageClause!.outcome).toBe('pass')
  })

  it('stage sum clause fails when no valid stages are matched', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000, selectedStages: ['Nonexistent Stage'] })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const stageClause = result.clauseResults.find((c) => c.clauseRef === 'FEE-STAGE-SUM')
    expect(stageClause).toBeDefined()
    expect(stageClause!.outcome).toBe('fail')
  })

  it('discount clause is advisory when discount has no reason', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000, discountPercent: 10 })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const discountClause = result.clauseResults.find((c) => c.clauseRef === 'FEE-DISCOUNT-REASON')
    expect(discountClause).toBeDefined()
    expect(discountClause!.outcome).toBe('advisory')
  })

  it('discount clause passes when reason is provided', () => {
    const input = defaultInput({ valueForFeePurposes: 5000000, discountPercent: 10, discountReason: 'Returning client' })
    const ctx = makeContext(input)
    const result = feeCalculatorV1.compute(ctx as ComputeContext<Record<string, unknown>, Record<string, unknown>>)

    const discountClause = result.clauseResults.find((c) => c.clauseRef === 'FEE-DISCOUNT-REASON')
    expect(discountClause).toBeDefined()
    expect(discountClause!.outcome).toBe('pass')
  })
})

describe('feeCalculator — definition registration', () => {
  it('is registered in the definition registry', () => {
    expect(hasCalculatorDefinition('fee_calculator_v1')).toBe(true)
  })

  it('can be retrieved from the registry', () => {
    const def = getCalculatorDefinition('fee_calculator_v1')
    expect(def).toBeDefined()
    expect(def!.toolId).toBe('fee_calculator')
    expect(def!.status).toBe('full')
  })

  it('has all 7 council bracket table refs + fee_stages', () => {
    const def = getCalculatorDefinition('fee_calculator_v1')
    expect(def!.tableRefs.length).toBe(8) // 7 councils + 1 fee_stages
    expect(def!.tableRefs).toContain('sacap_fee_brackets')
    expect(def!.tableRefs).toContain('ecsa_fee_brackets')
    expect(def!.tableRefs).toContain('sacqsp_fee_brackets')
    expect(def!.tableRefs).toContain('sacplan_fee_brackets')
    expect(def!.tableRefs).toContain('sacpcmp_fee_brackets')
    expect(def!.tableRefs).toContain('saclap_fee_brackets')
    expect(def!.tableRefs).toContain('sagc_fee_brackets')
    expect(def!.tableRefs).toContain('fee_stages')
  })

  it('has clause checks defined', () => {
    const def = getCalculatorDefinition('fee_calculator_v1')
    expect(def!.clauseSet).toBeDefined()
    expect(def!.clauseSet!.length).toBe(4)
  })

  it('has source info with recommended status', () => {
    const def = getCalculatorDefinition('fee_calculator_v1')
    expect(def!.source.status).toBe('recommended')
    expect(def!.source.guideline).toContain('Council')
  })
})
