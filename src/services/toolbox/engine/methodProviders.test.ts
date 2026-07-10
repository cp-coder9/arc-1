import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  CalculatorError,
  type CalculationResult,
  type CalculatorDefinition,
  type ComputeContext,
  type GuidelineTable,
} from '../types'
import {
  bracketFee,
  percentageFee,
  stageApportion,
  timeCost,
  areaUnit,
  hybrid,
  feeMethodProviders,
  type FeeMethodConfig,
  type FeeMethodInput,
} from './methodProviders'
import { runCalculator } from './runCalculator'

// ---------------------------------------------------------------------------
// Fixtures — versioned guideline tables (the providers MUST read these, never
// hard-coded constants).
// ---------------------------------------------------------------------------

/** Continuous progressive sliding scale (each bracket's baseFee = prior bracket's fee at its ceiling). */
const bracketTable: GuidelineTable = {
  id: 'fee_brackets',
  version: '1.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [
    { minValue: 0, maxValue: 1_000_000, baseFee: 0, marginalRate: 0.1 },
    { minValue: 1_000_000, maxValue: 5_000_000, baseFee: 100_000, marginalRate: 0.06 },
    { minValue: 5_000_000, maxValue: null, baseFee: 340_000, marginalRate: 0.04 },
  ],
}

const flatPercentageTable: GuidelineTable = {
  id: 'fee_percentage',
  version: '1.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [{ percentage: 8 }],
}

const bandedPercentageTable: GuidelineTable = {
  id: 'fee_percentage_banded',
  version: '1.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [
    { minValue: 0, maxValue: 1_000_000, percentage: 10 },
    { minValue: 1_000_000, maxValue: null, percentage: 7 },
  ],
}

const stageTable: GuidelineTable = {
  id: 'fee_stages',
  version: '1.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [
    { stage: 'Inception', percentage: 10 },
    { stage: 'Concept', percentage: 20 },
    { stage: 'Documentation', percentage: 40 },
    { stage: 'Tender', percentage: 10 },
    { stage: 'Construction', percentage: 20 },
  ],
}

const hourlyRateTable: GuidelineTable = {
  id: 'fee_hourly_rates',
  version: '1.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [
    { grade: 'principal', hourlyRate: 1500 },
    { grade: 'senior', hourlyRate: 950 },
  ],
}

const unitRateTable: GuidelineTable = {
  id: 'fee_unit_rates',
  version: '1.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [
    { category: 'residential', ratePerUnit: 12_000 },
    { category: 'commercial', ratePerUnit: 9_500 },
  ],
}

const hybridPercentageTable: GuidelineTable = {
  id: 'fee_percentage',
  version: '1.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [{ percentage: 3.5 }],
}

function makeCtx(
  input: FeeMethodInput,
  tables: GuidelineTable[],
): ComputeContext<FeeMethodInput> {
  const map: Record<string, GuidelineTable> = {}
  for (const t of tables) map[t.id] = t
  return { input, rows: [], tables: map, jurisdiction: 'ZA' }
}

const aggNum = (r: CalculationResult, key: string): number => r.aggregates[key] as number

// ---------------------------------------------------------------------------
// bracketFee — sliding-scale bracket thresholds
// ---------------------------------------------------------------------------

