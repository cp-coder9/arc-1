export type ToolCategory =
  | 'professional-fees'
  | 'compliance'
  | 'documents'
  | 'procurement'
  | 'commercial'
  | 'site-execution'
  | 'governance';

/**
 * Error codes for ToolRun failures across the execution pipeline.
 * Each code maps to a specific failure point in the engine pipeline.
 */
export type ToolRunErrorCode =
  | 'NO_DEFINITION'
  | 'INVALID_INPUT'
  | 'INVALID_SCHEDULE_ROW'
  | 'GENERIC_OUTPUT_DETECTED'
  | 'COMPUTE_FAILED'
  | 'UNSUPPORTED_JURISDICTION'
  | 'RUN_LOCKED'
  | 'REASSIGNMENT_NOT_PERMITTED';

/**
 * Structured error thrown by the ToolboxEngine when a tool run fails
 * at any stage of the execution pipeline.
 */
export class ToolRunError extends Error {
  constructor(
    public readonly code: ToolRunErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ToolRunError';
  }
}

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
  /**
   * Optional link to a CalculatorDefinition id in the definition registry.
   * When set, the engine resolves the Calculator_Definition and validates
   * input (and schedule rows) against its Zod schemas before executing.
   */
  calculatorDefinitionId?: string;
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
  locked: boolean;
  previewDisclaimer?: string;
  supersedesRunId?: string;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
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

/**
 * Generic paginated result wrapper for cursor-based pagination.
 * Used by repository list methods to return paged data.
 */
export interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;  // createdAt of last item for startAfter
  hasMore: boolean;
}

/**
 * Parameters for listing tool runs by tool, scoped to a tenant and user.
 */
export interface ListByToolParams {
  tenantId: string;
  userId: string;
  toolId: string;
  pageSize?: number;  // default 20, max 50
  cursor?: string;    // startAfter createdAt
}

/**
 * Parameters for listing tool runs by project, scoped to a tenant.
 */
export interface ListByProjectParams {
  tenantId: string;
  projectId: string;
  pageSize?: number;  // default 20, max 50
  cursor?: string;    // startAfter createdAt
}
