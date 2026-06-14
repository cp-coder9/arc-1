import type { ReadinessFinding, ReadinessReport } from '@/services/documentRegisterService';
import type { WorkflowEvent } from '@/services/lifecycleTypes';

export function workflowEventsFromReadiness(projectId: string, reports: ReadinessReport[]): WorkflowEvent[] {
  const findings = reports.flatMap((report) => report.findings);
  return findings.map((finding, index) => eventFromFinding(projectId, finding, index));
}

function eventFromFinding(projectId: string, finding: ReadinessFinding, index: number): WorkflowEvent {
  // Determine event type — 'document_updated' is a valid sub-type for the 'documents' module
  const eventType = finding.code.includes('MUNICIPAL') ? 'municipal_blocker' as const
    : finding.code.includes('REVIEW') ? 'approval_required' as const
    : finding.code.includes('SUPERSEDED') ? ('document_updated' as WorkflowEvent['type'])
    : 'risk_detected' as const;

  return {
    id: `doc-event-${projectId}-${index + 1}`,
    type: eventType,
    projectId,
    title: finding.code.replace(/_/g, ' ').toLowerCase().replace(/^./, (char) => char.toUpperCase()),
    detail: finding.message,
    priority: finding.priority,
    sourceModule: 'documents',
    assignedRoles: finding.assignedRoles,
    createdAt: new Date('2026-06-04T13:00:00Z').toISOString()
  };
}

// ── Backward-compatible stubs for existing site execution consumers ────────

export function subscribeToInboxEvents(_projectId: string, _callback?: (events: WorkflowEvent[]) => void): () => void {
  if (_callback) _callback([]);
  return () => {};
}

export function createInboxEvent(input: {
  recipientRole: string; title: string; sourceObjectId: string;
  priority: string; eventType?: string; description?: string; projectId?: string;
}): string {
  return `inbox-stub-${Date.now()}`;
}

// ── Pack 5: Appointment/Project Kickoff Inbox Events ──────────────────────

import type { AppointmentRecord } from "@/services/appointmentService";
import type { KickoffPackage } from "@/services/kickoffService";

export interface InboxEvent {
  eventId: string;
  projectId: string;
  recipientRole: "client" | "lead_professional" | "team";
  title: string;
  severity: "info" | "action_required" | "blocked";
}

export function createKickoffInboxEvents(
  appointment: AppointmentRecord,
  kickoff: KickoffPackage
): InboxEvent[] {
  const events: InboxEvent[] = [
    {
      eventId: `evt-${appointment.appointmentId}-accepted`,
      projectId: kickoff.workspace.projectId,
      recipientRole: "lead_professional",
      title: "Client accepted proposal. Create appointment and project kickoff.",
      severity: "info"
    },
    {
      eventId: `evt-${appointment.appointmentId}-confirm`,
      projectId: kickoff.workspace.projectId,
      recipientRole: "lead_professional",
      title: "Professional confirmation required before formal appointment issue.",
      severity: "action_required"
    }
  ];
  if (appointment.missingFacts.length > 0) {
    events.push({
      eventId: `evt-${appointment.appointmentId}-missing`,
      projectId: kickoff.workspace.projectId,
      recipientRole: "client",
      title: `${appointment.missingFacts.length} project facts are missing for kickoff readiness.`,
      severity: "blocked"
    });
  }
  if (kickoff.readiness === "ready") {
    events.push({
      eventId: `evt-${appointment.appointmentId}-ready`,
      projectId: kickoff.workspace.projectId,
      recipientRole: "team",
      title: "Project kickoff checklist is ready for team action.",
      severity: "info"
    });
  }
  return events;
}
