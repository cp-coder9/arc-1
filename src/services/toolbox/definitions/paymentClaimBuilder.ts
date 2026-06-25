// Payment Claim Builder calculator definition
//
// `payment_claim_builder_v1` (toolId `payment_claim_builder`) — a schedule-based tool
// for constructing payment claims. Each row is a claim item with description, claimAmount,
// previouslyPaid, and retentionHeld.
//
// Computes: per-row netClaimThisCert, aggregates (totalClaimed, totalPreviouslyPaid,
// totalRetention, netClaim, vatAmount, totalDue, platformFee, clientIntoEscrow).
//
// Design Property 6: certified = claimAmount - retention - previousPaid (exact cents)
//                    clientIntoEscrow = totalDue + platformFee (exact)
//
// Requirements: 7.2, 7.4.

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

export interface PaymentClaimRow {
  description: string
  claimAmount: number
  previouslyPaid: number
  retentionHeld: number
}

export interface PaymentClaimInput {
  projectName: string
  claimNumber: number
  claimDate: string
  retentionPercent: number
  vatRate: number
  platformFeePercent: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const paymentClaimRowSchema = z.object({
  description: z.string().min(1),
  claimAmount: z.number().min(0),
  previouslyPaid: z.number().min(0),
  retentionHeld: z.number().min(0),
})

export const paymentClaimInputSchema = z.object({
  projectName: z.string().min(1),
  claimNumber: z.number().int().min(1),
  claimDate: z.string().min(1),
  retentionPercent: z.number().min(0).max(100).default(10),
  vatRate: z.number().min(0).max(1).default(0.15),
  platformFeePercent: z.number().min(0).max(100).default(5),
})

// ----------------------------------------------------------------------------
// Exact arithmetic helpers (cents-based to avoid floating-point drift)
// ----------------------------------------------------------------------------

/** Round to 2 decimal places using cents-based arithmetic. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const paymentClaimClauseSet: ClauseCheckDef<PaymentClaimInput, PaymentClaimRow>[] = [
  {
    clauseRef: 'PCB-001',
    label: 'Retention applied to claim',
    evaluate: (ctx) => {
      const hasRetention = ctx.input.retentionPercent > 0
      return {
        outcome: hasRetention ? 'pass' : 'advisory',
        threshold: 'Retention > 0%',
        actual: `${ctx.input.retentionPercent}%`,
        note: hasRetention
          ? undefined
          : 'No retention applied — confirm this is intentional.',
      }
    },
  },
  {
    clauseRef: 'PCB-002',
    label: 'Claim amounts do not exceed contract values',
    evaluate: (ctx) => {
      // Check that no row's netClaimThisCert is negative (would indicate over-claim)
      const overClaimed = ctx.rows.filter(
        (r) => r.claimAmount < r.previouslyPaid + r.retentionHeld,
      )
      return {
        outcome: overClaimed.length === 0 ? 'pass' : 'fail',
        threshold: 'claimAmount ≥ previouslyPaid + retentionHeld for all rows',
        actual: `${overClaimed.length} over-claimed row(s)`,
        note:
          overClaimed.length > 0
            ? `Over-claimed items: ${overClaimed.map((r) => r.description).join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'PCB-003',
    label: 'Platform fee disclosed',
    evaluate: (ctx) => {
      const disclosed = ctx.input.platformFeePercent > 0
      return {
        outcome: disclosed ? 'pass' : 'advisory',
        threshold: 'Platform fee > 0% and disclosed',
        actual: `${ctx.input.platformFeePercent}%`,
        note: disclosed
          ? undefined
          : 'Platform fee is 0% — confirm fee disclosure is not required.',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this payment claim is a decision-support aid and does not constitute a contractual payment instruction.',
  'Amounts must be verified by a registered quantity surveyor or contract administrator before processing.',
  'Architex platform fee is disclosed as a separate line item and is not included in the claimed contract amount. The platform fee is charged to facilitate payment processing and escrow services.',
]

function compute(ctx: ComputeContext<PaymentClaimInput, PaymentClaimRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row amounts using exact cents arithmetic
  // Conservation: netClaimThisCert = claimAmount - previouslyPaid - retentionHeld
  const lineResults = rows.map((row) => {
    const netClaimThisCert = roundCents(row.claimAmount - row.previouslyPaid - row.retentionHeld)
    if (netClaimThisCert < 0) {
      warnings.push(
        `Row "${row.description}" has negative net claim (R${netClaimThisCert.toFixed(2)}) — claim may be over-recovered.`,
      )
    }
    return {
      description: row.description,
      claimAmount: row.claimAmount,
      previouslyPaid: row.previouslyPaid,
      retentionHeld: row.retentionHeld,
      netClaimThisCert,
    }
  })

  // Aggregates using exact cents arithmetic
  const totalClaimed = roundCents(rows.reduce((sum, r) => sum + r.claimAmount, 0))
  const totalPreviouslyPaid = roundCents(rows.reduce((sum, r) => sum + r.previouslyPaid, 0))
  const totalRetention = roundCents(rows.reduce((sum, r) => sum + r.retentionHeld, 0))
  const netClaim = roundCents(totalClaimed - totalPreviouslyPaid - totalRetention)
  const vatAmount = roundCents(netClaim * input.vatRate)
  const totalDue = roundCents(netClaim + vatAmount)
  const platformFee = roundCents(totalDue * (input.platformFeePercent / 100))
  const clientIntoEscrow = roundCents(totalDue + platformFee)

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(paymentClaimClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      claimNumber: input.claimNumber,
      claimDate: input.claimDate,
      totalClaimed,
      totalPreviouslyPaid,
      totalRetention,
      netClaim,
      vatRate: input.vatRate,
      vatAmount,
      totalDue,
      platformFeePercent: input.platformFeePercent,
      platformFee,
      clientIntoEscrow,
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

/** `payment_claim_builder_v1` — Payment Claim Builder. */
export const paymentClaimBuilderV1: CalculatorDefinition<PaymentClaimInput, PaymentClaimRow> =
  registerCalculatorDefinition<PaymentClaimInput, PaymentClaimRow>({
    id: 'payment_claim_builder_v1',
    toolId: 'payment_claim_builder',
    title: 'Payment Claim Builder',
    method: 'hybrid',
    inputSchema: paymentClaimInputSchema,
    scheduleSchema: paymentClaimRowSchema,
    tableRefs: [],
    clauseSet: paymentClaimClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'JBCC/NEC Payment Claim',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
