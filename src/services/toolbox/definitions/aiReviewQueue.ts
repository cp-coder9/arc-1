// AI Review Queue calculator definition
//
// `ai_review_queue_v1` (toolId `ai_review_queue`) — a schedule-based admin view for AI
// review items. Each row represents a review item with id, submitter, type, status, and
// assigned reviewer.
//
// Computes: total items, pending count, approved count, rejected count.
// Clause checks: no items unassigned > 24 hours.
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

export type ReviewItemStatus = 'pending' | 'approved' | 'rejected'

export interface AiReviewQueueRow {
  itemId: string
  submittedBy: string
  type: string
  status: ReviewItemStatus
  assignedTo: string
}

export interface AiReviewQueueInput {
  adminUser: string
  queueDate: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const aiReviewQueueRowSchema = z.object({
  itemId: z.string().min(1),
  submittedBy: z.string().min(1),
  type: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected']),
  assignedTo: z.string(),
})

export const aiReviewQueueInputSchema = z.object({
  adminUser: z.string().min(1),
  queueDate: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const aiReviewQueueClauseSet: ClauseCheckDef<AiReviewQueueInput, AiReviewQueueRow>[] = [
  {
    clauseRef: 'ARQ-001',
    label: 'No items unassigned > 24 hours',
    evaluate: (ctx) => {
      // Items that are pending but have no assignee are considered unassigned.
      // For this check, we flag pending items with empty assignedTo.
      const unassigned = ctx.rows.filter(
        (r) => r.status === 'pending' && (!r.assignedTo || r.assignedTo.trim() === ''),
      )
      return {
        outcome: unassigned.length === 0 ? 'pass' : 'fail',
        threshold: '0 unassigned pending items',
        actual: `${unassigned.length} unassigned item(s)`,
        note:
          unassigned.length > 0
            ? `Unassigned items: ${unassigned.map((r) => r.itemId).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'AI Review Queue — items should be assigned within 24 hours of submission.',
]

function compute(ctx: ComputeContext<AiReviewQueueInput, AiReviewQueueRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    itemId: row.itemId,
    submittedBy: row.submittedBy,
    type: row.type,
    status: row.status,
    assignedTo: row.assignedTo,
  }))

  const pendingCount = rows.filter((r) => r.status === 'pending').length
  const approvedCount = rows.filter((r) => r.status === 'approved').length
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length
  const unassignedCount = rows.filter(
    (r) => r.status === 'pending' && (!r.assignedTo || r.assignedTo.trim() === ''),
  ).length

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(aiReviewQueueClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      adminUser: input.adminUser,
      queueDate: input.queueDate,
      totalItems: rows.length,
      pendingCount,
      approvedCount,
      rejectedCount,
      unassignedCount,
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

export const aiReviewQueueV1: CalculatorDefinition<AiReviewQueueInput, AiReviewQueueRow> =
  registerCalculatorDefinition<AiReviewQueueInput, AiReviewQueueRow>({
    id: 'ai_review_queue_v1',
    toolId: 'ai_review_queue',
    title: 'AI Review Queue',
    method: 'hybrid',
    inputSchema: aiReviewQueueInputSchema,
    scheduleSchema: aiReviewQueueRowSchema,
    tableRefs: [],
    clauseSet: aiReviewQueueClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Platform AI Governance Policy',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
