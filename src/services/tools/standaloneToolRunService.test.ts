import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StandaloneToolRunService } from './standaloneToolRunService'
import type { RunSnapshotFields } from '@/services/toolbox/runSnapshot'
import type { ClauseResult, GuidelineVersionRef } from '@/services/toolbox/types'

// ----------------------------------------------------------------------------
// Task 4.2 — StandaloneToolRun framework fields round-trip through the run service.
// Verifies Requirement 9.1 (persist input/output/version snapshots, surface in
// run history) and Requirement 9.4 (mark run exported with format + timestamp).
// A fresh service instance is used per test so localStorage state never leaks.
// ----------------------------------------------------------------------------

const GUIDELINE_VERSIONS: GuidelineVersionRef[] = [
  { guideline: 'xa_zone_limits', version: '2024.1' },
]

const CLAUSE_RESULTS: ClauseResult[] = [
  {
    clauseRef: 'SANS 10400-XA 4.3.2',
    label: 'Glazing area within prescriptive limit',
    outcome: 'pass',
    threshold: '<= 20%',
    actual: '15.0%',
  },
]

const SCHEDULE_ROWS = [
  { label: 'North window', glazingAreaM2: 9 },
  { label: 'East window', glazingAreaM2: 6 },
]

// Install an in-memory localStorage so persistence round-trips work regardless of the
// jsdom storage shim in this environment.
function installMemoryLocalStorage(): void {
  const store = new Map<string, string>()
  const memory = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
  vi.stubGlobal('localStorage', memory)
}

function makeService(): StandaloneToolRunService {
  installMemoryLocalStorage()
  localStorage.clear()
  return new StandaloneToolRunService()
}

function baseParams() {
  return {
    toolId: 'fenestration_calc',
    toolLabel: 'XA Fenestration Calculator',
    category: 'compliance' as const,
    userId: 'user-1',
    role: 'energy_professional',
    input: { floorAreaM2: 100 },
    output: { glazingRatio: 0.15 },
  }
}

