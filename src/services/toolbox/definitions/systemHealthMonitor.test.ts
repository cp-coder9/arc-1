import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  systemHealthMonitorV1,
  systemHealthMonitorInputSchema,
  systemHealthMonitorRowSchema,
} from './systemHealthMonitor'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(systemHealthMonitorV1, input, rows, { tables: [] })
}

describe('system_health_monitor_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = systemHealthMonitorInputSchema.safeParse({
      adminUser: 'admin@test.com',
      checkTime: '2024-06-15T10:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty checkTime', () => {
    const result = systemHealthMonitorInputSchema.safeParse({
      adminUser: 'admin',
      checkTime: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = systemHealthMonitorRowSchema.safeParse({
      service: 'api-gateway',
      status: 'healthy',
      responseTimeMs: 45,
      lastCheck: '2024-06-15T10:00:00Z',
      errorRate: 0.1,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = systemHealthMonitorRowSchema.safeParse({
      service: 'api-gateway',
      status: 'unknown',
      responseTimeMs: 45,
      lastCheck: '2024-06-15T10:00:00Z',
      errorRate: 0.1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative responseTimeMs', () => {
    const result = systemHealthMonitorRowSchema.safeParse({
      service: 'api-gateway',
      status: 'healthy',
      responseTimeMs: -1,
      lastCheck: '2024-06-15T10:00:00Z',
      errorRate: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('system_health_monitor_v1 — computation', () => {
  it('counts services by status', () => {
    const result = run(
      { adminUser: 'admin', checkTime: '2024-06-15T10:00:00Z' },
      [
        { service: 'api', status: 'healthy', responseTimeMs: 50, lastCheck: '2024-06-15T10:00:00Z', errorRate: 0 },
        { service: 'db', status: 'healthy', responseTimeMs: 20, lastCheck: '2024-06-15T10:00:00Z', errorRate: 0 },
        { service: 'cache', status: 'degraded', responseTimeMs: 200, lastCheck: '2024-06-15T10:00:00Z', errorRate: 5 },
        { service: 'worker', status: 'down', responseTimeMs: 0, lastCheck: '2024-06-15T09:00:00Z', errorRate: 100 },
      ],
    )
    expect(result.aggregates.totalServices).toBe(4)
    expect(result.aggregates.healthyCount).toBe(2)
    expect(result.aggregates.degradedCount).toBe(1)
    expect(result.aggregates.downCount).toBe(1)
  })

  it('computes average response time', () => {
    const result = run(
      { adminUser: 'admin', checkTime: '2024-06-15T10:00:00Z' },
      [
        { service: 'api', status: 'healthy', responseTimeMs: 100, lastCheck: '2024-06-15T10:00:00Z', errorRate: 0 },
        { service: 'db', status: 'healthy', responseTimeMs: 200, lastCheck: '2024-06-15T10:00:00Z', errorRate: 0 },
      ],
    )
    expect(result.aggregates.avgResponseTimeMs).toBe(150)
  })
})

describe('system_health_monitor_v1 — clause checks', () => {
  it('passes when all services healthy', () => {
    const result = run(
      { adminUser: 'admin', checkTime: '2024-06-15T10:00:00Z' },
      [
        { service: 'api', status: 'healthy', responseTimeMs: 50, lastCheck: '2024-06-15T10:00:00Z', errorRate: 0 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SHM-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when a service is degraded', () => {
    const result = run(
      { adminUser: 'admin', checkTime: '2024-06-15T10:00:00Z' },
      [
        { service: 'api', status: 'healthy', responseTimeMs: 50, lastCheck: '2024-06-15T10:00:00Z', errorRate: 0 },
        { service: 'cache', status: 'degraded', responseTimeMs: 500, lastCheck: '2024-06-15T10:00:00Z', errorRate: 10 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SHM-001')
    expect(clause?.outcome).toBe('fail')
  })
})

describe('system_health_monitor_v1 — registration', () => {
  it('is registered with correct toolId and status', () => {
    expect(getCalculatorDefinition('system_health_monitor_v1')).toBe(systemHealthMonitorV1)
    expect(systemHealthMonitorV1.toolId).toBe('system_health_monitor')
    expect(systemHealthMonitorV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(systemHealthMonitorV1.scheduleSchema).toBeDefined()
  })
})
