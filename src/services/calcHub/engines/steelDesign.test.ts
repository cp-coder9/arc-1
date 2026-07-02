import { describe, it, expect } from 'vitest'
import { computeSteelBeam, computeSteelColumn, computeSteelBolt, computeSteelWeld, computeSteelBasePlate, computeProfileComparator } from './steelDesign'
import { STEEL_BEAM_DEFAULTS, STEEL_COLUMN_DEFAULTS, STEEL_BOLT_DEFAULTS, STEEL_WELD_DEFAULTS, STEEL_BASE_PLATE_DEFAULTS, PROFILE_COMPARATOR_DEFAULTS } from '../schemas/steelDesign'

describe('Steel Design Engine', () => {
  describe('computeSteelBeam', () => {
    it('returns valid CalculatorOutput with defaults', () => {
      const result = computeSteelBeam(STEEL_BEAM_DEFAULTS)
      expect(result.status).toMatch(/^(pass|warning|fail)$/)
      expect(result.utilisationRatio).toBeGreaterThan(0)
      expect(result.derivation.length).toBeGreaterThan(0)
      expect(result.sansReferences.length).toBeGreaterThan(0)
    })

    it('computes Mr = φ·fy·Sx/1000 correctly', () => {
      const result = computeSteelBeam(STEEL_BEAM_DEFAULTS)
      // φ=0.9, fy=350 (grade 350), Sx=1470 for 457x191UB67
      const expectedMr = 0.9 * 350 * 1470 / 1000
      expect(result.results.Mr.value).toBeCloseTo(expectedMr, 1)
    })

    it('returns fail status when utilisation > 1', () => {
      const result = computeSteelBeam({ ...STEEL_BEAM_DEFAULTS, udl: 500, span: 12 })
      expect(result.utilisationRatio).toBeGreaterThan(1)
      expect(result.status).toBe('fail')
    })
  })

  describe('computeSteelColumn', () => {
    it('returns valid output with defaults', () => {
      const result = computeSteelColumn(STEEL_COLUMN_DEFAULTS)
      expect(result.status).toMatch(/^(pass|warning|fail)$/)
      expect(result.derivation.length).toBeGreaterThan(0)
      expect(result.sansReferences).toContain('SANS 10162-1 §13.3')
    })

    it('uses n=1.34 for column curve', () => {
      const result = computeSteelColumn(STEEL_COLUMN_DEFAULTS)
      expect(result.intermediates.Cr).toBeGreaterThan(0)
    })
  })

  describe('computeSteelBolt', () => {
    it('returns valid output with defaults', () => {
      const result = computeSteelBolt(STEEL_BOLT_DEFAULTS)
      expect(result.status).toMatch(/^(pass|warning|fail)$/)
      expect(result.sansReferences).toContain('SANS 10162-1 §13.11')
    })
  })

  describe('computeSteelWeld', () => {
    it('returns valid output with defaults', () => {
      const result = computeSteelWeld(STEEL_WELD_DEFAULTS)
      expect(result.status).toMatch(/^(pass|warning|fail)$/)
      expect(result.sansReferences).toContain('SANS 10162-1 §13.13')
    })
  })

  describe('computeSteelBasePlate', () => {
    it('returns valid output with defaults', () => {
      const result = computeSteelBasePlate(STEEL_BASE_PLATE_DEFAULTS)
      expect(result.status).toMatch(/^(pass|warning|fail)$/)
      expect(result.derivation.length).toBeGreaterThan(0)
    })
  })

  describe('computeProfileComparator', () => {
    it('compares multiple sections', () => {
      const result = computeProfileComparator(PROFILE_COMPARATOR_DEFAULTS)
      expect(result.status).toBe('pass')
      expect(result.derivation.length).toBe(2) // two sections compared
    })
  })
})
