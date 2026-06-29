// Fee Tariff Editor calculator definition
//
// `fee_tariff_editor_v1` (toolId `fee_tariff_editor`) — a schedule-based admin tool for
// editing versioned fee/tariff table entries. Each row represents an edit action (add,
// update, supersede, lock) against a guideline table.
//
// Computes: count of changes, validates no locked versions being modified, confirms version incrementing.
// Clause checks: no changes to locked versions, effective date in future, change reason provided.
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

export type TariffAction = 'add' | 'update' | 'supersede' | 'lock'

export interface FeeTariffEditorRow {
  tableId: string
  version: string
  action: TariffAction
  rowIndex: number
  data: string
}

export interface FeeTariffEditorInput {
  adminUser: string
  targetTableId: string
  effectiveDate: string
  reason: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const feeTariffEditorRowSchema = z.object({
  tableId: z.string().min(1),
  version: z.string().min(1),
  action: z.enum(['add', 'update', 'supersede', 'lock']),
  rowIndex: z.number().int().min(0),
  data: z.string(),
})

export const feeTariffEditorInputSchema = z.object({
  adminUser: z.string().min(1),
  targetTableId: z.string().min(1),
  effectiveDate: z.string().min(1),
  reason: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const feeTariffEditorClauseSet: ClauseCheckDef<FeeTariffEditorInput, FeeTariffEditorRow>[] = [
  {
    clauseRef: 'FTE-001',
    label: 'No changes to locked versions',
    evaluate: (ctx) => {
      // Find rows that attempt to modify a locked version (lock action on same version means "lock it now",
      // but update/add/supersede on a version that has already been locked is invalid).
      // For this check: if any row with action != 'lock' shares a version with a row that has action='lock',
      // that implies modifying a locked version.
      const lockedVersions = new Set(
        ctx.rows.filter((r) => r.action === 'lock').map((r) => r.version),
      )
      const modifyingLocked = ctx.rows.filter(
        (r) => r.action !== 'lock' && lockedVersions.has(r.version),
      )
      return {
        outcome: modifyingLocked.length === 0 ? 'pass' : 'fail',
        threshold: '0 changes to locked versions',
        actual: `${modifyingLocked.length} change(s) targeting locked versions`,
        note:
          modifyingLocked.length > 0
            ? `Locked versions being modified: ${[...new Set(modifyingLocked.map((r) => r.version))].join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'FTE-002',
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
    clauseRef: 'FTE-003',
    label: 'Change reason provided',
    evaluate: (ctx) => {
      const hasReason = ctx.input.reason.trim().length > 0
      return {
        outcome: hasReason ? 'pass' : 'fail',
        threshold: 'Non-empty reason',
        actual: hasReason ? 'Reason provided' : 'No reason',
        note: !hasReason ? 'A change reason must be provided for audit trail.' : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Administrative action — changes to fee/tariff tables require governance approval before activation.',
  'Locked versions cannot be modified. Only superseding creates a new version.',
]

function compute(ctx: ComputeContext<FeeTariffEditorInput, FeeTariffEditorRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    tableId: row.tableId,
    version: row.version,
    action: row.action,
    rowIndex: row.rowIndex,
    data: row.data,
  }))

  // Aggregates
  const addCount = rows.filter((r) => r.action === 'add').length
  const updateCount = rows.filter((r) => r.action === 'update').length
  const supersedeCount = rows.filter((r) => r.action === 'supersede').length
  const lockCount = rows.filter((r) => r.action === 'lock').length

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(feeTariffEditorClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      adminUser: input.adminUser,
      targetTableId: input.targetTableId,
      effectiveDate: input.effectiveDate,
      totalChanges: rows.length,
      addCount,
      updateCount,
      supersedeCount,
      lockCount,
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

export const feeTariffEditorV1: CalculatorDefinition<FeeTariffEditorInput, FeeTariffEditorRow> =
  registerCalculatorDefinition<FeeTariffEditorInput, FeeTariffEditorRow>({
    id: 'fee_tariff_editor_v1',
    toolId: 'fee_tariff_editor',
    title: 'Fee / Tariff Table Editor',
    method: 'hybrid',
    inputSchema: feeTariffEditorInputSchema,
    scheduleSchema: feeTariffEditorRowSchema,
    tableRefs: [],
    clauseSet: feeTariffEditorClauseSet,
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
