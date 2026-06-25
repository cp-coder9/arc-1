// Audit Trail Viewer calculator definition
//
// `audit_trail_viewer_v1` (toolId `audit_trail_viewer`) — a read-only schedule-based admin
// view for audit log entries. Each row represents an audit event with timestamp, actor,
// action, resource, and details.
//
// Computes: total events, actions by type, unique actors.
// Clause checks: always passes (read-only viewer).
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

export interface AuditTrailViewerRow {
  timestamp: string
  actor: string
  action: string
  resource: string
  details: string
}

export interface AuditTrailViewerInput {
  adminUser: string
  dateFrom: string
  dateTo: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const auditTrailViewerRowSchema = z.object({
  timestamp: z.string().min(1),
  actor: z.string().min(1),
  action: z.string().min(1),
  resource: z.string().min(1),
  details: z.string(),
})

export const auditTrailViewerInputSchema = z.object({
  adminUser: z.string().min(1),
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const auditTrailViewerClauseSet: ClauseCheckDef<AuditTrailViewerInput, AuditTrailViewerRow>[] = [
  {
    clauseRef: 'ATV-001',
    label: 'Audit log accessible',
    evaluate: () => {
      // Read-only viewer — always passes
      return {
        outcome: 'pass',
        threshold: 'Log accessible',
        actual: 'Log accessible',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Read-only audit log viewer — no modifications are permitted through this interface.',
]

function compute(ctx: ComputeContext<AuditTrailViewerInput, AuditTrailViewerRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    timestamp: row.timestamp,
    actor: row.actor,
    action: row.action,
    resource: row.resource,
    details: row.details,
  }))

  // Actions by type
  const actionCounts: Record<string, number> = {}
  for (const row of rows) {
    actionCounts[row.action] = (actionCounts[row.action] || 0) + 1
  }

  // Unique actors
  const uniqueActors = new Set(rows.map((r) => r.actor)).size

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(auditTrailViewerClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      adminUser: input.adminUser,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      totalEvents: rows.length,
      uniqueActors,
      actionsSummary: JSON.stringify(actionCounts),
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

export const auditTrailViewerV1: CalculatorDefinition<AuditTrailViewerInput, AuditTrailViewerRow> =
  registerCalculatorDefinition<AuditTrailViewerInput, AuditTrailViewerRow>({
    id: 'audit_trail_viewer_v1',
    toolId: 'audit_trail_viewer',
    title: 'Audit Trail Viewer',
    method: 'hybrid',
    inputSchema: auditTrailViewerInputSchema,
    scheduleSchema: auditTrailViewerRowSchema,
    tableRefs: [],
    clauseSet: auditTrailViewerClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Platform Audit Policy',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
