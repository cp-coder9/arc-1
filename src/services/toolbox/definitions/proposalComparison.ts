// Proposal Comparison calculator definition
//
// `proposal_comparison_v1` (toolId `proposal_comparison`) — a schedule-based tool for
// comparing professional proposals using weighted scoring criteria.
//
// Computes: weighted score per proposal, ranking, recommended (highest score).
// Clause checks: weights sum to 100%, at least 3 proposals compared (advisory).
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

export interface ProposalComparisonRow {
  professionalName: string
  firm: string
  feeAmount: number
  timelineWeeks: number
  experienceScore: number
  methodologyScore: number
  referenceScore: number
}

export interface ProposalComparisonInput {
  projectName: string
  evaluationDate: string
  weightFee: number
  weightTimeline: number
  weightExperience: number
  weightMethodology: number
  weightReferences: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const proposalComparisonRowSchema = z.object({
  professionalName: z.string().min(1),
  firm: z.string().min(1),
  feeAmount: z.number().min(0),
  timelineWeeks: z.number().min(1),
  experienceScore: z.number().min(1).max(10),
  methodologyScore: z.number().min(1).max(10),
  referenceScore: z.number().min(1).max(10),
})

export const proposalComparisonInputSchema = z.object({
  projectName: z.string().min(1),
  evaluationDate: z.string().min(1),
  weightFee: z.number().min(0).max(100),
  weightTimeline: z.number().min(0).max(100),
  weightExperience: z.number().min(0).max(100),
  weightMethodology: z.number().min(0).max(100),
  weightReferences: z.number().min(0).max(100),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const proposalComparisonClauseSet: ClauseCheckDef<ProposalComparisonInput, ProposalComparisonRow>[] = [
  {
    clauseRef: 'PC-001',
    label: 'Weights sum to 100%',
    evaluate: (ctx) => {
      const total =
        ctx.input.weightFee +
        ctx.input.weightTimeline +
        ctx.input.weightExperience +
        ctx.input.weightMethodology +
        ctx.input.weightReferences
      return {
        outcome: total === 100 ? 'pass' : 'fail',
        threshold: '100%',
        actual: `${total}%`,
        note: total !== 100 ? `Weights sum to ${total}% — must equal 100%.` : undefined,
      }
    },
  },
  {
    clauseRef: 'PC-002',
    label: 'At least 3 proposals compared',
    evaluate: (ctx) => {
      const count = ctx.rows.length
      return {
        outcome: count >= 3 ? 'pass' : 'advisory',
        threshold: '≥ 3 proposals',
        actual: `${count} proposal(s)`,
        note:
          count < 3
            ? `Only ${count} proposal(s) compared. Consider obtaining at least 3 for a robust comparison.`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this proposal comparison is a decision-support aid and does not constitute a binding award recommendation.',
  'Scoring is based on inputs provided. Verify all scores independently before award decisions.',
]

function compute(ctx: ComputeContext<ProposalComparisonInput, ProposalComparisonRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Normalise fee and timeline to 1-10 scale (lower fee/time = higher score)
  const maxFee = Math.max(...rows.map((r) => r.feeAmount), 1)
  const maxTimeline = Math.max(...rows.map((r) => r.timelineWeeks), 1)

  const lineResults = rows.map((row) => {
    // Invert fee and timeline so lower = better (scale 1-10)
    const feeNormalized = rows.length > 1
      ? Math.max(1, 10 - ((row.feeAmount / maxFee) * 9))
      : 5
    const timelineNormalized = rows.length > 1
      ? Math.max(1, 10 - ((row.timelineWeeks / maxTimeline) * 9))
      : 5

    const weightedScore =
      (feeNormalized * input.weightFee +
        timelineNormalized * input.weightTimeline +
        row.experienceScore * input.weightExperience +
        row.methodologyScore * input.weightMethodology +
        row.referenceScore * input.weightReferences) / 100

    return {
      professionalName: row.professionalName,
      firm: row.firm,
      feeAmount: row.feeAmount,
      timelineWeeks: row.timelineWeeks,
      experienceScore: row.experienceScore,
      methodologyScore: row.methodologyScore,
      referenceScore: row.referenceScore,
      feeNormalized: Math.round(feeNormalized * 100) / 100,
      timelineNormalized: Math.round(timelineNormalized * 100) / 100,
      weightedScore: Math.round(weightedScore * 100) / 100,
    }
  })

  // Rank by weighted score descending
  const sorted = [...lineResults].sort(
    (a, b) => (b.weightedScore as number) - (a.weightedScore as number),
  )
  // Assign rankings
  lineResults.forEach((lr) => {
    const rank = sorted.findIndex((s) => s.professionalName === lr.professionalName) + 1
    ;(lr as Record<string, number | string>).rank = rank
  })

  const recommended = sorted.length > 0 ? (sorted[0].professionalName as string) : 'N/A'

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(proposalComparisonClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      evaluationDate: input.evaluationDate,
      totalProposals: rows.length,
      recommended,
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

export const proposalComparisonV1: CalculatorDefinition<ProposalComparisonInput, ProposalComparisonRow> =
  registerCalculatorDefinition<ProposalComparisonInput, ProposalComparisonRow>({
    id: 'proposal_comparison_v1',
    toolId: 'proposal_comparison',
    title: 'BEP Proposal Comparison',
    method: 'hybrid',
    inputSchema: proposalComparisonInputSchema,
    scheduleSchema: proposalComparisonRowSchema,
    tableRefs: [],
    clauseSet: proposalComparisonClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'CIDB / SACAP Procurement Guidance',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
