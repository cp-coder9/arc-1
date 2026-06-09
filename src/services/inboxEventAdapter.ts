/**
 * Inbox Event Adapter
 *
 * Converts readiness check findings into Platform-Spine-compatible
 * workflow events for the user inbox / action center.
 *
 * @module documents_drawing_intelligence
 */

import type {
  ReadinessFinding,
  ReadinessReport,
  WorkflowEvent,
  WorkflowEventType,
} from '@/types/documentTypes';

/** Generate workflow events from readiness reports. */
export function workflowEventsFromReadiness(
  projectId: string,
  reports: ReadinessReport[],
): WorkflowEvent[] {
  const findings = reports.flatMap((r) => r.findings);
  return findings.map((finding, index) => eventFromFinding(projectId, finding, index));
}

/** Generate events from a single report. */
export function workflowEventsFromReport(
  projectId: string,
  report: ReadinessReport,
): WorkflowEvent[] {
  return report.findings.map((finding, index) =>
    eventFromFinding(projectId, finding, index),
  );
}

/** Classify a finding into a WorkflowEventType. */
export function classifyEventType(finding: ReadinessFinding): WorkflowEventType {
  const code = finding.code;

  // Approval letter checks
  if (code.includes('APPROVAL_LETTER')) return 'approval_letter_missing';

  // Municipal checks
  if (code.includes('MUNICIPAL')) return 'municipal_submission_pack_incomplete';

  // Tender checks
  if (code.includes('TENDER')) return 'tender_pack_incomplete';

  // Superseded drawing checks
  if (code.includes('SUPERSEDED')) return 'superseded_construction_drawing';

  // Closeout / as-built checks
  if (code.includes('CLOSEOUT') || code.includes('AS_BUILT')) return 'closeout_pack_incomplete';

  // Review checks
  if (code.includes('REVIEW')) return 'document_review_required';

  // Drawing / revision checks
  if (code.includes('REVISION') || code.includes('DRAWING')) return 'drawing_revision_uploaded';

  // Warranty checks
  if (code.includes('WARRANTY')) return 'closeout_pack_incomplete';

  // Discipline drawing checks — fall through to appropriate type
  if (code.includes('DISCIPLINE')) return 'municipal_submission_pack_incomplete';

  return 'document_review_required';
}

/** Build a workflow event from a single finding. */
function eventFromFinding(
  projectId: string,
  finding: ReadinessFinding,
  index: number,
): WorkflowEvent {
  return {
    id: `doc-event-${projectId}-${index + 1}`,
    type: classifyEventType(finding),
    projectId,
    title: formatEventTitle(finding.code),
    detail: finding.message,
    priority: finding.priority,
    sourceModule: 'documents',
    assignedRoles: finding.assignedRoles,
    createdAt: new Date().toISOString(),
  };
}

/** Format a finding code into a human-readable event title. */
export function formatEventTitle(code: string): string {
  return code
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Filter events by priority threshold. */
export function eventsAbovePriority(
  events: WorkflowEvent[],
  minimumPriority: WorkflowEvent['priority'],
): WorkflowEvent[] {
  const rank = { low: 0, medium: 1, high: 2, critical: 3 };
  const threshold = rank[minimumPriority];
  return events.filter((e) => rank[e.priority] >= threshold);
}

/** Group events by their type. */
export function groupEventsByType(events: WorkflowEvent[]): Record<string, WorkflowEvent[]> {
  const groups: Record<string, WorkflowEvent[]> = {};
  for (const event of events) {
    if (!groups[event.type]) groups[event.type] = [];
    groups[event.type].push(event);
  }
  return groups;
}

/** Get the count of events by priority level. */
export function eventCountByPriority(events: WorkflowEvent[]): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const event of events) {
    counts[event.priority] = (counts[event.priority] || 0) + 1;
  }
  return counts;
}
