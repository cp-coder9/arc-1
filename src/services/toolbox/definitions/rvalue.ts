// SANS 10400-XA R-Value / Thermal calculator definition
//
// `rvalue_calc_v1` (toolId `rvalue_calc`) models a building-envelope assembly (roof, wall
// or floor) as an ordered stack of material layers and computes its total thermal
// resistance (R-value, m²·K/W), then checks it against the SANS 10400-XA deemed-to-satisfy
// minimum for the element type and climate zone.
//
// Reuse, not duplication (Requirement 6.4 / 8.1):
//   - layer conductivities are read from the versioned `material_r_values` table;
//   - the element/zone minimum R-values AND the standard internal/external surface
//     resistances (Rsi/Rse) are read from the versioned `xa_rvalue_minimums` table —
//     no hard-coded thresholds (Requirement 3.1, design Property 2);
//   - the run is executed through the shared `runCalculator` engine and the clause result
//     is produced by the shared `evaluateClauseSet`.
//
// The `computeAssemblyRValue` helper is exported so the broader XA energy-compliance
// definition (`xa_energy_compliance_v1`) can reuse the exact same assembly math rather than
// re-implementing it.
//
// Requirements: 4.* (XA energy depth), 6.4 (reuse over duplication), 8.1 (typed
// definition meeting Requirement 1), 10.1 (unit-tested formula/clause logic).

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

/** A row of `material_r_values`: either a conductivity (k) or a fixed R-value (air gaps). */
export interface MaterialRow {
  material: string
  label: string
  /** Thermal conductivity (W/m·K). Layer R = thickness(m) / conductivity. */
  conductivity?: number
  /** Fixed thermal resistance (m²·K/W) — used for air gaps where thickness is nominal. */
  rValue?: number
}

