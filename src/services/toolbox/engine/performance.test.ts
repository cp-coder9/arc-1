// Performance test — 500-row schedule recompute
//
// NFR: schedule recompute for up to 500 rows SHALL complete < 150 ms.
// Validates: Requirements 10.1, NFR performance.
//
// Uses `boq_takeoff_v1` as the schedule-based definition under test — it exercises
// per-row qty×rate computation, clause evaluation, and aggregate rollup.

import { describe, it, expect } from 'vitest'
import { runCalculator } from './runCalculator'
import { boqTakeoffV1 } from '../definitions/boqTakeoff'
import type { BoQRow } from '../definitions/boqTakeoff'

/** Generate N valid BoQ rows with realistic variation. */
function generate500Rows(n: number): BoQRow[] {
  const units: BoQRow['unit'][] = ['m²', 'm³', 'm', 'nr', 'kg', 'item']
  return Array.from({ length: n }, (_, i) => ({
    description: `Item ${i + 1} — ${units[i % units.length]} work`,
    unit: units[i % units.length],
    quantity: 1 + (i % 100),
    rate: 50 + (i % 200),
    rateBuildUp: i % 3 === 0
      ? { labour: 20 + (i % 50), material: 15 + (i % 30), plant: 10 + (i % 20) }
      : undefined,
  }))
}

describe('Performance — 500-row schedule recompute (NFR < 150 ms)', () => {
  const rows = generate500Rows(500)
  const input = { projectName: 'Perf Test Project', section: 'Structural', contingencyPercent: 10 }

  it('computes 500 rows within 150 ms', () => {
    const start = performance.now()
    const result = runCalculator(boqTakeoffV1, input, rows, { tables: [] })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(150)
    expect(result.lineResults).toHaveLength(500)
    expect(result.aggregates.itemCount).toBe(500)
    expect(result.aggregates.grandTotal).toBeGreaterThan(0)
  })

  it('recomputes the same 500 rows (simulating live schedule editing) within 150 ms', () => {
    // First pass to warm up any lazy paths
    runCalculator(boqTakeoffV1, input, rows, { tables: [] })

    // Second pass — the "recompute" case when a user edits then the grid re-runs
    const start = performance.now()
    const result = runCalculator(boqTakeoffV1, input, rows, { tables: [] })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(150)
    expect(result.lineResults).toHaveLength(500)
    expect(result.clauseResults.length).toBeGreaterThan(0)
  })

  it('correctly aggregates all 500 rows (no rounding drift)', () => {
    const result = runCalculator(boqTakeoffV1, input, rows, { tables: [] })

    // Manually compute expected subtotal
    const expectedSubtotal = rows.reduce((sum, r) => sum + r.quantity * r.rate, 0)
    const expectedContingency = expectedSubtotal * 0.1
    const expectedTotal = expectedSubtotal + expectedContingency

    expect(result.aggregates.subtotal).toBe(Math.round(expectedSubtotal * 100) / 100)
    expect(result.aggregates.contingencyAmount).toBe(Math.round(expectedContingency * 100) / 100)
    expect(result.aggregates.grandTotal).toBe(Math.round(expectedTotal * 100) / 100)
  })
})
