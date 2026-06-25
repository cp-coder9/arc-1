import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  staffCpdTrackerV1,
  staffCpdTrackerInputSchema,
  staffCpdTrackerRowSchema,
} from './staffCpdTracker'

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
  return runCalculator(staffCpdTrackerV1, input, rows, { tables: [cpdBodyRulesTable] })
}

describe('staff_cpd_tracker_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = staffCpdTrackerInputSchema.safeParse({
      firmName: 'Acme Architects',
      trackingYear: '2024',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty firmName', () => {
    const result = staffCpdTrackerInputSchema.safeParse({
      firmName: '',
      trackingYear: '2024',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = staffCpdTrackerRowSchema.safeParse({
      staffMember: 'Alice Smith',
      registrationBody: 'SACAP',
      targetPoints: 25,
      earnedPoints: 28,
      complianceYear: '2024',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty staffMember', () => {
    const result = staffCpdTrackerRowSchema.safeParse({
      staffMember: '',
      registrationBody: 'SACAP',
      targetPoints: 25,
      earnedPoints: 28,
      complianceYear: '2024',
    })
    expect(result.success).toBe(false)
  })
})

describe('staff_cpd_tracker_v1 — computation', () => {
  it('computes firm compliance metrics', () => {
    const result = run(
      { firmName: 'Acme', trackingYear: '2024' },
      [
        { staffMember: 'Alice', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 28, complianceYear: '2024' },
        { staffMember: 'Bob', registrationBody: 'ECSA', targetPoints: 25, earnedPoints: 25, complianceYear: '2024' },
        { staffMember: 'Carol', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 10, complianceYear: '2024' },
        { staffMember: 'Dave', registrationBody: 'SACQSP', targetPoints: 25, earnedPoints: 30, complianceYear: '2024' },
        { staffMember: 'Eve', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 5, complianceYear: '2024' },
      ],
    )
    expect(result.aggregates.totalStaff).toBe(5)
    expect(result.aggregates.compliantCount).toBe(3)
    expect(result.aggregates.nonCompliantCount).toBe(2)
    expect(result.aggregates.firmCompliancePct).toBe(60)
    expect((result.aggregates.atRiskStaff as string)).toContain('Carol')
    expect((result.aggregates.atRiskStaff as string)).toContain('Eve')
  })

  it('handles empty staff list', () => {
    const result = run(
      { firmName: 'Acme', trackingYear: '2024' },
      [],
    )
    expect(result.aggregates.totalStaff).toBe(0)
    expect(result.aggregates.firmCompliancePct).toBe(0)
    expect(result.aggregates.atRiskStaff).toBe('None')
  })

  it('reports full compliance correctly', () => {
    const result = run(
      { firmName: 'Acme', trackingYear: '2024' },
      [
        { staffMember: 'Alice', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 30, complianceYear: '2024' },
        { staffMember: 'Bob', registrationBody: 'ECSA', targetPoints: 25, earnedPoints: 25, complianceYear: '2024' },
      ],
    )
    expect(result.aggregates.firmCompliancePct).toBe(100)
    expect(result.aggregates.atRiskStaff).toBe('None')
  })
})

describe('staff_cpd_tracker_v1 — clause checks', () => {
  it('passes firm compliance when >= 80%', () => {
    const result = run(
      { firmName: 'Acme', trackingYear: '2024' },
      [
        { staffMember: 'A', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 30, complianceYear: '2024' },
        { staffMember: 'B', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 25, complianceYear: '2024' },
        { staffMember: 'C', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 28, complianceYear: '2024' },
        { staffMember: 'D', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 26, complianceYear: '2024' },
        { staffMember: 'E', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 10, complianceYear: '2024' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SCT-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when firm compliance < 80%', () => {
    const result = run(
      { firmName: 'Acme', trackingYear: '2024' },
      [
        { staffMember: 'A', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 30, complianceYear: '2024' },
        { staffMember: 'B', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 10, complianceYear: '2024' },
        { staffMember: 'C', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 5, complianceYear: '2024' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SCT-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('fails target clause when staff have zero target', () => {
    const result = run(
      { firmName: 'Acme', trackingYear: '2024' },
      [
        { staffMember: 'Alice', registrationBody: 'SACAP', targetPoints: 0, earnedPoints: 10, complianceYear: '2024' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SCT-002')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes target clause when all staff have targets', () => {
    const result = run(
      { firmName: 'Acme', trackingYear: '2024' },
      [
        { staffMember: 'Alice', registrationBody: 'SACAP', targetPoints: 25, earnedPoints: 10, complianceYear: '2024' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SCT-002')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('staff_cpd_tracker_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('staff_cpd_tracker_v1')).toBe(staffCpdTrackerV1)
    expect(staffCpdTrackerV1.toolId).toBe('staff_cpd_tracker')
    expect(staffCpdTrackerV1.method).toBe('hybrid')
    expect(staffCpdTrackerV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(staffCpdTrackerV1.scheduleSchema).toBeDefined()
  })

  it('references cpd_body_rules table', () => {
    expect(staffCpdTrackerV1.tableRefs).toContain('cpd_body_rules')
  })
})
