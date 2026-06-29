// Staff CPD Compliance Tracker calculator definition
//
// `staff_cpd_tracker_v1` (toolId `staff_cpd_tracker`) — a schedule-based tool for tracking
// firm-wide staff CPD compliance. Each row is a staff member with their target and earned points.
//
// Computes: total staff, compliant count, non-compliant count, firm compliance %, at-risk staff list.
// Clause checks: firm-wide compliance above 80% (advisory), all staff have targets set.
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

export interface StaffCpdTrackerRow {
  staffMember: string
  registrationBody: string
  targetPoints: number
  earnedPoints: number
  complianceYear: string
}

export interface StaffCpdTrackerInput {
  firmName: string
  trackingYear: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const staffCpdTrackerRowSchema = z.object({
  staffMember: z.string().min(1),
  registrationBody: z.string().min(1),
  targetPoints: z.number().min(0),
  earnedPoints: z.number().min(0),
  complianceYear: z.string().min(1),
})

export const staffCpdTrackerInputSchema = z.object({
  firmName: z.string().min(1),
  trackingYear: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const staffCpdTrackerClauseSet: ClauseCheckDef<StaffCpdTrackerInput, StaffCpdTrackerRow>[] = [
  {
    clauseRef: 'SCT-001',
    label: 'Firm-wide compliance above 80%',
    evaluate: (ctx) => {
      if (ctx.rows.length === 0) {
        return { outcome: 'pass', threshold: '≥ 80%', actual: 'N/A (no staff)' }
      }
      const compliant = ctx.rows.filter((r) => r.earnedPoints >= r.targetPoints).length
      const rate = Math.round((compliant / ctx.rows.length) * 100)
      return {
        outcome: rate >= 80 ? 'pass' : 'advisory',
        threshold: '≥ 80%',
        actual: `${rate}%`,
        note:
          rate < 80
            ? `Firm-wide CPD compliance is ${rate}%. Target staff at risk of non-compliance.`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'SCT-002',
    label: 'All staff have targets set',
    evaluate: (ctx) => {
      const noTarget = ctx.rows.filter((r) => r.targetPoints === 0)
      return {
        outcome: noTarget.length === 0 ? 'pass' : 'fail',
        threshold: '0 staff without targets',
        actual: `${noTarget.length} staff without target`,
        note:
          noTarget.length > 0
            ? `Staff without CPD target: ${noTarget.map((r) => r.staffMember).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this CPD compliance tracker is a firm management aid. Verify individual compliance with registration bodies.',
]

function compute(ctx: ComputeContext<StaffCpdTrackerInput, StaffCpdTrackerRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => {
    const compliant = row.earnedPoints >= row.targetPoints
    return {
      staffMember: row.staffMember,
      registrationBody: row.registrationBody,
      targetPoints: row.targetPoints,
      earnedPoints: row.earnedPoints,
      complianceYear: row.complianceYear,
      compliant: compliant ? 'Yes' : 'No',
      shortfall: compliant ? 0 : row.targetPoints - row.earnedPoints,
    }
  })

  const totalStaff = rows.length
  const compliantCount = rows.filter((r) => r.earnedPoints >= r.targetPoints).length
  const nonCompliantCount = totalStaff - compliantCount
  const firmCompliancePct = totalStaff > 0 ? Math.round((compliantCount / totalStaff) * 100) : 0

  // At-risk staff list (non-compliant)
  const atRiskStaff = rows
    .filter((r) => r.earnedPoints < r.targetPoints)
    .map((r) => r.staffMember)
    .join(', ')

  // Look up cpd_body_rules if available
  const bodyRulesTable = ctx.tables['cpd_body_rules']
  const sourceVersions = bodyRulesTable
    ? [{ guideline: 'cpd_body_rules', version: bodyRulesTable.version }]
    : []

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(staffCpdTrackerClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      firmName: input.firmName,
      trackingYear: input.trackingYear,
      totalStaff,
      compliantCount,
      nonCompliantCount,
      firmCompliancePct,
      atRiskStaff: atRiskStaff || 'None',
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

export const staffCpdTrackerV1: CalculatorDefinition<StaffCpdTrackerInput, StaffCpdTrackerRow> =
  registerCalculatorDefinition<StaffCpdTrackerInput, StaffCpdTrackerRow>({
    id: 'staff_cpd_tracker_v1',
    toolId: 'staff_cpd_tracker',
    title: 'Staff CPD Compliance Tracker',
    method: 'hybrid',
    inputSchema: staffCpdTrackerInputSchema,
    scheduleSchema: staffCpdTrackerRowSchema,
    tableRefs: ['cpd_body_rules'],
    clauseSet: staffCpdTrackerClauseSet,
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
