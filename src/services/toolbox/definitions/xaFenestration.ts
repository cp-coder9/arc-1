// SANS 10400-XA fenestration calculator definition (exemplar)
//
// `xa_fenestration_v1` is the first full vertical slice proving the Toolbox Capability
// Framework end-to-end (design.md "Migration / Rollout" step 1). It models a building's
// fenestration (glazed openings) and checks it against the SANS 10400-XA prescriptive
// energy route:
//
//   - per-opening schedule rows capture orientation, area, glazing type, U-value, SHGC,
//     external shading, and storey (Requirement 4.1);
//   - the compute reads the climate-zone prescriptive limits from `xa_zone_limits` and the
//     default glazing properties from `glazing_props` (Requirement 3.1 — no hidden
//     constants), then computes glazing % against the SANS limit, area-weighted U-value and
//     SHGC against the zone limits, and assesses external shading (Requirement 4.2).
//
// Task 6.1 authored the DEFINITION + per-opening schema + the `xa_zone_limits` /
// `glazing_props` table wiring. Task 6.2 (this) deepens the clause set: it cites the
// zone-specific threshold on every clause, treats absent thermal data as advisory rather
// than a false pass, and adds per-storey summaries (glazing area/ratio, area-weighted
// U-value/SHGC, shading counts) alongside the whole-building rollup. Task 6.3 wires the
// submission-ready PDF.
//
// Requirements: 4.1 (per-opening capture), 4.2 (glazing %/U-value/SHGC/shading checks),
// 4.3 (per-storey summaries + whole-building rollup), 4.4 (pass/fail/advisory per clause
// with the zone-specific threshold).

