import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  firmDocumentRegisterV1,
  firmDocumentRegisterInputSchema,
  firmDocumentRegisterRowSchema,
} from './firmDocumentRegister'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(firmDocumentRegisterV1, input, rows, { tables: [] })
}

describe('firm_document_register_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = firmDocumentRegisterInputSchema.safeParse({
      firmName: 'Acme Architects',
      registerId: 'QMS-001',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty firmName', () => {
    const result = firmDocumentRegisterInputSchema.safeParse({
      firmName: '',
      registerId: 'QMS-001',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = firmDocumentRegisterRowSchema.safeParse({
      documentId: 'QMS-POL-001',
      title: 'Quality Policy',
      category: 'policy',
      version: '3.0',
      owner: 'Principal',
      reviewDate: '2025-01-01',
      status: 'current',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid category', () => {
    const result = firmDocumentRegisterRowSchema.safeParse({
      documentId: 'QMS-001',
      title: 'Test',
      category: 'invalid',
      version: '1.0',
      owner: 'Owner',
      reviewDate: '2025-01-01',
      status: 'current',
    })
    expect(result.success).toBe(false)
  })
})

describe('firm_document_register_v1 — computation', () => {
  it('counts by category and status', () => {
    const result = run(
      { firmName: 'Acme', registerId: 'QMS-001' },
      [
        { documentId: 'POL-001', title: 'Quality Policy', category: 'policy', version: '3.0', owner: 'Principal', reviewDate: '2099-01-01', status: 'current' },
        { documentId: 'PRO-001', title: 'Design Procedure', category: 'procedure', version: '2.0', owner: 'Director', reviewDate: '2099-01-01', status: 'current' },
        { documentId: 'TPL-001', title: 'Proposal Template', category: 'template', version: '1.0', owner: 'Admin', reviewDate: '2099-01-01', status: 'archived' },
        { documentId: 'FRM-001', title: 'Timesheet Form', category: 'form', version: '1.5', owner: 'HR', reviewDate: '2099-01-01', status: 'under_review' },
        { documentId: 'REC-001', title: 'Audit Record', category: 'record', version: '1.0', owner: 'QA', reviewDate: '2099-01-01', status: 'current' },
      ],
    )
    expect(result.aggregates.totalDocuments).toBe(5)
    expect(result.aggregates.countPolicy).toBe(1)
    expect(result.aggregates.countProcedure).toBe(1)
    expect(result.aggregates.countTemplate).toBe(1)
    expect(result.aggregates.countForm).toBe(1)
    expect(result.aggregates.countRecord).toBe(1)
    expect(result.aggregates.countCurrent).toBe(3)
    expect(result.aggregates.countArchived).toBe(1)
    expect(result.aggregates.countUnderReview).toBe(1)
  })

  it('counts overdue reviews', () => {
    const result = run(
      { firmName: 'Acme', registerId: 'QMS-001' },
      [
        { documentId: 'POL-001', title: 'Old Policy', category: 'policy', version: '1.0', owner: 'Principal', reviewDate: '2020-01-01', status: 'current' },
        { documentId: 'PRO-001', title: 'Current Proc', category: 'procedure', version: '2.0', owner: 'Director', reviewDate: '2099-12-31', status: 'current' },
      ],
    )
    expect(result.aggregates.countOverdue).toBe(1)
  })
})

describe('firm_document_register_v1 — clause checks', () => {
  it('advisory when documents are past review date', () => {
    const result = run(
      { firmName: 'Acme', registerId: 'QMS-001' },
      [
        { documentId: 'POL-001', title: 'Old Policy', category: 'policy', version: '1.0', owner: 'Principal', reviewDate: '2020-01-01', status: 'current' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FDR-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes when no documents past review date', () => {
    const result = run(
      { firmName: 'Acme', registerId: 'QMS-001' },
      [
        { documentId: 'POL-001', title: 'Policy', category: 'policy', version: '1.0', owner: 'Principal', reviewDate: '2099-12-31', status: 'current' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FDR-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when documents have no owner', () => {
    const result = run(
      { firmName: 'Acme', registerId: 'QMS-001' },
      [
        { documentId: 'POL-001', title: 'Policy', category: 'policy', version: '1.0', owner: '', reviewDate: '2099-01-01', status: 'current' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FDR-002')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes when all documents have owners', () => {
    const result = run(
      { firmName: 'Acme', registerId: 'QMS-001' },
      [
        { documentId: 'POL-001', title: 'Policy', category: 'policy', version: '1.0', owner: 'Principal', reviewDate: '2099-01-01', status: 'current' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'FDR-002')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('firm_document_register_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('firm_document_register_v1')).toBe(firmDocumentRegisterV1)
    expect(firmDocumentRegisterV1.toolId).toBe('firm_document_register')
    expect(firmDocumentRegisterV1.method).toBe('hybrid')
    expect(firmDocumentRegisterV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(firmDocumentRegisterV1.scheduleSchema).toBeDefined()
  })
})
