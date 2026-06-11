/**
 * Audit Trail Service — Pack 14: Agent Orchestration Core
 *
 * Tracks every agent action, recommendation, and decision for audit compliance.
 * Every record is traceable to tenantId, projectId, userId, source object, and policy.
 */
import type { ArchitexRole } from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AuditActionType =
  | 'agent_identity_created'
  | 'agent_recommendation_generated'
  | 'agent_recommendation_approved'
  | 'agent_recommendation_rejected'
  | 'agent_recommendation_applied'
  | 'agent_recommendation_dismissed'
  | 'event_routed'
  | 'event_delivered'
  | 'event_dead_lettered'
  | 'approval_gate_checked'
  | 'approval_gate_passed'
  | 'approval_gate_blocked'
  | 'memory_record_created'
  | 'memory_record_accessed'
  | 'memory_record_purged'
  | 'memory_boundary_violation'
  | 'policy_created'
  | 'policy_updated'
  | 'policy_overridden'
  | 'compliance_check_run'
  | 'compliance_check_failed'
  | 'abuse_detected'
  | 'rate_limit_enforced'
  | 'message_draft_generated'
  | 'message_draft_sent'
  | 'agent_health_check'
  | 'agent_drift_detected';

export interface AgentAuditRecord {
  id: string;
  action: AuditActionType;
  actorId: string; // userId or agentId
  actorRole: ArchitexRole | 'system';
  tenantId: string;
  projectId?: string;
  sourceObjectType: string;
  sourceObjectId: string;
  detail: string;
  metadata?: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export interface AuditQuery {
  tenantId?: string;
  projectId?: string;
  actorId?: string;
  action?: AuditActionType;
  sourceObjectId?: string;
  fromDate?: string;
  toDate?: string;
  minSeverity?: AgentAuditRecord['severity'];
  limit?: number;
}

export interface AuditSummary {
  totalRecords: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  byActor: Record<string, number>;
  period: { start: string; end: string };
}

// ─── Factory ───────────────────────────────────────────────────────────────

let auditSeq = 1;

/**
 * Create an audit record for an agent orchestration action.
 */
export function createAuditRecord(params: {
  action: AuditActionType;
  actorId: string;
  actorRole: ArchitexRole | 'system';
  tenantId: string;
  projectId?: string;
  sourceObjectType: string;
  sourceObjectId: string;
  detail: string;
  metadata?: Record<string, unknown>;
  severity?: AgentAuditRecord['severity'];
}): AgentAuditRecord {
  return {
    id: `audit-agent-${auditSeq++}`,
    action: params.action,
    actorId: params.actorId,
    actorRole: params.actorRole,
    tenantId: params.tenantId,
    projectId: params.projectId,
    sourceObjectType: params.sourceObjectType,
    sourceObjectId: params.sourceObjectId,
    detail: params.detail,
    metadata: params.metadata,
    severity: params.severity ?? resolveSeverity(params.action),
    createdAt: new Date().toISOString(),
  };
}

// ─── Batch Auditing ────────────────────────────────────────────────────────

/**
 * Create audit records for a batch of agent actions in one tenant context.
 */
export function createAuditBatch(
  ctx: {
    actorId: string;
    actorRole: ArchitexRole | 'system';
    tenantId: string;
    projectId?: string;
  },
  actions: Array<{
    action: AuditActionType;
    sourceObjectType: string;
    sourceObjectId: string;
    detail: string;
    metadata?: Record<string, unknown>;
  }>,
): AgentAuditRecord[] {
  return actions.map((a) =>
    createAuditRecord({
      ...a,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      tenantId: ctx.tenantId,
      projectId: ctx.projectId,
    }),
  );
}

// ─── Query Helpers ────────────────────────────────────────────────────────

/**
 * Filter audit records in-memory. In production this would be a Firestore query.
 */
export function queryAuditRecords(
  records: AgentAuditRecord[],
  query: AuditQuery,
): AgentAuditRecord[] {
  let result = [...records];

  if (query.tenantId)
    result = result.filter((r) => r.tenantId === query.tenantId);
  if (query.projectId)
    result = result.filter((r) => r.projectId === query.projectId);
  if (query.actorId)
    result = result.filter((r) => r.actorId === query.actorId);
  if (query.action)
    result = result.filter((r) => r.action === query.action);
  if (query.sourceObjectId)
    result = result.filter((r) => r.sourceObjectId === query.sourceObjectId);
  if (query.fromDate)
    result = result.filter((r) => r.createdAt >= query.fromDate!);
  if (query.toDate)
    result = result.filter((r) => r.createdAt <= query.toDate!);
  if (query.minSeverity)
    result = result.filter(
      (r) => severityRank(r.severity) >= severityRank(query.minSeverity!),
    );

  if (query.limit) result = result.slice(0, query.limit);
  return result;
}

/**
 * Generate a summary from a set of audit records.
 */
export function summarizeAuditRecords(
  records: AgentAuditRecord[],
): AuditSummary {
  const byAction: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byActor: Record<string, number> = {};

  for (const r of records) {
    byAction[r.action] = (byAction[r.action] ?? 0) + 1;
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    byActor[r.actorId] = (byActor[r.actorId] ?? 0) + 1;
  }

  const timestamps = records.map((r) => r.createdAt).sort();
  return {
    totalRecords: records.length,
    byAction,
    bySeverity,
    byActor,
    period: {
      start: timestamps[0] ?? new Date(0).toISOString(),
      end: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const ACTION_SEVERITY: Record<AuditActionType, AgentAuditRecord['severity']> =
  {
    agent_identity_created: 'low',
    agent_recommendation_generated: 'medium',
    agent_recommendation_approved: 'medium',
    agent_recommendation_rejected: 'medium',
    agent_recommendation_applied: 'high',
    agent_recommendation_dismissed: 'low',
    event_routed: 'low',
    event_delivered: 'low',
    event_dead_lettered: 'high',
    approval_gate_checked: 'medium',
    approval_gate_passed: 'medium',
    approval_gate_blocked: 'high',
    memory_record_created: 'low',
    memory_record_accessed: 'low',
    memory_record_purged: 'medium',
    memory_boundary_violation: 'critical',
    policy_created: 'low',
    policy_updated: 'medium',
    policy_overridden: 'high',
    compliance_check_run: 'low',
    compliance_check_failed: 'critical',
    abuse_detected: 'critical',
    rate_limit_enforced: 'high',
    message_draft_generated: 'low',
    message_draft_sent: 'medium',
    agent_health_check: 'low',
    agent_drift_detected: 'high',
  };

function resolveSeverity(
  action: AuditActionType,
): AgentAuditRecord['severity'] {
  return ACTION_SEVERITY[action] ?? 'low';
}

function severityRank(severity: AgentAuditRecord['severity']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
