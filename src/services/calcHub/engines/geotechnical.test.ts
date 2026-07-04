import { describe, it, expect } from 'vitest'
import { computeBearingCapacity, computePadFooting, computeRetainingWall, computePileCapacity } from './geotechnical'
import { BEARING_CAPACITY_DEFAULTS, PAD_FOOTING_DEFAULTS, RETAINING_WALL_DEFAULTS, PILE_CAPACITY_DEFAULTS } from '../schemas/geotechnical'

describe('Geotechnical Engine', () => {
  it('computeBearingCapacity with Terzaghi method', () => {
    const result = computeBearingCapacity(BEARING_CAPACITY_DEFAULTS)
    expect(result.status).toMatch(/^(pass|warning|fail)$/)
    expect(result.results.ultimateBearingCapacity.value).toBeGreaterThan(0)
    expect(result.results.allowableBearingPressure.value).toBeGreaterThan(0)
  })

  it('computePadFooting sizes footing', () => {
    const result = computePadFooting(PAD_FOOTING_DEFAULTS)
    expect(result.results.footingSideLength.value).toBeGreaterThan(0)
    expect(result.results.requiredReinforcement.value).toBeGreaterThan(0)
  })

  it('computeRetainingWall checks stability', () => {
    const result = computeRetainingWall(RETAINING_WALL_DEFAULTS)
    expect(result.results.FoS_overturning.value).toBeGreaterThan(0)
    expect(result.results.FoS_sliding.value).toBeGreaterThan(0)
  })

  it('computePileCapacity calculates end-bearing + shaft', () => {
    const result = computePileCapacity(PILE_CAPACITY_DEFAULTS)
    expect(result.results.endBearing.value).toBeGreaterThan(0)
    expect(result.results.shaftFriction.value).toBeGreaterThan(0)
    expect(result.results.ultimateCapacity.value).toBeGreaterThan(
      result.results.endBearing.value
    )
  })
})
