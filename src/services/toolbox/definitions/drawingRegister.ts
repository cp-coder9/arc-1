// Drawing Register calculator definition
//
// `drawing_register_v1` (toolId `drawing_register`) — a schedule-based tool for tracking
// project drawings with revision states. Each row is a drawing entry with number, title,
// discipline, revision, status, and issue date.
//
// Computes: count by status, latest revision per drawing, total count.
// Clause checks: all drawings have a revision, no draft drawings in issued set (advisory).
//
// Requirements: 2.1, 8.1.

import { z } from 'zod'
import type {
  CalculationResult,
  CalculatorDefinition,
  ClauseCheckDef,
  ClauseResult,
  ComputeContext,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type DrawingStatus = 'issued' | 'superseded' | 'draft' | 'approved'

export interface DrawingRegisterRow {
  drawingNumber: string
  title: string
  discipline: string
  revision: string
  status: DrawingStatus
  dateIssued: string
}

export interface DrawingRegisterInput {
  projectName: string
  registerId: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const drawingRegisterRowSchema = z.object({
  drawingNumber: z.string().min(1),
  title: z.string().min(1),
  discipline: z.string().min(1),
  revision: z.string(),
  status: z.enum(['issued', 'superseded', 'draft', 'approved']),
  dateIssued: z.string().min(1),
})

export const drawingRegisterInputSchema = z.object({
  projectName: z.string().min(1),
  registerId: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const drawingRegisterClauseSet: ClauseCheckDef<DrawingRegisterInput, DrawingRegisterRow>[] = [
  {
    clauseRef: 'DR-001',
    label: 'All drawings have a revision',
    evaluate: (ctx) => {
      const missingRevision = ctx.rows.filter((r) => !r.revision || r.revision.trim() === '')
      return {
        outcome: missingRevision.length === 0 ? 'pass' : 'fail',
        threshold: '0 drawings without revision',
        actual: `${missingRevision.length} drawing(s) without revision`,
        note:
          missingRevision.length > 0
            ? `Drawings missing revision: ${missingRevision.map((r) => r.drawingNumber).join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'DR-002',
    label: 'No draft drawings in issued set',
    evaluate: (ctx) => {
      const draftInIssued = ctx.rows.filter((r) => r.status === 'draft')
      return {
        outcome: draftInIssued.length === 0 ? 'pass' : 'advisory',
        threshold: '0 draft drawings',
        actual: `${draftInIssued.length} draft drawing(s)`,
        note:
          draftInIssued.length > 0
            ? `Draft drawings present: ${draftInIssued.map((r) => r.drawingNumber).join(', ')}. Consider finalising before issue.`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this drawing register is a record-keeping aid and does not replace formal document control procedures.',
]

function compute(ctx: ComputeContext<DrawingRegisterInput, DrawingRegisterRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  // Per-row line results
  const lineResults = rows.map((row) => ({
    drawingNumber: row.drawingNumber,
    title: row.title,
    discipline: row.discipline,
    revision: row.revision,
    status: row.status,
    dateIssued: row.dateIssued,
  }))

  // Count by status
  const countIssued = rows.filter((r) => r.status === 'issued').length
  const countSuperseded = rows.filter((r) => r.status === 'superseded').length
  const countDraft = rows.filter((r) => r.status === 'draft').length
  const countApproved = rows.filter((r) => r.status === 'approved').length

  // Latest revision per drawing (group by drawingNumber)
  const revisionMap = new Map<string, string>()
  for (const row of rows) {
    const existing = revisionMap.get(row.drawingNumber)
    if (!existing || row.revision > existing) {
      revisionMap.set(row.drawingNumber, row.revision)
    }
  }

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(drawingRegisterClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      projectName: input.projectName,
      registerId: input.registerId,
      totalDrawings: rows.length,
      countIssued,
      countSuperseded,
      countDraft,
      countApproved,
      uniqueDrawings: revisionMap.size,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

export const drawingRegisterV1: CalculatorDefinition<DrawingRegisterInput, DrawingRegisterRow> =
  registerCalculatorDefinition<DrawingRegisterInput, DrawingRegisterRow>({
    id: 'drawing_register_v1',
    toolId: 'drawing_register',
    title: 'Drawing Register (Standalone)',
    method: 'hybrid',
    inputSchema: drawingRegisterInputSchema,
    scheduleSchema: drawingRegisterRowSchema,
    tableRefs: [],
    clauseSet: drawingRegisterClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Document Control Best Practice',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
