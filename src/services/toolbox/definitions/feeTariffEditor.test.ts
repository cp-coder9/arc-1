import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  feeTariffEditorV1,
  feeTariffEditorInputSchema,
  feeTariffEditorRowSchema,
} from './feeTariffEditor'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(feeTariffEditorV1, input, rows, { tables: [] })
}

describe('fee_tariff_editor_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = feeTariffEditorInputSchema.safeParse({
      adminUser: 'admin@test.com',
      targetTableId: 'sacap_brackets',
      effectiveDate: '2030-01-01',
      reason: 'Annual update',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty adminUser', () => {
    const result = feeTariffEditorInputSchema.safeParse({
      adminUser: '',
      targetTableId: 'sacap_brackets',
      effectiveDate: '2030-01-01',
      reason: 'Update',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = feeTariffEditorRowSchema.safeParse({
      tableId: 'sacap_brackets',
      version: '2.0.0',
      action: 'add',
      rowIndex: 0,
      data: '{"min":0,"max":100000}',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid action', () => {
    const result = feeTariffEditorRowSchema.safeParse({
      tableId: 'sacap_brackets',
      version: '2.0.0',
      action: 'delete',
      rowIndex: 0,
      data: '{}',
    })
    expect(result.success).toBe(false)
  })
})

describe('fee_tariff_editor_v1 — computation', () => {
  it('counts changes by action type', () => {
    const result = run(
      { adminUser: 'admin', targetTableId: 'tbl', effectiveDate: '2030-06-01', reason: 'Test' },
      [
        { tableId: 'tbl', version: '2.0', action: 'add', rowIndex: 0, data: '{}' },
        { tableId: 'tbl', version: '2.0', action: 'update', rowIndex: 1, data: '{}' },
        { tableId: 'tbl', version: '2.0', action: 'supersede', rowIndex: 2, data: '{}' },
        { tableId: 'tbl', version: '1.0', action: 'lock', rowIndex: 0, data: '{}' },
      ],
    )
    expect(result.aggregates.totalChanges).toBe(4)
    expect(result.aggregates.addCount).toBe(1)
    expect(result.aggregates.updateCount).toBe(1)
    expect(result.aggregates.supersedeCount).toBe(1)
    expect(result.aggregates.lockCount).toBe(1)
  })

  it('returns empty aggregates for no rows', () => {
    const result = run(
      { adminUser: 'admin', targetTableId: 'tbl', effectiveDate: '2030-06-01', reason: 'Test' },
      [],
    )
    expect(result.aggregates.totalChanges).toBe(0)
  })
})

describe('fee_tariff_editor_v1 — clause checks', () => {
  it('passes when no locked version is modified', () => {
    const result = run(
      { adminUser: 'admin', targetTableId: 'tbl', effectiveDate: '2030-06-01', reason: 'Test' },
      [
        { tableId: 'tbl', version: '2.0', action: 'add', rowIndex: 0, data: '{}' },
        { tableId: 'tbl', version: '1.0', action: 'lock', rowIndex: 0, data: '{}' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FTE-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when a locked version is also modified', () => {
    const result = run(
      { adminUser: 'admin', targetTableId: 'tbl', effectiveDate: '2030-06-01', reason: 'Test' },
      [
        { tableId: 'tbl', version: '1.0', action: 'lock', rowIndex: 0, data: '{}' },
        { tableId: 'tbl', version: '1.0', action: 'update', rowIndex: 1, data: '{}' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FTE-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('fails when effective date is in the past', () => {
    const result = run(
      { adminUser: 'admin', targetTableId: 'tbl', effectiveDate: '2020-01-01', reason: 'Test' },
      [{ tableId: 'tbl', version: '2.0', action: 'add', rowIndex: 0, data: '{}' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FTE-002')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes when effective date is in the future', () => {
    const result = run(
      { adminUser: 'admin', targetTableId: 'tbl', effectiveDate: '2030-06-01', reason: 'Test' },
      [{ tableId: 'tbl', version: '2.0', action: 'add', rowIndex: 0, data: '{}' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FTE-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('passes when reason is provided', () => {
    const result = run(
      { adminUser: 'admin', targetTableId: 'tbl', effectiveDate: '2030-06-01', reason: 'Annual gazette update' },
      [],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FTE-003')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('fee_tariff_editor_v1 — registration', () => {
  it('is registered with correct toolId and status', () => {
    expect(getCalculatorDefinition('fee_tariff_editor_v1')).toBe(feeTariffEditorV1)
    expect(feeTariffEditorV1.toolId).toBe('fee_tariff_editor')
    expect(feeTariffEditorV1.method).toBe('hybrid')
    expect(feeTariffEditorV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(feeTariffEditorV1.scheduleSchema).toBeDefined()
  })

  it('includes disclaimers', () => {
    expect(feeTariffEditorV1.disclaimers.length).toBeGreaterThan(0)
  })
})
