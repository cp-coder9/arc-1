// H&S Compliance Checklist calculator definition
//
// `hs_compliance_v1` (toolId `hs_compliance`) — a clauseSet-based H&S compliance
// checklist tool where each row is a check item evaluated as pass/fail.
//
// Computes: total checks, pass count, fail count, compliance score (%).
// Clause checks: each item evaluated based on `compliant` field from seed table `hs_checklist`.
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

export interface HsCheckRow {
  clause: string
  description: string
  compliant: boolean
  evidence?: string
  responsiblePerson: string
}

export interface HsComplianceInput {
  projectName: string
  inspectionDate: string
  inspectorName: string
  siteId: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const hsCheckRowSchema = z.object({
  clause: z.string().min(1),
  description: z.string().min(1),
  compliant: z.boolean(),
  evidence: z.string().optional(),
  responsiblePerson: z.string().min(1),
})

export const hsComplianceInputSchema = z.object({
  projectName: z.string().min(1),
  inspectionDate: z.string().min(1),
  inspectorName: z.string().min(1),
  siteId: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const hsComplianceClauseSet: ClauseCheckDef<HsComplianceInput, HsCheckRow>[] = [
  {
    clauseRef: 'OHS-GEN-001',
    label: 'Minimum compliance threshold (≥80%)',
    evaluate: (ctx) => {
      const total = ctx.rows.length
      if (total === 0) {
        return {
          outcome: 'advisory',
          threshold: '≥80% compliance',
          actual: 'No checks recorded',
          note: 'No H&S check items recorded — cannot assess compliance.',
        }
      }
      const passCount = ctx.rows.filter((r) => r.compliant).length
      const score = Math.round((passCount / total) * 100)
      return {
        outcome: score >= 80 ? 'pass' : 'fail',
        threshold: '≥80% compliance',
        actual: `${score}% (${passCount}/${total})`,
        note:
          score < 80
            ? `Compliance score of ${score}% is below the 80% minimum threshold — corrective action required.`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'OHS-GEN-002',
    label: 'All non-compliant items have evidence/responsible person',
    evaluate: (ctx) => {
      const nonCompliant = ctx.rows.filter((r) => !r.compliant)
      const undocumented = nonCompliant.filter(
        (r) => !r.responsiblePerson || r.responsiblePerson.trim() === '',
      )
      return {
        outcome: undocumented.length === 0 ? 'pass' : 'advisory',
        threshold: '0 non-compliant items without responsible person',
        actual: `${undocumented.length} undocumented non-compliance(s)`,
        note:
          undocumented.length > 0
            ? `${undocumented.length} non-compliant item(s) lack a responsible person for rectification.`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this H&S checklist is a record-keeping and decision-support aid and does not replace a formal health and safety inspection by a registered H&S agent.',
  'Non-compliant items require corrective action and re-inspection before work may proceed in affected areas.',
]

function compute(ctx: ComputeContext<HsComplianceInput, HsCheckRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Compute per-row (pass-through with pass/fail status)
  const lineResults = rows.map((row) => ({
    clause: row.clause,
    description: row.description,
    compliant: row.compliant ? 1 : 0,
    evidence: row.evidence || '',
    responsiblePerson: row.responsiblePerson,
    status: row.compliant ? 'PASS' : 'FAIL',
  }))

  // Warn about non-compliant items
  rows.forEach((row, i) => {
    if (!row.compliant) {
      warnings.push(
        `Row ${i + 1} ("${row.clause}: ${row.description}") — NON-COMPLIANT. Responsible: ${row.responsiblePerson}.`,
      )
    }
  })

  // Aggregates
  const totalChecks = rows.length
  const passCount = rows.filter((r) => r.compliant).length
  const failCount = totalChecks - passCount
  const complianceScoreCalc = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 0

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(hsComplianceClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      inspectionDate: input.inspectionDate,
      inspectorName: input.inspectorName,
      siteId: input.siteId,
      totalChecks,
      passCount,
      failCount,
      complianceScore: complianceScoreCalc,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore: complianceScore ?? complianceScoreCalc,
    sourceVersions: [{ guideline: 'OHS Act / Construction Regulations', version: '2024.1' }],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

/** `hs_compliance_v1` — H&S Compliance Checklist Tool. */
export const hsComplianceV1: CalculatorDefinition<HsComplianceInput, HsCheckRow> =
  registerCalculatorDefinition<HsComplianceInput, HsCheckRow>({
    id: 'hs_compliance_v1',
    toolId: 'hs_compliance',
    title: 'H&S Compliance Checklist',
    method: 'clauseSet',
    inputSchema: hsComplianceInputSchema,
    scheduleSchema: hsCheckRowSchema,
    tableRefs: ['hs_checklist'],
    clauseSet: hsComplianceClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'OHS Act / Construction Regulations',
      version: '2024.1',
      status: 'mandatory',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
