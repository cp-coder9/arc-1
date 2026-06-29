import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  cpdStandaloneV1,
  cpdStandaloneInputSchema,
  cpdStandaloneRowSchema,
} from './cpdStandalone'

const cpdBodyRulesTable = {
  id: 'cpd_body_rules',
  version: '2024.1',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  status: 'mandatory' as const,
  rows: [
    { body: 'SACAP', annualTarget: 25, structuredMinPct: 50, cycleLengthYears: 1 },
    { body: 'ECSA', annualTarget: 25, structuredMinPct: 50, cycleLengthYears: 5 },
    { body: 'SACQSP', annualTarget: 25, structuredMinPct: 50, cycleLengthYears: 1 },
    { body: 'SACPLAN', annualTarget: 20, structuredMinPct: 40, cycleLengthYears: 1 },
    { body: 'SACPCMP', annualTarget: 25, structuredMinPct: 50, cycleLengthYears: 1 },
  ],
}

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(cpdStandaloneV1, input, rows, { tables: [cpdBodyRulesTable] })
}

describe('cpd_standalone_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = cpdStandaloneInputSchema.safeParse({
      professionalName: 'John Architect',
      registrationNumber: 'PrArch 12345',
      cpdYear: '2024',
      targetPoints: 25,
    })
    expect(result.success).toBe(true)
  })

  it('applies default targetPoints of 25', () => {
    const result = cpdStandaloneInputSchema.safeParse({
      professionalName: 'John',
      registrationNumber: 'PrArch 12345',
      cpdYear: '2024',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetPoints).toBe(25)
    }
  })

  it('accepts valid row', () => {
    const result = cpdStandaloneRowSchema.safeParse({
      activityTitle: 'SANS 10400-XA Workshop',
      provider: 'SACAP',
      category: 'structured',
      hoursCompleted: 8,
      pointsEarned: 8,
      dateCompleted: '2024-03-15',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid category', () => {
    const result = cpdStandaloneRowSchema.safeParse({
      activityTitle: 'Workshop',
      provider: 'SACAP',
      category: 'informal',
      hoursCompleted: 2,
      pointsEarned: 2,
      dateCompleted: '2024-03-15',
    })
    expect(result.success).toBe(false)
  })
})

describe('cpd_standalone_v1 — computation', () => {
  it('computes total points and points by category', () => {
    const result = run(
      { professionalName: 'John', registrationNumber: 'PrArch 12345', cpdYear: '2024', targetPoints: 25 },
      [
        { activityTitle: 'Workshop A', provider: 'SACAP', category: 'structured', hoursCompleted: 8, pointsEarned: 8, dateCompleted: '2024-01-15' },
        { activityTitle: 'Reading B', provider: 'Self', category: 'unstructured', hoursCompleted: 4, pointsEarned: 4, dateCompleted: '2024-02-10' },
        { activityTitle: 'Research C', provider: 'University', category: 'research', hoursCompleted: 10, pointsEarned: 10, dateCompleted: '2024-03-20' },
        { activityTitle: 'Mentoring D', provider: 'Firm', category: 'mentoring', hoursCompleted: 5, pointsEarned: 5, dateCompleted: '2024-04-05' },
      ],
    )
    expect(result.aggregates.totalPoints).toBe(27)
    expect(result.aggregates.structuredPoints).toBe(8)
    expect(result.aggregates.unstructuredPoints).toBe(4)
    expect(result.aggregates.researchPoints).toBe(10)
    expect(result.aggregates.mentoringPoints).toBe(5)
    expect(result.aggregates.surplus).toBe(2)
    expect(result.aggregates.shortfall).toBe(0)
  })

  it('computes shortfall when below target', () => {
    const result = run(
      { professionalName: 'Jane', registrationNumber: 'PrArch 67890', cpdYear: '2024', targetPoints: 25 },
      [
        { activityTitle: 'Workshop', provider: 'SACAP', category: 'structured', hoursCompleted: 5, pointsEarned: 5, dateCompleted: '2024-01-15' },
      ],
    )
    expect(result.aggregates.shortfall).toBe(20)
    expect(result.aggregates.surplus).toBe(0)
    expect(result.aggregates.compliancePct).toBe(20)
  })

  it('caps compliance at 100%', () => {
    const result = run(
      { professionalName: 'Jane', registrationNumber: 'PrArch 67890', cpdYear: '2024', targetPoints: 10 },
      [
        { activityTitle: 'Workshop', provider: 'SACAP', category: 'structured', hoursCompleted: 20, pointsEarned: 20, dateCompleted: '2024-01-15' },
      ],
    )
    expect(result.aggregates.compliancePct).toBe(100)
  })
})

describe('cpd_standalone_v1 — clause checks', () => {
  it('passes target clause when points >= target', () => {
    const result = run(
      { professionalName: 'John', registrationNumber: 'PrArch 12345', cpdYear: '2024', targetPoints: 10 },
      [
        { activityTitle: 'Workshop', provider: 'SACAP', category: 'structured', hoursCompleted: 10, pointsEarned: 10, dateCompleted: '2024-01-15' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'CPD-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails target clause when points < target', () => {
    const result = run(
      { professionalName: 'John', registrationNumber: 'PrArch 12345', cpdYear: '2024', targetPoints: 25 },
      [
        { activityTitle: 'Workshop', provider: 'SACAP', category: 'structured', hoursCompleted: 5, pointsEarned: 5, dateCompleted: '2024-01-15' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'CPD-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes structured minimum when >= 50%', () => {
    const result = run(
      { professionalName: 'John', registrationNumber: 'PrArch 12345', cpdYear: '2024', targetPoints: 20 },
      [
        { activityTitle: 'Workshop', provider: 'SACAP', category: 'structured', hoursCompleted: 10, pointsEarned: 15, dateCompleted: '2024-01-15' },
        { activityTitle: 'Reading', provider: 'Self', category: 'unstructured', hoursCompleted: 5, pointsEarned: 5, dateCompleted: '2024-02-15' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'CPD-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when structured < 50%', () => {
    const result = run(
      { professionalName: 'John', registrationNumber: 'PrArch 12345', cpdYear: '2024', targetPoints: 20 },
      [
        { activityTitle: 'Workshop', provider: 'SACAP', category: 'structured', hoursCompleted: 2, pointsEarned: 2, dateCompleted: '2024-01-15' },
        { activityTitle: 'Reading', provider: 'Self', category: 'unstructured', hoursCompleted: 10, pointsEarned: 10, dateCompleted: '2024-02-15' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'CPD-002')
    expect(clause?.outcome).toBe('advisory')
  })
})

describe('cpd_standalone_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('cpd_standalone_v1')).toBe(cpdStandaloneV1)
    expect(cpdStandaloneV1.toolId).toBe('cpd_standalone')
    expect(cpdStandaloneV1.method).toBe('hybrid')
    expect(cpdStandaloneV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(cpdStandaloneV1.scheduleSchema).toBeDefined()
  })

  it('references cpd_body_rules table', () => {
    expect(cpdStandaloneV1.tableRefs).toContain('cpd_body_rules')
  })
})
