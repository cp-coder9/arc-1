// Workforce Timesheet / Payroll Export calculator definition
//
// `workforce_timesheet_v1` (toolId `workforce_timesheet`) — a schedule-based timesheet
// tool for tracking worker hours and computing payroll costs with statutory deductions
// (PAYE, UIF, SDL).
//
// Computes per row: normalCost, overtimeCost (1.5×), totalCost.
// Aggregates: totalHours, totalCost, payeAmount, uifAmount, sdlAmount, netPayable.
// Clause checks: overtime within limits (advisory if >10hrs/worker), statutory deductions applied.
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

export type WorkerGrade = 'labourer' | 'artisan' | 'foreman' | 'supervisor'

export interface TimesheetRow {
  workerName: string
  grade: WorkerGrade
  normalHours: number
  overtimeHours: number
  hourlyRate: number
}

export interface TimesheetInput {
  projectName: string
  weekEnding: string
  payePercent: number
  uifPercent: number
  sdlPercent: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const timesheetRowSchema = z.object({
  workerName: z.string().min(1),
  grade: z.enum(['labourer', 'artisan', 'foreman', 'supervisor']),
  normalHours: z.number().min(0),
  overtimeHours: z.number().min(0),
  hourlyRate: z.number().min(0),
})

export const timesheetInputSchema = z.object({
  projectName: z.string().min(1),
  weekEnding: z.string().min(1),
  payePercent: z.number().min(0).max(100).default(25),
  uifPercent: z.number().min(0).max(100).default(1),
  sdlPercent: z.number().min(0).max(100).default(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const timesheetClauseSet: ClauseCheckDef<TimesheetInput, TimesheetRow>[] = [
  {
    clauseRef: 'WFT-001',
    label: 'Overtime within acceptable limits (≤10hrs per worker)',
    evaluate: (ctx) => {
      const excessiveOT = ctx.rows.filter((r) => r.overtimeHours > 10)
      return {
        outcome: excessiveOT.length === 0 ? 'pass' : 'advisory',
        threshold: '≤10 overtime hours per worker',
        actual: `${excessiveOT.length} worker(s) exceed 10hrs overtime`,
        note:
          excessiveOT.length > 0
            ? `Workers with excessive overtime: ${excessiveOT.map((r) => r.workerName).join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'WFT-002',
    label: 'Statutory deductions applied (PAYE + UIF + SDL)',
    evaluate: (ctx) => {
      const totalDeductions = ctx.input.payePercent + ctx.input.uifPercent + ctx.input.sdlPercent
      return {
        outcome: totalDeductions > 0 ? 'pass' : 'fail',
        threshold: 'PAYE + UIF + SDL > 0%',
        actual: `${totalDeductions}% total deductions`,
        note:
          totalDeductions === 0
            ? 'No statutory deductions configured — payroll may be non-compliant.'
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this timesheet is a decision-support aid and does not constitute a final payroll submission.',
  'Statutory deduction rates must be verified against current SARS schedules before disbursement.',
]

function compute(ctx: ComputeContext<TimesheetInput, TimesheetRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row costs
  const lineResults = rows.map((row) => {
    const normalCost = row.normalHours * row.hourlyRate
    const overtimeCost = row.overtimeHours * row.hourlyRate * 1.5
    const totalCost = normalCost + overtimeCost

    return {
      workerName: row.workerName,
      grade: row.grade,
      normalHours: row.normalHours,
      overtimeHours: row.overtimeHours,
      hourlyRate: row.hourlyRate,
      normalCost: Math.round(normalCost * 100) / 100,
      overtimeCost: Math.round(overtimeCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
    }
  })

  // Warn about excessive overtime
  rows.forEach((row, i) => {
    if (row.overtimeHours > 10) {
      warnings.push(
        `Row ${i + 1} ("${row.workerName}") has ${row.overtimeHours} overtime hours — exceeds 10hr advisory limit.`,
      )
    }
  })

  // Aggregates
  const totalHours = rows.reduce((sum, r) => sum + r.normalHours + r.overtimeHours, 0)
  const totalCost = lineResults.reduce((sum, r) => sum + (r.totalCost as number), 0)
  const payeAmount = totalCost * (input.payePercent / 100)
  const uifAmount = totalCost * (input.uifPercent / 100)
  const sdlAmount = totalCost * (input.sdlPercent / 100)
  const netPayable = totalCost - payeAmount - uifAmount - sdlAmount

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(timesheetClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      weekEnding: input.weekEnding,
      workerCount: rows.length,
      totalHours: Math.round(totalHours * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      payePercent: input.payePercent,
      payeAmount: Math.round(payeAmount * 100) / 100,
      uifPercent: input.uifPercent,
      uifAmount: Math.round(uifAmount * 100) / 100,
      sdlPercent: input.sdlPercent,
      sdlAmount: Math.round(sdlAmount * 100) / 100,
      netPayable: Math.round(netPayable * 100) / 100,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [{ guideline: 'SARS PAYE/UIF/SDL', version: '2024.1' }],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

/** `workforce_timesheet_v1` — Workforce Timesheet / Payroll Export Tool. */
export const workforceTimesheetV1: CalculatorDefinition<TimesheetInput, TimesheetRow> =
  registerCalculatorDefinition<TimesheetInput, TimesheetRow>({
    id: 'workforce_timesheet_v1',
    toolId: 'workforce_timesheet',
    title: 'Workforce Timesheet / Payroll Export',
    method: 'time',
    inputSchema: timesheetInputSchema,
    scheduleSchema: timesheetRowSchema,
    tableRefs: ['paye_uif_sdl'],
    clauseSet: timesheetClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'SARS PAYE/UIF/SDL',
      version: '2024.1',
      status: 'mandatory',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
