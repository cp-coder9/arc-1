import { describe, it, expect } from 'vitest'
import { computeConcreteBeam, computeConcreteSlab, computeConcreteColumn, computeConcreteAnchorage, computeConcreteCrackWidth, computeConcreteMinRebar } from './concreteDesign'
import { CONCRETE_BEAM_DEFAULTS, CONCRETE_SLAB_DEFAULTS, CONCRETE_COLUMN_DEFAULTS, CONCRETE_ANCHORAGE_DEFAULTS, CONCRETE_CRACK_WIDTH_DEFAULTS, CONCRETE_MIN_REBAR_DEFAULTS } from '../schemas/concreteDesign'

describe('Concrete Design Engine', () => {
  it('computeConcreteBeam returns valid output', () => {
    const result = computeConcreteBeam(CONCRETE_BEAM_DEFAULTS)
    expect(result.status).toMatch(/^(pass|warning|fail)$/)
    expect(result.derivation.length).toBeGreaterThan(0)
    expect(result.sansReferences).toContain('SANS 10100-1 §4.3.3')
  })

  it('computeConcreteSlab returns valid output', () => {
    const result = computeConcreteSlab(CONCRETE_SLAB_DEFAULTS)
    expect(result.status).toMatch(/^(pass|warning|fail)$/)
    expect(result.derivation.length).toBeGreaterThan(0)
  })

  it('computeConcreteColumn returns valid output', () => {
    const result = computeConcreteColumn(CONCRETE_COLUMN_DEFAULTS)
    expect(result.status).toMatch(/^(pass|warning|fail)$/)
    expect(result.sansReferences).toContain('SANS 10100-1 §4.7')
  })

  it('computeConcreteAnchorage returns valid output', () => {
    const result = computeConcreteAnchorage(CONCRETE_ANCHORAGE_DEFAULTS)
    expect(result.status).toMatch(/^(pass|warning|fail)$/)
    expect(result.sansReferences).toContain('SANS 10100-1 §5.8')
  })

  it('computeConcreteCrackWidth returns valid output', () => {
    const result = computeConcreteCrackWidth(CONCRETE_CRACK_WIDTH_DEFAULTS)
    expect(result.status).toMatch(/^(pass|warning|fail)$/)
    expect(result.sansReferences).toContain('SANS 10100-1 §3.8')
  })

  it('computeConcreteMinRebar returns valid output', () => {
    const result = computeConcreteMinRebar(CONCRETE_MIN_REBAR_DEFAULTS)
    expect(result.status).toBe('pass')
    expect(result.sansReferences).toContain('SANS 10100-1 Table 13')
  })
})
