export type ToolCategory =
  | 'professional-fees'
  | 'compliance'
  | 'documents'
  | 'procurement'
  | 'commercial'
  | 'site-execution'
  | 'governance';

export type ToolRunStatus = 'draft' | 'completed' | 'issued' | 'superseded' | 'failed';

export interface ToolContext {
  tenantId: string;
  userId: string;
  userRole: string;
  now?: Date;
}

export interface ProjectAssignment {
  mode: 'none' | 'internal-project' | 'external-reference';
  projectId?: string;
  projectName?: string;
  externalReference?: string;
  notes?: string;
}

export interface GovernanceProfile {
  requiresProfessionalConfirmation: boolean;
  allowsAiDraft: boolean;
  locksOnIssue: boolean;
  downstreamWriteBack: Array<'ProjectRecord' | 'Inbox' | 'AuditTrail'>;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  version: string;
  roles: string[];
  category: ToolCategory;
  route: string;
  description: string;
  tags: string[];
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  governance: GovernanceProfile;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput> | TOutput;
}

export interface ToolRun {
  id: string;
  tenantId: string;
  userId: string;
  toolId: string;
  toolVersion: string;
  role: string;
  assignment: ProjectAssignment;
  status: ToolRunStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  exports: ExportRecord[];
  auditSnapshot?: AuditSnapshot;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
  supersedesRunId?: string;
}

export interface ExportRecord {
  id: string;
  format: 'json' | 'csv' | 'html';
  filename: string;
  mimeType: string;
  content: string;
  createdAt: string;
}

export interface AuditSnapshot {
  hash: string;
  algorithm: string;
  reason: string;
  createdAt: string;
  locked: boolean;
}

export interface IntegrationEvent {
  id: string;
  type: 'ProjectRecord' | 'Inbox' | 'AuditTrail';
  tenantId: string;
  userId: string;
  toolRunId: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
