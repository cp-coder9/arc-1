// Stage Gate Review & Decision Log calculator definition
//
// `stage_gate_review_v1` (toolId `stage_gate_review`) — a clauseSet-driven tool for
// evaluating stage gate criteria and producing a gate recommendation.
//
// Computes: total criteria, pass count, fail count, gate score, recommendation.
// Clause checks: all criteria reviewed, no unaddressed fails, gate decision documented.
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

export type GateCriterionStatus = 'pass' | 'fail' | 'deferred' | 'na'
export type GateRecommendation = 'proceed' | 'hold' | 'revert'

export interface StageGateReviewRow {
  criterion: string
  status: GateCriterionStatus
  evidence: string
  reviewer: string
  reviewDate: string
}

export interface StageGateReviewInput {
  projectName: string
  stageName: string
  gateDate: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const stageGateReviewRowSchema = z.object({
  criterion: z.string().min(1),
  status: z.enum(['pass', 'fail', 'deferred', 'na']),
  evidence: z.string(),
  reviewer: z.string(),
  reviewDate: z.string(),
})

export const stageGateReviewInputSchema = z.object({
  projectName: z.string().min(1),
  stageName: z.string().min(1),
  gateDate: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const stageGateReviewClauseSet: ClauseCheckDef<StageGateReviewInput, StageGateReviewRow>[] = [
  {
    clauseRef: 'SGR-001',
    label: 'All criteria reviewed',
    evaluate: (ctx) => {
      const unreviewed = ctx.rows.filter(
        (r) => !r.reviewer || r.reviewer.trim() === '' || !r.reviewDate || r.reviewDate.trim() === '',
      )
      return {
        outcome: unreviewed.length === 0 ? 'pass' : 'fail',
        threshold: '0 unreviewed criteria',
        actual: `${unreviewed.length} unreviewed criterion/a`,
        note:
          unreviewed.length > 0
            ? `Criteria not yet reviewed: ${unreviewed.map((r) => r.criterion).join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'SGR-002',
    label: 'No unaddressed fails',
    evaluate: (ctx) => {
      const fails = ctx.rows.filter((r) => r.status === 'fail')
      return {
        outcome: fails.length === 0 ? 'pass' : 'fail',
        threshold: '0 failed criteria',
        actual: `${fails.length} failed criterion/a`,
        note:
          fails.length > 0
            ? `Failed criteria: ${fails.map((r) => r.criterion).join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'SGR-003',
    label: 'Gate decision documented',
    evaluate: (ctx) => {
      // A gate decision is documented if there's at least one row and all have evidence or status
      const hasReview = ctx.rows.length > 0
      return {
        outcome: hasReview ? 'pass' : 'advisory',
        threshold: 'At least 1 criterion evaluated',
        actual: `${ctx.rows.length} criteria`,
        note: !hasReview ? 'No criteria have been evaluated yet.' : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'This stage gate review is a governance aid. Formal sign-off from authorised decision-makers is required before proceeding.',
]

function deriveRecommendation(passCount: number, failCount: number, totalApplicable: number): GateRecommendation {
  if (totalApplicable === 0) return 'hold'
  if (failCount === 0) return 'proceed'
  if (failCount <= totalApplicable * 0.2) return 'hold'
  return 'revert'
}

function compute(ctx: ComputeContext<StageGateReviewInput, StageGateReviewRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    criterion: row.criterion,
    status: row.status,
    evidence: row.evidence,
    reviewer: row.reviewer,
    reviewDate: row.reviewDate,
  }))

  const totalCriteria = rows.length
  const passCount = rows.filter((r) => r.status === 'pass').length
  const failCount = rows.filter((r) => r.status === 'fail').length
  const deferredCount = rows.filter((r) => r.status === 'deferred').length
  const naCount = rows.filter((r) => r.status === 'na').length

  const totalApplicable = totalCriteria - naCount
  const gateScore = totalApplicable > 0 ? Math.round((passCount / totalApplicable) * 100) : 0
  const recommendation = deriveRecommendation(passCount, failCount, totalApplicable)

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(stageGateReviewClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      stageName: input.stageName,
      gateDate: input.gateDate,
      totalCriteria,
      passCount,
      failCount,
      deferredCount,
      naCount,
      gateScore,
      recommendation,
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

export const stageGateReviewV1: CalculatorDefinition<StageGateReviewInput, StageGateReviewRow> =
  registerCalculatorDefinition<StageGateReviewInput, StageGateReviewRow>({
    id: 'stage_gate_review_v1',
    toolId: 'stage_gate_review',
    title: 'Stage Gate Review & Decision Log',
    method: 'clauseSet',
    inputSchema: stageGateReviewInputSchema,
    scheduleSchema: stageGateReviewRowSchema,
    tableRefs: [],
    clauseSet: stageGateReviewClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'PMBOK / PRINCE2 Stage Gate Methodology',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