/** A row of `xa_rvalue_minimums`: the deemed-to-satisfy minimum + surface resistances. */
export interface RValueMinimumRow {
  zone: number
  element: string
  minRValue: number
  /** Internal surface resistance (m²·K/W). */
  rsi: number
  /** External surface resistance (m²·K/W). */
  rse: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

/** Envelope element types assessed by the R-value route. */
export const ELEMENT_TYPES = ['roof', 'wall', 'floor'] as const
export type ElementType = (typeof ELEMENT_TYPES)[number]

/**
 * Top-level inputs: the climate zone and which envelope element the assembly represents.
 * Together these resolve the applicable minimum R-value + surface resistances row.
 */
export const rvalueInputSchema = z.object({
  /** SANS 10400-XA climate zone (1–6). */
  climateZone: z.number().int().min(1).max(6),
  /** Envelope element this assembly represents (roof / wall / floor). */
  elementType: z.enum(ELEMENT_TYPES),
})
export type RValueInput = z.infer<typeof rvalueInputSchema>

/**
 * One material layer in the assembly (inside → outside). `material` references a
 * `material_r_values` row for its default conductivity; `conductivity` / `rValue` are
 * optional per-layer overrides (e.g. a tested product value or a custom air gap).
 */
export const rvalueLayerSchema = z.object({
  /** Layer reference/label, e.g. "Outer brick skin". */
  label: z.string().min(1),
  /** Material id (FK into `material_r_values`); supplies the default conductivity. */
  material: z.string().min(1),
  /** Layer thickness (mm). Ignored when a fixed `rValue` is used. */
  thicknessMm: z.number().positive(),
  /** Optional per-layer conductivity override (W/m·K). */
  conductivity: z.number().positive().optional(),
  /** Optional per-layer fixed R-value override (m²·K/W) — e.g. an air gap. */
  rValue: z.number().positive().optional(),
})
export type RValueLayer = z.infer<typeof rvalueLayerSchema>

// ----------------------------------------------------------------------------
// Reusable assembly math
// ----------------------------------------------------------------------------

/** Per-layer R-value result; `matched` is false when the material/override is unknown. */
export interface LayerRValueResult {
  label: string
  material: string
  thicknessMm: number
  rValue: number
  matched: boolean
}

/** The computed assembly: per-layer results, the summed layer R, and any warnings. */
export interface AssemblyRValue {
  layers: LayerRValueResult[]
  /** Sum of the layer R-values only (excludes surface resistances). */
  layerRValue: number
  warnings: string[]
}

/**
 * Compute the thermal resistance of a layered assembly from the `material_r_values` table.
 *
 * For each layer the R-value is, in priority order:
 *   1. the per-layer `rValue` override;
 *   2. the material row's fixed `rValue` (air gaps);
 *   3. thickness(m) / conductivity, where conductivity is the per-layer override or the
 *      material row's conductivity.
 * A layer whose material is unknown and which supplies no override contributes 0 and is
 * flagged (surfaced as a warning rather than failing the whole run).
 *
 * Exported for reuse by `xa_energy_compliance_v1` (Requirement 6.4 — no duplicate logic).
 */
export function computeAssemblyRValue(
  layers: RValueLayer[],
  materialTable: GuidelineTable<MaterialRow>,
): AssemblyRValue {
  const warnings: string[] = []
  const results: LayerRValueResult[] = layers.map((layer) => {
    const match = materialTable.rows.find((m) => m.material === layer.material)
    let r: number
    let matched = true

    if (layer.rValue !== undefined) {
      r = layer.rValue
    } else if (match?.rValue !== undefined) {
      r = match.rValue
    } else {
      const k = layer.conductivity ?? match?.conductivity
      if (k === undefined) {
        r = 0
        matched = false
        warnings.push(
          `Layer "${layer.label}" — unknown material "${layer.material}" and no conductivity/R-value override; excluded from the assembly R-value.`,
        )
      } else {
        r = layer.thicknessMm / 1000 / k
      }
    }

    return {
      label: layer.label,
      material: layer.material,
      thicknessMm: layer.thicknessMm,
      rValue: Number(r.toFixed(3)),
      matched,
    }
  })

  const layerRValue = results.reduce((sum, l) => sum + l.rValue, 0)
  return { layers: results, layerRValue: Number(layerRValue.toFixed(3)), warnings }
}

/** Resolve the minimum-R/surface-resistance row for the building's zone + element. */
export function resolveRValueMinimum(
  ctx: ComputeContext<RValueInput, RValueLayer>,
): RValueMinimumRow {
  const table = ctx.tables.xa_rvalue_minimums as GuidelineTable<RValueMinimumRow>
  const row = table.rows.find(
    (r) => r.zone === ctx.input.climateZone && r.element === ctx.input.elementType,
  )
  if (!row) {
    throw new Error(
      `No xa_rvalue_minimums row for zone ${ctx.input.climateZone} / element ${ctx.input.elementType}`,
    )
  }
  return row
}

/** Total assembly R-value including the standard surface resistances (Rsi + Rse). */
export function totalRValue(layerRValue: number, min: RValueMinimumRow): number {
  return Number((min.rsi + layerRValue + min.rse).toFixed(3))
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

/**
 * The R-value clause set. The single deemed-to-satisfy check compares the total assembly
 * R-value (surface resistances + layers) against the zone/element minimum read from
 * `xa_rvalue_minimums` (Requirements 1.3, 4.2, 4.4 — pass/fail with the cited threshold).
 */
export const rvalueClauseSet: ClauseCheckDef<RValueInput, RValueLayer>[] = [
  {
    clauseRef: 'SANS 10400-XA 4.2',
    label: 'Building element achieves the minimum total R-value',
    evaluate: (ctx) => {
      const min = resolveRValueMinimum(ctx)
      const materialTable = ctx.tables.material_r_values as GuidelineTable<MaterialRow>
      const threshold = `>= ${min.minRValue} m²·K/W (zone ${min.zone} ${min.element})`
      if (ctx.rows.length === 0) {
        return { outcome: 'advisory', threshold, actual: 'no layers entered' }
      }
      const assembly = computeAssemblyRValue(ctx.rows, materialTable)
      const total = totalRValue(assembly.layerRValue, min)
      return {
        outcome: total >= min.minRValue ? 'pass' : 'fail',
        threshold,
        actual: `${total.toFixed(2)} m²·K/W`,
        note: `Layers ${assembly.layerRValue.toFixed(2)} + Rsi ${min.rsi} + Rse ${min.rse}`,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this thermal calculation is a decision-support aid and does not constitute statutory certification.',
  'A registered professional must review and sign off the thermal design before municipal submission.',
  'Deemed-to-satisfy (prescriptive) route; surface resistances and material conductivities are indicative defaults.',
]

function compute(ctx: ComputeContext<RValueInput, RValueLayer>): CalculationResult {
  const materialTable = ctx.tables.material_r_values as GuidelineTable<MaterialRow>
  const min = resolveRValueMinimum(ctx)
  const assembly = computeAssemblyRValue(ctx.rows, materialTable)
  const total = totalRValue(assembly.layerRValue, min)

  const lineResults = assembly.layers.map((l) => ({
    label: l.label,
    material: l.material,
    thicknessMm: l.thicknessMm,
    rValue: l.matched ? l.rValue : 'n/a',
  })) satisfies Array<Record<string, number | string>>

  const aggregates: Record<string, number | string> = {
    climateZone: ctx.input.climateZone,
    elementType: ctx.input.elementType,
    layerCount: ctx.rows.length,
    layerRValue: assembly.layerRValue,
    rsi: min.rsi,
    rse: min.rse,
    totalRValue: total,
    minRequiredRValue: min.minRValue,
    margin: Number((total - min.minRValue).toFixed(3)),
  }

  const { clauseResults, complianceScore } = evaluateClauseSet(rvalueClauseSet, ctx)

  return {
    lineResults,
    aggregates,
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings: assembly.warnings,
  }
}

/** `rvalue_calc_v1` — the SANS 10400-XA R-value/thermal assembly calculator. */
export const rvalueCalcV1: CalculatorDefinition<RValueInput, RValueLayer> =
  registerCalculatorDefinition<RValueInput, RValueLayer>({
    id: 'rvalue_calc_v1',
    toolId: 'rvalue_calc',
    title: 'SANS 10400-XA R-Value / Thermal Calculator',
    method: 'clauseSet',
    inputSchema: rvalueInputSchema,
    scheduleSchema: rvalueLayerSchema,
    tableRefs: ['material_r_values', 'xa_rvalue_minimums'],
    clauseSet: rvalueClauseSet,
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
