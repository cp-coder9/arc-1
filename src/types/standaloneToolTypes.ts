// Standalone Tool Types — Independent Tool Tiles System

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
