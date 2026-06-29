// Shop Drawing & Sample Submission calculator definition
//
// `shop_drawing_submission_v1` (toolId `shop_drawing_submission`) — a schedule-based tool
// for tracking shop drawing and sample submissions. Each row is a submission with status.
//
// Computes: total submissions, approved %, rejected %, pending count.
// Clause checks: approval rate above 70%, no submissions without reviewer.
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

export type ShopDrawingStatus = 'submitted' | 'approved' | 'rejected' | 'resubmit'

export interface ShopDrawingSubmissionRow {
  submissionNumber: string
  description: string
  contractor: string
  dateSubmitted: string
  status: ShopDrawingStatus
  reviewedBy: string
}

export interface ShopDrawingSubmissionInput {
  projectName: string
  packageName: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const shopDrawingSubmissionRowSchema = z.object({
  submissionNumber: z.string().min(1),
  description: z.string().min(1),
  contractor: z.string().min(1),
  dateSubmitted: z.string().min(1),
  status: z.enum(['submitted', 'approved', 'rejected', 'resubmit']),
  reviewedBy: z.string(),
})

export const shopDrawingSubmissionInputSchema = z.object({
  projectName: z.string().min(1),
  packageName: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const shopDrawingSubmissionClauseSet: ClauseCheckDef<ShopDrawingSubmissionInput, ShopDrawingSubmissionRow>[] = [
  {
    clauseRef: 'SDS-001',
    label: 'Approval rate above 70%',
    evaluate: (ctx) => {
      const resolved = ctx.rows.filter((r) => r.status === 'approved' || r.status === 'rejected')
      if (resolved.length === 0) {
        return { outcome: 'pass', threshold: '≥ 70%', actual: 'N/A (no resolved submissions)' }
      }
      const approved = ctx.rows.filter((r) => r.status === 'approved').length
      const rate = Math.round((approved / resolved.length) * 100)
      return {
        outcome: rate >= 70 ? 'pass' : 'advisory',
        threshold: '≥ 70% approval',
        actual: `${rate}%`,
        note:
          rate < 70
            ? `Approval rate of ${rate}% is below the 70% threshold. Review submission quality with contractor.`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'SDS-002',
    label: 'No submissions without reviewer',
    evaluate: (ctx) => {
      const noReviewer = ctx.rows.filter((r) => !r.reviewedBy || r.reviewedBy.trim() === '')
      return {
        outcome: noReviewer.length === 0 ? 'pass' : 'advisory',
        threshold: '0 submissions without reviewer',
        actual: `${noReviewer.length} submission(s) without reviewer`,
        note:
          noReviewer.length > 0
            ? `Submissions without reviewer: ${noReviewer.map((r) => r.submissionNumber).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this submission tracker is a record-keeping aid and does not replace formal approval procedures.',
]

function compute(ctx: ComputeContext<ShopDrawingSubmissionInput, ShopDrawingSubmissionRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    submissionNumber: row.submissionNumber,
    description: row.description,
    contractor: row.contractor,
    dateSubmitted: row.dateSubmitted,
    status: row.status,
    reviewedBy: row.reviewedBy,
  }))

  const totalSubmissions = rows.length
  const approvedCount = rows.filter((r) => r.status === 'approved').length
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length
  const pending = rows.filter((r) => r.status === 'submitted' || r.status === 'resubmit').length

  const resolvedCount = approvedCount + rejectedCount
  const approvedPct = resolvedCount > 0 ? Math.round((approvedCount / resolvedCount) * 100) : 0
  const rejectedPct = resolvedCount > 0 ? Math.round((rejectedCount / resolvedCount) * 100) : 0

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(shopDrawingSubmissionClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      packageName: input.packageName,
      totalSubmissions,
      approvedCount,
      rejectedCount,
      pending,
      approvedPct,
      rejectedPct,
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

export const shopDrawingSubmissionV1: CalculatorDefinition<ShopDrawingSubmissionInput, ShopDrawingSubmissionRow> =
  registerCalculatorDefinition<ShopDrawingSubmissionInput, ShopDrawingSubmissionRow>({
    id: 'shop_drawing_submission_v1',
    toolId: 'shop_drawing_submission',
    title: 'Shop Drawing & Sample Submission',
    method: 'hybrid',
    inputSchema: shopDrawingSubmissionInputSchema,
    scheduleSchema: shopDrawingSubmissionRowSchema,
    tableRefs: [],
    clauseSet: shopDrawingSubmissionClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Construction Administration Best Practice',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
