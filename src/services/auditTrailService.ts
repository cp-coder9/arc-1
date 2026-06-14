// ─── Pack 5: Audit Trail Service ───────────────────────────────────────────

import type { AppointmentRecord } from "@/services/appointmentService";
import type { KickoffPackage } from "@/services/kickoffService";
import type { SubmissionAuditRecord } from "@/types/municipalSubmissionReadiness";

// ─── Inline Type ───────────────────────────────────────────────────────────

export interface AuditRecord {
  auditId: string;
  entityId: string;
  action: string;
  actor: string;
  atIso: string;
  notes: string;
}

// ─── Service Functions ─────────────────────────────────────────────────────

export function createAppointmentAuditTrail(
  appointment: AppointmentRecord,
  kickoff: KickoffPackage,
  nowIso: string
): AuditRecord[] {
  return [
    {
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
  return [
    {
      id: `audit-${projectId || 'unknown'}-municipal`,
      action: 'municipal_readiness_assessed',
      actor: 'system',
      notes: 'Municipal submission readiness assessed.',
      timestamp: new Date().toISOString(),
    },
  ];
}
