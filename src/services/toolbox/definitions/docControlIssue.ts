// Document Control Issue Sheet calculator definition
//
// `doc_control_issue_v1` (toolId `doc_control_issue`) — a schedule-based tool for tracking
// document issue sheets. Each row is a document issued to a recipient with acknowledgement.
//
// Computes: count issued, count acknowledged, acknowledgement rate %.
// Clause checks: acknowledgement rate above 80% (advisory), all issues have dates.
//
// Requirements: 2.1, 8.1.

import { z } from 'zod'
import type {
  CalculationResult,
  CalculatorDefinition,
  ClauseCheckDef,
  ClauseResult,
  ComputeContext,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface DocControlIssueRow {
  documentRef: string
  title: string
  revision: string
  issuedTo: string
  issueDate: string
  acknowledged: boolean
}

export interface DocControlIssueInput {
  projectName: string
  issueSheetNumber: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const docControlIssueRowSchema = z.object({
  documentRef: z.string().min(1),
  title: z.string().min(1),
  revision: z.string().min(1),
  issuedTo: z.string().min(1),
  issueDate: z.string(),
  acknowledged: z.boolean(),
})

export const docControlIssueInputSchema = z.object({
  projectName: z.string().min(1),
  issueSheetNumber: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const docControlIssueClauseSet: ClauseCheckDef<DocControlIssueInput, DocControlIssueRow>[] = [
  {
    clauseRef: 'DCI-001',
    label: 'Acknowledgement rate above 80%',
    evaluate: (ctx) => {
      if (ctx.rows.length === 0) {
        return { outcome: 'pass', threshold: '≥ 80%', actual: 'N/A (no issues)' }
      }
      const ackCount = ctx.rows.filter((r) => r.acknowledged).length
      const rate = Math.round((ackCount / ctx.rows.length) * 100)
      return {
        outcome: rate >= 80 ? 'pass' : 'advisory',
        threshold: '≥ 80%',
        actual: `${rate}%`,
        note:
          rate < 80
            ? `Only ${rate}% of issued documents have been acknowledged. Follow up on outstanding acknowledgements.`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'DCI-002',
    label: 'All issues have dates',
    evaluate: (ctx) => {
      const missingDates = ctx.rows.filter((r) => !r.issueDate || r.issueDate.trim() === '')
      return {
        outcome: missingDates.length === 0 ? 'pass' : 'fail',
        threshold: '0 issues without dates',
        actual: `${missingDates.length} issue(s) without dates`,
        note:
          missingDates.length > 0
            ? `Documents without issue date: ${missingDates.map((r) => r.documentRef).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this document issue sheet is a record-keeping aid and does not replace formal transmittal procedures.',
]

function compute(ctx: ComputeContext<DocControlIssueInput, DocControlIssueRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    documentRef: row.documentRef,
    title: row.title,
    revision: row.revision,
    issuedTo: row.issuedTo,
    issueDate: row.issueDate,
    acknowledged: row.acknowledged ? 'Yes' : 'No',
  }))

  const countIssued = rows.length
  const countAcknowledged = rows.filter((r) => r.acknowledged).length
  const acknowledgementRate = countIssued > 0 ? Math.round((countAcknowledged / countIssued) * 100) : 0

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(docControlIssueClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      issueSheetNumber: input.issueSheetNumber,
      countIssued,
      countAcknowledged,
      acknowledgementRate,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

export const docControlIssueV1: CalculatorDefinition<DocControlIssueInput, DocControlIssueRow> =
  registerCalculatorDefinition<DocControlIssueInput, DocControlIssueRow>({
    id: 'doc_control_issue_v1',
    toolId: 'doc_control_issue',
    title: 'Document Control Issue Sheet',
    method: 'hybrid',
    inputSchema: docControlIssueInputSchema,
    scheduleSchema: docControlIssueRowSchema,
    tableRefs: [],
    clauseSet: docControlIssueClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Document Control Best Practice',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
