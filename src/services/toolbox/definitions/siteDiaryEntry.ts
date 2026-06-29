// Site Diary Standalone Entry calculator definition
//
// `site_diary_entry_v1` (toolId `site_diary_entry`) — a schedule-based daily diary tool
// for recording site activities, weather, workers, hours, and delays.
//
// Computes: total workdays, total worker-hours, total delays, average workers/day.
// Clause checks: all days logged (advisory if < 5 entries for a week), delays documented.
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

export type Weather = 'fine' | 'overcast' | 'rain' | 'storm'

export interface DiaryRow {
  date: string
  weather: Weather
  workersOnSite: number
  hoursWorked: number
  activitiesCompleted: string
  delaysReported: boolean
  delayDescription?: string
}

export interface DiaryInput {
  projectName: string
  siteForeman: string
  weekEnding: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const diaryRowSchema = z.object({
  date: z.string().min(1),
  weather: z.enum(['fine', 'overcast', 'rain', 'storm']),
  workersOnSite: z.number().min(0),
  hoursWorked: z.number().min(0),
  activitiesCompleted: z.string().min(1),
  delaysReported: z.boolean(),
  delayDescription: z.string().optional(),
})

export const diaryInputSchema = z.object({
  projectName: z.string().min(1),
  siteForeman: z.string().min(1),
  weekEnding: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const diaryClauseSet: ClauseCheckDef<DiaryInput, DiaryRow>[] = [
  {
    clauseRef: 'SDR-001',
    label: 'All weekdays logged (≥5 entries for a week)',
    evaluate: (ctx) => {
      const entryCount = ctx.rows.length
      return {
        outcome: entryCount >= 5 ? 'pass' : 'advisory',
        threshold: '≥5 diary entries per week',
        actual: `${entryCount} entries`,
        note:
          entryCount < 5
            ? `Only ${entryCount} diary entries recorded — ensure all workdays are documented.`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'SDR-002',
    label: 'Delays documented with descriptions',
    evaluate: (ctx) => {
      const delaysWithoutDesc = ctx.rows.filter(
        (r) => r.delaysReported && (!r.delayDescription || r.delayDescription.trim() === ''),
      )
      return {
        outcome: delaysWithoutDesc.length === 0 ? 'pass' : 'advisory',
        threshold: '0 delays without descriptions',
        actual: `${delaysWithoutDesc.length} delay(s) without description`,
        note:
          delaysWithoutDesc.length > 0
            ? `${delaysWithoutDesc.length} day(s) report delays without documentation — add descriptions for contractual record.`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this site diary is a record-keeping aid and does not constitute an official contract administration document without sign-off.',
  'Delay records should be cross-referenced with site instructions and extension of time claims.',
]

function compute(ctx: ComputeContext<DiaryInput, DiaryRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row (pass-through with worker-hours calculation)
  const lineResults = rows.map((row) => {
    const workerHours = row.workersOnSite * row.hoursWorked
    return {
      date: row.date,
      weather: row.weather,
      workersOnSite: row.workersOnSite,
      hoursWorked: row.hoursWorked,
      workerHours,
      activitiesCompleted: row.activitiesCompleted,
      delaysReported: row.delaysReported ? 1 : 0,
      delayDescription: row.delayDescription || '',
    }
  })

  // Warn about undocumented delays
  rows.forEach((row, i) => {
    if (row.delaysReported && (!row.delayDescription || row.delayDescription.trim() === '')) {
      warnings.push(`Row ${i + 1} (${row.date}) reports delays without a description.`)
    }
  })

  // Aggregates
  const totalWorkdays = rows.length
  const totalWorkerHours = lineResults.reduce((sum, r) => sum + (r.workerHours as number), 0)
  const totalDelays = rows.filter((r) => r.delaysReported).length
  const avgWorkersPerDay =
    totalWorkdays > 0
      ? Math.round((rows.reduce((sum, r) => sum + r.workersOnSite, 0) / totalWorkdays) * 100) / 100
      : 0

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(diaryClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      siteForeman: input.siteForeman,
      weekEnding: input.weekEnding,
      totalWorkdays,
      totalWorkerHours: Math.round(totalWorkerHours * 100) / 100,
      totalDelays,
      averageWorkersPerDay: avgWorkersPerDay,
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

/** `site_diary_entry_v1` — Site Diary Standalone Entry Tool. */
export const siteDiaryEntryV1: CalculatorDefinition<DiaryInput, DiaryRow> =
  registerCalculatorDefinition<DiaryInput, DiaryRow>({
    id: 'site_diary_entry_v1',
    toolId: 'site_diary_entry',
    title: 'Site Diary Standalone Entry',
    method: 'time',
    inputSchema: diaryInputSchema,
    scheduleSchema: diaryRowSchema,
    tableRefs: [],
    clauseSet: diaryClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'JBCC/NEC Site Administration',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
