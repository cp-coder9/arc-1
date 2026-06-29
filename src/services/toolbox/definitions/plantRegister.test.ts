import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  plantRegisterV1,
  plantInputSchema,
  plantRowSchema,
} from './plantRegister'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(plantRegisterV1, input, rows, { tables: [] })
}

describe('plant_register_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = plantInputSchema.safeParse({
      projectName: 'Highway Extension',
      period: 'March 2024',
      standbyRate: 50,
    })
    expect(result.success).toBe(true)
  })

  it('applies default standbyRate of 50%', () => {
    const result = plantInputSchema.safeParse({
      projectName: 'Highway Extension',
      period: 'March 2024',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.standbyRate).toBe(50)
    }
  })

  it('rejects empty projectName', () => {
    const result = plantInputSchema.safeParse({
      projectName: '',
      period: 'March 2024',
    })
    expect(result.success).toBe(false)
  })

  it('rejects standbyRate over 100', () => {
    const result = plantInputSchema.safeParse({
      projectName: 'Test',
      period: 'March 2024',
      standbyRate: 150,
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid schedule row', () => {
    const result = plantRowSchema.safeParse({
      description: 'TLB (Backhoe Loader)',
      registrationNumber: 'PLT-001',
      hireType: 'external',
      dailyRate: 3500,
      daysOnSite: 20,
      standbyDays: 5,
    })
    expect(result.success).toBe(true)
  })

  it('rejects row with empty description', () => {
    const result = plantRowSchema.safeParse({
      description: '',
      registrationNumber: 'PLT-001',
      hireType: 'internal',
      dailyRate: 2000,
      daysOnSite: 10,
      standbyDays: 2,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid hireType', () => {
    const result = plantRowSchema.safeParse({
      description: 'Crane',
      registrationNumber: 'PLT-002',
      hireType: 'leased',
      dailyRate: 8000,
      daysOnSite: 5,
      standbyDays: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('plant_register_v1 — per-row computation', () => {
  it('computes activeCost, standbyCost, totalCost per row', () => {
    const result = run(
      { projectName: 'Site A', period: 'March 2024', standbyRate: 50 },
      [
        { description: 'TLB', registrationNumber: 'PLT-001', hireType: 'external', dailyRate: 3500, daysOnSite: 20, standbyDays: 5 },
      ],
    )
    // activeCost = 3500 × 20 = 70000
    // standbyCost = 3500 × 0.50 × 5 = 8750
    // totalCost = 78750
    expect(result.lineResults[0].activeCost).toBe(70000)
    expect(result.lineResults[0].standbyCost).toBe(8750)
    expect(result.lineResults[0].totalCost).toBe(78750)
  })

  it('handles zero standby days', () => {
    const result = run(
      { projectName: 'Site B', period: 'April 2024', standbyRate: 50 },
      [
        { description: 'Excavator', registrationNumber: 'PLT-002', hireType: 'internal', dailyRate: 5000, daysOnSite: 15, standbyDays: 0 },
      ],
    )
    expect(result.lineResults[0].activeCost).toBe(75000)
    expect(result.lineResults[0].standbyCost).toBe(0)
    expect(result.lineResults[0].totalCost).toBe(75000)
  })

  it('respects custom standby rate', () => {
    const result = run(
      { projectName: 'Site C', period: 'May 2024', standbyRate: 40 },
      [
        { description: 'Crane', registrationNumber: 'PLT-003', hireType: 'external', dailyRate: 10000, daysOnSite: 10, standbyDays: 3 },
      ],
    )
    // standbyCost = 10000 × 0.40 × 3 = 12000
    expect(result.lineResults[0].standbyCost).toBe(12000)
  })
})

describe('plant_register_v1 — aggregate totals', () => {
  it('computes totalActiveCost, totalStandbyCost, totalPlantCost, itemCount', () => {
    const result = run(
      { projectName: 'Site D', period: 'June 2024', standbyRate: 50 },
      [
        { description: 'TLB', registrationNumber: 'PLT-001', hireType: 'external', dailyRate: 3500, daysOnSite: 20, standbyDays: 5 },
        { description: 'Excavator', registrationNumber: 'PLT-002', hireType: 'internal', dailyRate: 5000, daysOnSite: 15, standbyDays: 2 },
      ],
    )
    // TLB: active=70000, standby=8750
    // Excavator: active=75000, standby=5000
    expect(result.aggregates.totalActiveCost).toBe(145000)
    expect(result.aggregates.totalStandbyCost).toBe(13750)
    expect(result.aggregates.totalPlantCost).toBe(158750)
    expect(result.aggregates.itemCount).toBe(2)
  })
})

describe('plant_register_v1 — invalid row isolation', () => {
  it('excludes rows with invalid data and emits warnings', () => {
    const result = run(
      { projectName: 'Site E', period: 'July 2024', standbyRate: 50 },
      [
        { description: 'Valid Item', registrationNumber: 'PLT-001', hireType: 'external', dailyRate: 3500, daysOnSite: 20, standbyDays: 5 },
        { description: '', registrationNumber: 'PLT-002', hireType: 'internal', dailyRate: 2000, daysOnSite: 10, standbyDays: 2 }, // invalid
        { description: 'Another Valid', registrationNumber: 'PLT-003', hireType: 'external', dailyRate: 4000, daysOnSite: 8, standbyDays: 0 },
      ],
    )
    expect(result.lineResults.length).toBe(2)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })
})

describe('plant_register_v1 — clause checks', () => {
  it('passes standby rate clause when 40–60%', () => {
    const result = run(
      { projectName: 'Site F', period: 'Aug 2024', standbyRate: 50 },
      [
        { description: 'TLB', registrationNumber: 'PLT-001', hireType: 'external', dailyRate: 3500, daysOnSite: 10, standbyDays: 2 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PLT-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when standby rate outside 40–60%', () => {
    const result = run(
      { projectName: 'Site G', period: 'Sep 2024', standbyRate: 75 },
      [
        { description: 'TLB', registrationNumber: 'PLT-001', hireType: 'external', dailyRate: 3500, daysOnSite: 10, standbyDays: 2 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PLT-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes registration clause when all items have numbers', () => {
    const result = run(
      { projectName: 'Site H', period: 'Oct 2024', standbyRate: 50 },
      [
        { description: 'TLB', registrationNumber: 'PLT-001', hireType: 'external', dailyRate: 3500, daysOnSite: 10, standbyDays: 2 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PLT-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when items missing registration numbers', () => {
    const result = run(
      { projectName: 'Site I', period: 'Nov 2024', standbyRate: 50 },
      [
        { description: 'Unregistered Item', registrationNumber: '', hireType: 'internal', dailyRate: 2000, daysOnSite: 5, standbyDays: 1 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PLT-002')
    expect(clause?.outcome).toBe('advisory')
  })
})

describe('plant_register_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('plant_register_v1')).toBe(plantRegisterV1)
    expect(plantRegisterV1.toolId).toBe('plant_register')
    expect(plantRegisterV1.method).toBe('time')
    expect(plantRegisterV1.status).toBe('full')
  })

  it('has scheduleSchema defined (schedule-based tool)', () => {
    expect(plantRegisterV1.scheduleSchema).toBeDefined()
  })

  it('includes disclaimers', () => {
    expect(plantRegisterV1.disclaimers.length).toBeGreaterThan(0)
  })
})