import { z } from 'zod'
import {
  type CalculationResult,
  type CalculatorDefinition,
  type ClauseCheckDef,
  type ClauseResult,
  type ComputeContext,
  type GroupAggregate,
  type GuidelineTable,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Table row shapes (what we read out of the resolved guideline tables)
// ----------------------------------------------------------------------------

/** A row of `xa_zone_limits`: the prescriptive limits for one climate zone. */
interface ZoneLimitRow {
  zone: number
  zoneName: string
  maxGlazingRatioPct: number
  maxUValue: number
  maxShgc: number
}

/** A row of `glazing_props`: default thermal properties for a glazing type. */
interface GlazingPropRow {
  type: string
  label: string
  uValue: number
  shgc: number
}

// ----------------------------------------------------------------------------
// Schemas — top-level inputs + per-opening schedule row
// ----------------------------------------------------------------------------

/** The eight compass orientations a glazed opening can face. */
export const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type Orientation = (typeof ORIENTATIONS)[number]

/** External-shading classifications assessed by the XA route. */
export const SHADING_TYPES = ['none', 'overhang', 'fin', 'louvre', 'recessed', 'other'] as const
export type ShadingType = (typeof SHADING_TYPES)[number]

/**
 * Top-level building inputs: climate zone (1–6), number of storeys, and the net floor area
 * the glazing ratio is assessed against (Requirement 4.1 context).
 */
export const xaFenestrationInputSchema = z.object({
  /** SANS 10400-XA climate zone (1–6). Resolves the prescriptive limits row. */
  climateZone: z.number().int().min(1).max(6),
  /** Number of storeys in the building (drives per-storey rollups). */
  storeys: z.number().int().min(1).default(1),
  /** Net floor area of the building (m²) — denominator for the glazing-ratio check. */
  netFloorAreaM2: z.number().positive(),
  /**
   * Optional per-storey net floor area (m²), keyed by the storey label used on opening rows.
   * When supplied, per-storey glazing ratios are computed against the storey's own floor
   * area; otherwise an even split of `netFloorAreaM2` across the storeys present is assumed
   * (surfaced as a warning). Requirement 4.3.
   */
  storeyFloorAreasM2: z.record(z.string(), z.number().positive()).optional(),
})
export type XaFenestrationInput = z.infer<typeof xaFenestrationInputSchema>

/**
 * One glazed opening. `glazingType` references a `glazing_props` row for default U-value /
 * SHGC; `uValue` / `shgc` are optional per-opening overrides (e.g. a tested product value).
 * (Requirement 4.1 — capture orientation, area, glazing type, U-value, SHGC, shading.)
 */
export const xaOpeningRowSchema = z.object({
  /** Opening reference/label, e.g. "W12" or "Lounge sliding door". */
  label: z.string().min(1),
  /** Compass orientation the opening faces. */
  orientation: z.enum(ORIENTATIONS),
  /** Glazed area of the opening (m²). */
  areaM2: z.number().positive(),
  /** Glazing type id (FK into `glazing_props`); supplies default U-value/SHGC. */
  glazingType: z.string().min(1),
  /** Optional per-opening U-value override (W/m²·K). Falls back to the glazing default. */
  uValue: z.number().positive().optional(),
  /** Optional per-opening SHGC override (0–1). Falls back to the glazing default. */
  shgc: z.number().min(0).max(1).optional(),
  /** External shading classification. */
  shading: z.enum(SHADING_TYPES).default('none'),
  /** Optional storey label/number this opening belongs to (drives per-storey rollups). */
  storey: z.union([z.string(), z.number()]).optional(),
})
export type XaOpeningRow = z.infer<typeof xaOpeningRowSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Resolve the climate-zone limits row for the building's zone, or throw a clear error. */
function resolveZoneRow(ctx: ComputeContext<XaFenestrationInput, XaOpeningRow>): ZoneLimitRow {
  const table = ctx.tables.xa_zone_limits as GuidelineTable<ZoneLimitRow>
  const row = table.rows.find((r) => r.zone === ctx.input.climateZone)
  if (!row) {
    throw new Error(`No xa_zone_limits row for climate zone ${ctx.input.climateZone}`)
  }
  return row
}

/**
 * Effective thermal properties of an opening: per-opening override when present, otherwise
 * the `glazing_props` default for its type. `matched` is false when the type is unknown and
 * no override was supplied (surfaced as a warning rather than a hard failure).
 */
function effectiveGlazing(
  row: XaOpeningRow,
  glazingTable: GuidelineTable<GlazingPropRow>,
): { uValue?: number; shgc?: number; matched: boolean } {
  const match = glazingTable.rows.find((g) => g.type === row.glazingType)
  const uValue = row.uValue ?? match?.uValue
  const shgc = row.shgc ?? match?.shgc
  return { uValue, shgc, matched: match !== undefined }
}

/** Area-weighted mean of a per-opening property, ignoring openings missing that property. */
function areaWeightedMean(
  rows: XaOpeningRow[],
  glazingTable: GuidelineTable<GlazingPropRow>,
  pick: (g: { uValue?: number; shgc?: number }) => number | undefined,
): number {
  let weighted = 0
  let area = 0
  for (const row of rows) {
    const value = pick(effectiveGlazing(row, glazingTable))
    if (value === undefined) continue
    weighted += value * row.areaM2
    area += row.areaM2
  }
  return area > 0 ? weighted / area : 0
}

// ----------------------------------------------------------------------------
// Per-storey rollups (Requirement 4.3)
// ----------------------------------------------------------------------------

/** Normalise an opening's storey field into a stable group key. */
function storeyKeyOf(row: XaOpeningRow): string {
  if (row.storey === undefined || row.storey === null || row.storey === '') return 'Unassigned'
  return String(row.storey)
}

/** Group opening rows by their storey key, preserving first-seen order of storeys. */
function groupRowsByStorey(rows: XaOpeningRow[]): Map<string, XaOpeningRow[]> {
  const groups = new Map<string, XaOpeningRow[]>()
  for (const row of rows) {
    const key = storeyKeyOf(row)
    const bucket = groups.get(key)
    if (bucket) bucket.push(row)
    else groups.set(key, [row])
  }
  return groups
}

/** A typed per-storey summary used to build a `GroupAggregate`. */
interface StoreySummary {
  storey: string
  openingCount: number
  glazingAreaM2: number
  /** Ratio against the storey's floor area; `assumedFloorArea` flags an even-split estimate. */
  glazingRatioPct: number
  floorAreaM2: number
  assumedFloorArea: boolean
  areaWeightedUValue: number
  areaWeightedShgc: number
  shadedCount: number
}

/**
 * Resolve the floor area to use for a storey's glazing ratio. Uses the per-storey override
 * from `storeyFloorAreasM2` when present; otherwise assumes an even split of the building's
 * net floor area across the storeys present (flagged via `assumed`). Requirement 4.3.
 */
function resolveStoreyFloorArea(
  storey: string,
  input: XaFenestrationInput,
  storeysPresent: number,
): { area: number; assumed: boolean } {
  const explicit = input.storeyFloorAreasM2?.[storey]
  if (explicit !== undefined) return { area: explicit, assumed: false }
  const divisor = Math.max(storeysPresent, 1)
  return { area: input.netFloorAreaM2 / divisor, assumed: true }
}

/**
 * Build per-storey summaries from the schedule rows. Returns the typed summaries plus any
 * warnings (e.g. an even-split floor-area assumption) so `compute` can surface them.
 */
function computeStoreySummaries(
  rows: XaOpeningRow[],
  input: XaFenestrationInput,
  glazingTable: GuidelineTable<GlazingPropRow>,
): { summaries: StoreySummary[]; warnings: string[] } {
  const groups = groupRowsByStorey(rows)
  const storeysPresent = groups.size
  const warnings: string[] = []
  const summaries: StoreySummary[] = []

  for (const [storey, storeyRows] of groups) {
    const glazingArea = storeyRows.reduce((sum, r) => sum + r.areaM2, 0)
    const { area: floorArea, assumed } = resolveStoreyFloorArea(storey, input, storeysPresent)
    if (assumed) {
      warnings.push(
        `Storey "${storey}" — no per-storey floor area supplied; glazing ratio assumes an even split of the building net floor area.`,
      )
    }
    summaries.push({
      storey,
      openingCount: storeyRows.length,
      glazingAreaM2: Number(glazingArea.toFixed(2)),
      glazingRatioPct: Number(((glazingArea / floorArea) * 100).toFixed(1)),
      floorAreaM2: Number(floorArea.toFixed(2)),
      assumedFloorArea: assumed,
      areaWeightedUValue: Number(areaWeightedMean(storeyRows, glazingTable, (g) => g.uValue).toFixed(2)),
      areaWeightedShgc: Number(areaWeightedMean(storeyRows, glazingTable, (g) => g.shgc).toFixed(2)),
      shadedCount: storeyRows.filter((r) => r.shading !== 'none').length,
    })
  }

  return { summaries, warnings }
}

/** Map a typed storey summary onto the framework `GroupAggregate` shape. */
function toStoreyGroupAggregate(summary: StoreySummary): GroupAggregate {
  return {
    group: 'storey',
    key: summary.storey,
    label: `Storey ${summary.storey}`,
    values: {
      openingCount: summary.openingCount,
      glazingAreaM2: summary.glazingAreaM2,
      glazingRatioPct: summary.glazingRatioPct,
      floorAreaM2: summary.floorAreaM2,
      floorAreaBasis: summary.assumedFloorArea ? 'assumed (even split)' : 'declared',
      areaWeightedUValue: summary.areaWeightedUValue,
      areaWeightedShgc: summary.areaWeightedShgc,
      shadedCount: summary.shadedCount,
    },
  }
}

// ----------------------------------------------------------------------------
// Clause checks (whole-building pass/fail/advisory; per-storey detail in compute)
// ----------------------------------------------------------------------------

/** Count openings that contribute a value to the area-weighted thermal averages. */
function thermalSampleCount(
  rows: XaOpeningRow[],
  glazingTable: GuidelineTable<GlazingPropRow>,
  pick: (g: { uValue?: number; shgc?: number }) => number | undefined,
): number {
  return rows.filter((r) => pick(effectiveGlazing(r, glazingTable)) !== undefined).length
}

/**
 * The XA fenestration clause set. Each check reads its threshold from the resolved
 * `xa_zone_limits` row so no limit is hard-coded (Requirement 3.1) and cites its clause
 * with the zone-specific threshold (Requirements 1.3, 4.2, 4.4). Compliance is assessed at
 * whole-building level (prescriptive route); per-storey detail is surfaced as rollups in
 * `compute` (Requirement 4.3).
 */
export const xaFenestrationClauseSet: ClauseCheckDef<XaFenestrationInput, XaOpeningRow>[] = [
  {
    clauseRef: 'SANS 10400-XA 4.3.1',
    label: 'Total glazing area within prescriptive limit',
    evaluate: (ctx) => {
      const zone = resolveZoneRow(ctx)
      const glazingArea = ctx.rows.reduce((sum, r) => sum + r.areaM2, 0)
      const ratioPct = (glazingArea / ctx.input.netFloorAreaM2) * 100
      return {
        outcome: ratioPct <= zone.maxGlazingRatioPct ? 'pass' : 'fail',
        threshold: `<= ${zone.maxGlazingRatioPct}% of net floor area (zone ${zone.zone} — ${zone.zoneName})`,
        actual: `${ratioPct.toFixed(1)}%`,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-XA 4.3.2',
    label: 'Area-weighted glazing U-value within zone limit',
    evaluate: (ctx) => {
      const zone = resolveZoneRow(ctx)
      const glazingTable = ctx.tables.glazing_props as GuidelineTable<GlazingPropRow>
      const threshold = `<= ${zone.maxUValue} W/m²·K (zone ${zone.zone} — ${zone.zoneName})`
      // No openings with a known U-value → cannot assess; report advisory rather than a
      // misleading "0.00 W/m²·K pass".
      if (thermalSampleCount(ctx.rows, glazingTable, (g) => g.uValue) === 0) {
        return { outcome: 'advisory', threshold, actual: 'no glazing U-value data' }
      }
      const meanU = areaWeightedMean(ctx.rows, glazingTable, (g) => g.uValue)
      return {
        outcome: meanU <= zone.maxUValue ? 'pass' : 'fail',
        threshold,
        actual: `${meanU.toFixed(2)} W/m²·K`,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-XA 4.3.3',
    label: 'Area-weighted SHGC within zone limit',
    evaluate: (ctx) => {
      const zone = resolveZoneRow(ctx)
      const glazingTable = ctx.tables.glazing_props as GuidelineTable<GlazingPropRow>
      const threshold = `<= ${zone.maxShgc} (zone ${zone.zone} — ${zone.zoneName})`
      if (thermalSampleCount(ctx.rows, glazingTable, (g) => g.shgc) === 0) {
        return { outcome: 'advisory', threshold, actual: 'no glazing SHGC data' }
      }
      const meanShgc = areaWeightedMean(ctx.rows, glazingTable, (g) => g.shgc)
      return {
        outcome: meanShgc <= zone.maxShgc ? 'pass' : 'fail',
        threshold,
        actual: meanShgc.toFixed(2),
      }
    },
  },
  {
    clauseRef: 'SANS 10400-XA 4.3.4',
    label: 'External shading provided to glazed openings',
    evaluate: (ctx) => {
      const total = ctx.rows.length
      const shaded = ctx.rows.filter((r) => r.shading !== 'none').length
      // Shading is advisory under the prescriptive route — informational, never a hard fail.
      return {
        outcome: 'advisory',
        threshold: 'External shading recommended on solar-exposed glazing',
        actual: total > 0 ? `${shaded} of ${total} openings shaded` : 'no openings',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this calculation is a decision-support aid and does not constitute statutory certification.',
  'A registered professional must review and sign off the fenestration design before municipal submission.',
  'Prescriptive (deemed-to-satisfy) route only; a rational energy assessment may yield a different outcome.',
]

/**
 * `compute` runs the clause set and produces per-opening line results, whole-building
 * aggregates, and — when the building spans more than one storey — per-storey rollups
 * (glazing area/ratio, area-weighted U-value/SHGC, shading counts) as `groupAggregates`
 * (Requirement 4.3). Compliance clauses remain whole-building (prescriptive route).
 */
function compute(ctx: ComputeContext<XaFenestrationInput, XaOpeningRow>): CalculationResult {
  const glazingTable = ctx.tables.glazing_props as GuidelineTable<GlazingPropRow>
  const warnings: string[] = []

  const lineResults = ctx.rows.map((row) => {
    const g = effectiveGlazing(row, glazingTable)
    if (!g.matched && (row.uValue === undefined || row.shgc === undefined)) {
      warnings.push(
        `Opening "${row.label}" — unknown glazing type "${row.glazingType}" and no U-value/SHGC override; excluded from thermal averages.`,
      )
    }
    return {
      label: row.label,
      orientation: row.orientation,
      areaM2: row.areaM2,
      glazingType: row.glazingType,
      uValue: g.uValue ?? 'n/a',
      shgc: g.shgc ?? 'n/a',
      shading: row.shading,
      storey: storeyKeyOf(row),
    } satisfies Record<string, number | string>
  })

  const glazingArea = ctx.rows.reduce((sum, r) => sum + r.areaM2, 0)
  const glazingRatioPct = (glazingArea / ctx.input.netFloorAreaM2) * 100
  const meanU = areaWeightedMean(ctx.rows, glazingTable, (g) => g.uValue)
  const meanShgc = areaWeightedMean(ctx.rows, glazingTable, (g) => g.shgc)

  // Per-storey rollups (Requirement 4.3): grouped only when the building actually spans
  // more than one storey, so single-storey buildings aren't cluttered with a redundant
  // per-storey copy of the whole-building figures.
  const { summaries: storeySummaries, warnings: storeyWarnings } = computeStoreySummaries(
    ctx.rows,
    ctx.input,
    glazingTable,
  )
  const multiStorey = storeySummaries.length > 1
  const groupAggregates = multiStorey ? storeySummaries.map(toStoreyGroupAggregate) : []
  if (multiStorey) warnings.push(...storeyWarnings)

  const aggregates: Record<string, number | string> = {
    climateZone: ctx.input.climateZone,
    storeys: ctx.input.storeys,
    storeysWithOpenings: storeySummaries.length,
    netFloorAreaM2: ctx.input.netFloorAreaM2,
    openingCount: ctx.rows.length,
    totalGlazingAreaM2: Number(glazingArea.toFixed(2)),
    glazingRatioPct: Number(glazingRatioPct.toFixed(1)),
    areaWeightedUValue: Number(meanU.toFixed(2)),
    areaWeightedShgc: Number(meanShgc.toFixed(2)),
    shadedOpeningCount: ctx.rows.filter((r) => r.shading !== 'none').length,
  }

  const { clauseResults, complianceScore } = evaluateClauseSet(xaFenestrationClauseSet, ctx)

  return {
    lineResults,
    aggregates,
    groupAggregates,
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

/**
 * `xa_fenestration_v1` — the SANS 10400-XA fenestration exemplar definition, registered into
 * the definition registry at module load.
 */
export const xaFenestrationV1: CalculatorDefinition<XaFenestrationInput, XaOpeningRow> =
  registerCalculatorDefinition<XaFenestrationInput, XaOpeningRow>({
    id: 'xa_fenestration_v1',
    toolId: 'xa_compliance_calc',
    title: 'SANS 10400-XA Fenestration Compliance',
    method: 'clauseSet',
    inputSchema: xaFenestrationInputSchema,
    scheduleSchema: xaOpeningRowSchema,
    tableRefs: ['xa_zone_limits', 'glazing_props'],
    clauseSet: xaFenestrationClauseSet,
    compute,
    reportTemplateId: 'xa_fenestration_report',
    source: {
      guideline: 'SANS 10400-XA',
      version: '2021',
      status: 'mandatory',
      url: 'https://www.thensbc.org.za',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
