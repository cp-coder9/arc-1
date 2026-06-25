// CPD Assessment (Standalone) calculator definition
//
// `cpd_standalone_v1` (toolId `cpd_standalone`) — a schedule-based tool for tracking
// individual CPD activities and compliance against professional body targets.
//
// Computes: totalPoints, points by category, shortfall/surplus, compliance %.
// Clause checks: target points achieved, structured minimum met (50% rule — advisory).
// Seed table: `cpd_body_rules` with points requirements per body.
//
// Requirements: 2.1, 8.1.

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

export type CpdCategory = 'structured' | 'unstructured' | 'research' | 'mentoring'

export interface CpdStandaloneRow {
  activityTitle: string
  provider: string
  category: CpdCategory
  hoursCompleted: number
  pointsEarned: number
  dateCompleted: string
}

export interface CpdStandaloneInput {
  professionalName: string
  registrationNumber: string
  cpdYear: string
  targetPoints: number
}

export interface CpdBodyRuleRow {
  body: string
  annualTarget: number
  structuredMinPct: number
  cycleLengthYears: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const cpdStandaloneRowSchema = z.object({
  activityTitle: z.string().min(1),
  provider: z.string().min(1),
  category: z.enum(['structured', 'unstructured', 'research', 'mentoring']),
  hoursCompleted: z.number().min(0),
  pointsEarned: z.number().min(0),
  dateCompleted: z.string().min(1),
})

export const cpdStandaloneInputSchema = z.object({
  professionalName: z.string().min(1),
  registrationNumber: z.string().min(1),
  cpdYear: z.string().min(1),
  targetPoints: z.number().min(1).default(25),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const cpdStandaloneClauseSet: ClauseCheckDef<CpdStandaloneInput, CpdStandaloneRow>[] = [
  {
    clauseRef: 'CPD-001',
    label: 'Target points achieved',
    evaluate: (ctx) => {
      const totalPoints = ctx.rows.reduce((sum, r) => sum + r.pointsEarned, 0)
      const target = ctx.input.targetPoints
      return {
        outcome: totalPoints >= target ? 'pass' : 'fail',
        threshold: `≥ ${target} points`,
        actual: `${totalPoints} points`,
        note:
          totalPoints < target
            ? `Shortfall of ${target - totalPoints} points. Additional CPD activities required.`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'CPD-002',
    label: 'Structured minimum met (50% rule)',
    evaluate: (ctx) => {
      const totalPoints = ctx.rows.reduce((sum, r) => sum + r.pointsEarned, 0)
      const structuredPoints = ctx.rows
        .filter((r) => r.category === 'structured')
        .reduce((sum, r) => sum + r.pointsEarned, 0)
      const structuredPct = totalPoints > 0 ? Math.round((structuredPoints / totalPoints) * 100) : 0
      return {
        outcome: structuredPct >= 50 ? 'pass' : 'advisory',
        threshold: '≥ 50% structured',
        actual: `${structuredPct}%`,
        note:
          structuredPct < 50
            ? `Structured activities account for only ${structuredPct}% of points. Most bodies require ≥ 50%.`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this CPD tracker is a self-assessment tool. Confirm compliance with your professional body\'s specific requirements.',
  'Points claimed are subject to verification by the relevant registration body.',
]

function compute(ctx: ComputeContext<CpdStandaloneInput, CpdStandaloneRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    activityTitle: row.activityTitle,
    provider: row.provider,
    category: row.category,
    hoursCompleted: row.hoursCompleted,
    pointsEarned: row.pointsEarned,
    dateCompleted: row.dateCompleted,
  }))

  const totalPoints = rows.reduce((sum, r) => sum + r.pointsEarned, 0)
  const structuredPoints = rows.filter((r) => r.category === 'structured').reduce((sum, r) => sum + r.pointsEarned, 0)
  const unstructuredPoints = rows.filter((r) => r.category === 'unstructured').reduce((sum, r) => sum + r.pointsEarned, 0)
  const researchPoints = rows.filter((r) => r.category === 'research').reduce((sum, r) => sum + r.pointsEarned, 0)
  const mentoringPoints = rows.filter((r) => r.category === 'mentoring').reduce((sum, r) => sum + r.pointsEarned, 0)

  const target = input.targetPoints
  const shortfall = Math.max(0, target - totalPoints)
  const surplus = Math.max(0, totalPoints - target)
  const compliancePct = target > 0 ? Math.min(100, Math.round((totalPoints / target) * 100)) : 0

  // Look up cpd_body_rules if available
  const bodyRulesTable = ctx.tables['cpd_body_rules']
  const sourceVersions = bodyRulesTable
    ? [{ guideline: 'cpd_body_rules', version: bodyRulesTable.version }]
    : []

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(cpdStandaloneClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      professionalName: input.professionalName,
      registrationNumber: input.registrationNumber,
      cpdYear: input.cpdYear,
      targetPoints: target,
      totalPoints,
      structuredPoints,
      unstructuredPoints,
      researchPoints,
      mentoringPoints,
      shortfall,
      surplus,
      compliancePct,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions,
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

export const cpdStandaloneV1: CalculatorDefinition<CpdStandaloneInput, CpdStandaloneRow> =
  registerCalculatorDefinition<CpdStandaloneInput, CpdStandaloneRow>({
    id: 'cpd_standalone_v1',
    toolId: 'cpd_standalone',
    title: 'CPD Assessment (Standalone)',
    method: 'hybrid',
    inputSchema: cpdStandaloneInputSchema,
    scheduleSchema: cpdStandaloneRowSchema,
    tableRefs: ['cpd_body_rules'],
    clauseSet: cpdStandaloneClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'SACAP / ECSA / SACQSP CPD Policy',
      version: '2024',
      status: 'mandatory',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
