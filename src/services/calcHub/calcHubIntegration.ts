// Engineer's Calculation Hub — Platform Integration Adapters
//
// Persistence, project assignment, SpecForge push, and audit trail stubs.
// These adapters define the integration contracts between the Calculator Hub
// and the broader Architex platform spine (Project Passport, SpecForge, Audit Trail).
//
// Design reference: .kiro/specs/engineers-calculation-hub/design.md §6
// Requirements: 5.1, 5.2, 5.6, 7.1-7.6

import type { CalculatorOutput } from './types'

// ----------------------------------------------------------------------------
// StandaloneToolRun — local interface (platform type may not be available yet)
// ----------------------------------------------------------------------------

export interface StandaloneToolRun {
  runId: string
  toolId: string
  toolLabel: string
  category: string
  userId: string
  role: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  assignedToProject: string | null
  assignedToJobRef: string | null
  notes: string | null
  exportedAt: string | null
  exportFormat: string | null
  createdAt: string
  updatedAt: string
  version: number
  calculatorDefinitionId: string
  previousRunId?: string
}

// ----------------------------------------------------------------------------
// persistCalcRun — persist a completed calculator run as a StandaloneToolRun
// Requirement 5.1: Persist a Calculator_Run record on calculation completion
// Requirement 5.2: Conform to StandaloneToolRun interface
// ----------------------------------------------------------------------------

export function persistCalcRun(params: {
  calculatorId: string
  userId: string
  role: string
  input: Record<string, unknown>
  output: CalculatorOutput
}): StandaloneToolRun {
  const now = new Date().toISOString()
  const runId = crypto.randomUUID()

  const run: StandaloneToolRun = {
    runId,
    toolId: params.calculatorId,
    toolLabel: params.calculatorId,
    category: 'compliance',
    userId: params.userId,
    role: params.role,
    input: params.input,
    output: params.output as unknown as Record<string, unknown>,
    assignedToProject: null,
    assignedToJobRef: null,
    notes: null,
    exportedAt: null,
    exportFormat: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
    calculatorDefinitionId: params.calculatorId,
  }

  return run
}

// ----------------------------------------------------------------------------
// assignRunToProject — assign a run to a project, write compliance evidence
// Requirement 7.1: Persist assignment by updating assignedToProject/assignedToJobRef
// Requirement 7.2: Write compliance evidence record to Project Passport
// ----------------------------------------------------------------------------

export function assignRunToProject(params: {
  run: StandaloneToolRun
  projectName: string
  jobRef: string
}): void {
  const { run, projectName, jobRef } = params

  // Mutate the run record with project assignment
  run.assignedToProject = projectName
  run.assignedToJobRef = jobRef
  run.updatedAt = new Date().toISOString()

  // Stub: In the full platform, this writes a compliance evidence record
  // to Project Passport containing calculator name, pass/fail status,
  // key result summary, SANS references, run ID, and timestamp.
  // Actual Firestore write happens at the UI/service layer.
  console.info(
    `[CalcHub] Run ${run.runId} assigned to project "${projectName}" (job: ${jobRef})`
  )
}

// ----------------------------------------------------------------------------
// pushRunToSpecForge — create a spec item in SpecForge from a run
// Requirement 7.3: Create spec item with calculator name, result summary,
//                  SANS references as clause tags, and run ID as source reference
// ----------------------------------------------------------------------------

export function pushRunToSpecForge(params: {
  run: StandaloneToolRun
  output: CalculatorOutput
}): void {
  const { run, output } = params

  // Stub: Actual SpecForge integration happens in the UI layer.
  // This function defines the contract — the spec item shape would be:
  //   title: run.toolLabel
  //   description: result summary from output.results
  //   clauseTags: output.sansReferences
  //   sourceRef: run.runId
  console.info(
    `[CalcHub] Run ${run.runId} pushed to SpecForge — status: ${output.status}, refs: ${output.sansReferences.join(', ')}`
  )
}

// ----------------------------------------------------------------------------
// auditCalcEvent — record an audit event for a calculator action
// Requirement 7.4: calculator_run_created event
// Requirement 7.5: calculator_run_assigned event
// Requirement 7.6: calculator_run_exported event
// ----------------------------------------------------------------------------

export function auditCalcEvent(params: {
  action: 'calculator_run_created' | 'calculator_run_assigned' | 'calculator_run_exported'
  userId: string
  runId: string
  calculatorDefinitionId: string
  projectId?: string
  exportFormat?: string
}): void {
  // Stub: Actual audit trail integration happens at the platform level.
  // This function defines the contract shape for audit events.
  const timestamp = new Date().toISOString()

  console.info(
    `[CalcHub Audit] ${params.action} | run=${params.runId} | calc=${params.calculatorDefinitionId} | user=${params.userId} | ts=${timestamp}${
      params.projectId ? ` | project=${params.projectId}` : ''
    }${params.exportFormat ? ` | format=${params.exportFormat}` : ''}`
  )
}
