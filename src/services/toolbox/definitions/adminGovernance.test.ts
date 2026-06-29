import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  adminGovernanceV1,
  adminGovernanceInputSchema,
  adminGovernanceRowSchema,
} from './adminGovernance'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(adminGovernanceV1, input, rows, { tables: [] })
}

describe('admin_governance_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = adminGovernanceInputSchema.safeParse({
      adminUser: 'admin@test.com',
      reviewDate: '2024-06-01',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty adminUser', () => {
    const result = adminGovernanceInputSchema.safeParse({
      adminUser: '',
      reviewDate: '2024-06-01',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = adminGovernanceRowSchema.safeParse({
      policyName: 'Data Protection Policy',
      status: 'active',
      owner: 'CTO',
      lastReview: '2024-01-01',
      nextReview: '2025-01-01',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = adminGovernanceRowSchema.safeParse({
      policyName: 'Policy',
      status: 'invalid',
      owner: 'CTO',
      lastReview: '2024-01-01',
      nextReview: '2025-01-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('admin_governance_v1 — computation', () => {
  it('counts policies by status', () => {
    const result = run(
      { adminUser: 'admin', reviewDate: '2024-06-01' },
      [
        { policyName: 'Policy A', status: 'active', owner: 'CTO', lastReview: '2024-01-01', nextReview: '2025-01-01' },
        { policyName: 'Policy B', status: 'active', owner: 'CFO', lastReview: '2023-06-01', nextReview: '2024-06-01' },
        { policyName: 'Policy C', status: 'archived', owner: 'CTO', lastReview: '2022-01-01', nextReview: '2023-01-01' },
        { policyName: 'Policy D', status: 'draft', owner: 'COO', lastReview: '2024-03-01', nextReview: '2025-03-01' },
      ],
    )
    expect(result.aggregates.totalPolicies).toBe(4)
    expect(result.aggregates.activeCount).toBe(2)
    expect(result.aggregates.archivedCount).toBe(1)
    expect(result.aggregates.draftCount).toBe(1)
  })

  it('counts overdue reviews for active policies', () => {
    const result = run(
      { adminUser: 'admin', reviewDate: '2024-06-15' },
      [
        { policyName: 'Policy A', status: 'active', owner: 'CTO', lastReview: '2023-01-01', nextReview: '2024-01-01' },
        { policyName: 'Policy B', status: 'active', owner: 'CFO', lastReview: '2024-01-01', nextReview: '2025-01-01' },
      ],
    )
    expect(result.aggregates.overdueReviews).toBe(1)
  })
})

describe('admin_governance_v1 — clause checks', () => {
  it('passes when no overdue reviews', () => {
    const result = run(
      { adminUser: 'admin', reviewDate: '2024-06-01' },
      [
        { policyName: 'Policy A', status: 'active', owner: 'CTO', lastReview: '2024-01-01', nextReview: '2025-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'GOV-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when active policy has overdue review', () => {
    const result = run(
      { adminUser: 'admin', reviewDate: '2024-06-01' },
      [
        { policyName: 'Policy A', status: 'active', owner: 'CTO', lastReview: '2023-01-01', nextReview: '2024-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'GOV-001')
    expect(clause?.outcome).toBe('fail')
  })
})

describe('admin_governance_v1 — registration', () => {
  it('is registered with correct toolId and status', () => {
    expect(getCalculatorDefinition('admin_governance_v1')).toBe(adminGovernanceV1)
    expect(adminGovernanceV1.toolId).toBe('admin_governance')
    expect(adminGovernanceV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(adminGovernanceV1.scheduleSchema).toBeDefined()
  })
})
