import { describe, it, expect } from 'vitest'
import {
  type ClauseCheckDef,
  type ClauseResult,
  type ComputeContext,
} from '../types'
import {
  evaluateClauseSet,
  computeComplianceScore,
} from './evaluateClauseSet'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface XaInput {
  glazingPercent: number // whole-building glazing % of floor area
  uValue: number // worst-case glazing U-value (W/m²K)
}

/** Minimal compute context — clause checks read off `input` here. */
function ctxOf(input: XaInput): ComputeContext<XaInput> {
  return {
    input,
    rows: [],
    tables: {},
    jurisdiction: 'ZA',
  }
}

const GLAZING_LIMIT = 15 // % — fail when actual exceeds this
const U_VALUE_LIMIT = 5.0 // W/m²K — fail when actual exceeds this

/** Glazing % check: pass when ≤ limit, fail when > limit (boundary is inclusive pass). */
const glazingClause: ClauseCheckDef<XaInput> = {
  clauseRef: 'SANS 10400-XA 4.3.2',
  label: 'Maximum glazing area',
  evaluate: (ctx) => {
    const actual = ctx.input.glazingPercent
    return {
      outcome: actual <= GLAZING_LIMIT ? 'pass' : 'fail',
      threshold: `≤ ${GLAZING_LIMIT}%`,
      actual: `${actual}%`,
    }
  },
}

/** U-value check: pass when ≤ limit, fail when > limit. */
const uValueClause: ClauseCheckDef<XaInput> = {
  clauseRef: 'SANS 10400-XA 4.3.3',
  label: 'Glazing U-value',
  evaluate: (ctx) => {
    const actual = ctx.input.uValue
    return {
      outcome: actual <= U_VALUE_LIMIT ? 'pass' : 'fail',
      threshold: `≤ ${U_VALUE_LIMIT} W/m²K`,
      actual: `${actual} W/m²K`,
    }
  },
}

/** Always-advisory check (e.g. recommended external shading). */
const shadingAdvisoryClause: ClauseCheckDef<XaInput> = {
  clauseRef: 'SANS 10400-XA 4.3.4',
  label: 'External shading (recommended)',
  evaluate: () => ({
    outcome: 'advisory',
    threshold: 'Recommended',
    actual: 'Not assessed',
    note: 'Consider external shading on north/west facades.',
  }),
}

// ---------------------------------------------------------------------------
// Clause citation output
// ---------------------------------------------------------------------------

describe('evaluateClauseSet — clause citation output', () => {
  it('preserves clauseRef and label from the definition on each result', () => {
    const { clauseResults } = evaluateClauseSet(
      [glazingClause, uValueClause, shadingAdvisoryClause],
      ctxOf({ glazingPercent: 10, uValue: 4.0 }),
    )

    expect(clauseResults).toHaveLength(3)
    expect(clauseResults[0]).toMatchObject({
      clauseRef: 'SANS 10400-XA 4.3.2',
      label: 'Maximum glazing area',
      threshold: '≤ 15%',
      actual: '10%',
    })
    expect(clauseResults[1].clauseRef).toBe('SANS 10400-XA 4.3.3')
    expect(clauseResults[2].clauseRef).toBe('SANS 10400-XA 4.3.4')
  })

  it('keeps results in the same order as the clause set', () => {
    const { clauseResults } = evaluateClauseSet(
      [uValueClause, glazingClause],
      ctxOf({ glazingPercent: 10, uValue: 4.0 }),
    )
    expect(clauseResults.map((r) => r.clauseRef)).toEqual([
      'SANS 10400-XA 4.3.3',
      'SANS 10400-XA 4.3.2',
    ])
  })

  it('includes a note only when the evaluate function provides one', () => {
    const { clauseResults } = evaluateClauseSet(
      [glazingClause, shadingAdvisoryClause],
      ctxOf({ glazingPercent: 10, uValue: 4.0 }),
    )
    expect(clauseResults[0].note).toBeUndefined()
    expect(clauseResults[1].note).toBe('Consider external shading on north/west facades.')
  })

  it('lets an evaluate function override clauseRef/label for sub-clause spans', () => {
    const overridingClause: ClauseCheckDef<XaInput> = {
      clauseRef: 'SANS 10400-XA 4.3',
      label: 'Fenestration',
      evaluate: () => ({
        outcome: 'pass',
        threshold: 'n/a',
        actual: 'n/a',
        clauseRef: 'SANS 10400-XA 4.3.2(a)',
        label: 'Glazing sub-clause',
      }),
    }
    const { clauseResults } = evaluateClauseSet([overridingClause], ctxOf({ glazingPercent: 5, uValue: 3 }))
    expect(clauseResults[0].clauseRef).toBe('SANS 10400-XA 4.3.2(a)')
    expect(clauseResults[0].label).toBe('Glazing sub-clause')
  })
})

