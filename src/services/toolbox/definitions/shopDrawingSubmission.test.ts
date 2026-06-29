import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  shopDrawingSubmissionV1,
  shopDrawingSubmissionInputSchema,
  shopDrawingSubmissionRowSchema,
} from './shopDrawingSubmission'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(shopDrawingSubmissionV1, input, rows, { tables: [] })
}

describe('shop_drawing_submission_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = shopDrawingSubmissionInputSchema.safeParse({
      projectName: 'Project A',
      packageName: 'Structural Steel',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty packageName', () => {
    const result = shopDrawingSubmissionInputSchema.safeParse({
      projectName: 'Project A',
      packageName: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = shopDrawingSubmissionRowSchema.safeParse({
      submissionNumber: 'SD-001',
      description: 'Steel connection details',
      contractor: 'ABC Steel',
      dateSubmitted: '2024-03-01',
      status: 'approved',
      reviewedBy: 'John Smith',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = shopDrawingSubmissionRowSchema.safeParse({
      submissionNumber: 'SD-001',
      description: 'Details',
      contractor: 'ABC',
      dateSubmitted: '2024-03-01',
      status: 'pending',
      reviewedBy: 'John',
    })
    expect(result.success).toBe(false)
  })
})

describe('shop_drawing_submission_v1 — computation', () => {
  it('computes approval and rejection percentages', () => {
    const result = run(
      { projectName: 'Project A', packageName: 'Steel' },
      [
        { submissionNumber: 'SD-001', description: 'A', contractor: 'X', dateSubmitted: '2024-01-01', status: 'approved', reviewedBy: 'R1' },
        { submissionNumber: 'SD-002', description: 'B', contractor: 'X', dateSubmitted: '2024-01-02', status: 'approved', reviewedBy: 'R1' },
        { submissionNumber: 'SD-003', description: 'C', contractor: 'X', dateSubmitted: '2024-01-03', status: 'rejected', reviewedBy: 'R1' },
        { submissionNumber: 'SD-004', description: 'D', contractor: 'X', dateSubmitted: '2024-01-04', status: 'submitted', reviewedBy: '' },
      ],
    )
    expect(result.aggregates.totalSubmissions).toBe(4)
    expect(result.aggregates.approvedCount).toBe(2)
    expect(result.aggregates.rejectedCount).toBe(1)
    expect(result.aggregates.pending).toBe(1)
    // Approval rate: 2/(2+1) = 67%
    expect(result.aggregates.approvedPct).toBe(67)
    expect(result.aggregates.rejectedPct).toBe(33)
  })

  it('handles all pending submissions', () => {
    const result = run(
      { projectName: 'Project', packageName: 'Concrete' },
      [
        { submissionNumber: 'SD-001', description: 'A', contractor: 'Y', dateSubmitted: '2024-01-01', status: 'submitted', reviewedBy: '' },
      ],
    )
    expect(result.aggregates.approvedPct).toBe(0)
    expect(result.aggregates.pending).toBe(1)
  })
})

describe('shop_drawing_submission_v1 — clause checks', () => {
  it('passes approval rate when >= 70%', () => {
    const result = run(
      { projectName: 'Project', packageName: 'Steel' },
      [
        { submissionNumber: 'SD-001', description: 'A', contractor: 'X', dateSubmitted: '2024-01-01', status: 'approved', reviewedBy: 'R1' },
        { submissionNumber: 'SD-002', description: 'B', contractor: 'X', dateSubmitted: '2024-01-02', status: 'approved', reviewedBy: 'R1' },
        { submissionNumber: 'SD-003', description: 'C', contractor: 'X', dateSubmitted: '2024-01-03', status: 'approved', reviewedBy: 'R1' },
        { submissionNumber: 'SD-004', description: 'D', contractor: 'X', dateSubmitted: '2024-01-04', status: 'rejected', reviewedBy: 'R1' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SDS-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when approval rate < 70%', () => {
    const result = run(
      { projectName: 'Project', packageName: 'Steel' },
      [
        { submissionNumber: 'SD-001', description: 'A', contractor: 'X', dateSubmitted: '2024-01-01', status: 'approved', reviewedBy: 'R1' },
        { submissionNumber: 'SD-002', description: 'B', contractor: 'X', dateSubmitted: '2024-01-02', status: 'rejected', reviewedBy: 'R1' },
        { submissionNumber: 'SD-003', description: 'C', contractor: 'X', dateSubmitted: '2024-01-03', status: 'rejected', reviewedBy: 'R1' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SDS-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes reviewer clause when all have reviewers', () => {
    const result = run(
      { projectName: 'Project', packageName: 'Steel' },
      [
        { submissionNumber: 'SD-001', description: 'A', contractor: 'X', dateSubmitted: '2024-01-01', status: 'approved', reviewedBy: 'R1' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SDS-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when submissions lack reviewer', () => {
    const result = run(
      { projectName: 'Project', packageName: 'Steel' },
      [
        { submissionNumber: 'SD-001', description: 'A', contractor: 'X', dateSubmitted: '2024-01-01', status: 'submitted', reviewedBy: '' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SDS-002')
    expect(clause?.outcome).toBe('advisory')
  })
})

describe('shop_drawing_submission_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('shop_drawing_submission_v1')).toBe(shopDrawingSubmissionV1)
    expect(shopDrawingSubmissionV1.toolId).toBe('shop_drawing_submission')
    expect(shopDrawingSubmissionV1.method).toBe('hybrid')
    expect(shopDrawingSubmissionV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(shopDrawingSubmissionV1.scheduleSchema).toBeDefined()
  })
})
