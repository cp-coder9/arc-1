// Admin Governance calculator definition
//
// `admin_governance_v1` (toolId `admin_governance`) — a schedule-based admin view for
// governance policies. Each row represents a policy entry with name, status, owner,
// last review, and next review dates.
//
// Computes: total policies, active count, overdue reviews.
// Clause checks: no overdue reviews.
//
// Requirements: 3.2, 3.3.

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

export type PolicyStatus = 'active' | 'archived' | 'draft'

export interface AdminGovernanceRow {
  policyName: string
  status: PolicyStatus
  owner: string
  lastReview: string
  nextReview: string
}

export interface AdminGovernanceInput {
  adminUser: string
  reviewDate: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const adminGovernanceRowSchema = z.object({
  policyName: z.string().min(1),
  status: z.enum(['active', 'archived', 'draft']),
  owner: z.string().min(1),
  lastReview: z.string().min(1),
  nextReview: z.string().min(1),
})

export const adminGovernanceInputSchema = z.object({
  adminUser: z.string().min(1),
  reviewDate: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const adminGovernanceClauseSet: ClauseCheckDef<AdminGovernanceInput, AdminGovernanceRow>[] = [
  {
    clauseRef: 'GOV-001',
    label: 'No overdue reviews',
    evaluate: (ctx) => {
      const reviewDate = new Date(ctx.input.reviewDate)
      const overdue = ctx.rows.filter((r) => {
        if (r.status !== 'active') return false
        const next = new Date(r.nextReview)
        return next.getTime() < reviewDate.getTime()
      })
      return {
        outcome: overdue.length === 0 ? 'pass' : 'fail',
        threshold: '0 overdue reviews',
        actual: `${overdue.length} overdue review(s)`,
        note:
          overdue.length > 0
            ? `Overdue policies: ${overdue.map((r) => r.policyName).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Governance console — policy review status is advisory. Ensure all overdue reviews are actioned.',
]

function compute(ctx: ComputeContext<AdminGovernanceInput, AdminGovernanceRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    policyName: row.policyName,
    status: row.status,
    owner: row.owner,
    lastReview: row.lastReview,
    nextReview: row.nextReview,
  }))

  const activeCount = rows.filter((r) => r.status === 'active').length
  const archivedCount = rows.filter((r) => r.status === 'archived').length
  const draftCount = rows.filter((r) => r.status === 'draft').length

  const reviewDate = new Date(input.reviewDate)
  const overdueCount = rows.filter((r) => {
    if (r.status !== 'active') return false
    return new Date(r.nextReview).getTime() < reviewDate.getTime()
  }).length

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(adminGovernanceClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      adminUser: input.adminUser,
      reviewDate: input.reviewDate,
      totalPolicies: rows.length,
      activeCount,
      archivedCount,
      draftCount,
      overdueReviews: overdueCount,
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

export const adminGovernanceV1: CalculatorDefinition<AdminGovernanceInput, AdminGovernanceRow> =
  registerCalculatorDefinition<AdminGovernanceInput, AdminGovernanceRow>({
    id: 'admin_governance_v1',
    toolId: 'admin_governance',
    title: 'Governance Console',
    method: 'hybrid',
    inputSchema: adminGovernanceInputSchema,
    scheduleSchema: adminGovernanceRowSchema,
    tableRefs: [],
    clauseSet: adminGovernanceClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Platform Governance Policy',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