describe('bracketFee — bracket/threshold edge cases', () => {
  const config: FeeMethodConfig = { bracketTableId: 'fee_brackets', vatRate: 0.15 }

  it('computes fee from the bracket containing the value', () => {
    // 2,000,000 falls in bracket 2 → 100,000 + (2,000,000 − 1,000,000) × 0.06 = 160,000
    const r = bracketFee(makeCtx({ valueForFeePurposes: 2_000_000 }, [bracketTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(160_000)
    expect(aggNum(r, 'vatAmount')).toBe(24_000)
    expect(aggNum(r, 'total')).toBe(184_000)
  })

  it('is continuous at a bracket boundary (value === minValue uses the base fee)', () => {
    const r = bracketFee(makeCtx({ valueForFeePurposes: 1_000_000 }, [bracketTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(100_000)
  })

  it('uses the lowest bracket below the first threshold', () => {
    // 999,999 in bracket 1 → 0 + 999,999 × 0.10 = 99,999.9
    const r = bracketFee(makeCtx({ valueForFeePurposes: 999_999 }, [bracketTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBeCloseTo(99_999.9, 2)
  })

  it('selects the open-ended top bracket for large values', () => {
    // 10,000,000 in bracket 3 → 340,000 + (10,000,000 − 5,000,000) × 0.04 = 540,000
    const r = bracketFee(makeCtx({ valueForFeePurposes: 10_000_000 }, [bracketTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(540_000)
  })

  it('applies the complexity factor', () => {
    const r = bracketFee(
      makeCtx({ valueForFeePurposes: 2_000_000, complexityFactor: 2 }, [bracketTable]),
      config,
    )
    expect(aggNum(r, 'originalProfessionalFee')).toBe(320_000)
  })
})

// ---------------------------------------------------------------------------
// Property 4 — monotonic fees for bracket & percentage methods
// ---------------------------------------------------------------------------

describe('Property 4 — monotonic base fee (bracket & percentage)', () => {
  it('bracketFee never decreases as value increases', () => {
    const config: FeeMethodConfig = { bracketTableId: 'fee_brackets' }
    let prev = -Infinity
    for (let v = 0; v <= 12_000_000; v += 250_000) {
      const fee = aggNum(bracketFee(makeCtx({ valueForFeePurposes: v }, [bracketTable]), config), 'originalProfessionalFee')
      expect(fee).toBeGreaterThanOrEqual(prev)
      prev = fee
    }
  })

  it('percentageFee (flat) never decreases as value increases', () => {
    const config: FeeMethodConfig = { percentageTableId: 'fee_percentage' }
    let prev = -Infinity
    for (let v = 0; v <= 12_000_000; v += 250_000) {
      const fee = aggNum(percentageFee(makeCtx({ valueForFeePurposes: v }, [flatPercentageTable]), config), 'originalProfessionalFee')
      expect(fee).toBeGreaterThanOrEqual(prev)
      prev = fee
    }
  })
})

// ---------------------------------------------------------------------------
// percentageFee
// ---------------------------------------------------------------------------

describe('percentageFee — flat and banded', () => {
  it('applies a flat percentage from the table', () => {
    const r = percentageFee(
      makeCtx({ valueForFeePurposes: 1_000_000 }, [flatPercentageTable]),
      { percentageTableId: 'fee_percentage', vatRate: 0.15 },
    )
    expect(aggNum(r, 'originalProfessionalFee')).toBe(80_000)
    expect(aggNum(r, 'total')).toBe(92_000)
  })

  it('selects the banded percentage for the value', () => {
    const config: FeeMethodConfig = { percentageTableId: 'fee_percentage_banded' }
    const low = percentageFee(makeCtx({ valueForFeePurposes: 500_000 }, [bandedPercentageTable]), config)
    const high = percentageFee(makeCtx({ valueForFeePurposes: 2_000_000 }, [bandedPercentageTable]), config)
    expect(aggNum(low, 'originalProfessionalFee')).toBe(50_000) // 500k × 10%
    expect(aggNum(high, 'originalProfessionalFee')).toBe(140_000) // 2m × 7%
  })

  it('reads the tariff from the table, not a constant (changing the table changes the result)', () => {
    const edited: GuidelineTable = { ...flatPercentageTable, version: '2.0.0', rows: [{ percentage: 12 }] }
    const r = percentageFee(
      makeCtx({ valueForFeePurposes: 1_000_000 }, [edited]),
      { percentageTableId: 'fee_percentage' },
    )
    expect(aggNum(r, 'originalProfessionalFee')).toBe(120_000)
    expect(r.sourceVersions).toContainEqual(expect.objectContaining({ guideline: 'fee_percentage', version: '2.0.0' }))
  })
})

// ---------------------------------------------------------------------------
// stageApportion
// ---------------------------------------------------------------------------

describe('stageApportion — stage apportionment', () => {
  const config: FeeMethodConfig = {
    percentageTableId: 'fee_percentage',
    stageTableId: 'fee_stages',
    vatRate: 0.15,
  }

  it('apportions the base fee to selected stages', () => {
    // base = 1,000,000 × 8% = 80,000; Inception+Concept = 30% → 24,000
    const r = stageApportion(
      makeCtx({ valueForFeePurposes: 1_000_000, selectedStages: ['Inception', 'Concept'] }, [flatPercentageTable, stageTable]),
      config,
    )
    expect(aggNum(r, 'originalProfessionalFee')).toBe(24_000)
    expect(aggNum(r, 'vatAmount')).toBe(3_600)
    expect(aggNum(r, 'total')).toBe(27_600)
  })

  it('uses the full fee when no stages are selected (all stages sum to 100%)', () => {
    const r = stageApportion(
      makeCtx({ valueForFeePurposes: 1_000_000 }, [flatPercentageTable, stageTable]),
      config,
    )
    expect(aggNum(r, 'originalProfessionalFee')).toBe(80_000)
  })
})

// ---------------------------------------------------------------------------
// timeCost
// ---------------------------------------------------------------------------

describe('timeCost — time-based edge cases', () => {
  const config: FeeMethodConfig = { hourlyRateTableId: 'fee_hourly_rates', vatRate: 0.15 }

  it('multiplies hours by the grade-specific rate', () => {
    const r = timeCost(makeCtx({ hours: 10, grade: 'senior' }, [hourlyRateTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(9_500)
    expect(aggNum(r, 'total')).toBe(10_925)
  })

  it('falls back to the first rate row when grade is omitted', () => {
    const r = timeCost(makeCtx({ hours: 10 }, [hourlyRateTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(15_000) // principal 1500 × 10
  })

  it('produces a zero fee for zero hours without throwing', () => {
    const r = timeCost(makeCtx({ hours: 0, grade: 'senior' }, [hourlyRateTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// areaUnit
// ---------------------------------------------------------------------------

describe('areaUnit — area/unit edge cases', () => {
  const config: FeeMethodConfig = { unitRateTableId: 'fee_unit_rates', vatRate: 0.15 }

  it('multiplies area by the category-specific unit rate', () => {
    const r = areaUnit(makeCtx({ area: 100, category: 'commercial' }, [unitRateTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(950_000)
  })

  it('falls back to the first unit-rate row when category is omitted', () => {
    const r = areaUnit(makeCtx({ area: 100 }, [unitRateTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(1_200_000) // residential 12,000 × 100
  })

  it('accepts the units alias for area', () => {
    const r = areaUnit(makeCtx({ units: 50, category: 'commercial' }, [unitRateTable]), config)
    expect(aggNum(r, 'originalProfessionalFee')).toBe(475_000)
  })
})

// ---------------------------------------------------------------------------
// hybrid
// ---------------------------------------------------------------------------

describe('hybrid — composed components', () => {
  it('sums percentage + time base fees and finalizes once', () => {
    // percentage: 1,000,000 × 3.5% = 35,000 ; time: 10 × 950 = 9,500 → base 44,500
    const r = hybrid(
      makeCtx({ valueForFeePurposes: 1_000_000, hours: 10, grade: 'senior' }, [hybridPercentageTable, hourlyRateTable]),
      { percentageTableId: 'fee_percentage', hourlyRateTableId: 'fee_hourly_rates', vatRate: 0.15 },
    )
    expect(aggNum(r, 'originalProfessionalFee')).toBe(44_500)
    expect(aggNum(r, 'vatAmount')).toBe(6_675)
    expect(aggNum(r, 'total')).toBe(51_175)
  })

  it('warns and skips a component whose table is not configured', () => {
    const r = hybrid(
      makeCtx({ valueForFeePurposes: 1_000_000, hours: 10 }, [hybridPercentageTable]),
      { percentageTableId: 'fee_percentage', hybridComponents: ['percentage', 'time'] },
    )
    expect(aggNum(r, 'originalProfessionalFee')).toBe(35_000)
    expect(r.warnings.some((w) => w.includes('time component skipped'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// VAT, discount, disbursements & statutory composition
// ---------------------------------------------------------------------------

describe('fee composition — discount / disbursements / statutory / VAT', () => {
  it('applies discount, disbursements, statutory fees and VAT correctly', () => {
    const r = percentageFee(
      makeCtx(
        {
          valueForFeePurposes: 1_000_000,
          discountPercent: 10,
          discountReason: 'loyalty',
          disbursements: 5_000,
          statutoryFees: 2_000,
        },
        [flatPercentageTable],
      ),
      { percentageTableId: 'fee_percentage', vatRate: 0.15 },
    )
    expect(aggNum(r, 'originalProfessionalFee')).toBe(80_000)
    expect(aggNum(r, 'discountAmount')).toBe(8_000)
    expect(aggNum(r, 'professionalFeeAfterDiscount')).toBe(72_000)
    // VAT base = 72,000 + 5,000 disbursements = 77,000 → VAT 11,550
    expect(aggNum(r, 'vatAmount')).toBe(11_550)
    // total = 72,000 + 5,000 + 2,000 statutory + 11,550 = 90,550
    expect(aggNum(r, 'total')).toBe(90_550)
  })

  it('honours a VAT-rate override on the input', () => {
    const r = percentageFee(
      makeCtx({ valueForFeePurposes: 1_000_000, vatRate: 0 }, [flatPercentageTable]),
      { percentageTableId: 'fee_percentage', vatRate: 0.15 },
    )
    expect(aggNum(r, 'vatAmount')).toBe(0)
    expect(aggNum(r, 'total')).toBe(80_000)
  })

  it('warns when a discount is applied without a reason', () => {
    const r = percentageFee(
      makeCtx({ valueForFeePurposes: 1_000_000, discountPercent: 10 }, [flatPercentageTable]),
      { percentageTableId: 'fee_percentage' },
    )
    expect(r.warnings.some((w) => w.toLowerCase().includes('reason'))).toBe(true)
  })

  it('always attaches advisory disclaimers (Property 5)', () => {
    const r = percentageFee(
      makeCtx({ valueForFeePurposes: 1_000_000 }, [flatPercentageTable]),
      { percentageTableId: 'fee_percentage' },
    )
    expect(r.disclaimers.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Failure modes
// ---------------------------------------------------------------------------

describe('fee providers — failures', () => {
  it('throws MISSING_TABLE when the configured table id is absent', () => {
    expect(() =>
      percentageFee(makeCtx({ valueForFeePurposes: 1_000_000 }, []), { percentageTableId: 'fee_percentage' }),
    ).toThrowError(CalculatorError)
  })

  it('throws MISSING_TABLE when no table id is configured', () => {
    try {
      bracketFee(makeCtx({ valueForFeePurposes: 1_000_000 }, [bracketTable]), {})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalculatorError)
      expect((e as CalculatorError).code).toBe('MISSING_TABLE')
    }
  })
})

// ---------------------------------------------------------------------------
// Provider registry + end-to-end through runCalculator
// ---------------------------------------------------------------------------

describe('feeMethodProviders registry', () => {
  it('maps every fee MethodType to a provider', () => {
    expect(Object.keys(feeMethodProviders).sort()).toEqual(
      ['area', 'bracket', 'hybrid', 'percentage', 'stage', 'time'].sort(),
    )
  })
})

describe('integration — provider invoked inside a definition via runCalculator', () => {
  it('runs a bracket-fee definition end-to-end with table version pinning', () => {
    const def: CalculatorDefinition<FeeMethodInput> = {
      id: 'fee_calculator_bracket_v1',
      toolId: 'fee_calculator',
      title: 'Bracket fee calculator',
      method: 'bracket',
      inputSchema: z.object({
        valueForFeePurposes: z.number().nonnegative(),
        complexityFactor: z.number().positive().optional(),
      }),
      tableRefs: ['fee_brackets'],
      compute: (ctx) => bracketFee(ctx as ComputeContext<FeeMethodInput>, { bracketTableId: 'fee_brackets', vatRate: 0.15 }),
      reportTemplateId: 'fee_report',
      source: { guideline: 'SACAP fee guideline', version: '1.0.0', status: 'recommended' },
      disclaimers: ['Advisory only.'],
      status: 'full',
    }
    const result = runCalculator(def, { valueForFeePurposes: 2_000_000 }, [], { tables: [bracketTable] })
    expect(result.aggregates.originalProfessionalFee).toBe(160_000)
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({ guideline: 'fee_brackets', version: '1.0.0' }))
  })
})
