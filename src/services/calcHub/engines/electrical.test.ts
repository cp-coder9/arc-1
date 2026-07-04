import { describe, it, expect } from 'vitest'
import { computeCableSizing, computeVoltageDrop, computeShortCircuit, computeMaxDemand } from './electrical'
import { CABLE_SIZING_DEFAULTS, VOLTAGE_DROP_DEFAULTS, SHORT_CIRCUIT_DEFAULTS, MAX_DEMAND_DEFAULTS } from '../schemas/electrical'

describe('Electrical Engine', () => {
  it('computeCableSizing selects appropriate cable', () => {
    const result = computeCableSizing(CABLE_SIZING_DEFAULTS)
    expect(result.status).toMatch(/^(pass|warning|fail)$/)
    expect(result.results.selectedCableSize.value).toBeGreaterThan(0)
    expect(result.sansReferences).toContain('SANS 10142-1')
  })

  it('computeVoltageDrop checks within 5%', () => {
    const result = computeVoltageDrop(VOLTAGE_DROP_DEFAULTS)
    expect(result.status).toMatch(/^(pass|warning|fail)$/)
    expect(result.results.voltageDropPercent.value).toBeGreaterThan(0)
  })

  it('computeShortCircuit returns fault current', () => {
    const result = computeShortCircuit(SHORT_CIRCUIT_DEFAULTS)
    expect(result.results.Isc.value).toBeGreaterThan(0)
  })

  it('computeMaxDemand sums with diversity', () => {
    const result = computeMaxDemand(MAX_DEMAND_DEFAULTS)
    expect(result.results.totalMaxDemand.value).toBeLessThan(result.results.totalConnectedLoad.value)
    expect(result.results.requiredDBRating.value).toBeGreaterThan(0)
  })
})
