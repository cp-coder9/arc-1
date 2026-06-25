import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  drawingRegisterV1,
  drawingRegisterInputSchema,
  drawingRegisterRowSchema,
} from './drawingRegister'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(drawingRegisterV1, input, rows, { tables: [] })
}

describe('drawing_register_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = drawingRegisterInputSchema.safeParse({
      projectName: 'Test Project',
      registerId: 'REG-001',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty projectName', () => {
    const result = drawingRegisterInputSchema.safeParse({
      projectName: '',
      registerId: 'REG-001',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = drawingRegisterRowSchema.safeParse({
      drawingNumber: 'A-101',
      title: 'Ground Floor Plan',
      discipline: 'Architecture',
      revision: 'P01',
      status: 'issued',
      dateIssued: '2024-06-01',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = drawingRegisterRowSchema.safeParse({
      drawingNumber: 'A-101',
      title: 'Ground Floor Plan',
      discipline: 'Architecture',
      revision: 'P01',
      status: 'invalid',
      dateIssued: '2024-06-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('drawing_register_v1 — computation', () => {
  it('counts drawings by status', () => {
    const result = run(
      { projectName: 'Project A', registerId: 'REG-001' },
      [
        { drawingNumber: 'A-101', title: 'GF Plan', discipline: 'Arch', revision: 'P01', status: 'issued', dateIssued: '2024-01-01' },
        { drawingNumber: 'A-102', title: 'FF Plan', discipline: 'Arch', revision: 'P01', status: 'approved', dateIssued: '2024-01-02' },
        { drawingNumber: 'A-103', title: 'Roof Plan', discipline: 'Arch', revision: 'P01', status: 'draft', dateIssued: '2024-01-03' },
        { drawingNumber: 'A-101', title: 'GF Plan', discipline: 'Arch', revision: 'P00', status: 'superseded', dateIssued: '2023-12-01' },
      ],
    )
    expect(result.aggregates.totalDrawings).toBe(4)
    expect(result.aggregates.countIssued).toBe(1)
    expect(result.aggregates.countApproved).toBe(1)
    expect(result.aggregates.countDraft).toBe(1)
    expect(result.aggregates.countSuperseded).toBe(1)
  })

  it('counts unique drawings by drawingNumber', () => {
    const result = run(
      { projectName: 'Project A', registerId: 'REG-001' },
      [
        { drawingNumber: 'A-101', title: 'GF Plan', discipline: 'Arch', revision: 'P01', status: 'issued', dateIssued: '2024-01-01' },
        { drawingNumber: 'A-101', title: 'GF Plan', discipline: 'Arch', revision: 'P00', status: 'superseded', dateIssued: '2023-12-01' },
        { drawingNumber: 'A-102', title: 'FF Plan', discipline: 'Arch', revision: 'P01', status: 'issued', dateIssued: '2024-01-02' },
      ],
    )
    expect(result.aggregates.uniqueDrawings).toBe(2)
  })
})

describe('drawing_register_v1 — clause checks', () => {
  it('passes when all drawings have revisions', () => {
    const result = run(
      { projectName: 'Project', registerId: 'REG-001' },
      [
        { drawingNumber: 'A-101', title: 'Plan', discipline: 'Arch', revision: 'P01', status: 'issued', dateIssued: '2024-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'DR-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when a drawing has empty revision', () => {
    const result = run(
      { projectName: 'Project', registerId: 'REG-001' },
      [
        { drawingNumber: 'A-101', title: 'Plan', discipline: 'Arch', revision: '', status: 'issued', dateIssued: '2024-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'DR-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('advisory when draft drawings present', () => {
    const result = run(
      { projectName: 'Project', registerId: 'REG-001' },
      [
        { drawingNumber: 'A-101', title: 'Plan', discipline: 'Arch', revision: 'P01', status: 'draft', dateIssued: '2024-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'DR-002')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes when no draft drawings', () => {
    const result = run(
      { projectName: 'Project', registerId: 'REG-001' },
      [
        { drawingNumber: 'A-101', title: 'Plan', discipline: 'Arch', revision: 'P01', status: 'issued', dateIssued: '2024-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'DR-002')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('drawing_register_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('drawing_register_v1')).toBe(drawingRegisterV1)
    expect(drawingRegisterV1.toolId).toBe('drawing_register')
    expect(drawingRegisterV1.method).toBe('hybrid')
    expect(drawingRegisterV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(drawingRegisterV1.scheduleSchema).toBeDefined()
  })

  it('includes disclaimers', () => {
    expect(drawingRegisterV1.disclaimers.length).toBeGreaterThan(0)
  })
})
