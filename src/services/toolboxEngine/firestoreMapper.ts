import type { ToolRun } from './types';

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
  exports: unknown[];
  auditSnapshot?: unknown;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
  supersedesRunId?: string;
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
    exports: run.exports,
    auditSnapshot: run.auditSnapshot,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    issuedAt: run.issuedAt,
    supersedesRunId: run.supersedesRunId,
  };
}
