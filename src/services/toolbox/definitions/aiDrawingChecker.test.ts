import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  aiDrawingCheckerV1,
  aiDrawingInputSchema,
} from './aiDrawingChecker'

function run(input: unknown) {
  return runCalculator(aiDrawingCheckerV1, input, [], { tables: SEED_GUIDELINE_TABLES })
}

describe('aiDrawingChecker schema validation', () => {
  it('accepts valid input', () => {
    const result = aiDrawingInputSchema.safeParse({
      drawingType: 'floor_plan',
      scale: '1:100',
      hasNorthPoint: true,
      hasTitleBlock: true,
      hasDimensions: true,
      hasScaleBar: true,
      drawingNumber: 'A-101',
      paperSize: 'A1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty drawing type', () => {
    const result = aiDrawingInputSchema.safeParse({
      drawingType: '',
      scale: '1:100',
      hasNorthPoint: true,
      hasTitleBlock: true,
      hasDimensions: true,
      hasScaleBar: true,
      drawingNumber: 'A-101',
      paperSize: 'A1',
    })
    expect(result.success).toBe(false)
  })
})

describe('ai_drawing_checker_v1 — registration', () => {
  it('is registered with correct toolId and table refs', () => {
    expect(getCalculatorDefinition('ai_drawing_checker_v1')).toBe(aiDrawingCheckerV1)
    expect(aiDrawingCheckerV1.toolId).toBe('ai_drawing_checker')
    expect(aiDrawingCheckerV1.method).toBe('clauseSet')
    expect(aiDrawingCheckerV1.status).toBe('full')
    expect(aiDrawingCheckerV1.tableRefs).toContain('drawing_check_requirements')
  })
})

describe('ai_drawing_checker_v1 — clause checks', () => {
  it('passes all clauses for a complete floor plan', () => {
    const result = run({
      drawingType: 'floor_plan',
      scale: '1:100',
      hasNorthPoint: true,
      hasTitleBlock: true,
      hasDimensions: true,
      hasScaleBar: true,
      drawingNumber: 'A-101',
      paperSize: 'A1',
    })
    expect(result.complianceScore).toBe(100)
    expect(result.clauseResults.find((c) => c.clauseRef === 'Drawing 1.1')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'Drawing 1.2')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'Drawing 1.5')?.outcome).toBe('pass')
    expect(result.disclaimers.length).toBeGreaterThan(0)
  })

  it('fails when title block and dimensions are missing for a site plan', () => {
    const result = run({
      drawingType: 'site_plan',
      scale: '1:500',
      hasNorthPoint: true,
      hasTitleBlock: false,
      hasDimensions: false,
      hasScaleBar: true,
      drawingNumber: 'S-01',
      paperSize: 'A1',
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Drawing 1.1')?.outcome).toBe('fail')
    expect(result.clauseResults.find((c) => c.clauseRef === 'Drawing 1.4')?.outcome).toBe('fail')
    expect(result.complianceScore).toBeLessThan(100)
  })

  it('north point is advisory for section drawings (not required)', () => {
    const result = run({
      drawingType: 'section',
      scale: '1:50',
      hasNorthPoint: false,
      hasTitleBlock: true,
      hasDimensions: true,
      hasScaleBar: true,
      drawingNumber: 'B-01',
      paperSize: 'A1',
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Drawing 1.2')?.outcome).toBe('advisory')
    // All non-advisory clauses should pass
    const nonAdvisory = result.clauseResults.filter((c) => c.outcome !== 'advisory')
    expect(nonAdvisory.every((c) => c.outcome === 'pass')).toBe(true)
  })

  it('fails invalid drawing number format', () => {
    const result = run({
      drawingType: 'floor_plan',
      scale: '1:100',
      hasNorthPoint: true,
      hasTitleBlock: true,
      hasDimensions: true,
      hasScaleBar: true,
      drawingNumber: 'bad drawing number!',
      paperSize: 'A1',
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Drawing 1.5')?.outcome).toBe('fail')
  })

  it('throws for unknown drawing type', () => {
    expect(() =>
      run({
        drawingType: 'unknown_type',
        scale: '1:100',
        hasNorthPoint: true,
        hasTitleBlock: true,
        hasDimensions: true,
        hasScaleBar: true,
        drawingNumber: 'A-101',
        paperSize: 'A1',
      }),
    ).toThrow()
  })
})

describe('ai_drawing_checker_v1 — source traceability', () => {
  it('includes source version in result', () => {
    const result = run({
      drawingType: 'floor_plan',
      scale: '1:100',
      hasNorthPoint: true,
      hasTitleBlock: true,
      hasDimensions: true,
      hasScaleBar: true,
      drawingNumber: 'A-101',
      paperSize: 'A1',
    })
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({
      guideline: 'drawing_check_requirements',
      version: '2024.1',
    }))
  })
})
