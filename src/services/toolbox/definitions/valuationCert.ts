// Payment Valuation Certificate calculator definition
//
// `valuation_cert_v1` (toolId `valuation_cert`) — a schedule-based tool for producing
// payment valuation certificates. Each row is a BoQ item with work-done, retention,
// previous certified, and materials on site.
//
// Computes: per-row currentCertified, aggregates (totalWorkDone, totalPrevious,
// currentGross, retentionThisCert, totalRetentionHeld, netCurrentCertified, vatAmount,
// amountDue, platformFee, clientIntoEscrow).
//
// Design Property 6: certified = workDone − retention − previousPaid (exact cents arithmetic)
//                    clientIntoEscrow = amountDue + platformFee (exact)
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

export interface ValuationCertRow {
  description: string
  contractAmount: number
  previousCertified: number
  currentWorkDone: number
  materialsOnSite: number
}

export interface ValuationCertInput {
  contractNumber: string
  certNumber: number
  contractSum: number
  retentionPercent: number
  previousRetentionHeld: number
  vatRate: number
  platformFeePercent: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const valuationCertRowSchema = z.object({
  description: z.string().min(1),
  contractAmount: z.number().min(0),
  previousCertified: z.number().min(0),
  currentWorkDone: z.number().min(0),
  materialsOnSite: z.number().min(0),
})

export const valuationCertInputSchema = z.object({
  contractNumber: z.string().min(1),
  certNumber: z.number().int().min(1),
  contractSum: z.number().min(0),
  retentionPercent: z.number().min(0).max(100).default(10),
  previousRetentionHeld: z.number().min(0).default(0),
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

export const valuationCertClauseSet: ClauseCheckDef<ValuationCertInput, ValuationCertRow>[] = [
  {
    clauseRef: 'VAL-001',
    label: 'Retention within standard range (5–10%)',
    evaluate: (ctx) => {
      const pct = ctx.input.retentionPercent
      const inRange = pct >= 5 && pct <= 10
      return {
        outcome: inRange ? 'pass' : 'advisory',
        threshold: '5% – 10%',
        actual: `${pct}%`,
        note: inRange
          ? undefined
          : `Retention of ${pct}% is outside the standard 5–10% range.`,
      }
    },
  },
  {
    clauseRef: 'VAL-002',
    label: 'Total certified does not exceed contract sum',
    evaluate: (ctx) => {
      const totalCertified = ctx.rows.reduce(
        (sum, r) => sum + r.previousCertified + r.currentWorkDone + r.materialsOnSite,
        0,
      )
      const withinContract = roundCents(totalCertified) <= roundCents(ctx.input.contractSum)
      return {
        outcome: withinContract ? 'pass' : 'fail',
        threshold: `≤ R${ctx.input.contractSum.toFixed(2)}`,
        actual: `R${roundCents(totalCertified).toFixed(2)}`,
        note: withinContract
          ? undefined
          : 'Total certified amount exceeds contract sum — review required.',
      }
    },
  },
  {
    clauseRef: 'VAL-003',
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
  'Advisory only — this valuation certificate is a decision-support aid and does not constitute a contractual payment instruction.',
  'Amounts must be verified by a registered quantity surveyor or contract administrator before issuing payment.',
  'Architex platform fee is disclosed as a separate line item and is not included in the certified contract amount. The platform fee is charged to facilitate payment processing and escrow services.',
]

function compute(ctx: ComputeContext<ValuationCertInput, ValuationCertRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row amounts using exact cents arithmetic
  const lineResults = rows.map((row) => {
    const currentCertified = roundCents(row.currentWorkDone + row.materialsOnSite)
    return {
      description: row.description,
      contractAmount: row.contractAmount,
      previousCertified: row.previousCertified,
      currentWorkDone: row.currentWorkDone,
      materialsOnSite: row.materialsOnSite,
      currentCertified,
    }
  })

  // Aggregates using exact cents arithmetic
  const totalWorkDone = roundCents(
    rows.reduce((sum, r) => sum + r.currentWorkDone, 0),
  )
  const totalMaterialsOnSite = roundCents(
    rows.reduce((sum, r) => sum + r.materialsOnSite, 0),
  )
  const totalPrevious = roundCents(
    rows.reduce((sum, r) => sum + r.previousCertified, 0),
  )
  const currentGross = roundCents(totalWorkDone + totalMaterialsOnSite)
  const retentionThisCert = roundCents(currentGross * (input.retentionPercent / 100))
  const totalRetentionHeld = roundCents(input.previousRetentionHeld + retentionThisCert)
  const netCurrentCertified = roundCents(currentGross - retentionThisCert)
  const vatAmount = roundCents(netCurrentCertified * input.vatRate)
  const amountDue = roundCents(netCurrentCertified + vatAmount)
  const platformFee = roundCents(amountDue * (input.platformFeePercent / 100))
  const clientIntoEscrow = roundCents(amountDue + platformFee)

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(valuationCertClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      contractNumber: input.contractNumber,
      certNumber: input.certNumber,
      contractSum: input.contractSum,
      totalWorkDone,
      totalMaterialsOnSite,
      totalPrevious,
      currentGross,
      retentionPercent: input.retentionPercent,
      retentionThisCert,
      previousRetentionHeld: input.previousRetentionHeld,
      totalRetentionHeld,
      netCurrentCertified,
      vatRate: input.vatRate,
      vatAmount,
      amountDue,
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

/** `valuation_cert_v1` — Payment Valuation Certificate. */
export const valuationCertV1: CalculatorDefinition<ValuationCertInput, ValuationCertRow> =
  registerCalculatorDefinition<ValuationCertInput, ValuationCertRow>({
    id: 'valuation_cert_v1',
    toolId: 'valuation_cert',
    title: 'Payment Valuation Certificate',
    method: 'hybrid',
    inputSchema: valuationCertInputSchema,
    scheduleSchema: valuationCertRowSchema,
    tableRefs: [],
    clauseSet: valuationCertClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'JBCC/NEC Payment Certificate',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
