// Standalone Tool Run Service — Persistence for independent tool runs
// Supports: localStorage (default), Firestore (when available)
import type { StandaloneToolRun, AssignToProjectRequest, StandaloneToolResult } from '@/types/standaloneToolTypes'
import type { ClauseResult, GuidelineVersionRef } from '@/services/toolbox/types'
import type { RunSnapshotFields } from '@/services/toolbox/runSnapshot'
import {
  createToolRunProjectHandoff,
  type ToolRunProjectHandoff,
} from '@/services/toolbox/toolRunProjectAdapter'

/**
 * Optional Toolbox Capability Framework metadata accepted by `createRun`. These mirror the
 * additive fields on `StandaloneToolRun`. Callers may pass a pre-built `snapshot`
 * (e.g. from `toRunSnapshot`) and/or the individual fields — the individual fields win
 * when both are supplied. Legacy callers omit all of them and runs persist unchanged.
 */
export interface FrameworkRunFields {
  calculatorDefinitionId?: string
  scheduleRows?: unknown[]
  guidelineVersions?: GuidelineVersionRef[]
  clauseResults?: ClauseResult[]
  /** Convenience: a snapshot produced by `toRunSnapshot`; individual fields override it. */
  snapshot?: RunSnapshotFields
}

/**
 * Merge an optional snapshot with any individually-supplied framework fields, returning only
 * the keys that are actually defined so legacy runs stay free of `undefined` clutter.
 */
function resolveFrameworkFields(params: FrameworkRunFields): Partial<RunSnapshotFields> {
  const merged: Partial<RunSnapshotFields> = {}
  const { snapshot } = params
  const calculatorDefinitionId = params.calculatorDefinitionId ?? snapshot?.calculatorDefinitionId
  const scheduleRows = params.scheduleRows ?? snapshot?.scheduleRows
  const guidelineVersions = params.guidelineVersions ?? snapshot?.guidelineVersions
  const clauseResults = params.clauseResults ?? snapshot?.clauseResults

  if (calculatorDefinitionId !== undefined) merged.calculatorDefinitionId = calculatorDefinitionId
  if (scheduleRows !== undefined) merged.scheduleRows = scheduleRows
  if (guidelineVersions !== undefined) merged.guidelineVersions = guidelineVersions
  if (clauseResults !== undefined) merged.clauseResults = clauseResults
  return merged
}

const STORAGE_KEY = 'standalone_tool_runs'

function getStoredRuns(): StandaloneToolRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persistRuns(runs: StandaloneToolRun[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
  } catch {
    console.warn('Failed to persist standalone tool runs to localStorage')
  }
}

export class StandaloneToolRunService {
  private runs: StandaloneToolRun[] = getStoredRuns()
  private nextRunId = this.runs.length + 1

  createRun(params: {
    toolId: string
    toolLabel: string
    category: any
    userId: string
    role: string
    input: Record<string, unknown>
    output: Record<string, unknown>
  } & FrameworkRunFields): StandaloneToolRun {
    const now = new Date().toISOString()
    const framework = resolveFrameworkFields(params)
    const run: StandaloneToolRun = {
      runId: `standalone-run-${String(this.nextRunId++).padStart(4, '0')}`,
      toolId: params.toolId,
      toolLabel: params.toolLabel,
      category: params.category,
      userId: params.userId,
      role: params.role,
      input: params.input,
      output: params.output,
      assignedToProject: null,
      assignedToJobRef: null,
      notes: null,
      exportedAt: null,
      exportFormat: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      ...framework,
    }
    this.runs.push(run)
    persistRuns(this.runs)
    return run
  }

  /**
   * Persist (or replace) the Toolbox Capability Framework snapshot on an existing run —
   * e.g. when a recompute produces fresh clause outcomes/pinned versions before save.
   * Bumps the version and returns the updated run, or null if the run is unknown.
   */
  saveRunSnapshot(runId: string, fields: FrameworkRunFields): StandaloneToolRun | null {
    const idx = this.runs.findIndex(r => r.runId === runId)
    if (idx === -1) return null
    const framework = resolveFrameworkFields(fields)
    const updated: StandaloneToolRun = {
      ...this.runs[idx],
      ...framework,
      updatedAt: new Date().toISOString(),
      version: this.runs[idx].version + 1,
    }
    this.runs[idx] = updated
    persistRuns(this.runs)
    return updated
  }

