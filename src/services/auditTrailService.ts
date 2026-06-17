import type { AuditRecord, BaseContext } from '../types/agentOrchestration';
import type { ComplexityAssessment, SubmissionAuditRecord } from '../types/municipalSubmissionReadiness';

const auditLog: AuditRecord[] = [];

export function audit(ctx: BaseContext, action: string, sourceObjectId: string): AuditRecord {
  const record: AuditRecord = {
    auditId: `audit-${auditLog.length + 1}`,
    actorId: ctx.userId,
    action,
    sourceObjectId,
    createdAt: ctx.now,
  };
  auditLog.push(record);
  return record;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAuditTrail(_complexity: ComplexityAssessment, _readiness: any): SubmissionAuditRecord[] {
  return [
    {
      id: `audit-submission-${auditLog.length + 1}`,
      action: `municipal_readiness_assessment:${_complexity.complexity}`,
      actor: 'system',
      notes: 'Submission readiness assessment completed',
      timestamp: new Date().toISOString(),
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
