import { describe, it, expect } from 'vitest'
import { computeRationalMethod, computePipeSizing, computeAttenuation } from './stormwater'
import { RATIONAL_METHOD_DEFAULTS, PIPE_SIZING_DEFAULTS, ATTENUATION_DEFAULTS } from '../schemas/stormwater'

describe('Stormwater Engine', () => {
  describe('computeRationalMethod', () => {
    it('computes Q = C·I·A/3.6 correctly with defaults', () => {
      const result = computeRationalMethod(RATIONAL_METHOD_DEFAULTS)
      const expectedQ = (0.65 * 80 * 2.5) / 3.6
      expect(result.results.peakRunoff.value).toBeCloseTo(expectedQ, 3)
      expect(result.results.peakRunoff.unit).toBe('m³/s')
    })

    it('returns valid CalculatorOutput shape', () => {
      const result = computeRationalMethod(RATIONAL_METHOD_DEFAULTS)
      expect(result.status).toMatch(/^(pass|warning|fail)$/)
      expect(result.utilisationRatio).toBeGreaterThanOrEqual(0)
      expect(result.derivation.length).toBeGreaterThan(0)
      expect(result.sansReferences.length).toBeGreaterThan(0)
    })

    it('computes Q = 0 when runoff coefficient is 0', () => {
      const result = computeRationalMethod({
        runoffCoefficient: 0,
        rainfallIntensity: 100,
        catchmentArea: 5,
      })
      expect(result.results.peakRunoff.value).toBe(0)
    })

    it('scales linearly with each parameter', () => {
      const base = computeRationalMethod({ runoffCoefficient: 0.5, rainfallIntensity: 60, catchmentArea: 1 })
      const doubled = computeRationalMethod({ runoffCoefficient: 0.5, rainfallIntensity: 120, catchmentArea: 1 })
      expect(doubled.results.peakRunoff.value).toBeCloseTo(base.results.peakRunoff.value * 2, 3)
    })
  })

  describe('computePipeSizing', () => {
    it('returns a standard pipe diameter >= theoretical', () => {
      const result = computePipeSizing(PIPE_SIZING_DEFAULTS)
      expect(result.results.standardDiameter.value).toBeGreaterThanOrEqual(
        result.results.theoreticalDiameter.value
      )
    })

    it('has pipe capacity >= design flow', () => {
      const result = computePipeSizing(PIPE_SIZING_DEFAULTS)
      expect(result.results.pipeCapacity.value).toBeGreaterThanOrEqual(PIPE_SIZING_DEFAULTS.designFlow)
    })

    it('returns valid CalculatorOutput shape', () => {
      const result = computePipeSizing(PIPE_SIZING_DEFAULTS)
      expect(result.status).toMatch(/^(pass|warning|fail)$/)
      expect(result.utilisationRatio).toBeGreaterThan(0)
      expect(result.utilisationRatio).toBeLessThanOrEqual(1)
      expect(result.derivation.length).toBeGreaterThan(0)
      expect(result.sansReferences.length).toBeGreaterThan(0)
    })

    it('larger flow requires larger pipe', () => {
      const small = computePipeSizing({ ...PIPE_SIZING_DEFAULTS, designFlow: 0.05 })
      const large = computePipeSizing({ ...PIPE_SIZING_DEFAULTS, designFlow: 0.5 })
      expect(large.results.theoreticalDiameter.value).toBeGreaterThan(
        small.results.theoreticalDiameter.value
      )
    })
  })

  describe('computeAttenuation', () => {
    it('computes V = 0.5 × (Qpost - Qallow) × T × 3600 correctly', () => {
      const result = computeAttenuation(ATTENUATION_DEFAULTS)
      const expectedV = 0.5 * (0.45 - 0.25) * 1.5 * 3600
      expect(result.results.storageVolume.value).toBeCloseTo(expectedV, 1)
    })

    it('returns zero storage when post <= allowable', () => {
      const result = computeAttenuation({
        preDevelopmentPeak: 0.2,
        postDevelopmentPeak: 0.2,
        allowableOutflow: 0.25,
        stormDuration: 1,
      })
      expect(result.results.storageVolume.value).toBe(0)
    })

    it('returns valid CalculatorOutput shape', () => {
      const result = computeAttenuation(ATTENUATION_DEFAULTS)
      expect(result.status).toMatch(/^(pass|warning|fail)$/)
      expect(result.utilisationRatio).toBeGreaterThan(0)
      expect(result.derivation.length).toBeGreaterThan(0)
      expect(result.sansReferences.length).toBeGreaterThan(0)
    })

    it('storage scales linearly with storm duration', () => {
      const short = computeAttenuation({ ...ATTENUATION_DEFAULTS, stormDuration: 1 })
      const long = computeAttenuation({ ...ATTENUATION_DEFAULTS, stormDuration: 2 })
      expect(long.results.storageVolume.value).toBeCloseTo(
        short.results.storageVolume.value * 2,
        1
      )
    })
  })
})
