// Standalone Tool Run Service — Persistence for independent tool runs
// Supports: localStorage (default), Firestore (when available)
import type { StandaloneToolRun, AssignToProjectRequest, StandaloneToolResult } from '@/types/standaloneToolTypes'

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
  }): StandaloneToolRun {
    const now = new Date().toISOString()
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
