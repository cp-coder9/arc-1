import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  paymentRateConfigV1,
  paymentRateConfigInputSchema,
  paymentRateConfigRowSchema,
} from './paymentRateConfig'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(paymentRateConfigV1, input, rows, { tables: [] })
}

describe('payment_rate_config_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = paymentRateConfigInputSchema.safeParse({
      adminUser: 'admin@test.com',
      configScope: 'platform',
      effectiveDate: '2030-01-01',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid configScope', () => {
    const result = paymentRateConfigInputSchema.safeParse({
      adminUser: 'admin',
      configScope: 'invalid',
      effectiveDate: '2030-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = paymentRateConfigRowSchema.safeParse({
      rateId: 'platform_fee',
      label: 'Platform Fee',
      rateValue: 3.5,
      unit: 'percent',
      category: 'fees',
      effectiveFrom: '2030-01-01',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid unit', () => {
    const result = paymentRateConfigRowSchema.safeParse({
      rateId: 'rate1',
      label: 'Rate',
      rateValue: 10,
      unit: 'invalid',
      category: 'fees',
      effectiveFrom: '2030-01-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('payment_rate_config_v1 — computation', () => {
  it('counts total rates and categories', () => {
    const result = run(
      { adminUser: 'admin', configScope: 'platform', effectiveDate: '2030-06-01' },
      [
        { rateId: 'fee1', label: 'Platform Fee', rateValue: 3.5, unit: 'percent', category: 'fees', effectiveFrom: '2030-01-01' },
        { rateId: 'fee2', label: 'Admin Fee', rateValue: 50, unit: 'fixed', category: 'fees', effectiveFrom: '2030-01-01' },
        { rateId: 'rate1', label: 'Labour Rate', rateValue: 250, unit: 'per_hour', category: 'labour', effectiveFrom: '2030-01-01' },
      ],
    )
    expect(result.aggregates.totalRates).toBe(3)
    expect(result.aggregates.categories).toBe(2)
  })

  it('returns zero for empty rows', () => {
    const result = run(
      { adminUser: 'admin', configScope: 'tenant', effectiveDate: '2030-06-01' },
      [],
    )
    expect(result.aggregates.totalRates).toBe(0)
  })
})

describe('payment_rate_config_v1 — clause checks', () => {
  it('passes when no duplicate rate IDs', () => {
    const result = run(
      { adminUser: 'admin', configScope: 'platform', effectiveDate: '2030-06-01' },
      [
        { rateId: 'fee1', label: 'Fee 1', rateValue: 3, unit: 'percent', category: 'fees', effectiveFrom: '2030-01-01' },
        { rateId: 'fee2', label: 'Fee 2', rateValue: 5, unit: 'percent', category: 'fees', effectiveFrom: '2030-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PRC-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when duplicate rate IDs exist', () => {
    const result = run(
      { adminUser: 'admin', configScope: 'platform', effectiveDate: '2030-06-01' },
      [
        { rateId: 'fee1', label: 'Fee 1', rateValue: 3, unit: 'percent', category: 'fees', effectiveFrom: '2030-01-01' },
        { rateId: 'fee1', label: 'Fee 1 Dup', rateValue: 5, unit: 'fixed', category: 'fees', effectiveFrom: '2030-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PRC-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('fails when effective date is in the past', () => {
    const result = run(
      { adminUser: 'admin', configScope: 'platform', effectiveDate: '2020-01-01' },
      [{ rateId: 'fee1', label: 'Fee', rateValue: 3, unit: 'percent', category: 'fees', effectiveFrom: '2030-01-01' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PRC-002')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes when all rates have labels', () => {
    const result = run(
      { adminUser: 'admin', configScope: 'platform', effectiveDate: '2030-06-01' },
      [
        { rateId: 'fee1', label: 'Fee 1', rateValue: 3, unit: 'percent', category: 'fees', effectiveFrom: '2030-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PRC-003')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('payment_rate_config_v1 — registration', () => {
  it('is registered with correct toolId and status', () => {
    expect(getCalculatorDefinition('payment_rate_config_v1')).toBe(paymentRateConfigV1)
    expect(paymentRateConfigV1.toolId).toBe('payment_rate_config')
    expect(paymentRateConfigV1.method).toBe('hybrid')
    expect(paymentRateConfigV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(paymentRateConfigV1.scheduleSchema).toBeDefined()
  })
})
