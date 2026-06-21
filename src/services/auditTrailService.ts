import type { AuditRecord, BaseContext } from '../types/agentOrchestration';
import type { ComplexityAssessment, SubmissionAuditRecord } from '../types/municipalSubmissionReadiness';

const auditLog: AuditRecord[] = [];

export function audit(ctx: BaseContext, action: string, sourceObjectId: string, metadata?: Record<string, unknown>): AuditRecord {
  const record: AuditRecord = {
    auditId: `audit-${auditLog.length + 1}`,
    actorId: ctx.userId,
    action,
    sourceObjectId,
    createdAt: ctx.now,
    immutable: true,
    ...(metadata ? { metadata } : {}),
  };
  auditLog.push(record);
  return record;
}

export function getAuditRecords(filters?: { actorId?: string; action?: string; sourceObjectId?: string; since?: string; limit?: number }): AuditRecord[] {
  let results = [...auditLog];
  if (filters?.actorId) results = results.filter((r) => r.actorId === filters.actorId);
  if (filters?.action) results = results.filter((r) => r.action.includes(filters.action!));
  if (filters?.sourceObjectId) results = results.filter((r) => r.sourceObjectId === filters.sourceObjectId);
  if (filters?.since) results = results.filter((r) => r.createdAt >= filters.since!);
  if (filters?.limit) results = results.slice(0, filters.limit);
  return results;
}

export function assertAuditImmutableUpdateAttempt(changedKeys: string[]): void {
  if (changedKeys.length > 0) {
    throw new Error(`immutable audit records cannot be updated. Attempted to change: ${changedKeys.join(', ')}`);
  }
}

export function exportAuditRecords(): AuditRecord[] {
  return [...auditLog];
}

export function resetAuditState(): void {
  auditLog.length = 0;
}

export function createAuditEntry(params: {
  actorId: string;
  action: string;
  sourceObjectId: string;
}): AuditRecord {
  const record: AuditRecord = {
    auditId: `audit-${auditLog.length + 1}`,
    actorId: params.actorId,
    action: params.action,
    sourceObjectId: params.sourceObjectId,
    createdAt: new Date().toISOString(),
  };
  auditLog.push(record);
  return record;
}

/**
 * Generic audit trail creator for backward compatibility.
 * Used by municipalSubmissionReadinessService.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAuditTrail(
  _complexity: ComplexityAssessment,
  _readiness: any,
  projectId?: string
): SubmissionAuditRecord[] {
  const now = new Date().toISOString();
  const baseId = projectId || 'unknown';
  return [
    {
      id: `audit-${baseId}-complexity`,
      action: 'project_complexity_classified',
      actor: 'system',
      notes: 'Project complexity classified for submission readiness.',
      timestamp: now,
    },
    {
      id: `audit-${baseId}-readiness`,
      action: 'municipal_readiness_assessed',
      actor: 'system',
      notes: 'Municipal submission readiness assessed.',
      timestamp: now,
    },
    {
      id: `audit-${baseId}-approval`,
      action: 'human_approval_required',
      actor: 'system',
      notes: 'Professional human review required before formal municipal submission.',
      timestamp: now,
    },
  ];
}

export function queryAudit(sourceObjectId?: string, actorId?: string, limitCount = 50): AuditRecord[] {
  let results = [...auditLog];
  if (sourceObjectId) results = results.filter((r) => r.sourceObjectId === sourceObjectId);
  if (actorId) results = results.filter((r) => r.actorId === actorId);
  return results.reverse().slice(0, limitCount);
}

export function getAuditSummary(): { totalRecords: number; uniqueActors: number; uniqueActions: number } {
  return {
    totalRecords: auditLog.length,
    uniqueActors: new Set(auditLog.map((r) => r.actorId)).size,
    uniqueActions: new Set(auditLog.map((r) => r.action)).size,
  };
}
