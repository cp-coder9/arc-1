// SANS 10400-XA building energy compliance calculator definition
//
// `xa_energy_compliance_v1` (toolId `xa_compliance_calc`) is the broader XA *building energy*
// check that the "XA Energy Compliance Calculator" tool advertises: it assesses the
// building envelope insulation (achieved roof + wall R-values) AND the glazing ratio in a
// single whole-building compliance pass.
//
// Reuse over duplication (Requirement 6.4):
//   - the envelope R-value minimums are read from the SAME versioned `xa_rvalue_minimums`
//     table the R-value calculator (`rvalue_calc_v1`) uses — the threshold data is shared,
//     never duplicated;
//   - the glazing ratio limit is read from the SAME versioned `xa_zone_limits` table the
//     fenestration exemplar (`xa_fenestration_v1`) uses;
//   - the run executes through the shared `runCalculator` engine and the clause result is
//     produced by the shared `evaluateClauseSet`.
//
// This definition is what the `xa_compliance_calc` registry tool points at via
// `calculatorDefinitionId`. The pre-existing `xa_fenestration_v1` (a deep, per-opening
// fenestration schedule) remains registered under its own id and is unaffected; this
// broader envelope+glazing summary is the cohesive fit for the energy-compliance tool.
//
// Requirements: 4.* (XA energy depth), 6.4 (reuse shared tables/engine), 8.1 (typed
// definition meeting Requirement 1), 10.1 (tests).

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
import type { RValueMinimumRow } from './rvalue'

