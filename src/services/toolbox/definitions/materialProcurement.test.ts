import { describe, it, expect, vi, afterEach } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  materialProcurementV1,
  materialProcurementInputSchema,
  materialRowSchema,
} from './materialProcurement'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(materialProcurementV1, input, rows, { tables: [] })
}

// Future date helper (always 30 days from now)
function futureDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

// Past date helper
function pastDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 5)
  return d.toISOString().split('T')[0]
}

describe('material_procurement_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = materialProcurementInputSchema.safeParse({
      projectName: 'Test Project',
      orderReference: 'PO-001',
      deliveryDate: '2025-12-01',
      contingencyPercent: 5,
    })
    expect(result.success).toBe(true)
  })

  it('applies default contingencyPercent of 5%', () => {
    const result = materialProcurementInputSchema.safeParse({
      projectName: 'Test Project',
      orderReference: 'PO-001',
      deliveryDate: '2025-12-01',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contingencyPercent).toBe(5)
    }
  })

  it('rejects empty projectName', () => {
    const result = materialProcurementInputSchema.safeParse({
      projectName: '',
      orderReference: 'PO-001',
      deliveryDate: '2025-12-01',
      contingencyPercent: 5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty orderReference', () => {
    const result = materialProcurementInputSchema.safeParse({
      projectName: 'Test',
      orderReference: '',
      deliveryDate: '2025-12-01',
      contingencyPercent: 5,
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid schedule row', () => {
    const result = materialRowSchema.safeParse({
      description: 'Cement 42.5N',
      unit: 'bag',
      quantity: 200,
      unitRate: 125,
      priority: 'high',
    })
    expect(result.success).toBe(true)
  })

  it('accepts row with optional fields', () => {
    const result = materialRowSchema.safeParse({
      description: 'Steel Y12',
      unit: 'ton',
      quantity: 5,
      unitRate: 18500,
      supplier: 'ArcelorMittal',
      leadTimeDays: 14,
      priority: 'medium',
    })
    expect(result.success).toBe(true)
  })

  it('rejects row with invalid priority', () => {
    const result = materialRowSchema.safeParse({
      description: 'Test',
      unit: 'nr',
      quantity: 10,
      unitRate: 100,
      priority: 'urgent',
    })
    expect(result.success).toBe(false)
  })

  it('rejects row with zero/negative quantity', () => {
    const result = materialRowSchema.safeParse({
      description: 'Test',
      unit: 'nr',
      quantity: 0,
      unitRate: 100,
      priority: 'low',
    })
    expect(result.success).toBe(false)
  })
})

describe('material_procurement_v1 — per-row cost calculation', () => {
  it('computes qty × unitRate for each row', () => {
    const result = run(
      { projectName: 'Project A', orderReference: 'PO-001', deliveryDate: futureDate(), contingencyPercent: 5 },
      [
        { description: 'Cement', unit: 'bag', quantity: 200, unitRate: 125, priority: 'high' },
        { description: 'Sand', unit: 'm³', quantity: 15, unitRate: 850, priority: 'medium' },
      ],
    )
    expect(result.lineResults[0].cost).toBe(25000)
    expect(result.lineResults[1].cost).toBe(12750)
  })

  it('includes supplier and lead time in line results when provided', () => {
    const result = run(
      { projectName: 'Project A', orderReference: 'PO-002', deliveryDate: futureDate(), contingencyPercent: 5 },
      [
        {
          description: 'Steel Y16',
          unit: 'ton',
          quantity: 3,
          unitRate: 19000,
          supplier: 'ArcelorMittal',
          leadTimeDays: 21,
          priority: 'high',
        },
      ],
    )
    expect(result.lineResults[0].supplier).toBe('ArcelorMittal')
    expect(result.lineResults[0].leadTimeDays).toBe(21)
  })
})

describe('material_procurement_v1 — contingency + VAT', () => {
  it('applies contingency and 15% VAT to produce total order value', () => {
    const result = run(
      { projectName: 'Project B', orderReference: 'PO-003', deliveryDate: futureDate(), contingencyPercent: 5 },
      [
        { description: 'Cement', unit: 'bag', quantity: 100, unitRate: 100, priority: 'medium' },
      ],
    )
    // subtotal = 10000, contingency = 500, subtotalWithCont = 10500, VAT = 1575, total = 12075
    expect(result.aggregates.subtotal).toBe(10000)
    expect(result.aggregates.contingencyAmount).toBe(500)
    expect(result.aggregates.subtotalWithContingency).toBe(10500)
    expect(result.aggregates.vatRate).toBe(15)
    expect(result.aggregates.vatAmount).toBe(1575)
    expect(result.aggregates.totalOrderValue).toBe(12075)
  })

  it('handles zero contingency', () => {
    const result = run(
      { projectName: 'Project C', orderReference: 'PO-004', deliveryDate: futureDate(), contingencyPercent: 0 },
      [
        { description: 'Bricks', unit: 'nr', quantity: 1000, unitRate: 5, priority: 'low' },
      ],
    )
    // subtotal = 5000, contingency = 0, VAT = 750, total = 5750
    expect(result.aggregates.contingencyAmount).toBe(0)
    expect(result.aggregates.subtotalWithContingency).toBe(5000)
    expect(result.aggregates.vatAmount).toBe(750)
    expect(result.aggregates.totalOrderValue).toBe(5750)
  })
})

describe('material_procurement_v1 — invalid row isolation', () => {
  it('excludes rows with invalid data and emits warnings', () => {
    const result = run(
      { projectName: 'Project D', orderReference: 'PO-005', deliveryDate: futureDate(), contingencyPercent: 5 },
      [
        { description: 'Valid item', unit: 'bag', quantity: 50, unitRate: 100, priority: 'high' },
        { description: '', unit: 'bag', quantity: 50, unitRate: 100, priority: 'high' }, // invalid: empty description
        { description: 'Another valid', unit: 'nr', quantity: 10, unitRate: 200, priority: 'low' },
      ],
    )
    expect(result.lineResults.length).toBe(2)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })

  it('warns about zero unit rate', () => {
    const result = run(
      { projectName: 'Project E', orderReference: 'PO-006', deliveryDate: futureDate(), contingencyPercent: 5 },
      [
        { description: 'Awaiting quote', unit: 'nr', quantity: 10, unitRate: 0, priority: 'medium' },
      ],
    )
    expect(result.warnings.some((w) => w.includes('zero unit rate'))).toBe(true)
  })
})

describe('material_procurement_v1 — clause checks', () => {
  it('passes contingency clause when contingency > 0', () => {
    const result = run(
      { projectName: 'Project', orderReference: 'PO', deliveryDate: futureDate(), contingencyPercent: 5 },
      [{ description: 'Item', unit: 'nr', quantity: 1, unitRate: 1000, priority: 'low' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PROC-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when contingency is 0', () => {
    const result = run(
      { projectName: 'Project', orderReference: 'PO', deliveryDate: futureDate(), contingencyPercent: 0 },
      [{ description: 'Item', unit: 'nr', quantity: 1, unitRate: 1000, priority: 'low' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PROC-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes delivery date clause when date is in future', () => {
    const result = run(
      { projectName: 'Project', orderReference: 'PO', deliveryDate: futureDate(), contingencyPercent: 5 },
      [{ description: 'Item', unit: 'nr', quantity: 1, unitRate: 1000, priority: 'low' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PROC-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails delivery date clause when date is in the past', () => {
    const result = run(
      { projectName: 'Project', orderReference: 'PO', deliveryDate: pastDate(), contingencyPercent: 5 },
      [{ description: 'Item', unit: 'nr', quantity: 1, unitRate: 1000, priority: 'low' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PROC-002')
    expect(clause?.outcome).toBe('fail')
  })

  it('total order value clause is always advisory', () => {
    const result = run(
      { projectName: 'Project', orderReference: 'PO', deliveryDate: futureDate(), contingencyPercent: 5 },
      [{ description: 'Item', unit: 'nr', quantity: 1, unitRate: 1000, priority: 'low' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PROC-003')
    expect(clause?.outcome).toBe('advisory')
  })
})

describe('material_procurement_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('material_procurement_v1')).toBe(materialProcurementV1)
    expect(materialProcurementV1.toolId).toBe('material_procurement')
    expect(materialProcurementV1.method).toBe('area')
    expect(materialProcurementV1.status).toBe('full')
  })

  it('has scheduleSchema defined (schedule-based tool)', () => {
    expect(materialProcurementV1.scheduleSchema).toBeDefined()
  })

  it('includes disclaimers', () => {
    expect(materialProcurementV1.disclaimers.length).toBeGreaterThan(0)
  })

  it('tracks priority distribution in aggregates', () => {
    const result = run(
      { projectName: 'Project', orderReference: 'PO', deliveryDate: futureDate(), contingencyPercent: 5 },
      [
        { description: 'Item A', unit: 'nr', quantity: 1, unitRate: 100, priority: 'high' },
        { description: 'Item B', unit: 'nr', quantity: 2, unitRate: 200, priority: 'high' },
        { description: 'Item C', unit: 'nr', quantity: 3, unitRate: 300, priority: 'medium' },
        { description: 'Item D', unit: 'nr', quantity: 4, unitRate: 400, priority: 'low' },
      ],
    )
    expect(result.aggregates.highPriorityItems).toBe(2)
    expect(result.aggregates.mediumPriorityItems).toBe(1)
    expect(result.aggregates.lowPriorityItems).toBe(1)
  })
})
