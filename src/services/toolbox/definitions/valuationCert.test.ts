import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  valuationCertV1,
  valuationCertInputSchema,
  valuationCertRowSchema,
  type ValuationCertInput,
  type ValuationCertRow,
} from './valuationCert'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(valuationCertV1, input, rows, { tables: [] })
}

function defaultInput(overrides: Partial<ValuationCertInput> = {}): ValuationCertInput {
  return {
    contractNumber: 'CNT-001',
    certNumber: 1,
    contractSum: 1000000,
    retentionPercent: 10,
    previousRetentionHeld: 0,
    vatRate: 0.15,
    platformFeePercent: 5,
    ...overrides,
  }
}

function defaultRow(overrides: Partial<ValuationCertRow> = {}): ValuationCertRow {
  return {
    description: 'Substructure concrete',
    contractAmount: 500000,
    previousCertified: 100000,
    currentWorkDone: 50000,
    materialsOnSite: 10000,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — schema validation', () => {
  it('accepts valid input with defaults', () => {
    const result = valuationCertInputSchema.safeParse({
      contractNumber: 'CNT-001',
      certNumber: 1,
      contractSum: 500000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.retentionPercent).toBe(10)
      expect(result.data.vatRate).toBe(0.15)
      expect(result.data.platformFeePercent).toBe(5)
      expect(result.data.previousRetentionHeld).toBe(0)
    }
  })

  it('rejects empty contractNumber', () => {
    const result = valuationCertInputSchema.safeParse({
      contractNumber: '',
      certNumber: 1,
      contractSum: 500000,
    })
    expect(result.success).toBe(false)
  })

  it('rejects certNumber < 1', () => {
    const result = valuationCertInputSchema.safeParse({
      contractNumber: 'CNT-001',
      certNumber: 0,
      contractSum: 500000,
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid schedule row', () => {
    const result = valuationCertRowSchema.safeParse({
      description: 'Brickwork',
      contractAmount: 200000,
      previousCertified: 50000,
      currentWorkDone: 30000,
      materialsOnSite: 5000,
    })
    expect(result.success).toBe(true)
  })

  it('rejects row with empty description', () => {
    const result = valuationCertRowSchema.safeParse({
      description: '',
      contractAmount: 200000,
      previousCertified: 0,
      currentWorkDone: 30000,
      materialsOnSite: 0,
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Per-row certified amount
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — per-row certified amount', () => {
  it('currentCertified = currentWorkDone + materialsOnSite', () => {
    const result = run(defaultInput(), [
      defaultRow({ currentWorkDone: 50000, materialsOnSite: 10000 }),
    ])
    expect(result.lineResults[0].currentCertified).toBe(60000)
  })

  it('handles multiple rows independently', () => {
    const result = run(defaultInput(), [
      defaultRow({ currentWorkDone: 30000, materialsOnSite: 5000 }),
      defaultRow({ description: 'Steel', currentWorkDone: 20000, materialsOnSite: 3000 }),
    ])
    expect(result.lineResults[0].currentCertified).toBe(35000)
    expect(result.lineResults[1].currentCertified).toBe(23000)
  })
})

// ---------------------------------------------------------------------------
// Retention calculation
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — retention calculation', () => {
  it('retentionThisCert = currentGross × retentionPercent', () => {
    const result = run(
      defaultInput({ retentionPercent: 10 }),
      [defaultRow({ currentWorkDone: 100000, materialsOnSite: 0 })],
    )
    // currentGross = 100000, retention = 10000
    expect(result.aggregates.retentionThisCert).toBe(10000)
  })

  it('totalRetentionHeld = previousRetentionHeld + retentionThisCert', () => {
    const result = run(
      defaultInput({ retentionPercent: 10, previousRetentionHeld: 25000 }),
      [defaultRow({ currentWorkDone: 100000, materialsOnSite: 0 })],
    )
    expect(result.aggregates.totalRetentionHeld).toBe(35000)
  })
})

// ---------------------------------------------------------------------------
// Net amount = gross - retention
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — net current certified', () => {
  it('netCurrentCertified = currentGross - retentionThisCert', () => {
    const result = run(
      defaultInput({ retentionPercent: 10 }),
      [defaultRow({ currentWorkDone: 100000, materialsOnSite: 20000 })],
    )
    // currentGross = 120000, retention = 12000, net = 108000
    expect(result.aggregates.currentGross).toBe(120000)
    expect(result.aggregates.retentionThisCert).toBe(12000)
    expect(result.aggregates.netCurrentCertified).toBe(108000)
  })
})

// ---------------------------------------------------------------------------
// VAT on net amount
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — VAT calculation', () => {
  it('vatAmount = netCurrentCertified × vatRate', () => {
    const result = run(
      defaultInput({ retentionPercent: 10, vatRate: 0.15 }),
      [defaultRow({ currentWorkDone: 100000, materialsOnSite: 0 })],
    )
    // net = 90000, VAT = 13500
    expect(result.aggregates.netCurrentCertified).toBe(90000)
    expect(result.aggregates.vatAmount).toBe(13500)
  })

  it('handles zero VAT rate', () => {
    const result = run(
      defaultInput({ retentionPercent: 10, vatRate: 0 }),
      [defaultRow({ currentWorkDone: 100000, materialsOnSite: 0 })],
    )
    expect(result.aggregates.vatAmount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Platform fee calculation
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — platform fee', () => {
  it('platformFee = amountDue × platformFeePercent/100', () => {
    const result = run(
      defaultInput({ retentionPercent: 10, vatRate: 0.15, platformFeePercent: 5 }),
      [defaultRow({ currentWorkDone: 100000, materialsOnSite: 0 })],
    )
    // net = 90000, VAT = 13500, amountDue = 103500, fee = 5175
    expect(result.aggregates.amountDue).toBe(103500)
    expect(result.aggregates.platformFee).toBe(5175)
  })

  it('handles zero platform fee', () => {
    const result = run(
      defaultInput({ platformFeePercent: 0 }),
      [defaultRow({ currentWorkDone: 50000, materialsOnSite: 0 })],
    )
    expect(result.aggregates.platformFee).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Design Property 6: clientIntoEscrow = amountDue + platformFee (exact)
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — Property 6: clientIntoEscrow exactness', () => {
  it('clientIntoEscrow = amountDue + platformFee exactly', () => {
    const result = run(
      defaultInput({ retentionPercent: 10, vatRate: 0.15, platformFeePercent: 5 }),
      [
        defaultRow({ currentWorkDone: 73421.57, materialsOnSite: 12345.89 }),
        defaultRow({ description: 'Steel', currentWorkDone: 45678.12, materialsOnSite: 8901.23 }),
      ],
    )
    const amountDue = result.aggregates.amountDue as number
    const platformFee = result.aggregates.platformFee as number
    const clientIntoEscrow = result.aggregates.clientIntoEscrow as number

    // Exact: no floating-point drift beyond cents
    expect(clientIntoEscrow).toBe(
      Math.round((amountDue + platformFee) * 100) / 100,
    )
  })

  it('conservation holds with many fractional amounts', () => {
    const rows = [
      defaultRow({ currentWorkDone: 33333.33, materialsOnSite: 11111.11 }),
      defaultRow({ description: 'Item B', currentWorkDone: 22222.22, materialsOnSite: 7777.77 }),
      defaultRow({ description: 'Item C', currentWorkDone: 44444.44, materialsOnSite: 5555.55 }),
    ]
    const result = run(
      defaultInput({ retentionPercent: 7.5, vatRate: 0.15, platformFeePercent: 3.5 }),
      rows,
    )
    const amountDue = result.aggregates.amountDue as number
    const platformFee = result.aggregates.platformFee as number
    const clientIntoEscrow = result.aggregates.clientIntoEscrow as number

    expect(clientIntoEscrow).toBe(
      Math.round((amountDue + platformFee) * 100) / 100,
    )
  })
})

// ---------------------------------------------------------------------------
// Design Property 6: certified = workDone − retention − previousPaid (exact)
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — Property 6: certified conservation', () => {
  it('netCurrentCertified = currentGross - retentionThisCert (exact)', () => {
    const result = run(
      defaultInput({ retentionPercent: 10 }),
      [
        defaultRow({ currentWorkDone: 73421.57, materialsOnSite: 12345.89 }),
      ],
    )
    const currentGross = result.aggregates.currentGross as number
    const retention = result.aggregates.retentionThisCert as number
    const net = result.aggregates.netCurrentCertified as number

    expect(net).toBe(Math.round((currentGross - retention) * 100) / 100)
  })
})

// ---------------------------------------------------------------------------
// Clause checks
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — clause checks', () => {
  it('passes retention clause when within 5–10%', () => {
    const result = run(
      defaultInput({ retentionPercent: 7 }),
      [defaultRow()],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'VAL-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when retention outside 5–10%', () => {
    const result = run(
      defaultInput({ retentionPercent: 15 }),
      [defaultRow()],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'VAL-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes contract-sum clause when within limit', () => {
    const result = run(
      defaultInput({ contractSum: 1000000 }),
      [defaultRow({ previousCertified: 100000, currentWorkDone: 50000, materialsOnSite: 10000 })],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'VAL-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails contract-sum clause when exceeding limit', () => {
    const result = run(
      defaultInput({ contractSum: 100000 }),
      [defaultRow({ previousCertified: 80000, currentWorkDone: 30000, materialsOnSite: 5000 })],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'VAL-002')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes platform-fee disclosure clause', () => {
    const result = run(
      defaultInput({ platformFeePercent: 5 }),
      [defaultRow()],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'VAL-003')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when platform fee is 0', () => {
    const result = run(
      defaultInput({ platformFeePercent: 0 }),
      [defaultRow()],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'VAL-003')
    expect(clause?.outcome).toBe('advisory')
  })
})

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('valuation_cert_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('valuation_cert_v1')).toBe(valuationCertV1)
    expect(valuationCertV1.toolId).toBe('valuation_cert')
    expect(valuationCertV1.method).toBe('hybrid')
    expect(valuationCertV1.status).toBe('full')
  })

  it('has scheduleSchema defined (schedule-based tool)', () => {
    expect(valuationCertV1.scheduleSchema).toBeDefined()
  })

  it('includes platform-fee disclosure in disclaimers', () => {
    expect(valuationCertV1.disclaimers.some((d) => d.includes('platform fee'))).toBe(true)
  })
})
