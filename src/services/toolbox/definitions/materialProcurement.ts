// Material Procurement / Order List calculator definition
//
// `material_procurement_v1` (toolId `material_procurement`) — a schedule-based tool for
// constructing material procurement orders. Each row is a material item with description,
// unit, quantity, unit rate, optional supplier, lead time, and priority.
//
// Computes: per-row cost (qty × unitRate), subtotal, contingency, VAT (15%), total order value.
// Clause checks: contingency applied, delivery date in future, total advisory.
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

export type MaterialPriority = 'high' | 'medium' | 'low'

export interface MaterialRow {
  description: string
  unit: string
  quantity: number
  unitRate: number
  supplier?: string
  leadTimeDays?: number
  priority: MaterialPriority
}

export interface MaterialProcurementInput {
  projectName: string
  orderReference: string
  deliveryDate: string
  contingencyPercent: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const materialRowSchema = z.object({
  description: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().positive(),
  unitRate: z.number().min(0),
  supplier: z.string().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  priority: z.enum(['high', 'medium', 'low']),
})

export const materialProcurementInputSchema = z.object({
  projectName: z.string().min(1),
  orderReference: z.string().min(1),
  deliveryDate: z.string().min(1), // ISO date string
  contingencyPercent: z.number().min(0).max(100).default(5),
})

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const VAT_RATE = 0.15

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const materialProcurementClauseSet: ClauseCheckDef<MaterialProcurementInput, MaterialRow>[] = [
  {
    clauseRef: 'PROC-001',
    label: 'Contingency applied to order',
    evaluate: (ctx) => {
      const pct = ctx.input.contingencyPercent
      return {
        outcome: pct > 0 ? 'pass' : 'advisory',
        threshold: '> 0%',
        actual: `${pct}%`,
        note: pct === 0
          ? 'No contingency applied — consider adding 3–10% for material price fluctuation.'
          : undefined,
      }
    },
  },
  {
    clauseRef: 'PROC-002',
    label: 'Delivery date is in the future',
    evaluate: (ctx) => {
      const deliveryDate = new Date(ctx.input.deliveryDate)
      const now = new Date()
      // Compare dates only (not time)
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const delivery = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth(), deliveryDate.getDate())
      const isFuture = delivery > today
      return {
        outcome: isFuture ? 'pass' : 'fail',
        threshold: 'After today',
        actual: ctx.input.deliveryDate,
        note: isFuture
          ? undefined
          : 'Delivery date is in the past or today — update to a valid future date.',
      }
    },
  },
  {
    clauseRef: 'PROC-003',
    label: 'Total order value advisory',
    evaluate: (ctx) => {
      const subtotal = ctx.rows.reduce((sum, r) => sum + r.quantity * r.unitRate, 0)
      const contingency = subtotal * (ctx.input.contingencyPercent / 100)
      const totalExVat = subtotal + contingency
      return {
        outcome: 'advisory',
        threshold: 'Budget review recommended',
        actual: `R ${totalExVat.toFixed(2)} excl. VAT`,
        note: 'Ensure the total order value falls within the approved project procurement budget.',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this procurement schedule is a decision-support aid and does not constitute a binding purchase order.',
  'Material rates are subject to supplier confirmation and may vary. Verify with current supplier quotations.',
]

function compute(ctx: ComputeContext<MaterialProcurementInput, MaterialRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row costs
  const lineResults = rows.map((row) => {
    const cost = row.quantity * row.unitRate
    const result: Record<string, number | string> = {
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      unitRate: row.unitRate,
      cost,
      priority: row.priority,
    }
    if (row.supplier) result.supplier = row.supplier
    if (row.leadTimeDays !== undefined) result.leadTimeDays = row.leadTimeDays
    return result
  })

  // Flag items with zero unit rate
  rows.forEach((row, i) => {
    if (row.unitRate === 0) {
      warnings.push(`Row ${i + 1} ("${row.description}") has zero unit rate.`)
    }
  })

  // Aggregates
  const subtotal = lineResults.reduce((sum, r) => sum + (r.cost as number), 0)
  const contingencyAmount = subtotal * (input.contingencyPercent / 100)
  const subtotalWithContingency = subtotal + contingencyAmount
  const vatAmount = subtotalWithContingency * VAT_RATE
  const totalOrderValue = subtotalWithContingency + vatAmount

  // Priority summary
  const highPriorityCount = rows.filter((r) => r.priority === 'high').length
  const mediumPriorityCount = rows.filter((r) => r.priority === 'medium').length
  const lowPriorityCount = rows.filter((r) => r.priority === 'low').length

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(materialProcurementClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      orderReference: input.orderReference,
      deliveryDate: input.deliveryDate,
      itemCount: rows.length,
      subtotal: Math.round(subtotal * 100) / 100,
      contingencyPercent: input.contingencyPercent,
      contingencyAmount: Math.round(contingencyAmount * 100) / 100,
      subtotalWithContingency: Math.round(subtotalWithContingency * 100) / 100,
      vatRate: VAT_RATE * 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      totalOrderValue: Math.round(totalOrderValue * 100) / 100,
      highPriorityItems: highPriorityCount,
      mediumPriorityItems: mediumPriorityCount,
      lowPriorityItems: lowPriorityCount,
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

/** `material_procurement_v1` — Material Procurement / Order List. */
export const materialProcurementV1: CalculatorDefinition<MaterialProcurementInput, MaterialRow> =
  registerCalculatorDefinition<MaterialProcurementInput, MaterialRow>({
    id: 'material_procurement_v1',
    toolId: 'material_procurement',
    title: 'Material Procurement / Order List',
    method: 'area',
    inputSchema: materialProcurementInputSchema,
    scheduleSchema: materialRowSchema,
    tableRefs: [],
    clauseSet: materialProcurementClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'JBCC/NEC Procurement Schedule',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
