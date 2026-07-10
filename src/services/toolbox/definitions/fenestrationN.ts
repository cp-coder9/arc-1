// SANS 10400-N fenestration (natural ventilation & lighting) calculator definition
//
// `fenestration_n_v1` (toolId `fenestration_calc`) is the natural-ventilation/lighting
// checker — DISTINCT from the XA thermal route. It models a building room-by-room and
// verifies that each room provides:
//   - openable ventilation area >= the minimum % of floor area (5% for habitable rooms);
//   - glazed/translucent area for natural light >= the minimum % of floor area (10% for
//     habitable rooms).
//
// The minimum ratios are read from the versioned `sans_10400_n_requirements` table keyed by
// occupancy (no hard-coded constants — Requirement 3.1, design Property 2). Each room is a
// schedule row; per-room pass/fail line results are produced alongside whole-building clause
// checks that list the rooms failing each requirement.
//
// Requirements: 6.4 (distinct calc, not the XA thermal route), 8.1 (typed definition meeting
// Requirement 1), 2.* (room schedule), 1.3 (pass/fail with cited threshold), 10.1 (tests).

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
// Table row shape
// ----------------------------------------------------------------------------

/** A row of `sans_10400_n_requirements`: the minimum ventilation/lighting ratios. */
interface NRequirementRow {
  occupancy: string
  label: string
  ventilationMinPct: number
  lightingMinPct: number
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

/** Room occupancy classes assessed by the SANS 10400-N route. */
export const OCCUPANCY_TYPES = ['habitable', 'non_habitable'] as const
export type OccupancyType = (typeof OCCUPANCY_TYPES)[number]

/**
 * Top-level inputs: the default occupancy applied to rows that do not override it. The
 * minimum ventilation/lighting ratios are resolved per-row from the requirements table.
 */
export const fenestrationNInputSchema = z.object({
  /** Default occupancy class for rooms that don't set their own. */
  occupancyDefault: z.enum(OCCUPANCY_TYPES).default('habitable'),
})
export type FenestrationNInput = z.infer<typeof fenestrationNInputSchema>

/**
 * One room. `ventilationOpeningM2` is the openable area for ventilation; `glazedAreaM2` is
 * the glazed/translucent area admitting natural light. `occupancy` overrides the default.
 */
export const fenestrationNRoomSchema = z.object({
  /** Room reference/name, e.g. "Bedroom 1". */
  roomName: z.string().min(1),
  /** Room floor area (m²) — the denominator for both ratios. */
  floorAreaM2: z.number().positive(),
  /** Openable ventilation area (m²). */
  ventilationOpeningM2: z.number().min(0),
  /** Glazed/translucent area for natural light (m²). */
  glazedAreaM2: z.number().min(0),
  /** Optional per-room occupancy override. */
  occupancy: z.enum(OCCUPANCY_TYPES).optional(),
})
export type FenestrationNRoom = z.infer<typeof fenestrationNRoomSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Resolve the requirement row for a room's occupancy (falling back to the default). */
function requirementFor(
  room: FenestrationNRoom,
  input: FenestrationNInput,
  table: GuidelineTable<NRequirementRow>,
): NRequirementRow {
  const occupancy = room.occupancy ?? input.occupancyDefault
  const row = table.rows.find((r) => r.occupancy === occupancy)
  if (!row) throw new Error(`No sans_10400_n_requirements row for occupancy "${occupancy}"`)
  return row
}

/** Per-room evaluation against the ventilation + lighting minimums. */
interface RoomEvaluation {
  room: FenestrationNRoom
  requirement: NRequirementRow
  ventilationPct: number
  lightingPct: number
  ventilationPass: boolean
  lightingPass: boolean
}

function evaluateRoom(
  room: FenestrationNRoom,
  input: FenestrationNInput,
  table: GuidelineTable<NRequirementRow>,
): RoomEvaluation {
  const requirement = requirementFor(room, input, table)
  const ventilationPct = (room.ventilationOpeningM2 / room.floorAreaM2) * 100
  const lightingPct = (room.glazedAreaM2 / room.floorAreaM2) * 100
  return {
    room,
    requirement,
    ventilationPct,
    lightingPct,
    ventilationPass: ventilationPct >= requirement.ventilationMinPct,
    // A 0% lighting minimum (non-habitable) is always satisfied.
    lightingPass: lightingPct >= requirement.lightingMinPct,
  }
}

function evaluateRooms(ctx: ComputeContext<FenestrationNInput, FenestrationNRoom>): RoomEvaluation[] {
  const table = ctx.tables.sans_10400_n_requirements as GuidelineTable<NRequirementRow>
  return ctx.rows.map((room) => evaluateRoom(room, ctx.input, table))
}

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

/**
 * The SANS 10400-N clause set. Each whole-building clause passes only when every applicable
 * room satisfies the requirement, and cites the minimum ratio read from the table. Rooms
 * failing are listed in the `note` so the non-conformances are explicit (Requirement 6.2).
 */
export const fenestrationNClauseSet: ClauseCheckDef<FenestrationNInput, FenestrationNRoom>[] = [
  {
    clauseRef: 'SANS 10400-N 4.1',
    label: 'Natural ventilation — openable area at least 5% of floor area',
    evaluate: (ctx) => {
      const evals = evaluateRooms(ctx)
      const minPct = evals[0]?.requirement.ventilationMinPct ?? 5
      const threshold = `>= ${minPct}% of floor area (openable)`
      if (evals.length === 0) return { outcome: 'advisory', threshold, actual: 'no rooms entered' }
      const failing = evals.filter((e) => !e.ventilationPass)
      return {
        outcome: failing.length === 0 ? 'pass' : 'fail',
        threshold,
        actual: `${evals.length - failing.length} of ${evals.length} rooms compliant`,
        note:
          failing.length > 0
            ? `Non-compliant: ${failing.map((f) => `${f.room.roomName} (${f.ventilationPct.toFixed(1)}%)`).join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'SANS 10400-N 5.1',
    label: 'Natural lighting — glazed area at least 10% of floor area',
    evaluate: (ctx) => {
      const evals = evaluateRooms(ctx)
      // Only rooms with a non-zero lighting requirement are assessed for lighting.
      const applicable = evals.filter((e) => e.requirement.lightingMinPct > 0)
      const minPct = applicable[0]?.requirement.lightingMinPct ?? 10
      const threshold = `>= ${minPct}% of floor area (glazed)`
      if (applicable.length === 0) {
        return { outcome: 'advisory', threshold, actual: 'no rooms with a lighting requirement' }
      }
      const failing = applicable.filter((e) => !e.lightingPass)
      return {
        outcome: failing.length === 0 ? 'pass' : 'fail',
        threshold,
        actual: `${applicable.length - failing.length} of ${applicable.length} rooms compliant`,
        note:
          failing.length > 0
            ? `Non-compliant: ${failing.map((f) => `${f.room.roomName} (${f.lightingPct.toFixed(1)}%)`).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this ventilation/lighting calculation is a decision-support aid and does not constitute statutory certification.',
  'A registered professional must review and sign off before municipal submission.',
  'Mechanical ventilation or artificial lighting designed to SANS 10400-O may substitute for the natural provision assessed here.',
]

function compute(ctx: ComputeContext<FenestrationNInput, FenestrationNRoom>): CalculationResult {
  const evals = evaluateRooms(ctx)

  const lineResults = evals.map((e) => ({
    roomName: e.room.roomName,
    floorAreaM2: e.room.floorAreaM2,
    ventilationOpeningM2: e.room.ventilationOpeningM2,
    ventilationPct: Number(e.ventilationPct.toFixed(1)),
    ventilation: e.ventilationPass ? 'pass' : 'fail',
    glazedAreaM2: e.room.glazedAreaM2,
    lightingPct: Number(e.lightingPct.toFixed(1)),
    lighting: e.requirement.lightingMinPct === 0 ? 'n/a' : e.lightingPass ? 'pass' : 'fail',
  })) satisfies Array<Record<string, number | string>>

  const totalFloorArea = ctx.rows.reduce((sum, r) => sum + r.floorAreaM2, 0)
  const aggregates: Record<string, number | string> = {
    roomCount: ctx.rows.length,
    totalFloorAreaM2: Number(totalFloorArea.toFixed(2)),
    totalVentilationOpeningM2: Number(
      ctx.rows.reduce((sum, r) => sum + r.ventilationOpeningM2, 0).toFixed(2),
    ),
    totalGlazedAreaM2: Number(ctx.rows.reduce((sum, r) => sum + r.glazedAreaM2, 0).toFixed(2)),
    ventilationCompliantRooms: evals.filter((e) => e.ventilationPass).length,
    lightingCompliantRooms: evals.filter((e) => e.requirement.lightingMinPct === 0 || e.lightingPass)
      .length,
  }

  const { clauseResults, complianceScore } = evaluateClauseSet(fenestrationNClauseSet, ctx)

  // Build sourceVersions from consumed guideline table (Req 12.4)
  const nTable = ctx.tables.sans_10400_n_requirements
  const sourceVersions = nTable
    ? [{ guideline: nTable.id, version: nTable.version, effectiveFrom: nTable.effectiveFrom, status: nTable.status }]
    : []

  return {
    lineResults,
    aggregates,
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions,
    disclaimers: DISCLAIMERS,
    warnings: [],
  }
}

/** `fenestration_n_v1` — the SANS 10400-N natural ventilation & lighting checker. */
export const fenestrationNV1: CalculatorDefinition<FenestrationNInput, FenestrationNRoom> =
  registerCalculatorDefinition<FenestrationNInput, FenestrationNRoom>({
    id: 'fenestration_n_v1',
    toolId: 'fenestration_calc',
    title: 'SANS 10400-N Ventilation & Lighting Compliance',
    method: 'clauseSet',
    inputSchema: fenestrationNInputSchema,
    scheduleSchema: fenestrationNRoomSchema,
    tableRefs: ['sans_10400_n_requirements'],
    clauseSet: fenestrationNClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'SANS 10400-N',
      version: '2012',
      status: 'mandatory',
      url: 'https://www.sabs.co.za',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
