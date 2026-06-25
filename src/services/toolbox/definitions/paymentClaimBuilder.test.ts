import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  paymentClaimBuilderV1,
  paymentClaimInputSchema,
  paymentClaimRowSchema,
  type PaymentClaimInput,
  type PaymentClaimRow,
} from './paymentClaimBuilder'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(paymentClaimBuilderV1, input, rows, { tables: [] })
}

function defaultInput(overrides: Partial<PaymentClaimInput> = {}): PaymentClaimInput {
  return {
    projectName: 'Test Project',
    claimNumber: 1,
    claimDate: '2024-06-15',
    retentionPercent: 10,
    vatRate: 0.15,
    platformFeePercent: 5,
    ...overrides,
  }
}

function defaultRow(overrides: Partial<PaymentClaimRow> = {}): PaymentClaimRow {
  return {
    description: 'Concrete works',
    claimAmount: 100000,
    previouslyPaid: 30000,
    retentionHeld: 10000,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('payment_claim_builder_v1 — schema validation', () => {
  it('accepts valid input with defaults', () => {
    const result = paymentClaimInputSchema.safeParse({
      projectName: 'My Project',
      claimNumber: 1,
      claimDate: '2024-06-15',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.retentionPercent).toBe(10)
      expect(result.data.vatRate).toBe(0.15)
      expect(result.data.platformFeePercent).toBe(5)
    }
  })

  it('rejects empty projectName', () => {
    const result = paymentClaimInputSchema.safeParse({
      projectName: '',
      claimNumber: 1,
      claimDate: '2024-06-15',
    })
    expect(result.success).toBe(false)
  })

  it('rejects claimNumber < 1', () => {
    const result = paymentClaimInputSchema.safeParse({
      projectName: 'Test',
      claimNumber: 0,
      claimDate: '2024-06-15',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid schedule row', () => {
    const result = paymentClaimRowSchema.safeParse({
      description: 'Brickwork',
      claimAmount: 50000,
      previouslyPaid: 20000,
      retentionHeld: 5000,
    })
    expect(result.success).toBe(true)
  })

  it('rejects row with empty description', () => {
    const result = paymentClaimRowSchema.safeParse({
      description: '',
      claimAmount: 50000,
      previouslyPaid: 0,
      retentionHeld: 0,
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Net claim per row
// ---------------------------------------------------------------------------

describe('payment_claim_builder_v1 — net claim per row', () => {
  it('netClaimThisCert = claimAmount - previouslyPaid - retentionHeld', () => {
    const result = run(defaultInput(), [
      defaultRow({ claimAmount: 100000, previouslyPaid: 30000, retentionHeld: 10000 }),
    ])
    expect(result.lineResults[0].netClaimThisCert).toBe(60000)
  })

  it('handles multiple rows independently', () => {
    const result = run(defaultInput(), [
      defaultRow({ claimAmount: 80000, previouslyPaid: 20000, retentionHeld: 8000 }),
      defaultRow({ description: 'Steel', claimAmount: 50000, previouslyPaid: 10000, retentionHeld: 5000 }),
    ])
    expect(result.lineResults[0].netClaimThisCert).toBe(52000)
    expect(result.lineResults[1].netClaimThisCert).toBe(35000)
  })

  it('warns on negative net claim', () => {
    const result = run(defaultInput(), [
      defaultRow({ claimAmount: 50000, previouslyPaid: 40000, retentionHeld: 20000 }),
    ])
    expect(result.lineResults[0].netClaimThisCert).toBe(-10000)
    expect(result.warnings.some((w) => w.includes('negative net claim'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Total aggregation
// ---------------------------------------------------------------------------

describe('payment_claim_builder_v1 — aggregation', () => {
  it('aggregates totals correctly across rows', () => {
    const result = run(defaultInput(), [
      defaultRow({ claimAmount: 100000, previouslyPaid: 30000, retentionHeld: 10000 }),
      defaultRow({ description: 'Item B', claimAmount: 80000, previouslyPaid: 20000, retentionHeld: 8000 }),
    ])
    expect(result.aggregates.totalClaimed).toBe(180000)
    expect(result.aggregates.totalPreviouslyPaid).toBe(50000)
    expect(result.aggregates.totalRetention).toBe(18000)
    expect(result.aggregates.netClaim).toBe(112000) // 180000 - 50000 - 18000
  })
})

// ---------------------------------------------------------------------------
// VAT
// ---------------------------------------------------------------------------

describe('payment_claim_builder_v1 — VAT calculation', () => {
  it('vatAmount = netClaim × vatRate', () => {
    const result = run(
      defaultInput({ vatRate: 0.15 }),
      [defaultRow({ claimAmount: 100000, previouslyPaid: 0, retentionHeld: 0 })],
    )
    // netClaim = 100000, VAT = 15000
    expect(result.aggregates.netClaim).toBe(100000)
    expect(result.aggregates.vatAmount).toBe(15000)
  })

  it('handles zero VAT rate', () => {
    const result = run(
      defaultInput({ vatRate: 0 }),
      [defaultRow({ claimAmount: 100000, previouslyPaid: 0, retentionHeld: 0 })],
    )
    expect(result.aggregates.vatAmount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Platform fee
// ---------------------------------------------------------------------------

describe('payment_claim_builder_v1 — platform fee', () => {
  it('platformFee = totalDue × platformFeePercent/100', () => {
    const result = run(
      defaultInput({ vatRate: 0.15, platformFeePercent: 5 }),
      [defaultRow({ claimAmount: 100000, previouslyPaid: 0, retentionHeld: 0 })],
    )
    // netClaim = 100000, VAT = 15000, totalDue = 115000, fee = 5750
    expect(result.aggregates.totalDue).toBe(115000)
    expect(result.aggregates.platformFee).toBe(5750)
  })

  it('handles zero platform fee', () => {
    const result = run(
      defaultInput({ platformFeePercent: 0 }),
      [defaultRow({ claimAmount: 50000, previouslyPaid: 0, retentionHeld: 0 })],
    )
    expect(result.aggregates.platformFee).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Design Property 6: conservation
// ---------------------------------------------------------------------------

describe('payment_claim_builder_v1 — Property 6: conservation', () => {
  it('netClaim = totalClaimed - totalPreviouslyPaid - totalRetention (exact)', () => {
    const rows = [
      defaultRow({ claimAmount: 73421.57, previouslyPaid: 21345.89, retentionHeld: 7342.16 }),
      defaultRow({ description: 'Item B', claimAmount: 45678.12, previouslyPaid: 15000.50, retentionHeld: 4567.81 }),
    ]
    const result = run(defaultInput(), rows)

    const totalClaimed = result.aggregates.totalClaimed as number
    const totalPrevious = result.aggregates.totalPreviouslyPaid as number
    const totalRetention = result.aggregates.totalRetention as number
    const netClaim = result.aggregates.netClaim as number

    expect(netClaim).toBe(
      Math.round((totalClaimed - totalPrevious - totalRetention) * 100) / 100,
    )
  })

  it('clientIntoEscrow = totalDue + platformFee (exact)', () => {
    const rows = [
      defaultRow({ claimAmount: 33333.33, previouslyPaid: 11111.11, retentionHeld: 3333.33 }),
      defaultRow({ description: 'Item B', claimAmount: 22222.22, previouslyPaid: 7777.77, retentionHeld: 2222.22 }),
      defaultRow({ description: 'Item C', claimAmount: 44444.44, previouslyPaid: 14444.44, retentionHeld: 4444.44 }),
    ]
    const result = run(
      defaultInput({ retentionPercent: 10, vatRate: 0.15, platformFeePercent: 3.5 }),
      rows,
    )

    const totalDue = result.aggregates.totalDue as number
    const platformFee = result.aggregates.platformFee as number
    const clientIntoEscrow = result.aggregates.clientIntoEscrow as number

    expect(clientIntoEscrow).toBe(
      Math.round((totalDue + platformFee) * 100) / 100,
    )
  })
})

// ---------------------------------------------------------------------------
// Clause checks
// ---------------------------------------------------------------------------

describe('payment_claim_builder_v1 — clause checks', () => {
  it('passes retention clause when retention > 0', () => {
    const result = run(
      defaultInput({ retentionPercent: 10 }),
      [defaultRow()],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PCB-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when retention is 0', () => {
    const result = run(
      defaultInput({ retentionPercent: 0 }),
      [defaultRow()],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PCB-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes claim-amount clause when no over-claiming', () => {
    const result = run(defaultInput(), [
      defaultRow({ claimAmount: 100000, previouslyPaid: 30000, retentionHeld: 10000 }),
    ])
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PCB-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails claim-amount clause when over-claimed', () => {
    const result = run(defaultInput(), [
      defaultRow({ claimAmount: 50000, previouslyPaid: 40000, retentionHeld: 20000 }),
    ])
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PCB-002')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes platform-fee disclosure clause', () => {
    const result = run(
      defaultInput({ platformFeePercent: 5 }),
      [defaultRow()],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PCB-003')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when platform fee is 0', () => {
    const result = run(
      defaultInput({ platformFeePercent: 0 }),
      [defaultRow()],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PCB-003')
    expect(clause?.outcome).toBe('advisory')
  })
})

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('payment_claim_builder_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('payment_claim_builder_v1')).toBe(paymentClaimBuilderV1)
    expect(paymentClaimBuilderV1.toolId).toBe('payment_claim_builder')
    expect(paymentClaimBuilderV1.method).toBe('hybrid')
    expect(paymentClaimBuilderV1.status).toBe('full')
  })

  it('has scheduleSchema defined (schedule-based tool)', () => {
    expect(paymentClaimBuilderV1.scheduleSchema).toBeDefined()
  })

  it('includes platform-fee disclosure in disclaimers', () => {
    expect(paymentClaimBuilderV1.disclaimers.some((d) => d.includes('platform fee'))).toBe(true)
  })
})
