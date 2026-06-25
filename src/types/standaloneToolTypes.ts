// Standalone Tool Types — Independent Tool Tiles System

import type { ClauseResult, GuidelineVersionRef } from '@/services/toolbox/types'

export type StandaloneToolCategory =
  | 'fee_calculator'
  | 'compliance'
  | 'drawing'
  | 'document_control'
  | 'briefing'
  | 'proposal'
  | 'tendering'
  | 'estimating'
  | 'site_management'
  | 'workforce'
  | 'plant_equipment'
  | 'procurement'
  | 'supplier'
  | 'payment'
  | 'closeout'
  | 'admin_governance'
  | 'cpd'
  | 'communication'
  | 'freelancer'
  | 'resource_centre'
  | 'general'

export interface StandaloneToolDef {
  id: string
  label: string
  category: StandaloneToolCategory
  description: string
  roles: string[]  // UserRole values
  icon: string  // lucide-react icon name string
  route: string  // URL path or page ID for the standalone tool
  standaloneOnly: boolean  // true = only available here, not in workflow view
  requiresInput: boolean
  canExport: boolean
  canAssignToProject: boolean
  recentRunsCount: number
  tags: string[]
  /**
   * Optional FK to a Toolbox Capability Framework `CalculatorDefinition`.
   * When present, the definition-driven runner takes over; otherwise the legacy
   * runner path is used (zero-downtime migration). Additive, non-breaking.
   */
  calculatorDefinitionId?: string
}

export interface StandaloneToolRun {
  runId: string
  toolId: string
  toolLabel: string
  category: StandaloneToolCategory
  userId: string
  role: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  assignedToProject: string | null  // user-defined project name/ID, can be external
  assignedToJobRef: string | null   // user-defined external job reference
  notes: string | null
  exportedAt: string | null
  exportFormat: 'pdf' | 'csv' | 'json' | null
  createdAt: string
  updatedAt: string
  version: number
  /**
   * Toolbox Capability Framework run metadata (additive, optional — legacy runs omit these).
   * Persists the calculator definition, schedule rows, pinned guideline versions, and
   * clause outcomes so a run is fully reproducible (Requirements 3.3, 9.1).
   */
  calculatorDefinitionId?: string
  scheduleRows?: unknown[]
  guidelineVersions?: GuidelineVersionRef[]
  clauseResults?: ClauseResult[]
  /**
   * Lineage + project hand-off references (additive, optional — legacy runs omit these).
   * `previousRunId` links a run created by re-opening a saved run as a new version
   * (Requirement 9.2). `projectRecordId` / `documentId` capture the project record and
   * document-adapter entries produced when a run is assigned to a project (Requirement 9.3).
   */
  previousRunId?: string
  projectRecordId?: string
  documentId?: string
}

export interface StandaloneToolResult {
  runId: string
  toolId: string
  label: string
  summary: string
  amount?: number
  currency?: string
  tableRows?: Record<string, string | number>[]
  files?: string[]
  timestamp: string
}

export interface AssignToProjectRequest {
  runId: string
  projectName: string
  jobRef: string
  notes?: string
}
