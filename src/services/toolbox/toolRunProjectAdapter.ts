// Toolbox — assign-to-project hand-off adapter
//
// Maps a saved `StandaloneToolRun` onto the project layer when it is assigned to a project
// (Requirement 9.3): it produces both a project-record envelope and a document-adapter
// entry derived from the run, alongside the project/job reference recorded on the run.
//
// This is the single, cohesive place that knows how a tool run becomes project artefacts.
// It is intentionally synchronous and side-effect free — it builds the entries; the run
// service persists references to them. The created entries are advisory document-prep
// (never statutory certification): clause outcomes and guideline versions ride along so
// the project record is fully traceable to the version-pinned run that produced it.

import type { StandaloneToolRun, AssignToProjectRequest } from '@/types/standaloneToolTypes'
import type { ClauseResult, GuidelineVersionRef } from './types'
import { createToolRunDocumentOutput, type DocumentOutput } from '@/services/documentAdapter'

let recordSeq = 1

/** Reset the internal record-id counter — test-only determinism helper. */
export function __resetToolRunRecordSeq(): void {
  recordSeq = 1
}

/**
 * A project-record envelope created from a tool run. Mirrors the lightweight shape used by
 * `projectRecordAdapter` (recordType/title/status) while carrying the run-specific
 * provenance needed for an audit-ready project record.
 */
export interface ToolRunProjectRecord {
  recordId: string
  recordType: 'tool_run'
  /** User-defined project name/ID the run was assigned to (may be external). */
  projectName: string
  /** User-defined external job reference. */
  jobRef: string
  toolId: string
  toolLabel: string
  category: string
  title: string
  status: 'active'
  /** The run this record was produced from (lineage back to the version-pinned run). */
  sourceRunId: string
  calculatorDefinitionId?: string
  guidelineVersions?: GuidelineVersionRef[]
  clauseResults?: ClauseResult[]
  notes?: string
  createdAt: string
}

/** The full project hand-off produced when a run is assigned to a project. */
export interface ToolRunProjectHandoff {
  projectRecord: ToolRunProjectRecord
  documentOutput: DocumentOutput
}

/**
 * Build a project-record envelope from a run + assign request. Pure: no persistence,
 * no mutation of the run.
 */
export function toolRunToProjectRecord(
  run: StandaloneToolRun,
  request: AssignToProjectRequest,
): ToolRunProjectRecord {
  const record: ToolRunProjectRecord = {
    recordId: `projectRecord-toolrun-${recordSeq++}`,
    recordType: 'tool_run',
    projectName: request.projectName,
    jobRef: request.jobRef,
    toolId: run.toolId,
    toolLabel: run.toolLabel,
    category: run.category,
    title: `${run.toolLabel} — ${request.projectName}`,
    status: 'active',
    sourceRunId: run.runId,
    createdAt: new Date().toISOString(),
  }
  // Carry framework provenance only when present so legacy runs stay free of clutter.
  if (run.calculatorDefinitionId !== undefined) record.calculatorDefinitionId = run.calculatorDefinitionId
  if (run.guidelineVersions !== undefined) {
    record.guidelineVersions = run.guidelineVersions.map((v) => ({ ...v }))
  }
  if (run.clauseResults !== undefined) {
    record.clauseResults = run.clauseResults.map((c) => ({ ...c }))
  }
  if (request.notes !== undefined) record.notes = request.notes
  return record
}

/**
 * Produce the complete project hand-off (project record + document adapter entry) for a
 * run being assigned to a project. The caller (run service) persists the resulting
 * `recordId` / `documentId` references back onto the run.
 */
export function createToolRunProjectHandoff(
  run: StandaloneToolRun,
  request: AssignToProjectRequest,
): ToolRunProjectHandoff {
  return {
    projectRecord: toolRunToProjectRecord(run, request),
    documentOutput: createToolRunDocumentOutput(run, request),
  }
}
