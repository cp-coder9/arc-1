import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  aiReviewQueueV1,
  aiReviewQueueInputSchema,
  aiReviewQueueRowSchema,
} from './aiReviewQueue'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(aiReviewQueueV1, input, rows, { tables: [] })
}

describe('ai_review_queue_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = aiReviewQueueInputSchema.safeParse({
      adminUser: 'admin@test.com',
      queueDate: '2024-06-15',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty adminUser', () => {
    const result = aiReviewQueueInputSchema.safeParse({
      adminUser: '',
      queueDate: '2024-06-15',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = aiReviewQueueRowSchema.safeParse({
      itemId: 'item_001',
      submittedBy: 'user@test.com',
      type: 'drawing_review',
      status: 'pending',
      assignedTo: 'reviewer@test.com',
    })
    expect(result.success).toBe(true)
  })

  it('accepts row with empty assignedTo', () => {
    const result = aiReviewQueueRowSchema.safeParse({
      itemId: 'item_001',
      submittedBy: 'user@test.com',
      type: 'drawing_review',
      status: 'pending',
      assignedTo: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = aiReviewQueueRowSchema.safeParse({
      itemId: 'item_001',
      submittedBy: 'user@test.com',
      type: 'drawing_review',
      status: 'in_progress',
      assignedTo: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('ai_review_queue_v1 — computation', () => {
  it('counts items by status', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { itemId: 'i1', submittedBy: 'u1', type: 'drawing', status: 'pending', assignedTo: 'r1' },
        { itemId: 'i2', submittedBy: 'u2', type: 'document', status: 'approved', assignedTo: 'r1' },
        { itemId: 'i3', submittedBy: 'u3', type: 'drawing', status: 'rejected', assignedTo: 'r2' },
        { itemId: 'i4', submittedBy: 'u4', type: 'compliance', status: 'pending', assignedTo: '' },
      ],
    )
    expect(result.aggregates.totalItems).toBe(4)
    expect(result.aggregates.pendingCount).toBe(2)
    expect(result.aggregates.approvedCount).toBe(1)
    expect(result.aggregates.rejectedCount).toBe(1)
    expect(result.aggregates.unassignedCount).toBe(1)
  })
})

describe('ai_review_queue_v1 — clause checks', () => {
  it('passes when all pending items are assigned', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { itemId: 'i1', submittedBy: 'u1', type: 'drawing', status: 'pending', assignedTo: 'r1' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'ARQ-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when pending items have no assignee', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { itemId: 'i1', submittedBy: 'u1', type: 'drawing', status: 'pending', assignedTo: '' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'ARQ-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('ignores non-pending items for assignment check', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { itemId: 'i1', submittedBy: 'u1', type: 'drawing', status: 'approved', assignedTo: '' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'ARQ-001')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('ai_review_queue_v1 — registration', () => {
  it('is registered with correct toolId and status', () => {
    expect(getCalculatorDefinition('ai_review_queue_v1')).toBe(aiReviewQueueV1)
    expect(aiReviewQueueV1.toolId).toBe('ai_review_queue')
    expect(aiReviewQueueV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(aiReviewQueueV1.scheduleSchema).toBeDefined()
  })
})
