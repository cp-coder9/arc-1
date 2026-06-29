// System Health Monitor calculator definition
//
// `system_health_monitor_v1` (toolId `system_health_monitor`) — a schedule-based admin view
// for system health metrics. Each row represents a service with status, response time,
// last check time, and error rate.
//
// Computes: total services, healthy count, degraded/down count.
// Clause checks: all services healthy.
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

export type ServiceStatus = 'healthy' | 'degraded' | 'down'

export interface SystemHealthMonitorRow {
  service: string
  status: ServiceStatus
  responseTimeMs: number
  lastCheck: string
  errorRate: number
}

export interface SystemHealthMonitorInput {
  adminUser: string
  checkTime: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const systemHealthMonitorRowSchema = z.object({
  service: z.string().min(1),
  status: z.enum(['healthy', 'degraded', 'down']),
  responseTimeMs: z.number().min(0),
  lastCheck: z.string().min(1),
  errorRate: z.number().min(0).max(100),
})

export const systemHealthMonitorInputSchema = z.object({
  adminUser: z.string().min(1),
  checkTime: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const systemHealthMonitorClauseSet: ClauseCheckDef<SystemHealthMonitorInput, SystemHealthMonitorRow>[] = [
  {
    clauseRef: 'SHM-001',
    label: 'All services healthy',
    evaluate: (ctx) => {
      const unhealthy = ctx.rows.filter((r) => r.status !== 'healthy')
      return {
        outcome: unhealthy.length === 0 ? 'pass' : 'fail',
        threshold: '0 unhealthy services',
        actual: `${unhealthy.length} unhealthy service(s)`,
        note:
          unhealthy.length > 0
            ? `Unhealthy services: ${unhealthy.map((r) => `${r.service} (${r.status})`).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'System health monitoring — status reflects last check time. Real-time checks may differ.',
]

function compute(ctx: ComputeContext<SystemHealthMonitorInput, SystemHealthMonitorRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    service: row.service,
    status: row.status,
    responseTimeMs: row.responseTimeMs,
    lastCheck: row.lastCheck,
    errorRate: row.errorRate,
  }))

  const healthyCount = rows.filter((r) => r.status === 'healthy').length
  const degradedCount = rows.filter((r) => r.status === 'degraded').length
  const downCount = rows.filter((r) => r.status === 'down').length

  // Average response time
  const avgResponseTime =
    rows.length > 0
      ? Math.round(rows.reduce((sum, r) => sum + r.responseTimeMs, 0) / rows.length)
      : 0

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(systemHealthMonitorClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      adminUser: input.adminUser,
      checkTime: input.checkTime,
      totalServices: rows.length,
      healthyCount,
      degradedCount,
      downCount,
      avgResponseTimeMs: avgResponseTime,
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

export const systemHealthMonitorV1: CalculatorDefinition<SystemHealthMonitorInput, SystemHealthMonitorRow> =
  registerCalculatorDefinition<SystemHealthMonitorInput, SystemHealthMonitorRow>({
    id: 'system_health_monitor_v1',
    toolId: 'system_health_monitor',
    title: 'System Health & Audit Monitor',
    method: 'hybrid',
    inputSchema: systemHealthMonitorInputSchema,
    scheduleSchema: systemHealthMonitorRowSchema,
    tableRefs: [],
    clauseSet: systemHealthMonitorClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Platform Operations Policy',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
