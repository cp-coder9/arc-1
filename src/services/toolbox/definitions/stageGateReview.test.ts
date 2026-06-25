import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  stageGateReviewV1,
  stageGateReviewInputSchema,
  stageGateReviewRowSchema,
} from './stageGateReview'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(stageGateReviewV1, input, rows, { tables: [] })
}

describe('stage_gate_review_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = stageGateReviewInputSchema.safeParse({
      projectName: 'Office Tower',
      stageName: 'Stage 3: Design Development',
      gateDate: '2024-06-15',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty stageName', () => {
    const result = stageGateReviewInputSchema.safeParse({
      projectName: 'Office Tower',
      stageName: '',
      gateDate: '2024-06-15',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = stageGateReviewRowSchema.safeParse({
      criterion: 'All design drawings complete',
      status: 'pass',
      evidence: 'Drawing register confirms 100% complete',
      reviewer: 'Principal Architect',
      reviewDate: '2024-06-14',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = stageGateReviewRowSchema.safeParse({
      criterion: 'Test',
      status: 'maybe',
      evidence: '',
      reviewer: 'A',
      reviewDate: '2024-01-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('stage_gate_review_v1 — computation', () => {
  it('computes gate score and recommendation', () => {
    const result = run(
      { projectName: 'Office', stageName: 'Stage 3', gateDate: '2024-06-15' },
      [
        { criterion: 'Drawings complete', status: 'pass', evidence: 'Yes', reviewer: 'PA', reviewDate: '2024-06-14' },
        { criterion: 'Cost plan updated', status: 'pass', evidence: 'Yes', reviewer: 'QS', reviewDate: '2024-06-14' },
        { criterion: 'Client sign-off', status: 'pass', evidence: 'Signed', reviewer: 'PM', reviewDate: '2024-06-14' },
        { criterion: 'Energy model', status: 'na', evidence: 'Not applicable', reviewer: 'EP', reviewDate: '2024-06-14' },
      ],
    )
    expect(result.aggregates.totalCriteria).toBe(4)
    expect(result.aggregates.passCount).toBe(3)
    expect(result.aggregates.naCount).toBe(1)
    expect(result.aggregates.gateScore).toBe(100) // 3/3 applicable = 100%
    expect(result.aggregates.recommendation).toBe('proceed')
  })

  it('recommends hold when some failures', () => {
    const result = run(
      { projectName: 'Office', stageName: 'Stage 3', gateDate: '2024-06-15' },
      [
        { criterion: 'A', status: 'pass', evidence: 'Y', reviewer: 'R', reviewDate: '2024-06-14' },
        { criterion: 'B', status: 'pass', evidence: 'Y', reviewer: 'R', reviewDate: '2024-06-14' },
        { criterion: 'C', status: 'pass', evidence: 'Y', reviewer: 'R', reviewDate: '2024-06-14' },
        { criterion: 'D', status: 'pass', evidence: 'Y', reviewer: 'R', reviewDate: '2024-06-14' },
        { criterion: 'E', status: 'fail', evidence: 'N', reviewer: 'R', reviewDate: '2024-06-14' },
      ],
    )
    expect(result.aggregates.recommendation).toBe('hold')
  })

  it('recommends revert when many failures', () => {
    const result = run(
      { projectName: 'Office', stageName: 'Stage 3', gateDate: '2024-06-15' },
      [
        { criterion: 'A', status: 'fail', evidence: 'N', reviewer: 'R', reviewDate: '2024-06-14' },
        { criterion: 'B', status: 'fail', evidence: 'N', reviewer: 'R', reviewDate: '2024-06-14' },
        { criterion: 'C', status: 'pass', evidence: 'Y', reviewer: 'R', reviewDate: '2024-06-14' },
      ],
    )
    expect(result.aggregates.recommendation).toBe('revert')
  })
})

describe('stage_gate_review_v1 — clause checks', () => {
  it('passes all-reviewed clause when all have reviewers and dates', () => {
    const result = run(
      { projectName: 'Office', stageName: 'Stage 3', gateDate: '2024-06-15' },
      [
        { criterion: 'A', status: 'pass', evidence: 'Y', reviewer: 'R1', reviewDate: '2024-06-14' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SGR-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails all-reviewed clause when reviewer missing', () => {
    const result = run(
      { projectName: 'Office', stageName: 'Stage 3', gateDate: '2024-06-15' },
      [
        { criterion: 'A', status: 'pass', evidence: 'Y', reviewer: '', reviewDate: '2024-06-14' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SGR-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes no-fails clause when no failures', () => {
    const result = run(
      { projectName: 'Office', stageName: 'Stage 3', gateDate: '2024-06-15' },
      [
        { criterion: 'A', status: 'pass', evidence: 'Y', reviewer: 'R', reviewDate: '2024-06-14' },
        { criterion: 'B', status: 'deferred', evidence: 'Deferred', reviewer: 'R', reviewDate: '2024-06-14' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SGR-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails no-fails clause when failures present', () => {
    const result = run(
      { projectName: 'Office', stageName: 'Stage 3', gateDate: '2024-06-15' },
      [
        { criterion: 'A', status: 'fail', evidence: 'N', reviewer: 'R', reviewDate: '2024-06-14' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SGR-002')
    expect(clause?.outcome).toBe('fail')
  })
})

describe('stage_gate_review_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('stage_gate_review_v1')).toBe(stageGateReviewV1)
    expect(stageGateReviewV1.toolId).toBe('stage_gate_review')
    expect(stageGateReviewV1.method).toBe('clauseSet')
    expect(stageGateReviewV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(stageGateReviewV1.scheduleSchema).toBeDefined()
  })
})
