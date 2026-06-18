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
<<<<<<< HEAD
      id: `audit-submission-${auditLog.length + 1}`,
      action: `municipal_readiness_assessment:${_complexity.complexity}`,
      actor: 'system',
      notes: 'Submission readiness assessment completed',
      timestamp: new Date().toISOString(),
=======
      auditId: `audit-${appointment.appointmentId}-snapshot`,
      entityId: appointment.appointmentId,
      action: "accepted_proposal_snapshotted",
      actor: "system",
      atIso: nowIso,
      notes: `Proposal ${appointment.proposalSnapshot.proposalId} revision ${appointment.proposalSnapshot.proposalRevisionId} snapshotted.`
    },
    {
      auditId: `audit-${appointment.appointmentId}-appointment`,
      entityId: appointment.appointmentId,
      action: "appointment_created",
      actor: "system",
      atIso: nowIso,
      notes: "Appointment record created from accepted proposal."
    },
    {
      auditId: `audit-${kickoff.workspace.projectId}-workspace`,
      entityId: kickoff.workspace.projectId,
      action: "project_workspace_created",
      actor: "system",
      atIso: nowIso,
      notes: `Workspace created with readiness ${kickoff.readiness}.`
    }
  ];
}

/**
 * Generic audit trail creator for backward compatibility.
 * Used by municipalSubmissionReadinessService.ts.
 */
export function createAuditTrail(
  _complexity: unknown,
  _readiness: unknown,
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
