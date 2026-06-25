// Energy Performance Certificate (EPC) preparation calculator definition
//
// `energy_certificate_v1` (toolId `energy_certificate`) prepares the core figures behind a
// building Energy Performance Certificate: it takes the measured annual energy use and net
// floor area, computes the energy-use intensity (kWh/m²/annum), compares it against the
// versioned maximum norm for the building type, and assigns an indicative A–G rating band.
//
// Reuse, not duplication (Requirement 6.4 / 8.1):
//   - the per-building-type energy norms are read from the versioned `epc_energy_thresholds`
//     table and the rating band cut-offs from `epc_rating_bands` — no hard-coded constants
//     (Requirement 3.1, design Property 2);
//   - the run executes through the shared `runCalculator` engine and the compliance clause is
//     produced by the shared `evaluateClauseSet`.
//
// Requirements: 4.* (energy depth), 8.1 (typed definition meeting Requirement 1),
// 1.3 (pass/fail with the cited threshold), 10.1 (tests).

import { z } from 'zod'
import {
  type CalculationResult,
  type CalculatorDefinition,
  type ClauseCheckDef,
  type ClauseResult,
  type ComputeContext,
  type GuidelineTable,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Table row shapes
// ----------------------------------------------------------------------------

/** A row of `epc_energy_thresholds`: the maximum energy norm for one building type. */
interface EnergyThresholdRow {
  buildingType: string
  label: string
  maxKwhM2Year: number
}

/** A row of `epc_rating_bands`: a band and its inclusive upper ratio bound (null = open). */
interface RatingBandRow {
  band: string
  label: string
  maxRatio: number | null
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

/** Building-use classes with a published energy norm. */
export const BUILDING_TYPES = ['office', 'retail', 'education', 'hospitality', 'residential'] as const
export type BuildingType = (typeof BUILDING_TYPES)[number]

/**
 * EPC inputs: the building type (selects the norm), the net floor area, and the measured
 * annual energy consumption.
 */
export const energyCertificateInputSchema = z.object({
  /** Building-use class (selects the applicable energy norm). */
  buildingType: z.enum(BUILDING_TYPES),
  /** Net floor area (m²) — the denominator for energy-use intensity. */
  netFloorAreaM2: z.number().positive(),
  /** Measured annual energy consumption (kWh/annum). */
  annualEnergyKwh: z.number().min(0),
})
export type EnergyCertificateInput = z.infer<typeof energyCertificateInputSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function resolveThreshold(ctx: ComputeContext<EnergyCertificateInput>): EnergyThresholdRow {
  const table = ctx.tables.epc_energy_thresholds as GuidelineTable<EnergyThresholdRow>
  const row = table.rows.find((r) => r.buildingType === ctx.input.buildingType)
  if (!row) throw new Error(`No epc_energy_thresholds row for building type "${ctx.input.buildingType}"`)
  return row
}

/** Energy-use intensity (kWh/m²/annum) for the building. */
function energyIntensity(input: EnergyCertificateInput): number {
  return input.annualEnergyKwh / input.netFloorAreaM2
}

/**
 * Assign the rating band for a performance ratio (actual ÷ norm). Bands are evaluated in
 * ascending `maxRatio` order; the first band whose bound the ratio does not exceed wins,
 * and the open-ended band (maxRatio null) catches the worst performers.
 */
export function resolveRatingBand(
  ratio: number,
  table: GuidelineTable<RatingBandRow>,
): RatingBandRow {
  const sorted = [...table.rows].sort((a, b) => {
    const av = a.maxRatio ?? Number.POSITIVE_INFINITY
    const bv = b.maxRatio ?? Number.POSITIVE_INFINITY
    return av - bv
  })
  for (const band of sorted) {
    if (band.maxRatio === null || ratio <= band.maxRatio) return band
  }
  return sorted[sorted.length - 1]
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

/**
 * The EPC clause set: the building's energy-use intensity must not exceed the published norm
 * for its type (Requirements 1.3 — pass/fail with the cited threshold).
 */
export const energyCertificateClauseSet: ClauseCheckDef<EnergyCertificateInput>[] = [
  {
    clauseRef: 'SANS 1544 / Energy Performance Certificate',
    label: 'Energy-use intensity within the building-type norm',
    evaluate: (ctx) => {
      const threshold = resolveThreshold(ctx)
      const intensity = energyIntensity(ctx.input)
      return {
        outcome: intensity <= threshold.maxKwhM2Year ? 'pass' : 'fail',
        threshold: `<= ${threshold.maxKwhM2Year} kWh/m²/annum (${threshold.label})`,
        actual: `${intensity.toFixed(1)} kWh/m²/annum`,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this worksheet prepares Energy Performance Certificate inputs and does not constitute an issued certificate.',
  'An accredited EPC inspection body must verify the data and issue the statutory certificate.',
  'Energy norms and rating bands are indicative defaults; confirm against the current gazetted values for the building class.',
]

function compute(ctx: ComputeContext<EnergyCertificateInput>): CalculationResult {
  const threshold = resolveThreshold(ctx)
  const bandsTable = ctx.tables.epc_rating_bands as GuidelineTable<RatingBandRow>
  const intensity = energyIntensity(ctx.input)
  const ratio = intensity / threshold.maxKwhM2Year
  const band = resolveRatingBand(ratio, bandsTable)

  const aggregates: Record<string, number | string> = {
    buildingType: ctx.input.buildingType,
    netFloorAreaM2: ctx.input.netFloorAreaM2,
    annualEnergyKwh: ctx.input.annualEnergyKwh,
    energyIntensityKwhM2Year: Number(intensity.toFixed(1)),
    thresholdKwhM2Year: threshold.maxKwhM2Year,
    performanceRatio: Number(ratio.toFixed(3)),
    ratingBand: band.band,
    ratingLabel: band.label,
  }

  const { clauseResults, complianceScore } = evaluateClauseSet(energyCertificateClauseSet, ctx)

  return {
    lineResults: [
      {
        metric: 'Energy-use intensity',
        value: Number(intensity.toFixed(1)),
        unit: 'kWh/m²/annum',
        benchmark: threshold.maxKwhM2Year,
      },
    ],
    aggregates,
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings: [],
  }
}

/** `energy_certificate_v1` — the Energy Performance Certificate preparation worksheet. */
export const energyCertificateV1: CalculatorDefinition<EnergyCertificateInput> =
  registerCalculatorDefinition<EnergyCertificateInput, Record<string, unknown>>({
    id: 'energy_certificate_v1',
    toolId: 'energy_certificate',
    title: 'Energy Performance Certificate Preparation',
    method: 'clauseSet',
    inputSchema: energyCertificateInputSchema,
    tableRefs: ['epc_energy_thresholds', 'epc_rating_bands'],
    clauseSet: energyCertificateClauseSet as ClauseCheckDef[],
    compute: compute as CalculatorDefinition['compute'],
    reportTemplateId: 'default',
    source: {
      guideline: 'SANS 1544',
      version: '2014',
      status: 'mandatory',
      url: 'https://www.sabs.co.za',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
