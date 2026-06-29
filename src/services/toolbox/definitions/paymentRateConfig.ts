// Payment Rate Configuration calculator definition
//
// `payment_rate_config_v1` (toolId `payment_rate_config`) — a schedule-based admin tool for
// configuring payment rate tables. Each row represents a rate configuration entry with
// rateId, label, value, unit, category, and effective date.
//
// Computes: total rates configured, validates no duplicate rateIds.
// Clause checks: no duplicate rates, effective date in future, all rates have labels.
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

export type RateUnit = 'percent' | 'fixed' | 'per_m2' | 'per_hour'

export interface PaymentRateConfigRow {
  rateId: string
  label: string
  rateValue: number
  unit: RateUnit
  category: string
  effectiveFrom: string
}

export interface PaymentRateConfigInput {
  adminUser: string
  configScope: 'platform' | 'tenant'
  effectiveDate: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const paymentRateConfigRowSchema = z.object({
  rateId: z.string().min(1),
  label: z.string().min(1),
  rateValue: z.number(),
  unit: z.enum(['percent', 'fixed', 'per_m2', 'per_hour']),
  category: z.string().min(1),
  effectiveFrom: z.string().min(1),
})

export const paymentRateConfigInputSchema = z.object({
  adminUser: z.string().min(1),
  configScope: z.enum(['platform', 'tenant']),
  effectiveDate: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const paymentRateConfigClauseSet: ClauseCheckDef<PaymentRateConfigInput, PaymentRateConfigRow>[] = [
  {
    clauseRef: 'PRC-001',
    label: 'No duplicate rate IDs',
    evaluate: (ctx) => {
      const ids = ctx.rows.map((r) => r.rateId)
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
      const uniqueDuplicates = [...new Set(duplicates)]
      return {
        outcome: uniqueDuplicates.length === 0 ? 'pass' : 'fail',
        threshold: '0 duplicate rate IDs',
        actual: `${uniqueDuplicates.length} duplicate(s)`,
        note:
          uniqueDuplicates.length > 0
            ? `Duplicate rate IDs: ${uniqueDuplicates.join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'PRC-002',
    label: 'Effective date in future',
    evaluate: (ctx) => {
      const now = new Date()
      const effective = new Date(ctx.input.effectiveDate)
      const isFuture = effective.getTime() > now.getTime()
      return {
        outcome: isFuture ? 'pass' : 'fail',
        threshold: 'Effective date > current date',
        actual: ctx.input.effectiveDate,
        note: !isFuture ? 'Effective date must be in the future.' : undefined,
      }
    },
  },
  {
    clauseRef: 'PRC-003',
    label: 'All rates have labels',
    evaluate: (ctx) => {
      const missingLabels = ctx.rows.filter((r) => !r.label || r.label.trim() === '')
      return {
        outcome: missingLabels.length === 0 ? 'pass' : 'fail',
        threshold: '0 rates without labels',
        actual: `${missingLabels.length} rate(s) without labels`,
        note:
          missingLabels.length > 0
            ? `Rate IDs missing labels: ${missingLabels.map((r) => r.rateId).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Administrative action — payment rate changes require governance approval before activation.',
  'Rate configurations take effect from the specified effective date only.',
]

function compute(ctx: ComputeContext<PaymentRateConfigInput, PaymentRateConfigRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    rateId: row.rateId,
    label: row.label,
    rateValue: row.rateValue,
    unit: row.unit,
    category: row.category,
    effectiveFrom: row.effectiveFrom,
  }))

  // Group by category
  const categoryCounts: Record<string, number> = {}
  for (const row of rows) {
    categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1
  }

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(paymentRateConfigClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      adminUser: input.adminUser,
      configScope: input.configScope,
      effectiveDate: input.effectiveDate,
      totalRates: rows.length,
      categories: Object.keys(categoryCounts).length,
      categorySummary: JSON.stringify(categoryCounts),
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

export const paymentRateConfigV1: CalculatorDefinition<PaymentRateConfigInput, PaymentRateConfigRow> =
  registerCalculatorDefinition<PaymentRateConfigInput, PaymentRateConfigRow>({
    id: 'payment_rate_config_v1',
    toolId: 'payment_rate_config',
    title: 'Payment Rate Configurator',
    method: 'hybrid',
    inputSchema: paymentRateConfigInputSchema,
    scheduleSchema: paymentRateConfigRowSchema,
    tableRefs: [],
    clauseSet: paymentRateConfigClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Platform Admin Governance',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
