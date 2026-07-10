import type { ToolRun, ProjectAssignment, ToolRunStatus, ExportRecord, AuditSnapshot } from './types';

export interface FirestoreToolRunDocument {
  tenantId: string;
  userId: string;
  toolId: string;
  toolVersion: string;
  role: string;
  assignment: unknown;
  status: string;
  input: unknown;
  output?: unknown;
  error?: string;
  exports: unknown[];
  auditSnapshot?: unknown;
  locked: boolean;
  previewDisclaimer?: string;
  supersedesRunId?: string;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
}

export function toFirestoreDocument(run: ToolRun): FirestoreToolRunDocument {
  return {
    tenantId: run.tenantId,
    userId: run.userId,
    toolId: run.toolId,
    toolVersion: run.toolVersion,
    role: run.role,
    assignment: run.assignment,
    status: run.status,
    input: run.input,
    output: run.output,
    error: run.error,
    exports: run.exports,
    auditSnapshot: run.auditSnapshot,
    locked: run.locked,
    previewDisclaimer: run.previewDisclaimer,
    supersedesRunId: run.supersedesRunId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    issuedAt: run.issuedAt,
  };
}

export function fromFirestoreDocument(id: string, data: FirestoreToolRunDocument): ToolRun {
  return {
    id,
    tenantId: data.tenantId,
    userId: data.userId,
    toolId: data.toolId,
    toolVersion: data.toolVersion,
    role: data.role,
    assignment: (data.assignment ?? { mode: 'none' }) as ProjectAssignment,
    status: data.status as ToolRunStatus,
    input: data.input,
    output: data.output,
    error: data.error,
    exports: (data.exports ?? []) as ExportRecord[],
    auditSnapshot: data.auditSnapshot as AuditSnapshot | undefined,
    locked: data.locked ?? false,
    previewDisclaimer: data.previewDisclaimer,
    supersedesRunId: data.supersedesRunId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    issuedAt: data.issuedAt,
  };
}
