import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  proposalComparisonV1,
  proposalComparisonInputSchema,
  proposalComparisonRowSchema,
} from './proposalComparison'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(proposalComparisonV1, input, rows, { tables: [] })
}

describe('proposal_comparison_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = proposalComparisonInputSchema.safeParse({
      projectName: 'New Library',
      evaluationDate: '2024-06-01',
      weightFee: 30,
      weightTimeline: 20,
      weightExperience: 20,
      weightMethodology: 20,
      weightReferences: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rejects weight over 100', () => {
    const result = proposalComparisonInputSchema.safeParse({
      projectName: 'Test',
      evaluationDate: '2024-06-01',
      weightFee: 150,
      weightTimeline: 0,
      weightExperience: 0,
      weightMethodology: 0,
      weightReferences: 0,
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = proposalComparisonRowSchema.safeParse({
      professionalName: 'Jane Architect',
      firm: 'Design Co',
      feeAmount: 500000,
      timelineWeeks: 24,
      experienceScore: 8,
      methodologyScore: 7,
      referenceScore: 9,
    })
    expect(result.success).toBe(true)
  })

  it('rejects experienceScore out of range', () => {
    const result = proposalComparisonRowSchema.safeParse({
      professionalName: 'Jane',
      firm: 'Design Co',
      feeAmount: 500000,
      timelineWeeks: 24,
      experienceScore: 11,
      methodologyScore: 7,
      referenceScore: 9,
    })
    expect(result.success).toBe(false)
  })
})

describe('proposal_comparison_v1 — computation', () => {
  it('ranks proposals by weighted score', () => {
    const result = run(
      {
        projectName: 'Library',
        evaluationDate: '2024-06-01',
        weightFee: 20,
        weightTimeline: 20,
        weightExperience: 20,
        weightMethodology: 20,
        weightReferences: 20,
      },
      [
        { professionalName: 'Alice', firm: 'A Co', feeAmount: 400000, timelineWeeks: 20, experienceScore: 9, methodologyScore: 8, referenceScore: 9 },
        { professionalName: 'Bob', firm: 'B Co', feeAmount: 600000, timelineWeeks: 30, experienceScore: 7, methodologyScore: 6, referenceScore: 7 },
        { professionalName: 'Carol', firm: 'C Co', feeAmount: 500000, timelineWeeks: 25, experienceScore: 8, methodologyScore: 9, referenceScore: 8 },
      ],
    )
    expect(result.aggregates.totalProposals).toBe(3)
    expect(result.aggregates.recommended).toBe('Alice')

    // Check rankings are assigned
    const alice = result.lineResults.find((r) => r.professionalName === 'Alice')
    expect(alice?.rank).toBe(1)
  })

  it('identifies recommended professional', () => {
    const result = run(
      {
        projectName: 'Office',
        evaluationDate: '2024-06-01',
        weightFee: 0,
        weightTimeline: 0,
        weightExperience: 50,
        weightMethodology: 50,
        weightReferences: 0,
      },
      [
        { professionalName: 'Low-exp', firm: 'A', feeAmount: 100000, timelineWeeks: 10, experienceScore: 3, methodologyScore: 3, referenceScore: 10 },
        { professionalName: 'High-exp', firm: 'B', feeAmount: 900000, timelineWeeks: 50, experienceScore: 10, methodologyScore: 10, referenceScore: 1 },
      ],
    )
    expect(result.aggregates.recommended).toBe('High-exp')
  })
})

describe('proposal_comparison_v1 — clause checks', () => {
  it('passes when weights sum to 100', () => {
    const result = run(
      {
        projectName: 'Test',
        evaluationDate: '2024-06-01',
        weightFee: 20,
        weightTimeline: 20,
        weightExperience: 20,
        weightMethodology: 20,
        weightReferences: 20,
      },
      [
        { professionalName: 'A', firm: 'A', feeAmount: 100000, timelineWeeks: 10, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
        { professionalName: 'B', firm: 'B', feeAmount: 200000, timelineWeeks: 20, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
        { professionalName: 'C', firm: 'C', feeAmount: 300000, timelineWeeks: 30, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PC-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when weights do not sum to 100', () => {
    const result = run(
      {
        projectName: 'Test',
        evaluationDate: '2024-06-01',
        weightFee: 20,
        weightTimeline: 20,
        weightExperience: 20,
        weightMethodology: 20,
        weightReferences: 10,
      },
      [
        { professionalName: 'A', firm: 'A', feeAmount: 100000, timelineWeeks: 10, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PC-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('advisory when fewer than 3 proposals', () => {
    const result = run(
      {
        projectName: 'Test',
        evaluationDate: '2024-06-01',
        weightFee: 20,
        weightTimeline: 20,
        weightExperience: 20,
        weightMethodology: 20,
        weightReferences: 20,
      },
      [
        { professionalName: 'A', firm: 'A', feeAmount: 100000, timelineWeeks: 10, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
        { professionalName: 'B', firm: 'B', feeAmount: 200000, timelineWeeks: 20, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PC-002')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes when 3 or more proposals', () => {
    const result = run(
      {
        projectName: 'Test',
        evaluationDate: '2024-06-01',
        weightFee: 20,
        weightTimeline: 20,
        weightExperience: 20,
        weightMethodology: 20,
        weightReferences: 20,
      },
      [
        { professionalName: 'A', firm: 'A', feeAmount: 100000, timelineWeeks: 10, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
        { professionalName: 'B', firm: 'B', feeAmount: 200000, timelineWeeks: 20, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
        { professionalName: 'C', firm: 'C', feeAmount: 300000, timelineWeeks: 30, experienceScore: 5, methodologyScore: 5, referenceScore: 5 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PC-002')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('proposal_comparison_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('proposal_comparison_v1')).toBe(proposalComparisonV1)
    expect(proposalComparisonV1.toolId).toBe('proposal_comparison')
    expect(proposalComparisonV1.method).toBe('hybrid')
    expect(proposalComparisonV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(proposalComparisonV1.scheduleSchema).toBeDefined()
  })
})