// ---------------------------------------------------------------------------
// Pass / fail / advisory boundary cases
// ---------------------------------------------------------------------------

describe('evaluateClauseSet — pass/fail boundaries', () => {
  it('passes exactly at the threshold (inclusive boundary)', () => {
    const { clauseResults } = evaluateClauseSet(
      [glazingClause],
      ctxOf({ glazingPercent: GLAZING_LIMIT, uValue: 0 }),
    )
    expect(clauseResults[0].outcome).toBe('pass')
  })

  it('fails just above the threshold', () => {
    const { clauseResults } = evaluateClauseSet(
      [glazingClause],
      ctxOf({ glazingPercent: GLAZING_LIMIT + 0.01, uValue: 0 }),
    )
    expect(clauseResults[0].outcome).toBe('fail')
  })

  it('reports advisory outcomes verbatim', () => {
    const { clauseResults } = evaluateClauseSet(
      [shadingAdvisoryClause],
      ctxOf({ glazingPercent: 0, uValue: 0 }),
    )
    expect(clauseResults[0].outcome).toBe('advisory')
  })
})

// ---------------------------------------------------------------------------
// Compliance score
// ---------------------------------------------------------------------------

describe('evaluateClauseSet — compliance score', () => {
  it('is 100 when all non-advisory clauses pass', () => {
    const { complianceScore } = evaluateClauseSet(
      [glazingClause, uValueClause],
      ctxOf({ glazingPercent: 10, uValue: 4.0 }),
    )
    expect(complianceScore).toBe(100)
  })

  it('is 0 when all non-advisory clauses fail', () => {
    const { complianceScore } = evaluateClauseSet(
      [glazingClause, uValueClause],
      ctxOf({ glazingPercent: 50, uValue: 9.0 }),
    )
    expect(complianceScore).toBe(0)
  })

  it('is the pass rate of non-advisory clauses (1 of 2 pass → 50)', () => {
    const { complianceScore } = evaluateClauseSet(
      [glazingClause, uValueClause],
      ctxOf({ glazingPercent: 10, uValue: 9.0 }), // glazing pass, U-value fail
    )
    expect(complianceScore).toBe(50)
  })

  it('rounds to the nearest integer (2 of 3 pass → 67)', () => {
    const failClause: ClauseCheckDef<XaInput> = {
      clauseRef: 'X.1',
      label: 'extra',
      evaluate: () => ({ outcome: 'fail', threshold: 'n/a', actual: 'n/a' }),
    }
    const passClause: ClauseCheckDef<XaInput> = {
      clauseRef: 'X.2',
      label: 'extra2',
      evaluate: () => ({ outcome: 'pass', threshold: 'n/a', actual: 'n/a' }),
    }
    const { complianceScore } = evaluateClauseSet(
      [passClause, passClause, failClause],
      ctxOf({ glazingPercent: 0, uValue: 0 }),
    )
    expect(complianceScore).toBe(67)
  })

  it('excludes advisory clauses from the score denominator', () => {
    // 1 pass, 1 fail, 1 advisory → 1/2 = 50 (advisory ignored)
    const { complianceScore } = evaluateClauseSet(
      [glazingClause, uValueClause, shadingAdvisoryClause],
      ctxOf({ glazingPercent: 10, uValue: 9.0 }),
    )
    expect(complianceScore).toBe(50)
  })

  it('is vacuously 100 for an empty clause set', () => {
    const { clauseResults, complianceScore } = evaluateClauseSet(
      [] as ClauseCheckDef<XaInput>[],
      ctxOf({ glazingPercent: 0, uValue: 0 }),
    )
    expect(clauseResults).toHaveLength(0)
    expect(complianceScore).toBe(100)
  })

  it('is vacuously 100 when every clause is advisory', () => {
    const { complianceScore } = evaluateClauseSet(
      [shadingAdvisoryClause, shadingAdvisoryClause],
      ctxOf({ glazingPercent: 0, uValue: 0 }),
    )
    expect(complianceScore).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// computeComplianceScore (direct unit coverage)
// ---------------------------------------------------------------------------

describe('computeComplianceScore', () => {
  const r = (outcome: ClauseResult['outcome']): ClauseResult => ({
    clauseRef: 'c',
    label: 'l',
    outcome,
    threshold: 't',
    actual: 'a',
  })

  it('returns 100 for an empty list', () => {
    expect(computeComplianceScore([])).toBe(100)
  })

  it('returns 100 for all-advisory lists', () => {
    expect(computeComplianceScore([r('advisory'), r('advisory')])).toBe(100)
  })

  it('computes pass rate ignoring advisory rows', () => {
    expect(computeComplianceScore([r('pass'), r('fail'), r('advisory')])).toBe(50)
  })

  it('is bounded in [0, 100]', () => {
    expect(computeComplianceScore([r('pass'), r('pass')])).toBe(100)
    expect(computeComplianceScore([r('fail'), r('fail')])).toBe(0)
  })
})
