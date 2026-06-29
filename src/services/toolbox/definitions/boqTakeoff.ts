// Bill of Quantities / Bill of Materials Takeoff calculator definition
//
// `boq_takeoff_v1` (toolId `boq_takeoff`) — a schedule-based tool for constructing
// quantity × rate cost schedules. Each row is a line item with description, unit,
// quantity, rate, and optional rate build-up (labour/material/plant breakdown).
//
// Computes: per-row amount (qty × rate), section subtotals, contingency, grand total.
// Clause checks: contingency within 5-15%, no zero-quantity rows, no zero-rate rows.
//
// Requirements: 7.1.

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

export type BoQUnit = 'm²' | 'm³' | 'm' | 'nr' | 'kg' | 'item'

export interface RateBuildUp {
  labour: number
  material: number
  plant: number
}

export interface BoQRow {
  description: string
  unit: BoQUnit
  quantity: number
  rate: number
  rateBuildUp?: RateBuildUp
}

export interface BoQInput {
  projectName: string
  section: string
  contingencyPercent: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const boqRateBuildUpSchema = z.object({
  labour: z.number().min(0),
  material: z.number().min(0),
  plant: z.number().min(0),
})

export const boqRowSchema = z.object({
  description: z.string().min(1),
  unit: z.enum(['m²', 'm³', 'm', 'nr', 'kg', 'item']),
  quantity: z.number(),
  rate: z.number(),
  rateBuildUp: boqRateBuildUpSchema.optional(),
})

export const boqInputSchema = z.object({
  projectName: z.string().min(1),
  section: z.string().min(1),
  contingencyPercent: z.number().min(0).max(100).default(10),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const boqClauseSet: ClauseCheckDef<BoQInput, BoQRow>[] = [
  {
    clauseRef: 'BOQ-001',
    label: 'Contingency within acceptable range (5–15%)',
    evaluate: (ctx) => {
      const pct = ctx.input.contingencyPercent
      const inRange = pct >= 5 && pct <= 15
      return {
        outcome: inRange ? 'pass' : 'advisory',
        threshold: '5% – 15%',
        actual: `${pct}%`,
        note: inRange
          ? undefined
          : `Contingency of ${pct}% is outside the typical 5–15% range. Ensure this is justified.`,
      }
    },
  },
  {
    clauseRef: 'BOQ-002',
    label: 'No zero-quantity rows in schedule',
    evaluate: (ctx) => {
      const zeroQtyRows = ctx.rows.filter((r) => r.quantity === 0)
      return {
        outcome: zeroQtyRows.length === 0 ? 'pass' : 'advisory',
        threshold: '0 zero-quantity rows',
        actual: `${zeroQtyRows.length} zero-quantity row(s)`,
        note:
          zeroQtyRows.length > 0
            ? `Rows with zero quantity: ${zeroQtyRows.map((r) => r.description).join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'BOQ-003',
    label: 'No zero-rate rows in schedule',
    evaluate: (ctx) => {
      const zeroRateRows = ctx.rows.filter((r) => r.rate === 0)
      return {
        outcome: zeroRateRows.length === 0 ? 'pass' : 'advisory',
        threshold: '0 zero-rate rows',
        actual: `${zeroRateRows.length} zero-rate row(s)`,
        note:
          zeroRateRows.length > 0
            ? `Rows with zero rate: ${zeroRateRows.map((r) => r.description).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this BoQ/BoM takeoff is a decision-support aid and does not constitute a contractual cost estimate.',
  'Rates and quantities must be verified by a registered quantity surveyor before use in tender or contractual documents.',
]

function compute(ctx: ComputeContext<BoQInput, BoQRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row amounts
  const lineResults = rows.map((row) => {
    const amount = row.quantity * row.rate
    const result: Record<string, number | string> = {
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      rate: row.rate,
      amount,
    }
    if (row.rateBuildUp) {
      result.labourCost = row.rateBuildUp.labour * row.quantity
      result.materialCost = row.rateBuildUp.material * row.quantity
      result.plantCost = row.rateBuildUp.plant * row.quantity
    }
    return result
  })

  // Warn about zero-quantity and zero-rate rows (still included in results, but flagged)
  rows.forEach((row, i) => {
    if (row.quantity === 0) {
      warnings.push(`Row ${i + 1} ("${row.description}") has zero quantity.`)
    }
    if (row.rate === 0) {
      warnings.push(`Row ${i + 1} ("${row.description}") has zero rate.`)
    }
  })

  // Aggregates
  const subtotal = lineResults.reduce((sum, r) => sum + (r.amount as number), 0)
  const contingencyAmount = subtotal * (input.contingencyPercent / 100)
  const grandTotal = subtotal + contingencyAmount

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(boqClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      section: input.section,
      itemCount: rows.length,
      subtotal: Math.round(subtotal * 100) / 100,
      contingencyPercent: input.contingencyPercent,
      contingencyAmount: Math.round(contingencyAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
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

/** `boq_takeoff_v1` — Bill of Quantities / Bill of Materials Takeoff Tool. */
export const boqTakeoffV1: CalculatorDefinition<BoQInput, BoQRow> =
  registerCalculatorDefinition<BoQInput, BoQRow>({
    id: 'boq_takeoff_v1',
    toolId: 'boq_takeoff',
    title: 'BoQ / BoM Takeoff Tool',
    method: 'area',
    inputSchema: boqInputSchema,
    scheduleSchema: boqRowSchema,
    tableRefs: [],
    clauseSet: boqClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'JBCC/NEC Schedule of Quantities',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
