import { describe, it, expect } from 'vitest'
import { CalculatorError, type GuidelineTable } from '../types'
import { resolveTable, resolveTables } from './tableResolver'

// Three versions of one table: v1 (superseded by v2), v2 (superseded by v3), v3 (live).
const zoneLimitsV1: GuidelineTable = {
  id: 'xa_zone_limits',
  version: '1.0.0',
  effectiveFrom: '2022-01-01',
  supersededBy: '2.0.0',
  jurisdiction: 'ZA',
  rows: [{ zone: 1, maxGlazingRatio: 0.12 }],
}
const zoneLimitsV2: GuidelineTable = {
  id: 'xa_zone_limits',
  version: '2.0.0',
  effectiveFrom: '2023-06-01',
  supersededBy: '3.0.0',
  jurisdiction: 'ZA',
  rows: [{ zone: 1, maxGlazingRatio: 0.14 }],
}
const zoneLimitsV3: GuidelineTable = {
  id: 'xa_zone_limits',
  version: '3.0.0',
  effectiveFrom: '2024-09-01',
  jurisdiction: 'ZA',
  rows: [{ zone: 1, maxGlazingRatio: 0.15 }],
}
const glazingProps: GuidelineTable = {
  id: 'glazing_props',
  version: '1.0.0',
  effectiveFrom: '2024-01-01',
  jurisdiction: 'ZA',
  rows: [{ type: 'double', uValue: 2.8 }],
}

const allTables = [zoneLimitsV1, zoneLimitsV2, zoneLimitsV3, glazingProps]

describe('resolveTable — latest semantics', () => {
  it('resolves to the latest non-superseded version by default', () => {
    const resolved = resolveTable('xa_zone_limits', allTables)
    expect(resolved.version).toBe('3.0.0')
  })

  it('falls back to the latest effectiveFrom when all versions are superseded', () => {
    // Edge: a misconfigured set where every version carries supersededBy.
    const onlySuperseded = [zoneLimitsV1, zoneLimitsV2]
    const resolved = resolveTable('xa_zone_limits', onlySuperseded)
    expect(resolved.version).toBe('2.0.0')
  })

  it('respects asOf — picks the latest version effective on/before the date', () => {
    const resolved = resolveTable('xa_zone_limits', allTables, undefined, '2023-12-31')
    // v3 is effective 2024-09-01 (after asOf), so v2 is the latest applicable.
    expect(resolved.version).toBe('2.0.0')
  })
})

describe('resolveTable — pinned semantics', () => {
  it('resolves to the exact pinned version even when superseded', () => {
    const resolved = resolveTable('xa_zone_limits', allTables, '1.0.0')
    expect(resolved.version).toBe('1.0.0')
    expect(resolved.rows[0]).toMatchObject({ maxGlazingRatio: 0.12 })
  })
})

describe('resolveTable — failures', () => {
  it('throws MISSING_TABLE when the id is not registered', () => {
    try {
      resolveTable('does_not_exist', allTables)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalculatorError)
      expect((e as CalculatorError).code).toBe('MISSING_TABLE')
    }
  })

  it('throws MISSING_TABLE_VERSION when a pinned version is absent', () => {
    try {
      resolveTable('xa_zone_limits', allTables, '9.9.9')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalculatorError)
      expect((e as CalculatorError).code).toBe('MISSING_TABLE_VERSION')
      expect((e as CalculatorError).details).toMatchObject({ requestedVersion: '9.9.9' })
    }
  })

  it('throws MISSING_TABLE_VERSION when no version is effective as of the date', () => {
    try {
      resolveTable('xa_zone_limits', allTables, undefined, '2000-01-01')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalculatorError)
      expect((e as CalculatorError).code).toBe('MISSING_TABLE_VERSION')
    }
  })
})

describe('resolveTables — multiple refs', () => {
  it('resolves every requested table id into a version-pinned map', () => {
    const resolved = resolveTables({
      tableRefs: ['xa_zone_limits', 'glazing_props'],
      available: allTables,
    })
    expect(resolved.xa_zone_limits.version).toBe('3.0.0')
    expect(resolved.glazing_props.version).toBe('1.0.0')
  })

  it('honours per-id pinned versions while resolving others to latest', () => {
    const resolved = resolveTables({
      tableRefs: ['xa_zone_limits', 'glazing_props'],
      available: allTables,
      pinned: { xa_zone_limits: '1.0.0' },
    })
    expect(resolved.xa_zone_limits.version).toBe('1.0.0')
    expect(resolved.glazing_props.version).toBe('1.0.0')
  })

  it('propagates a MISSING_TABLE failure for an unknown ref', () => {
    expect(() =>
      resolveTables({ tableRefs: ['xa_zone_limits', 'ghost'], available: allTables }),
    ).toThrowError(CalculatorError)
  })
})
