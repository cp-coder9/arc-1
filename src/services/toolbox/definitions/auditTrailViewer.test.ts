import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  auditTrailViewerV1,
  auditTrailViewerInputSchema,
  auditTrailViewerRowSchema,
} from './auditTrailViewer'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(auditTrailViewerV1, input, rows, { tables: [] })
}

describe('audit_trail_viewer_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = auditTrailViewerInputSchema.safeParse({
      adminUser: 'admin@test.com',
      dateFrom: '2024-01-01',
      dateTo: '2024-06-30',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty dateFrom', () => {
    const result = auditTrailViewerInputSchema.safeParse({
      adminUser: 'admin',
      dateFrom: '',
      dateTo: '2024-06-30',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = auditTrailViewerRowSchema.safeParse({
      timestamp: '2024-06-01T10:00:00Z',
      actor: 'user@test.com',
      action: 'create',
      resource: 'project/123',
      details: 'Created project',
    })
    expect(result.success).toBe(true)
  })
})

describe('audit_trail_viewer_v1 — computation', () => {
  it('counts events and unique actors', () => {
    const result = run(
      { adminUser: 'admin', dateFrom: '2024-01-01', dateTo: '2024-06-30' },
      [
        { timestamp: '2024-01-01T10:00:00Z', actor: 'user1', action: 'create', resource: 'proj/1', details: '' },
        { timestamp: '2024-01-02T10:00:00Z', actor: 'user2', action: 'update', resource: 'proj/1', details: '' },
        { timestamp: '2024-01-03T10:00:00Z', actor: 'user1', action: 'delete', resource: 'proj/2', details: '' },
      ],
    )
    expect(result.aggregates.totalEvents).toBe(3)
    expect(result.aggregates.uniqueActors).toBe(2)
  })

  it('groups actions by type', () => {
    const result = run(
      { adminUser: 'admin', dateFrom: '2024-01-01', dateTo: '2024-06-30' },
      [
        { timestamp: '2024-01-01T10:00:00Z', actor: 'user1', action: 'create', resource: 'proj/1', details: '' },
        { timestamp: '2024-01-02T10:00:00Z', actor: 'user1', action: 'create', resource: 'proj/2', details: '' },
        { timestamp: '2024-01-03T10:00:00Z', actor: 'user2', action: 'update', resource: 'proj/1', details: '' },
      ],
    )
    const summary = JSON.parse(result.aggregates.actionsSummary as string)
    expect(summary.create).toBe(2)
    expect(summary.update).toBe(1)
  })
})

describe('audit_trail_viewer_v1 — clause checks', () => {
  it('always passes (read-only viewer)', () => {
    const result = run(
      { adminUser: 'admin', dateFrom: '2024-01-01', dateTo: '2024-06-30' },
      [{ timestamp: '2024-01-01T10:00:00Z', actor: 'user1', action: 'create', resource: 'proj/1', details: '' }],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'ATV-001')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('audit_trail_viewer_v1 — registration', () => {
  it('is registered with correct toolId and status', () => {
    expect(getCalculatorDefinition('audit_trail_viewer_v1')).toBe(auditTrailViewerV1)
    expect(auditTrailViewerV1.toolId).toBe('audit_trail_viewer')
    expect(auditTrailViewerV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(auditTrailViewerV1.scheduleSchema).toBeDefined()
  })
})
