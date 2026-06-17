import type { BaseContext, WorkflowRecord } from '../types/agentOrchestration';
import type { ProjectRecord, ProjectPhase, ProductModuleKey, ProjectRecordType, ApprovalMetadata, AuditMetadata } from '../types/architexMasterTypes';
import type { SiteProjectRecord } from '../types';
import { ORCHESTRATION_MODULE_KEY } from '../types/agentOrchestration';

let seq = 1;

export function toProjectRecord(
  ctx: BaseContext,
  workflowRecord: WorkflowRecord,
  linkedRecordIds?: string[],
): ProjectRecord {
  const approval: ApprovalMetadata = {
    status: workflowRecord.approvalsRequired.length > 0 ? 'pending_review' : 'approved',
    requiredApproverRoles: workflowRecord.approvalsRequired.length > 0
      ? workflowRecord.approvalsRequired.map((r) => r as import('../types/architexMasterTypes').ArchitexRole)
      : [],
  };

  const audit: AuditMetadata = {
    createdByUserId: ctx.userId,
    createdAt: ctx.now,
    source: 'agent',
    revision: 1,
  };

  return {
    id: `projectRecord-${seq++}`,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    phase: guessPhase(ctx.now),
    moduleKey: ORCHESTRATION_MODULE_KEY as unknown as ProductModuleKey,
    recordType: workflowRecord.type as ProjectRecordType,
    title: workflowRecord.title,
    status: workflowRecord.status,
    payload: workflowRecord,
    approval,
    audit,
    linkedRecordIds: linkedRecordIds ?? [],
  };
}

export async function createProjectRecord(params: {
  projectId: string;
  tenantId: string;
  phase: string;
  recordType: string;
  title: string;
  status: string;
  payload: unknown;
  linkedRecordIds: string[];
  createdBy: string;
}): Promise<string> {
  return `record-${seq++}-${params.recordType}`;
}

export function projectRecordsFromDocuments(
  _docs: unknown[],
  _dwgs: unknown[],
): Array<{ recordType: string; title: string; status: string }> {
  return [
    { recordType: 'document', title: 'Document Register', status: 'active' },
    { recordType: 'drawing_revision', title: 'Drawing Register', status: 'active' },
  ];
}

export function subscribeToProjectRecords(
  projectId: string,
  callback: (records: SiteProjectRecord[]) => void,
): () => void {
  callback([]);
  return () => {};
}

function guessPhase(_now: string): ProjectPhase {
  return 'design_coordination';
}