interface ZoneLimitRow {
  zone: number
  zoneName: string
  maxGlazingRatioPct: number
  maxUValue: number
  maxShgc: number
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

/**
 * Whole-building energy inputs: the climate zone, the achieved roof/wall R-values (from the
 * envelope design — typically produced by the R-value calculator), and the total glazing
 * area against the net floor area for the glazing-ratio check.
 */
export const xaEnergyInputSchema = z.object({
  /** SANS 10400-XA climate zone (1–6). */
  climateZone: z.number().int().min(1).max(6),
  /** Achieved total roof/ceiling assembly R-value (m²·K/W). */
  roofRValue: z.number().positive(),
  /** Achieved total external-wall assembly R-value (m²·K/W). */
  wallRValue: z.number().positive(),
  /** Total glazed area of the building (m²). */
  totalGlazingAreaM2: z.number().min(0),
  /** Net floor area of the building (m²) — denominator for the glazing ratio. */
  netFloorAreaM2: z.number().positive(),
})
export type XaEnergyInput = z.infer<typeof xaEnergyInputSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function resolveMinimum(
  ctx: ComputeContext<XaEnergyInput>,
  element: 'roof' | 'wall',
): RValueMinimumRow {
  const table = ctx.tables.xa_rvalue_minimums as GuidelineTable<RValueMinimumRow>
  const row = table.rows.find((r) => r.zone === ctx.input.climateZone && r.element === element)
  if (!row) {
    throw new Error(`No xa_rvalue_minimums row for zone ${ctx.input.climateZone} / element ${element}`)
  }
  return row
}

function resolveZone(ctx: ComputeContext<XaEnergyInput>): ZoneLimitRow {
  const table = ctx.tables.xa_zone_limits as GuidelineTable<ZoneLimitRow>
  const row = table.rows.find((r) => r.zone === ctx.input.climateZone)
  if (!row) throw new Error(`No xa_zone_limits row for zone ${ctx.input.climateZone}`)
  return row
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

/**
 * The XA building-energy clause set: roof insulation, wall insulation, and glazing ratio.
 * Each check cites the zone-specific threshold read from the shared versioned tables
 * (Requirements 1.3, 4.2, 4.4).
 */
export const xaEnergyClauseSet: ClauseCheckDef<XaEnergyInput>[] = [
  {
    clauseRef: 'SANS 10400-XA 4.2.1',
    label: 'Roof/ceiling assembly achieves the minimum R-value',
    evaluate: (ctx) => {
      const min = resolveMinimum(ctx, 'roof')
      return {
        outcome: ctx.input.roofRValue >= min.minRValue ? 'pass' : 'fail',
        threshold: `>= ${min.minRValue} m²·K/W (zone ${min.zone} roof)`,
        actual: `${ctx.input.roofRValue.toFixed(2)} m²·K/W`,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-XA 4.2.2',
    label: 'External wall achieves the minimum R-value',
    evaluate: (ctx) => {
      const min = resolveMinimum(ctx, 'wall')
      return {
        outcome: ctx.input.wallRValue >= min.minRValue ? 'pass' : 'fail',
        threshold: `>= ${min.minRValue} m²·K/W (zone ${min.zone} wall)`,
        actual: `${ctx.input.wallRValue.toFixed(2)} m²·K/W`,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-XA 4.3.1',
    label: 'Total glazing area within prescriptive limit',
    evaluate: (ctx) => {
      const zone = resolveZone(ctx)
      const ratioPct = (ctx.input.totalGlazingAreaM2 / ctx.input.netFloorAreaM2) * 100
      return {
        outcome: ratioPct <= zone.maxGlazingRatioPct ? 'pass' : 'fail',
        threshold: `<= ${zone.maxGlazingRatioPct}% of net floor area (zone ${zone.zone} — ${zone.zoneName})`,
        actual: `${ratioPct.toFixed(1)}%`,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this energy compliance check is a decision-support aid and does not constitute statutory certification.',
  'A registered professional (e.g. SANS 10400-XA competent person) must review and sign off before municipal submission.',
  'Prescriptive (deemed-to-satisfy) route only; a rational energy assessment (SANS 10400-XA Annex / SANS 204) may yield a different outcome.',
]

function compute(ctx: ComputeContext<XaEnergyInput>): CalculationResult {
  const roofMin = resolveMinimum(ctx, 'roof')
  const wallMin = resolveMinimum(ctx, 'wall')
  const zone = resolveZone(ctx)
  const glazingRatioPct = (ctx.input.totalGlazingAreaM2 / ctx.input.netFloorAreaM2) * 100

  const aggregates: Record<string, number | string> = {
    climateZone: ctx.input.climateZone,
    zoneName: zone.zoneName,
    roofRValue: ctx.input.roofRValue,
    roofMinRValue: roofMin.minRValue,
    wallRValue: ctx.input.wallRValue,
    wallMinRValue: wallMin.minRValue,
    totalGlazingAreaM2: ctx.input.totalGlazingAreaM2,
    netFloorAreaM2: ctx.input.netFloorAreaM2,
    glazingRatioPct: Number(glazingRatioPct.toFixed(1)),
    maxGlazingRatioPct: zone.maxGlazingRatioPct,
  }

  const { clauseResults, complianceScore } = evaluateClauseSet(xaEnergyClauseSet, ctx)

  return {
    lineResults: [
      { element: 'roof', achieved: ctx.input.roofRValue, minimum: roofMin.minRValue },
      { element: 'wall', achieved: ctx.input.wallRValue, minimum: wallMin.minRValue },
      {
        element: 'glazing',
        achieved: Number(glazingRatioPct.toFixed(1)),
        minimum: zone.maxGlazingRatioPct,
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

/** `xa_energy_compliance_v1` — the SANS 10400-XA whole-building energy compliance check. */
export const xaEnergyComplianceV1: CalculatorDefinition<XaEnergyInput> =
  registerCalculatorDefinition<XaEnergyInput, Record<string, unknown>>({
    id: 'xa_energy_compliance_v1',
    toolId: 'xa_compliance_calc',
    title: 'SANS 10400-XA Building Energy Compliance',
    method: 'clauseSet',
    inputSchema: xaEnergyInputSchema,
    tableRefs: ['xa_rvalue_minimums', 'xa_zone_limits'],
    clauseSet: xaEnergyClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'SANS 10400-XA',
      version: '2021',
      status: 'mandatory',
      url: 'https://www.thensbc.org.za',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
