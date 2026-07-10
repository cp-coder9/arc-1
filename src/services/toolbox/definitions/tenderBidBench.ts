// Tender / Bid Workbench calculator definition
//
// `tender_bid_bench_v1` (toolId `tender_bid_bench`) — a schedule-based tool for preparing
// tender or bid responses. Each row is a BoQ pricing item with description and amount.
// Top-level inputs cover project identification and margin parameters.
//
// Computes per-row: amount (as-entered).
// Aggregates: subtotal, marginAmount, totalBidPrice, itemCount.
// Clause checks: margin within typical norms (5–25%), total bid price positive.
//
// Requirements: 14.5, 14.4.

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

export interface TenderBidRow {
  description: string
  unit: string
  quantity: number
  rate: number
  amount: number
}

export interface TenderBidInput {
  projectName: string
  tenderReference: string
  closingDate: string
  marginPercent: number
  contingencyPercent: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const tenderBidRowSchema = z.object({
  description: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().min(0),
  rate: z.number().min(0),
  amount: z.number().min(0),
})

export const tenderBidInputSchema = z.object({
  projectName: z.string().min(1),
  tenderReference: z.string().min(1),
  closingDate: z.string().min(1),
  marginPercent: z.number().min(0).max(100).default(10),
  contingencyPercent: z.number().min(0).max(100).default(5),
})

// ----------------------------------------------------------------------------
// Exact arithmetic helpers
// ----------------------------------------------------------------------------

/** Round to 2 decimal places using cents-based arithmetic. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const tenderBidClauseSet: ClauseCheckDef<TenderBidInput, TenderBidRow>[] = [
  {
    clauseRef: 'TBB-001',
    label: 'Margin within typical tender norms (5–25%)',
    evaluate: (ctx) => {
      const margin = ctx.input.marginPercent
      const inRange = margin >= 5 && margin <= 25
      return {
        outcome: inRange ? 'pass' : 'advisory',
        threshold: '5% – 25% margin',
        actual: `${margin}%`,
        note: inRange
          ? undefined
          : `Margin of ${margin}% is outside the typical 5–25% range for tender submissions. Confirm this is commercially appropriate.`,
      }
    },
  },
  {
    clauseRef: 'TBB-002',
    label: 'Total bid price is positive',
    evaluate: (ctx) => {
      const subtotal = ctx.rows.reduce((sum, r) => sum + r.amount, 0)
      return {
        outcome: subtotal > 0 ? 'pass' : 'fail',
        threshold: 'Total > R0.00',
        actual: `R${roundCents(subtotal).toFixed(2)}`,
        note: subtotal <= 0 ? 'BoQ pricing produces a zero or negative total — bid cannot be submitted.' : undefined,
      }
    },
  },
  {
    clauseRef: 'TBB-003',
    label: 'All items have amounts',
    evaluate: (ctx) => {
      const zeroItems = ctx.rows.filter((r) => r.amount === 0)
      return {
        outcome: zeroItems.length === 0 ? 'pass' : 'advisory',
        threshold: '0 items with R0.00 amounts',
        actual: `${zeroItems.length} item(s) with zero amount`,
        note:
          zeroItems.length > 0
            ? `Items with zero pricing: ${zeroItems.map((r) => r.description).join(', ')}. These may be excluded by the client.`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this tender pricing summary is a decision-support aid and does not constitute a formal tender submission.',
  'All rates, quantities, and margins must be verified by the tendering team before submission to the client or employer.',
]

function compute(ctx: ComputeContext<TenderBidInput, TenderBidRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row amounts
  const lineResults = rows.map((row) => {
    return {
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      rate: roundCents(row.rate),
      amount: roundCents(row.amount),
    }
  })

  // Aggregates
  const subtotal = roundCents(rows.reduce((sum, r) => sum + r.amount, 0))
  const contingencyAmount = roundCents(subtotal * (input.contingencyPercent / 100))
  const subtotalWithContingency = roundCents(subtotal + contingencyAmount)
  const marginAmount = roundCents(subtotalWithContingency * (input.marginPercent / 100))
  const totalBidPrice = roundCents(subtotalWithContingency + marginAmount)
  const itemCount = rows.length

  // Warn about zero-amount items
  rows.forEach((row, i) => {
    if (row.amount === 0) {
      warnings.push(
        `Row ${i + 1} ("${row.description}") has a zero amount — confirm this item is correctly priced.`,
      )
    }
  })

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(tenderBidClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      tenderReference: input.tenderReference,
      closingDate: input.closingDate,
      itemCount,
      subtotal,
      contingencyPercent: input.contingencyPercent,
      contingencyAmount,
      marginPercent: input.marginPercent,
      marginAmount,
      totalBidPrice,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [
      { guideline: 'CIDB Tender Best Practice', version: '2024', effectiveFrom: '2024-01-01', status: 'indicative' },
    ],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

/** `tender_bid_bench_v1` — Tender / Bid Workbench. */
export const tenderBidBenchV1: CalculatorDefinition<TenderBidInput, TenderBidRow> =
  registerCalculatorDefinition<TenderBidInput, TenderBidRow>({
    id: 'tender_bid_bench_v1',
    toolId: 'tender_bid_bench',
    title: 'Tender / Bid Workbench',
    method: 'hybrid',
    inputSchema: tenderBidInputSchema,
    scheduleSchema: tenderBidRowSchema,
    tableRefs: [],
    clauseSet: tenderBidClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'CIDB Tender Best Practice',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
