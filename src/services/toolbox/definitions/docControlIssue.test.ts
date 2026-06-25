import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  docControlIssueV1,
  docControlIssueInputSchema,
  docControlIssueRowSchema,
} from './docControlIssue'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(docControlIssueV1, input, rows, { tables: [] })
}

describe('doc_control_issue_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = docControlIssueInputSchema.safeParse({
      projectName: 'Project A',
      issueSheetNumber: 'IS-001',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty issueSheetNumber', () => {
    const result = docControlIssueInputSchema.safeParse({
      projectName: 'Project A',
      issueSheetNumber: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = docControlIssueRowSchema.safeParse({
      documentRef: 'DOC-001',
      title: 'Design Brief',
      revision: 'A',
      issuedTo: 'John Smith',
      issueDate: '2024-06-01',
      acknowledged: true,
    })
    expect(result.success).toBe(true)
  })
})

describe('doc_control_issue_v1 — computation', () => {
  it('computes acknowledgement rate', () => {
    const result = run(
      { projectName: 'Project A', issueSheetNumber: 'IS-001' },
      [
        { documentRef: 'DOC-001', title: 'Brief', revision: 'A', issuedTo: 'Alice', issueDate: '2024-01-01', acknowledged: true },
        { documentRef: 'DOC-002', title: 'Spec', revision: 'A', issuedTo: 'Bob', issueDate: '2024-01-02', acknowledged: true },
        { documentRef: 'DOC-003', title: 'Schedule', revision: 'A', issuedTo: 'Carol', issueDate: '2024-01-03', acknowledged: false },
        { documentRef: 'DOC-004', title: 'Drawings', revision: 'A', issuedTo: 'Dave', issueDate: '2024-01-04', acknowledged: true },
      ],
    )
    expect(result.aggregates.countIssued).toBe(4)
    expect(result.aggregates.countAcknowledged).toBe(3)
    expect(result.aggregates.acknowledgementRate).toBe(75)
  })

  it('handles empty schedule', () => {
    const result = run(
      { projectName: 'Project A', issueSheetNumber: 'IS-001' },
      [],
    )
    expect(result.aggregates.countIssued).toBe(0)
    expect(result.aggregates.acknowledgementRate).toBe(0)
  })
})

describe('doc_control_issue_v1 — clause checks', () => {
  it('passes when acknowledgement rate >= 80%', () => {
    const result = run(
      { projectName: 'Project', issueSheetNumber: 'IS-001' },
      [
        { documentRef: 'DOC-001', title: 'A', revision: '1', issuedTo: 'X', issueDate: '2024-01-01', acknowledged: true },
        { documentRef: 'DOC-002', title: 'B', revision: '1', issuedTo: 'Y', issueDate: '2024-01-02', acknowledged: true },
        { documentRef: 'DOC-003', title: 'C', revision: '1', issuedTo: 'Z', issueDate: '2024-01-03', acknowledged: true },
        { documentRef: 'DOC-004', title: 'D', revision: '1', issuedTo: 'W', issueDate: '2024-01-04', acknowledged: true },
        { documentRef: 'DOC-005', title: 'E', revision: '1', issuedTo: 'V', issueDate: '2024-01-05', acknowledged: false },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'DCI-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when acknowledgement rate < 80%', () => {
    const result = run(
      { projectName: 'Project', issueSheetNumber: 'IS-001' },
      [
        { documentRef: 'DOC-001', title: 'A', revision: '1', issuedTo: 'X', issueDate: '2024-01-01', acknowledged: true },
        { documentRef: 'DOC-002', title: 'B', revision: '1', issuedTo: 'Y', issueDate: '2024-01-02', acknowledged: false },
        { documentRef: 'DOC-003', title: 'C', revision: '1', issuedTo: 'Z', issueDate: '2024-01-03', acknowledged: false },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'DCI-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes date clause when all issues have dates', () => {
    const result = run(
      { projectName: 'Project', issueSheetNumber: 'IS-001' },
      [
        { documentRef: 'DOC-001', title: 'A', revision: '1', issuedTo: 'X', issueDate: '2024-01-01', acknowledged: true },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'DCI-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails date clause when issue has empty date', () => {
    const result = run(
      { projectName: 'Project', issueSheetNumber: 'IS-001' },
      [
        { documentRef: 'DOC-001', title: 'A', revision: '1', issuedTo: 'X', issueDate: '', acknowledged: true },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'DCI-002')
    expect(clause?.outcome).toBe('fail')
  })
})

describe('doc_control_issue_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('doc_control_issue_v1')).toBe(docControlIssueV1)
    expect(docControlIssueV1.toolId).toBe('doc_control_issue')
    expect(docControlIssueV1.method).toBe('hybrid')
    expect(docControlIssueV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(docControlIssueV1.scheduleSchema).toBeDefined()
  })
})
