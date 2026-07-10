// SANS 10400-T fire compliance checklist calculator definition
//
// `fire_compliance_check_v1` (toolId `fire_compliance_check`) evaluates building fire safety
// compliance against SANS 10400-T occupancy-based thresholds: escape route travel distance,
// exit width sufficiency, fire resistance rating, compartment floor area limits, and
// sprinkler requirement.
//
// Reuse over duplication (Requirement 6.4): the `sans_10400_t_thresholds` table is shared
// with `fire_rational_design_v1` for occupancy-based lookups.
//
// Requirements: 6.1, 6.2, 6.3, 6.4, 8.1.

import { z } from 'zod'
import {
  CalculatorError,
  type CalculationResult,
  type CalculatorDefinition,
  type ClauseCheckDef,
  type ClauseResult,
  type ComputeContext,
  type GuidelineTable,
  type GuidelineVersionRef,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface FireThresholdRow {
  occupancy: string
  label: string
  maxTravelDistanceM: number
  minExitWidthMmPerPerson: number
  minFireResistanceMin: number
  maxCompartmentAreaM2: number | null
  sprinklerRequired: boolean
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

export const fireComplianceInputSchema = z.object({
  /** Building occupancy class (e.g. "A1", "G1", "H4"). */
  occupancyClass: z.string().min(1),
  /** Total floor area of the largest compartment (m²). */
  floorAreaM2: z.number().positive(),
  /** Number of storeys. */
  numberOfStoreys: z.number().int().min(1),
  /** Measured/designed travel distance to the nearest exit (m). */
  travelDistanceM: z.number().min(0),
  /** Provided fire resistance rating of the building structure (minutes). */
  fireResistanceRatingMin: z.number().min(0),
  /** Total exit width provided (mm). */
  exitWidthMm: z.number().min(0),
  /** Number of occupants served by the exit(s). */
  occupantCount: z.number().int().min(1),
  /** Whether the building is sprinklered. */
  sprinklered: z.boolean(),
})
export type FireComplianceInput = z.infer<typeof fireComplianceInputSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function resolveThreshold(ctx: ComputeContext<FireComplianceInput>): FireThresholdRow {
  const table = ctx.tables.sans_10400_t_thresholds as GuidelineTable<FireThresholdRow> | undefined
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    throw new CalculatorError('MISSING_TABLE', 'Guideline table "sans_10400_t_thresholds" not found or empty.', {
      tableId: 'sans_10400_t_thresholds',
    })
  }
  const row = table.rows.find(
    (r) => r.occupancy.toUpperCase() === ctx.input.occupancyClass.toUpperCase(),
  )
  if (!row) {
    throw new CalculatorError('MISSING_TABLE_VERSION', `No sans_10400_t_thresholds row for occupancy class "${ctx.input.occupancyClass}".`, {
      tableId: 'sans_10400_t_thresholds',
      occupancyClass: ctx.input.occupancyClass,
    })
  }
  return row
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const fireComplianceClauseSet: ClauseCheckDef<FireComplianceInput>[] = [
  {
    clauseRef: 'SANS 10400-T 4.5',
    label: 'Escape route travel distance within limit',
    evaluate: (ctx) => {
      const t = resolveThreshold(ctx)
      return {
        outcome: ctx.input.travelDistanceM <= t.maxTravelDistanceM ? 'pass' : 'fail',
        threshold: `<= ${t.maxTravelDistanceM} m (${t.occupancy} — ${t.label})`,
        actual: `${ctx.input.travelDistanceM} m`,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-T 4.6',
    label: 'Exit width sufficient for occupant load',
    evaluate: (ctx) => {
      const t = resolveThreshold(ctx)
      const requiredWidthMm = t.minExitWidthMmPerPerson * ctx.input.occupantCount
      return {
        outcome: ctx.input.exitWidthMm >= requiredWidthMm ? 'pass' : 'fail',
        threshold: `>= ${requiredWidthMm} mm (${t.minExitWidthMmPerPerson} mm/person × ${ctx.input.occupantCount})`,
        actual: `${ctx.input.exitWidthMm} mm`,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-T 4.3',
    label: 'Fire resistance rating meets minimum',
    evaluate: (ctx) => {
      const t = resolveThreshold(ctx)
      return {
        outcome: ctx.input.fireResistanceRatingMin >= t.minFireResistanceMin ? 'pass' : 'fail',
        threshold: `>= ${t.minFireResistanceMin} min (${t.occupancy})`,
        actual: `${ctx.input.fireResistanceRatingMin} min`,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-T 4.4',
    label: 'Compartment floor area within limit',
    evaluate: (ctx) => {
      const t = resolveThreshold(ctx)
      if (t.maxCompartmentAreaM2 === null) {
        return {
          outcome: 'pass',
          threshold: 'No limit (dwelling house)',
          actual: `${ctx.input.floorAreaM2} m²`,
          note: 'Dwelling houses have no prescriptive compartment area limit.',
        }
      }
      return {
        outcome: ctx.input.floorAreaM2 <= t.maxCompartmentAreaM2 ? 'pass' : 'fail',
        threshold: `<= ${t.maxCompartmentAreaM2} m² (${t.occupancy})`,
        actual: `${ctx.input.floorAreaM2} m²`,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-T 4.7',
    label: 'Sprinkler provision where required',
    evaluate: (ctx) => {
      const t = resolveThreshold(ctx)
      if (!t.sprinklerRequired) {
        return {
          outcome: 'advisory',
          threshold: 'Not required for this occupancy',
          actual: ctx.input.sprinklered ? 'Provided' : 'Not provided',
          note: 'Sprinklers not mandated but may benefit insurance/travel distance relaxation.',
        }
      }
      return {
        outcome: ctx.input.sprinklered ? 'pass' : 'fail',
        threshold: 'Required (mandatory for this occupancy)',
        actual: ctx.input.sprinklered ? 'Provided' : 'Not provided',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this fire compliance check is a decision-support aid and does not constitute statutory certification.',
  'A registered fire engineer or competent person must review and sign off before municipal submission.',
  'Based on the prescriptive (deemed-to-satisfy) route; a rational fire design assessment may yield different requirements.',
]

function compute(ctx: ComputeContext<FireComplianceInput>): CalculationResult {
  const t = resolveThreshold(ctx)
  const requiredExitWidthMm = t.minExitWidthMmPerPerson * ctx.input.occupantCount

  const { clauseResults, complianceScore } = evaluateClauseSet(fireComplianceClauseSet, ctx)

  // Populate sourceVersions from resolved tables (Requirements 8.2, 8.5)
  const sourceVersions: GuidelineVersionRef[] = []
  const thresholdTable = ctx.tables.sans_10400_t_thresholds
  if (thresholdTable) {
    sourceVersions.push({
      guideline: thresholdTable.id,
      version: thresholdTable.version,
      effectiveFrom: thresholdTable.effectiveFrom,
      status: thresholdTable.status,
    })
  }

  return {
    lineResults: [],
    aggregates: {
      occupancyClass: ctx.input.occupancyClass,
      occupancyLabel: t.label,
      travelDistanceM: ctx.input.travelDistanceM,
      maxTravelDistanceM: t.maxTravelDistanceM,
      exitWidthMm: ctx.input.exitWidthMm,
      requiredExitWidthMm,
      fireResistanceRatingMin: ctx.input.fireResistanceRatingMin,
      minFireResistanceMin: t.minFireResistanceMin,
      floorAreaM2: ctx.input.floorAreaM2,
      maxCompartmentAreaM2: t.maxCompartmentAreaM2 ?? 'No limit',
      sprinklered: ctx.input.sprinklered ? 'Yes' : 'No',
      sprinklerRequired: t.sprinklerRequired ? 'Yes' : 'No',
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions,
    disclaimers: DISCLAIMERS,
    warnings: [],
  }
}

/** `fire_compliance_check_v1` — SANS 10400-T fire safety compliance checklist. */
export const fireComplianceCheckV1: CalculatorDefinition<FireComplianceInput> =
  registerCalculatorDefinition<FireComplianceInput, Record<string, unknown>>({
    id: 'fire_compliance_check_v1',
    toolId: 'fire_compliance_check',
    title: 'SANS 10400-T Fire Compliance Checklist',
    method: 'clauseSet',
    inputSchema: fireComplianceInputSchema,
    tableRefs: ['sans_10400_t_thresholds'],
    clauseSet: fireComplianceClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'SANS 10400-T',
      version: '2012',
      status: 'mandatory',
      url: 'https://www.thensbc.org.za',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
