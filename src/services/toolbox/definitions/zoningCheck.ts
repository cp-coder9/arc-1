// Zoning compliance checker calculator definition
//
// `zoning_check_v1` (toolId `zoning_check`) evaluates a development proposal against
// zoning scheme parameters: coverage %, FAR (floor area ratio), height restriction,
// setback compliance, and parking provision.
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

export interface ZoningSchemeRow {
  zone: string
  label: string
  maxCoveragePct: number
  maxFAR: number
  maxHeightM: number
  maxStoreys: number
  frontSetbackM: number
  sideSetbackM: number
  rearSetbackM: number
  parkingPerUnit: number
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

export const zoningInputSchema = z.object({
  /** Zoning scheme key (e.g. "residential_1", "business_2"). */
  zoningScheme: z.string().min(1),
  /** Plot area (m²). */
  plotAreaM2: z.number().positive(),
  /** Building footprint area (m²). */
  buildingFootprintM2: z.number().positive(),
  /** Total floor area across all storeys (m²). */
  totalFloorAreaM2: z.number().positive(),
  /** Number of storeys. */
  numberOfStoreys: z.number().int().min(1),
  /** Building height (m). */
  buildingHeightM: z.number().positive(),
  /** Front setback provided (m). */
  frontSetbackM: z.number().min(0),
  /** Side setback provided (m). */
  sideSetbackM: z.number().min(0),
  /** Rear setback provided (m). */
  rearSetbackM: z.number().min(0),
  /** Number of parking spaces provided. */
  parkingSpaces: z.number().int().min(0),
  /** Number of dwelling/tenancy units (for parking calculation). */
  numberOfUnits: z.number().int().min(1),
})
export type ZoningInput = z.infer<typeof zoningInputSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function resolveZone(ctx: ComputeContext<ZoningInput>): ZoningSchemeRow {
  const table = ctx.tables.zoning_scheme_parameters as GuidelineTable<ZoningSchemeRow>
  const row = table.rows.find(
    (r) => r.zone.toLowerCase() === ctx.input.zoningScheme.toLowerCase(),
  )
  if (!row) {
    throw new Error(
      `No zoning_scheme_parameters row for zone "${ctx.input.zoningScheme}"`,
    )
  }
  return row
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const zoningClauseSet: ClauseCheckDef<ZoningInput>[] = [
  {
    clauseRef: 'Zoning 2.1',
    label: 'Coverage within limit',
    evaluate: (ctx) => {
      const z = resolveZone(ctx)
      const coveragePct = (ctx.input.buildingFootprintM2 / ctx.input.plotAreaM2) * 100
      return {
        outcome: coveragePct <= z.maxCoveragePct ? 'pass' : 'fail',
        threshold: `<= ${z.maxCoveragePct}% (${z.label})`,
        actual: `${coveragePct.toFixed(1)}%`,
      }
    },
  },
  {
    clauseRef: 'Zoning 2.2',
    label: 'Floor Area Ratio (FAR) within limit',
    evaluate: (ctx) => {
      const z = resolveZone(ctx)
      const far = ctx.input.totalFloorAreaM2 / ctx.input.plotAreaM2
      return {
        outcome: far <= z.maxFAR ? 'pass' : 'fail',
        threshold: `<= ${z.maxFAR} (${z.label})`,
        actual: `${far.toFixed(2)}`,
      }
    },
  },
  {
    clauseRef: 'Zoning 2.3',
    label: 'Building height within restriction',
    evaluate: (ctx) => {
      const z = resolveZone(ctx)
      const heightOk = ctx.input.buildingHeightM <= z.maxHeightM
      const storeysOk = ctx.input.numberOfStoreys <= z.maxStoreys
      return {
        outcome: heightOk && storeysOk ? 'pass' : 'fail',
        threshold: `<= ${z.maxHeightM} m / ${z.maxStoreys} storeys (${z.label})`,
        actual: `${ctx.input.buildingHeightM} m / ${ctx.input.numberOfStoreys} storeys`,
      }
    },
  },
  {
    clauseRef: 'Zoning 2.4',
    label: 'Setback compliance',
    evaluate: (ctx) => {
      const z = resolveZone(ctx)
      const frontOk = ctx.input.frontSetbackM >= z.frontSetbackM
      const sideOk = ctx.input.sideSetbackM >= z.sideSetbackM
      const rearOk = ctx.input.rearSetbackM >= z.rearSetbackM
      const allOk = frontOk && sideOk && rearOk
      const issues: string[] = []
      if (!frontOk) issues.push(`front: ${ctx.input.frontSetbackM}m < ${z.frontSetbackM}m`)
      if (!sideOk) issues.push(`side: ${ctx.input.sideSetbackM}m < ${z.sideSetbackM}m`)
      if (!rearOk) issues.push(`rear: ${ctx.input.rearSetbackM}m < ${z.rearSetbackM}m`)
      return {
        outcome: allOk ? 'pass' : 'fail',
        threshold: `Front >= ${z.frontSetbackM}m, Side >= ${z.sideSetbackM}m, Rear >= ${z.rearSetbackM}m`,
        actual: `Front ${ctx.input.frontSetbackM}m, Side ${ctx.input.sideSetbackM}m, Rear ${ctx.input.rearSetbackM}m`,
        note: issues.length > 0 ? `Shortfalls: ${issues.join('; ')}` : undefined,
      }
    },
  },
  {
    clauseRef: 'Zoning 2.5',
    label: 'Parking provision adequate',
    evaluate: (ctx) => {
      const z = resolveZone(ctx)
      const requiredSpaces = Math.ceil(z.parkingPerUnit * ctx.input.numberOfUnits)
      return {
        outcome: ctx.input.parkingSpaces >= requiredSpaces ? 'pass' : 'fail',
        threshold: `>= ${requiredSpaces} spaces (${z.parkingPerUnit}/unit × ${ctx.input.numberOfUnits} units)`,
        actual: `${ctx.input.parkingSpaces} spaces`,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this zoning check is a decision-support aid and does not replace a formal town planning assessment.',
  'A registered town planner or competent professional must confirm zoning compliance before submission.',
  'Specific municipal zoning schemes may have additional or amended requirements — verify with the local authority.',
]

function compute(ctx: ComputeContext<ZoningInput>): CalculationResult {
  const zone = resolveZone(ctx)
  const coveragePct = (ctx.input.buildingFootprintM2 / ctx.input.plotAreaM2) * 100
  const far = ctx.input.totalFloorAreaM2 / ctx.input.plotAreaM2
  const requiredParking = Math.ceil(zone.parkingPerUnit * ctx.input.numberOfUnits)

  const { clauseResults, complianceScore } = evaluateClauseSet(zoningClauseSet, ctx)

  return {
    lineResults: [],
    aggregates: {
      zoningScheme: ctx.input.zoningScheme,
      zoneLabel: zone.label,
      coveragePct: Number(coveragePct.toFixed(1)),
      maxCoveragePct: zone.maxCoveragePct,
      far: Number(far.toFixed(2)),
      maxFAR: zone.maxFAR,
      buildingHeightM: ctx.input.buildingHeightM,
      maxHeightM: zone.maxHeightM,
      numberOfStoreys: ctx.input.numberOfStoreys,
      maxStoreys: zone.maxStoreys,
      parkingSpaces: ctx.input.parkingSpaces,
      requiredParking,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings: [],
  }
}

/** `zoning_check_v1` — Zoning compliance checker. */
export const zoningCheckV1: CalculatorDefinition<ZoningInput> =
  registerCalculatorDefinition<ZoningInput, Record<string, unknown>>({
    id: 'zoning_check_v1',
    toolId: 'zoning_check',
    title: 'Zoning Compliance Checker',
    method: 'clauseSet',
    inputSchema: zoningInputSchema,
    tableRefs: ['zoning_scheme_parameters'],
    clauseSet: zoningClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Municipal Zoning Schemes',
      version: '2024',
      status: 'indicative',
      url: 'https://www.cogta.gov.za',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