describe('StandaloneToolRunService — framework field persistence (Req 9.1)', () => {
  let service: StandaloneToolRunService

  beforeEach(() => {
    service = makeService()
  })

  it('persists framework fields supplied individually and round-trips via getRunById', () => {
    const run = service.createRun({
      ...baseParams(),
      calculatorDefinitionId: 'xa_fenestration_v1',
      scheduleRows: SCHEDULE_ROWS,
      guidelineVersions: GUIDELINE_VERSIONS,
      clauseResults: CLAUSE_RESULTS,
    })

    expect(run.calculatorDefinitionId).toBe('xa_fenestration_v1')
    expect(run.scheduleRows).toEqual(SCHEDULE_ROWS)
    expect(run.guidelineVersions).toEqual(GUIDELINE_VERSIONS)
    expect(run.clauseResults).toEqual(CLAUSE_RESULTS)

    const reloaded = service.getRunById(run.runId)
    expect(reloaded).toBeDefined()
    expect(reloaded?.calculatorDefinitionId).toBe('xa_fenestration_v1')
    expect(reloaded?.clauseResults).toEqual(CLAUSE_RESULTS)
  })

  it('accepts a pre-built snapshot object (e.g. from toRunSnapshot)', () => {
    const snapshot: RunSnapshotFields = {
      calculatorDefinitionId: 'xa_fenestration_v1',
      scheduleRows: SCHEDULE_ROWS,
      guidelineVersions: GUIDELINE_VERSIONS,
      clauseResults: CLAUSE_RESULTS,
    }
    const run = service.createRun({ ...baseParams(), snapshot })

    expect(run.calculatorDefinitionId).toBe('xa_fenestration_v1')
    expect(run.scheduleRows).toEqual(SCHEDULE_ROWS)
    expect(run.guidelineVersions).toEqual(GUIDELINE_VERSIONS)
    expect(run.clauseResults).toEqual(CLAUSE_RESULTS)
  })

  it('lets individual fields override a supplied snapshot', () => {
    const snapshot: RunSnapshotFields = {
      calculatorDefinitionId: 'xa_fenestration_v1',
      scheduleRows: SCHEDULE_ROWS,
      guidelineVersions: GUIDELINE_VERSIONS,
      clauseResults: CLAUSE_RESULTS,
    }
    const run = service.createRun({
      ...baseParams(),
      snapshot,
      calculatorDefinitionId: 'xa_fenestration_v2',
    })

    expect(run.calculatorDefinitionId).toBe('xa_fenestration_v2')
    // Non-overridden fields fall back to the snapshot.
    expect(run.scheduleRows).toEqual(SCHEDULE_ROWS)
  })

  it('keeps legacy runs free of framework keys when none are supplied (backward compatible)', () => {
    const run = service.createRun(baseParams())

    expect(run.input).toEqual({ floorAreaM2: 100 })
    expect('calculatorDefinitionId' in run).toBe(false)
    expect('scheduleRows' in run).toBe(false)
    expect('guidelineVersions' in run).toBe(false)
    expect('clauseResults' in run).toBe(false)
  })

  it('surfaces framework runs in user/tool run history', () => {
    service.createRun({
      ...baseParams(),
      calculatorDefinitionId: 'xa_fenestration_v1',
      guidelineVersions: GUIDELINE_VERSIONS,
    })

    const userRuns = service.getRunsForUser('user-1')
    expect(userRuns).toHaveLength(1)
    expect(userRuns[0].calculatorDefinitionId).toBe('xa_fenestration_v1')

    const toolRuns = service.getRunsForTool('fenestration_calc', 'user-1')
    expect(toolRuns).toHaveLength(1)
    expect(toolRuns[0].guidelineVersions).toEqual(GUIDELINE_VERSIONS)
  })

  it('saveRunSnapshot attaches/replaces framework metadata on an existing run and bumps version', () => {
    const run = service.createRun(baseParams())
    expect(run.version).toBe(1)

    const updated = service.saveRunSnapshot(run.runId, {
      calculatorDefinitionId: 'xa_fenestration_v1',
      scheduleRows: SCHEDULE_ROWS,
      guidelineVersions: GUIDELINE_VERSIONS,
      clauseResults: CLAUSE_RESULTS,
    })

    expect(updated).not.toBeNull()
    expect(updated?.version).toBe(2)
    expect(updated?.calculatorDefinitionId).toBe('xa_fenestration_v1')
    expect(updated?.clauseResults).toEqual(CLAUSE_RESULTS)
  })

  it('saveRunSnapshot returns null for an unknown run', () => {
    expect(service.saveRunSnapshot('does-not-exist', { calculatorDefinitionId: 'x' })).toBeNull()
  })

  it('persists framework fields across service re-instantiation (localStorage round-trip)', () => {
    const run = service.createRun({
      ...baseParams(),
      calculatorDefinitionId: 'xa_fenestration_v1',
      scheduleRows: SCHEDULE_ROWS,
      guidelineVersions: GUIDELINE_VERSIONS,
      clauseResults: CLAUSE_RESULTS,
    })

    // New instance reads from the same localStorage backing store.
    const reloadedService = new StandaloneToolRunService()
    const reloaded = reloadedService.getRunById(run.runId)
    expect(reloaded?.calculatorDefinitionId).toBe('xa_fenestration_v1')
    expect(reloaded?.scheduleRows).toEqual(SCHEDULE_ROWS)
    expect(reloaded?.clauseResults).toEqual(CLAUSE_RESULTS)
  })
})

describe('StandaloneToolRunService — markExported (Req 9.4)', () => {
  let service: StandaloneToolRunService

  beforeEach(() => {
    service = makeService()
  })

  it('marks a framework run exported with format + timestamp and bumps version', () => {
    const run = service.createRun({
      ...baseParams(),
      calculatorDefinitionId: 'xa_fenestration_v1',
      guidelineVersions: GUIDELINE_VERSIONS,
      clauseResults: CLAUSE_RESULTS,
    })
    expect(run.exportedAt).toBeNull()
    expect(run.exportFormat).toBeNull()

    const exported = service.markExported(run.runId, 'pdf')

    expect(exported).not.toBeNull()
    expect(exported?.exportFormat).toBe('pdf')
    expect(exported?.exportedAt).toEqual(expect.any(String))
    expect(() => new Date(exported!.exportedAt!).toISOString()).not.toThrow()
    expect(exported?.version).toBe(2)
    // Framework fields survive an export.
    expect(exported?.calculatorDefinitionId).toBe('xa_fenestration_v1')
    expect(exported?.clauseResults).toEqual(CLAUSE_RESULTS)
  })

  it('supports csv and json export formats', () => {
    const csvRun = service.createRun(baseParams())
    expect(service.markExported(csvRun.runId, 'csv')?.exportFormat).toBe('csv')

    const jsonRun = service.createRun(baseParams())
    expect(service.markExported(jsonRun.runId, 'json')?.exportFormat).toBe('json')
  })

  it('returns null when marking an unknown run exported', () => {
    expect(service.markExported('does-not-exist', 'pdf')).toBeNull()
  })
})
