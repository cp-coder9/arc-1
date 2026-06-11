/**
 * Project Record Adapter — Pack 14: Agent Orchestration Core
 *
 * Converts agent workflow objects into the platform-standard ProjectRecord format,
 * enabling agent-generated outputs to be stored, retrieved, and linked to
 * the project lifecycle.
 */
import type {
  ArchitexRole,
  ProjectRecord,
  ProjectRecordType,
  ProjectPhase,
  ProductModuleKey,
  AuditMetadata,
  ApprovalMetadata,
} from '@/types/architexMasterTypes';

const moduleKey: ProductModuleKey = 'risk_engine'; // agent_orchestration_core → risk_engine in Platform map

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AgentWorkflowRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}

export interface AdapterContext {
  tenantId: string;
  projectId: string;
  phase: ProjectPhase;
  userId: string;
  actorRole: string;
  moduleKey?: ProductModuleKey;
  now?: string;
}

// ─── Record Type Mapping ───────────────────────────────────────────────────

const AGENT_TYPE_TO_RECORD_TYPE: Record<string, ProjectRecordType> = {
  agentIdentity: 'practice_record',
  userAgent: 'practice_record',
  projectAgent: 'practice_record',
  systemGovernanceAgent: 'verification_record',
  eventRouting: 'risk_alert',
  recommendationPolicy: 'verification_record',
  contextualMessageDraft: 'document',
  approvalGate: 'verification_record',
  agentMemoryBoundary: 'practice_record',
  agentMonitoring: 'risk_alert',
};

// ─── Adapter ───────────────────────────────────────────────────────────────

let recordSeq = 1;

/**
 * Convert an agent workflow record into a platform-standard ProjectRecord.
 * Links records to tenant, project, phase, and enriches with audit + approval metadata.
 */
export function toProjectRecord(
  ctx: AdapterContext,
  record: AgentWorkflowRecord,
  linkedRecordIds: string[] = [],
): ProjectRecord<AgentWorkflowRecord> {
  const now = ctx.now ?? new Date().toISOString();
  const recordType =
    AGENT_TYPE_TO_RECORD_TYPE[record.type] ?? 'practice_record';

  const audit: AuditMetadata = {
    createdByUserId: ctx.userId,
    createdAt: now,
    source: 'agent',
  };

  const approval: ApprovalMetadata = {
    status:
      record.status === 'active'
        ? 'approved'
        : record.status === 'blocked'
          ? 'pending_review'
          : record.status === 'requires_review'
            ? 'pending_review'
            : record.status === 'ready_with_minor_items'
              ? 'pending_review'
              : 'draft',
    requiredApproverRoles: resolveApproverRoles(record),
  };

  return {
    id: `project-record-agent-${ctx.projectId}-${recordSeq++}`,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    phase: ctx.phase,
    moduleKey: ctx.moduleKey ?? (moduleKey as ProductModuleKey),
    recordType,
    title: record.title,
    status: record.status,
    payload: record,
    approval,
    audit,
    linkedRecordIds,
  };
}

/**
 * Batch-convert multiple agent workflow records to ProjectRecords,
 * linking each successive record to the previous one.
 */
export function toProjectRecords(
  ctx: AdapterContext,
  records: AgentWorkflowRecord[],
): ProjectRecord<AgentWorkflowRecord>[] {
  return records.map((record, index) => {
    const linkedIds =
      index > 0 ? [records[index - 1].id] : [];
    return toProjectRecord(ctx, record, linkedIds);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function resolveApproverRoles(
  record: AgentWorkflowRecord,
): ArchitexRole[] {
  // Map string-based approval roles to valid ArchitexRole values
  const validRoles: ArchitexRole[] = [
    'architect', 'client', 'platform_admin', 'engineer',
    'quantity_surveyor', 'contractor',
  ];
  return (record.approvalsRequired ?? [])
    .filter((r): r is ArchitexRole => validRoles.includes(r as ArchitexRole));
}
