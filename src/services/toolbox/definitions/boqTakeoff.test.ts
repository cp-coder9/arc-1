import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  boqTakeoffV1,
  boqInputSchema,
  boqRowSchema,
  type BoQRow,
  type BoQInput,
} from './boqTakeoff'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(boqTakeoffV1, input, rows, { tables: [] })
}

describe('boq_takeoff_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = boqInputSchema.safeParse({
      projectName: 'Test Project',
      section: 'substructure',
      contingencyPercent: 10,
    })
    expect(result.success).toBe(true)
  })

  it('applies default contingencyPercent of 10%', () => {
    const result = boqInputSchema.safeParse({
      projectName: 'Test Project',
      section: 'substructure',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contingencyPercent).toBe(10)
    }
  })

  it('rejects empty projectName', () => {
    const result = boqInputSchema.safeParse({
      projectName: '',
      section: 'substructure',
      contingencyPercent: 10,
    })
    expect(result.success).toBe(false)
  })

  it('rejects contingencyPercent over 100', () => {
    const result = boqInputSchema.safeParse({
      projectName: 'Test',
      section: 'substructure',
      contingencyPercent: 150,
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid schedule row', () => {
    const result = boqRowSchema.safeParse({
      description: 'Concrete 30MPa',
      unit: 'm³',
      quantity: 50,
      rate: 2500,
    })
    expect(result.success).toBe(true)
  })

  it('accepts row with rate build-up', () => {
    const result = boqRowSchema.safeParse({
      description: 'Brickwork',
      unit: 'm²',
      quantity: 100,
      rate: 450,
      rateBuildUp: { labour: 200, material: 200, plant: 50 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects row with empty description', () => {
    const result = boqRowSchema.safeParse({
      description: '',
      unit: 'm²',
      quantity: 100,
      rate: 450,
    })
    expect(result.success).toBe(false)
  })

  it('rejects row with invalid unit', () => {
    const result = boqRowSchema.safeParse({
      description: 'Test',
      unit: 'litre',
      quantity: 10,
      rate: 100,
    })
    expect(result.success).toBe(false)
  })
})

describe('boq_takeoff_v1 — row amount calculation', () => {
  it('computes qty × rate for each row', () => {
    const result = run(
      { projectName: 'Project A', section: 'substructure', contingencyPercent: 10 },
      [
        { description: 'Concrete 30MPa', unit: 'm³', quantity: 50, rate: 2500 },
        { description: 'Rebar Y16', unit: 'kg', quantity: 1000, rate: 18 },
      ],
    )
    expect(result.lineResults[0].amount).toBe(125000)
    expect(result.lineResults[1].amount).toBe(18000)
  })

  it('includes rate build-up costs in line results', () => {
    const result = run(
      { projectName: 'Project A', section: 'superstructure', contingencyPercent: 10 },
      [
        {
          description: 'Brickwork',
          unit: 'm²',
          quantity: 100,
          rate: 450,
          rateBuildUp: { labour: 200, material: 200, plant: 50 },
        },
      ],
    )
    expect(result.lineResults[0].amount).toBe(45000)
    expect(result.lineResults[0].labourCost).toBe(20000)
    expect(result.lineResults[0].materialCost).toBe(20000)
    expect(result.lineResults[0].plantCost).toBe(5000)
  })
})

describe('boq_takeoff_v1 — contingency and grand total', () => {
  it('applies contingency to subtotal', () => {
    const result = run(
      { projectName: 'Project A', section: 'substructure', contingencyPercent: 10 },
      [
        { description: 'Concrete', unit: 'm³', quantity: 100, rate: 2000 },
      ],
    )
    // Subtotal = 200000, contingency = 20000, grand total = 220000
    expect(result.aggregates.subtotal).toBe(200000)
    expect(result.aggregates.contingencyAmount).toBe(20000)
    expect(result.aggregates.grandTotal).toBe(220000)
  })

  it('grand total = subtotal + contingency', () => {
    const result = run(
      { projectName: 'Project B', section: 'finishes', contingencyPercent: 15 },
      [
        { description: 'Paint', unit: 'm²', quantity: 500, rate: 85 },
        { description: 'Tiling', unit: 'm²', quantity: 200, rate: 350 },
      ],
    )
    const subtotal = 500 * 85 + 200 * 350 // 42500 + 70000 = 112500
    const contingency = subtotal * 0.15 // 16875
    expect(result.aggregates.subtotal).toBe(subtotal)
    expect(result.aggregates.contingencyAmount).toBe(contingency)
    expect(result.aggregates.grandTotal).toBe(subtotal + contingency)
  })

  it('handles zero contingency', () => {
    const result = run(
      { projectName: 'Project C', section: 'substructure', contingencyPercent: 0 },
      [
        { description: 'Excavation', unit: 'm³', quantity: 200, rate: 120 },
      ],
    )
    expect(result.aggregates.contingencyAmount).toBe(0)
    expect(result.aggregates.grandTotal).toBe(result.aggregates.subtotal)
  })
})

describe('boq_takeoff_v1 — invalid row isolation', () => {
  it('excludes rows with invalid data and emits warnings', () => {
    const result = run(
      { projectName: 'Project D', section: 'substructure', contingencyPercent: 10 },
      [
        { description: 'Valid', unit: 'm²', quantity: 10, rate: 100 },
        { description: '', unit: 'm²', quantity: 10, rate: 100 }, // invalid: empty description
        { description: 'Also valid', unit: 'm³', quantity: 5, rate: 200 },
      ],
    )
    // Only 2 valid rows should be processed
    expect(result.lineResults.length).toBe(2)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })

  it('warns about zero-quantity rows (valid but flagged)', () => {
    const result = run(
      { projectName: 'Project E', section: 'substructure', contingencyPercent: 10 },
      [
        { description: 'Provisional item', unit: 'item', quantity: 0, rate: 5000 },
      ],
    )
    expect(result.warnings.some((w) => w.includes('zero quantity'))).toBe(true)
  })

  it('warns about zero-rate rows (valid but flagged)', () => {
    const result = run(
      { projectName: 'Project F', section: 'substructure', contingencyPercent: 10 },
      [
        { description: 'TBD item', unit: 'nr', quantity: 5, rate: 0 },
      ],
    )
    expect(result.warnings.some((w) => w.includes('zero rate'))).toBe(true)
  })
})

describe('boq_takeoff_v1 — clause checks', () => {
  it('passes contingency clause when within 5–15%', () => {
    const result = run(
      { projectName: 'Project', section: 'structure', contingencyPercent: 10 },
      [{ description: 'Item', unit: 'nr', quantity: 1, rate: 1000 }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'BOQ-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when contingency outside 5–15%', () => {
    const result = run(
      { projectName: 'Project', section: 'structure', contingencyPercent: 3 },
      [{ description: 'Item', unit: 'nr', quantity: 1, rate: 1000 }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'BOQ-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes zero-qty clause when no zero-quantity rows', () => {
    const result = run(
      { projectName: 'Project', section: 'structure', contingencyPercent: 10 },
      [{ description: 'Item', unit: 'nr', quantity: 5, rate: 100 }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'BOQ-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when zero-quantity rows present', () => {
    const result = run(
      { projectName: 'Project', section: 'structure', contingencyPercent: 10 },
      [{ description: 'Provisional', unit: 'item', quantity: 0, rate: 5000 }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'BOQ-002')
    expect(clause?.outcome).toBe('advisory')
  })

  it('advisory when zero-rate rows present', () => {
    const result = run(
      { projectName: 'Project', section: 'structure', contingencyPercent: 10 },
      [{ description: 'TBD', unit: 'nr', quantity: 10, rate: 0 }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'BOQ-003')
    expect(clause?.outcome).toBe('advisory')
  })
})

describe('boq_takeoff_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('boq_takeoff_v1')).toBe(boqTakeoffV1)
    expect(boqTakeoffV1.toolId).toBe('boq_takeoff')
    expect(boqTakeoffV1.method).toBe('area')
    expect(boqTakeoffV1.status).toBe('full')
  })

  it('has scheduleSchema defined (schedule-based tool)', () => {
    expect(boqTakeoffV1.scheduleSchema).toBeDefined()
  })

  it('includes disclaimers', () => {
    expect(boqTakeoffV1.disclaimers.length).toBeGreaterThan(0)
  })
})