  /**
   * Re-open a saved run as a NEW version (Requirement 9.2). Creates a fresh run record
   * derived from the parent — copying its tool/user identity and framework metadata — with
   * the edited inputs/output applied, `version` bumped, and `previousRunId` linking lineage.
   * The parent run is left intact (immutable history). Returns the new run, or null when
   * the parent is unknown.
   *
   * Callers obtain the editable starting state via `restoreRunForReopen`, edit it (and
   * typically recompute against the pinned guideline versions), then persist the result here.
   */
  reopenAsNewVersion(
    runId: string,
    edited: {
      input?: Record<string, unknown>
      output?: Record<string, unknown>
    } & FrameworkRunFields = {},
  ): StandaloneToolRun | null {
    const parent = this.getRunById(runId)
    if (!parent) return null
    const now = new Date().toISOString()
    // Default each framework field to the parent's; individually-supplied edits override.
    const framework = resolveFrameworkFields({
      calculatorDefinitionId: edited.calculatorDefinitionId ?? parent.calculatorDefinitionId,
      scheduleRows: edited.scheduleRows ?? parent.scheduleRows,
      guidelineVersions: edited.guidelineVersions ?? parent.guidelineVersions,
      clauseResults: edited.clauseResults ?? parent.clauseResults,
      snapshot: edited.snapshot,
    })
    const run: StandaloneToolRun = {
      runId: `standalone-run-${String(this.nextRunId++).padStart(4, '0')}`,
      toolId: parent.toolId,
      toolLabel: parent.toolLabel,
      category: parent.category,
      userId: parent.userId,
      role: parent.role,
      input: edited.input ?? { ...parent.input },
      output: edited.output ?? { ...parent.output },
      assignedToProject: null,
      assignedToJobRef: null,
      notes: null,
      exportedAt: null,
      exportFormat: null,
      createdAt: now,
      updatedAt: now,
      version: parent.version + 1,
      previousRunId: parent.runId,
      ...framework,
    }
    this.runs.push(run)
    persistRuns(this.runs)
    return run
  }

  assignToProject(runId: string, request: AssignToProjectRequest): StandaloneToolRun | null {
    const idx = this.runs.findIndex(r => r.runId === runId)
    if (idx === -1) return null
    const updated: StandaloneToolRun = {
      ...this.runs[idx],
      assignedToProject: request.projectName,
      assignedToJobRef: request.jobRef,
      notes: request.notes ?? null,
      updatedAt: new Date().toISOString(),
      version: this.runs[idx].version + 1,
    }
    this.runs[idx] = updated
    persistRuns(this.runs)
    return updated
  }

  /**
   * Assign a run to a project AND produce the project hand-off (Requirement 9.3): records
   * the project/job reference (via `assignToProject`), then creates a project-record
   * envelope and a document-adapter entry from the run, persisting their references
   * (`projectRecordId`, `documentId`) back onto the run. Returns the updated run plus the
   * created hand-off entries, or null when the run is unknown.
   */
  assignToProjectWithHandoff(
    runId: string,
    request: AssignToProjectRequest,
  ): { run: StandaloneToolRun; handoff: ToolRunProjectHandoff } | null {
    const assigned = this.assignToProject(runId, request)
    if (!assigned) return null
    const handoff = createToolRunProjectHandoff(assigned, request)
    const idx = this.runs.findIndex(r => r.runId === runId)
    const updated: StandaloneToolRun = {
      ...this.runs[idx],
      projectRecordId: handoff.projectRecord.recordId,
      documentId: handoff.documentOutput.documentId,
      updatedAt: new Date().toISOString(),
    }
    this.runs[idx] = updated
    persistRuns(this.runs)
    return { run: updated, handoff }
  }

  markExported(runId: string, format: 'pdf' | 'csv' | 'json'): StandaloneToolRun | null {
    const idx = this.runs.findIndex(r => r.runId === runId)
    if (idx === -1) return null
    const updated: StandaloneToolRun = {
      ...this.runs[idx],
      exportedAt: new Date().toISOString(),
      exportFormat: format,
      updatedAt: new Date().toISOString(),
      version: this.runs[idx].version + 1,
    }
    this.runs[idx] = updated
    persistRuns(this.runs)
    return updated
  }

  getRunsForUser(userId: string): StandaloneToolRun[] {
    return this.runs.filter(r => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getRunsForTool(toolId: string, userId: string): StandaloneToolRun[] {
    return this.runs.filter(r => r.toolId === toolId && r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getRunById(runId: string): StandaloneToolRun | undefined {
    return this.runs.find(r => r.runId === runId)
  }

  getRecentRunCount(toolId: string, userId: string): number {
    return this.runs.filter(r => r.toolId === toolId && r.userId === userId).length
  }

  clearAll(): void {
    this.runs = []
    this.nextRunId = 1
    localStorage.removeItem(STORAGE_KEY)
  }
}

// Singleton
export const standaloneToolRunService = new StandaloneToolRunService()
