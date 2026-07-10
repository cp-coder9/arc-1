// Plant & Equipment Register calculator definition
//
// `plant_register_v1` (toolId `plant_register`) — a schedule-based register for tracking
// construction plant/equipment on site, computing active and standby costs.
//
// Computes per row: activeCost (dailyRate × daysOnSite), standbyCost (dailyRate × standbyRate% × standbyDays), totalCost.
// Aggregates: totalActiveCost, totalStandbyCost, totalPlantCost, itemCount.
// Clause checks: standby rate within norms (40–60%), all items have registration numbers.
//
// Requirements: 7.3, 6.1.

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

export type HireType = 'internal' | 'external'

export interface PlantRow {
  description: string
  registrationNumber: string
  hireType: HireType
  dailyRate: number
  daysOnSite: number
  standbyDays: number
}

export interface PlantInput {
  projectName: string
  period: string
  standbyRate: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const plantRowSchema = z.object({
  description: z.string().min(1),
  registrationNumber: z.string(),
  hireType: z.enum(['internal', 'external']),
  dailyRate: z.number().min(0),
  daysOnSite: z.number().min(0),
  standbyDays: z.number().min(0),
})

export const plantInputSchema = z.object({
  projectName: z.string().min(1),
  period: z.string().min(1),
  standbyRate: z.number().min(0).max(100).default(50),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const plantClauseSet: ClauseCheckDef<PlantInput, PlantRow>[] = [
  {
    clauseRef: 'PLT-001',
    label: 'Standby rate within industry norms (40–60%)',
    evaluate: (ctx) => {
      const rate = ctx.input.standbyRate
      const inRange = rate >= 40 && rate <= 60
      return {
        outcome: inRange ? 'pass' : 'advisory',
        threshold: '40% – 60% of daily rate',
        actual: `${rate}%`,
        note: inRange
          ? undefined
          : `Standby rate of ${rate}% is outside the typical 40–60% range. Ensure this is contractually justified.`,
      }
    },
  },
  {
    clauseRef: 'PLT-002',
    label: 'All items have registration numbers',
    evaluate: (ctx) => {
      const missing = ctx.rows.filter((r) => !r.registrationNumber || r.registrationNumber.trim() === '')
      return {
        outcome: missing.length === 0 ? 'pass' : 'advisory',
        threshold: '0 items without registration numbers',
        actual: `${missing.length} item(s) without registration numbers`,
        note:
          missing.length > 0
            ? `Items missing registration: ${missing.map((r) => r.description).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this plant register is a decision-support aid and does not constitute a contractual hire claim.',
  'Daily rates and standby terms must be verified against actual hire agreements before submission.',
]

function compute(ctx: ComputeContext<PlantInput, PlantRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row costs
  const lineResults = rows.map((row) => {
    const activeCost = row.dailyRate * row.daysOnSite
    const standbyCost = row.dailyRate * (input.standbyRate / 100) * row.standbyDays
    const totalCost = activeCost + standbyCost

    return {
      description: row.description,
      registrationNumber: row.registrationNumber,
      hireType: row.hireType,
      dailyRate: row.dailyRate,
      daysOnSite: row.daysOnSite,
      standbyDays: row.standbyDays,
      activeCost: Math.round(activeCost * 100) / 100,
      standbyCost: Math.round(standbyCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
    }
  })

  // Warn about missing registration numbers
  rows.forEach((row, i) => {
    if (!row.registrationNumber || row.registrationNumber.trim() === '') {
      warnings.push(`Row ${i + 1} ("${row.description}") has no registration number.`)
    }
  })

  // Aggregates
  const totalActiveCost = lineResults.reduce((sum, r) => sum + (r.activeCost as number), 0)
  const totalStandbyCost = lineResults.reduce((sum, r) => sum + (r.standbyCost as number), 0)
  const totalPlantCost = totalActiveCost + totalStandbyCost

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(plantClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      period: input.period,
      itemCount: rows.length,
      standbyRatePercent: input.standbyRate,
      totalActiveCost: Math.round(totalActiveCost * 100) / 100,
      totalStandbyCost: Math.round(totalStandbyCost * 100) / 100,
      totalPlantCost: Math.round(totalPlantCost * 100) / 100,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [
      { guideline: 'JBCC/NEC Plant & Equipment Schedule', version: '2024', effectiveFrom: '2024-01-01', status: 'indicative' },
    ],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

/** `plant_register_v1` — Plant & Equipment Register Tool. */
export const plantRegisterV1: CalculatorDefinition<PlantInput, PlantRow> =
  registerCalculatorDefinition<PlantInput, PlantRow>({
    id: 'plant_register_v1',
    toolId: 'plant_register',
    title: 'Plant & Equipment Register',
    method: 'time',
    inputSchema: plantInputSchema,
    scheduleSchema: plantRowSchema,
    tableRefs: [],
    clauseSet: plantClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'JBCC/NEC Plant & Equipment Schedule',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
