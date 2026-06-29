// Rational fire design worksheet calculator definition
//
// `fire_rational_design_v1` (toolId `fire_rational_design`) evaluates fire design
// parameters for a rational fire engineering assessment: fire load classification,
// calculated fire duration vs structural resistance, and ventilation adequacy.
//
// Reuse over duplication (Requirement 6.4): shares `sans_10400_t_thresholds` with
// `fire_compliance_check_v1` for cross-reference; uses its own `fire_rational_parameters`
// table for load-based duration calculations.
//
// Requirements: 6.1, 6.2, 6.3, 6.4, 8.1.

import { z } from 'zod'
import type {
  CalculationResult,
  CalculatorDefinition,
  ClauseCheckDef,
  ClauseResult,
  ComputeContext,
  GuidelineTable,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface FireRationalRow {
  category: string
  label: string
  minFireLoadMJm2: number
  maxFireLoadMJm2: number | null
  baseDurationMin: number
  durationFactorPerMJm2: number
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

export const fireRationalInputSchema = z.object({
  /** Design fire load in MJ/m². */
  designFireLoadMJm2: z.number().min(0),
  /** Compartment length (m). */
  compartmentLengthM: z.number().positive(),
  /** Compartment width (m). */
  compartmentWidthM: z.number().positive(),
  /** Compartment height (m). */
  compartmentHeightM: z.number().positive(),
  /** Total ventilation opening area (m²). */
  ventilationOpeningAreaM2: z.number().min(0),
  /** Structural fire resistance provided (minutes). */
  structuralFireResistanceMin: z.number().min(0),
  /** Fire regime: fuel-controlled or ventilation-controlled. */
  fireRegime: z.enum(['fuel_controlled', 'ventilation_controlled']),
})
export type FireRationalInput = z.infer<typeof fireRationalInputSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function resolveCategory(ctx: ComputeContext<FireRationalInput>): FireRationalRow {
  const table = ctx.tables.fire_rational_parameters as GuidelineTable<FireRationalRow>
  const load = ctx.input.designFireLoadMJm2
  const row = table.rows.find(
    (r) => load >= r.minFireLoadMJm2 && (r.maxFireLoadMJm2 === null || load < r.maxFireLoadMJm2),
  )
  if (!row) {
    throw new Error(`No fire_rational_parameters row for fire load ${load} MJ/m²`)
  }
  return row
}

/** Calculate fire duration based on fire load and category parameters. */
function calculateFireDuration(input: FireRationalInput, cat: FireRationalRow): number {
  return cat.baseDurationMin + cat.durationFactorPerMJm2 * input.designFireLoadMJm2
}

/** Ventilation factor (Av√h / At) — simplified Thomas model check. */
function calculateVentilationFactor(input: FireRationalInput): number {
  const floorArea = input.compartmentLengthM * input.compartmentWidthM
  const wallArea =
    2 * (input.compartmentLengthM + input.compartmentWidthM) * input.compartmentHeightM
  const totalSurfaceArea = 2 * floorArea + wallArea
  const avSqrtH = input.ventilationOpeningAreaM2 * Math.sqrt(input.compartmentHeightM)
  return avSqrtH / totalSurfaceArea
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const fireRationalClauseSet: ClauseCheckDef<FireRationalInput>[] = [
  {
    clauseRef: 'Rational Fire 3.1',
    label: 'Fire load within classified range',
    evaluate: (ctx) => {
      const cat = resolveCategory(ctx)
      const upper = cat.maxFireLoadMJm2
      return {
        outcome: 'pass',
        threshold: upper !== null
          ? `${cat.minFireLoadMJm2}–${upper} MJ/m² (${cat.label})`
          : `>= ${cat.minFireLoadMJm2} MJ/m² (${cat.label})`,
        actual: `${ctx.input.designFireLoadMJm2} MJ/m²`,
        note: `Classified as: ${cat.label}`,
      }
    },
  },
  {
    clauseRef: 'Rational Fire 3.2',
    label: 'Structural fire resistance exceeds calculated duration',
    evaluate: (ctx) => {
      const cat = resolveCategory(ctx)
      const duration = calculateFireDuration(ctx.input, cat)
      return {
        outcome: ctx.input.structuralFireResistanceMin >= duration ? 'pass' : 'fail',
        threshold: `>= ${duration.toFixed(0)} min (calculated fire duration)`,
        actual: `${ctx.input.structuralFireResistanceMin} min`,
      }
    },
  },
  {
    clauseRef: 'Rational Fire 3.3',
    label: 'Ventilation adequacy for fire regime',
    evaluate: (ctx) => {
      const vf = calculateVentilationFactor(ctx.input)
      // A ventilation factor > 0.04 is generally considered ventilation-controlled territory
      const isVentControlled = vf < 0.04
      const regimeMatch =
        (ctx.input.fireRegime === 'ventilation_controlled' && isVentControlled) ||
        (ctx.input.fireRegime === 'fuel_controlled' && !isVentControlled)
      return {
        outcome: regimeMatch ? 'pass' : 'advisory',
        threshold: ctx.input.fireRegime === 'ventilation_controlled'
          ? 'Ventilation factor < 0.04 (confirms ventilation-controlled)'
          : 'Ventilation factor >= 0.04 (confirms fuel-controlled)',
        actual: `Ventilation factor = ${vf.toFixed(4)}`,
        note: regimeMatch
          ? 'Declared fire regime matches calculated ventilation factor.'
          : 'Declared regime does not match calculated ventilation factor — review design assumptions.',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this rational fire design worksheet is a decision-support tool and does not constitute a fire engineering report.',
  'A registered fire engineer (Pr.Eng / Pr.Tech Eng) must prepare and sign the formal rational fire design.',
  'Simplified duration model — detailed time-temperature analysis (parametric fire curves) may yield different results.',
]

function compute(ctx: ComputeContext<FireRationalInput>): CalculationResult {
  const cat = resolveCategory(ctx)
  const duration = calculateFireDuration(ctx.input, cat)
  const ventilationFactor = calculateVentilationFactor(ctx.input)
  const floorArea = ctx.input.compartmentLengthM * ctx.input.compartmentWidthM

  const { clauseResults, complianceScore } = evaluateClauseSet(fireRationalClauseSet, ctx)

  return {
    lineResults: [],
    aggregates: {
      designFireLoadMJm2: ctx.input.designFireLoadMJm2,
      fireLoadCategory: cat.label,
      calculatedDurationMin: Number(duration.toFixed(0)),
      structuralFireResistanceMin: ctx.input.structuralFireResistanceMin,
      resistanceAdequacy: ctx.input.structuralFireResistanceMin >= duration ? 'Adequate' : 'Inadequate',
      compartmentFloorAreaM2: Number(floorArea.toFixed(1)),
      ventilationFactor: Number(ventilationFactor.toFixed(4)),
      fireRegime: ctx.input.fireRegime,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings: [],
  }
}

/** `fire_rational_design_v1` — Rational fire design worksheet. */
export const fireRationalDesignV1: CalculatorDefinition<FireRationalInput> =
  registerCalculatorDefinition<FireRationalInput, Record<string, unknown>>({
    id: 'fire_rational_design_v1',
    toolId: 'fire_rational_design',
    title: 'Rational Fire Design Worksheet',
    method: 'clauseSet',
    inputSchema: fireRationalInputSchema,
    tableRefs: ['fire_rational_parameters', 'sans_10400_t_thresholds'],
    clauseSet: fireRationalClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'SANS 10400-T / Rational Fire Design',
      version: '2012',
      status: 'mandatory',
      url: 'https://www.thensbc.org.za',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
