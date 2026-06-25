// User Verification Console calculator definition
//
// `user_verification_console_v1` (toolId `user_verification_console`) — a schedule-based
// admin view for the user verification queue. Each row represents a verification request
// with userId, userName, type, status, and submitted date.
//
// Computes: total pending, verified count, rejected count, avg time in queue.
// Clause checks: no items pending > 7 days.
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

export type VerificationStatus = 'pending' | 'verified' | 'rejected'

export interface UserVerificationConsoleRow {
  userId: string
  userName: string
  verificationType: string
  status: VerificationStatus
  submittedDate: string
}

export interface UserVerificationConsoleInput {
  adminUser: string
  queueDate: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const userVerificationConsoleRowSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  verificationType: z.string().min(1),
  status: z.enum(['pending', 'verified', 'rejected']),
  submittedDate: z.string().min(1),
})

export const userVerificationConsoleInputSchema = z.object({
  adminUser: z.string().min(1),
  queueDate: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const userVerificationConsoleClauseSet: ClauseCheckDef<UserVerificationConsoleInput, UserVerificationConsoleRow>[] = [
  {
    clauseRef: 'UVC-001',
    label: 'No items pending > 7 days',
    evaluate: (ctx) => {
      const queueDate = new Date(ctx.input.queueDate)
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      const overdue = ctx.rows.filter((r) => {
        if (r.status !== 'pending') return false
        const submitted = new Date(r.submittedDate)
        return queueDate.getTime() - submitted.getTime() > sevenDaysMs
      })
      return {
        outcome: overdue.length === 0 ? 'pass' : 'fail',
        threshold: '0 items pending > 7 days',
        actual: `${overdue.length} item(s) pending > 7 days`,
        note:
          overdue.length > 0
            ? `Overdue verifications: ${overdue.map((r) => r.userName).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Verification queue — pending items should be reviewed within 7 days of submission.',
]

function compute(ctx: ComputeContext<UserVerificationConsoleInput, UserVerificationConsoleRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    userId: row.userId,
    userName: row.userName,
    verificationType: row.verificationType,
    status: row.status,
    submittedDate: row.submittedDate,
  }))

  const pendingCount = rows.filter((r) => r.status === 'pending').length
  const verifiedCount = rows.filter((r) => r.status === 'verified').length
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length

  // Average time in queue for pending items
  const queueDate = new Date(input.queueDate)
  const pendingRows = rows.filter((r) => r.status === 'pending')
  let avgDaysInQueue = 0
  if (pendingRows.length > 0) {
    const totalMs = pendingRows.reduce((sum, r) => {
      return sum + (queueDate.getTime() - new Date(r.submittedDate).getTime())
    }, 0)
    avgDaysInQueue = Math.round((totalMs / pendingRows.length) / (24 * 60 * 60 * 1000))
  }

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(userVerificationConsoleClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      adminUser: input.adminUser,
      queueDate: input.queueDate,
      totalItems: rows.length,
      pendingCount,
      verifiedCount,
      rejectedCount,
      avgDaysInQueue,
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

export const userVerificationConsoleV1: CalculatorDefinition<UserVerificationConsoleInput, UserVerificationConsoleRow> =
  registerCalculatorDefinition<UserVerificationConsoleInput, UserVerificationConsoleRow>({
    id: 'user_verification_console_v1',
    toolId: 'user_verification_console',
    title: 'User Verification Console',
    method: 'hybrid',
    inputSchema: userVerificationConsoleInputSchema,
    scheduleSchema: userVerificationConsoleRowSchema,
    tableRefs: [],
    clauseSet: userVerificationConsoleClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Platform Verification Policy',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
