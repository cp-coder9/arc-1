// ─── EIA Event Service ────────────────────────────────────────────────────────
// Coordinates Action Centre event emission from all EIA services.
// Each function maps EIA domain events to WorkflowEvent objects via the
// integration service's emitWorkflowEvent function.
//
// Severity mapping:
//   - info: informational items (reminders, advisory notifications)
//   - high: action-required items (appointments, non-compliance, expiry warnings)
//   - critical: blockers (overdue deadlines, lifecycle blockers)
//
// Requirements: 12.4, 3.7, 4.4–4.5, 5.3, 5.5, 6.4–6.5, 8.2, 8.5, 8.7, 9.7, 11.4

import type { ArchitexRole, Priority, WorkflowEvent } from './eiaTypes';
import { emitWorkflowEvent } from './eiaIntegrationService';

// ─── Deadline Warning ────────────────────────────────────────────────────────

/**
 * Emits a warning event when a phase deadline is within 14 days.
 * Severity: info (deadline_warning type).
 *
 * Requirements: 4.4, 5.5
 */
export function emitDeadlineWarning(
  projectId: string,
  phaseName: string,
  daysRemaining: number,
  assignedRoles: ArchitexRole[]
): WorkflowEvent {
  return emitWorkflowEvent(
    'deadline_warning',
    projectId,
    `EIA deadline approaching: ${phaseName}`,
    `The ${phaseName} phase has ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining before its regulatory deadline expires.`,
    assignedRoles,
    'medium' as Priority
  );
}

// ─── Phase Overdue ───────────────────────────────────────────────────────────

/**
 * Emits a critical event when a phase deadline has passed without completion.
 * Severity: critical (blocker type).
 *
 * Requirements: 4.5, 5.5
 */
export function emitPhaseOverdue(
  projectId: string,
  phaseName: string,
  daysOverdue: number,
  assignedRoles: ArchitexRole[]
): WorkflowEvent {
  return emitWorkflowEvent(
    'blocker',
    projectId,
    `EIA phase overdue: ${phaseName}`,
    `The ${phaseName} phase is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past its regulatory deadline. Immediate action required.`,
    assignedRoles,
    'critical' as Priority
  );
}

// ─── EAP Required ────────────────────────────────────────────────────────────

/**
 * Emits an action_required event when screening identifies an EIA process
 * but no EAP has been appointed. Must fire within 60 seconds of screening.
 * Severity: high (action_required type).
 *
 * Requirement: 3.7
 */
export function emitEAPRequired(
  projectId: string,
  assignedRoles: ArchitexRole[]
): WorkflowEvent {
  return emitWorkflowEvent(
    'action_required',
    projectId,
    'EAP appointment required',
    'Activity screening has identified a required EIA process, but no Environmental Assessment Practitioner (EAP) has been appointed. An EAP must be appointed to proceed with the assessment.',
    assignedRoles,
    'high' as Priority
  );
}

// ─── Monitoring Reminder (Time-based) ───────────────────────────────────────

/**
 * Emits a reminder event 24 hours before a monitoring commitment is due.
 * Severity: info (deadline_warning type).
 *
 * Requirement: 8.2
 */
export function emitMonitoringReminder(
  projectId: string,
  commitmentRef: string,
  responsibleParty: string
): WorkflowEvent {
  return emitWorkflowEvent(
    'deadline_warning',
    projectId,
    `EMPr monitoring due: ${commitmentRef}`,
    `Monitoring for commitment "${commitmentRef}" is due within 24 hours. Responsible party: ${responsibleParty}.`,
    ['site_manager', 'architect'] as ArchitexRole[],
    'medium' as Priority
  );
}

// ─── Event-Triggered Monitoring Reminder ─────────────────────────────────────

/**
 * Emits a reminder event within 48 hours when an event-triggered monitoring
 * commitment is activated.
 * Severity: info (deadline_warning type).
 *
 * Requirement: 8.7
 */
export function emitEventTriggeredReminder(
  projectId: string,
  commitmentRef: string,
  responsibleParty: string
): WorkflowEvent {
  return emitWorkflowEvent(
    'deadline_warning',
    projectId,
    `Event-triggered monitoring required: ${commitmentRef}`,
    `A triggering event has been logged for commitment "${commitmentRef}". Monitoring assessment must be completed within 48 hours. Responsible party: ${responsibleParty}.`,
    ['site_manager', 'architect'] as ArchitexRole[],
    'medium' as Priority
  );
}

// ─── Non-Compliant Alert ─────────────────────────────────────────────────────

/**
 * Emits a high-priority event when an EMPr commitment is marked non-compliant.
 * Severity: high (action_required type).
 *
 * Requirement: 8.5
 */
export function emitNonCompliantAlert(
  projectId: string,
  commitmentRef: string,
  responsibleParty: string
): WorkflowEvent {
  return emitWorkflowEvent(
    'action_required',
    projectId,
    `EMPr non-compliance: ${commitmentRef}`,
    `Commitment "${commitmentRef}" has been marked as non-compliant. Corrective action is required. Responsible party: ${responsibleParty}.`,
    ['site_manager', 'architect', 'engineer'] as ArchitexRole[],
    'high' as Priority
  );
}

// ─── Authorization Expiry Warning ────────────────────────────────────────────

/**
 * Emits a warning event when an Environmental Authorization is within
 * 60 days of expiry. Recommends applying for amendment or new authorization.
 * Severity: high (action_required type).
 *
 * Requirement: 6.4
 */
export function emitAuthorizationExpiryWarning(
  projectId: string,
  referenceNumber: string,
  daysRemaining: number
): WorkflowEvent {
  return emitWorkflowEvent(
    'action_required',
    projectId,
    `Authorization expiring: ${referenceNumber}`,
    `Environmental Authorization "${referenceNumber}" expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Apply for an amendment or new authorization to avoid lapse.`,
    ['architect', 'engineer'] as ArchitexRole[],
    'high' as Priority
  );
}

// ─── Net Zero Deviation ──────────────────────────────────────────────────────

/**
 * Emits an attention event when actual net-zero performance deviates
 * from the target trajectory by more than 10 percentage points.
 * Severity: info (info type).
 *
 * Requirement: 11.4
 */
export function emitNetZeroDeviation(
  projectId: string,
  targetType: string,
  deviation: number
): WorkflowEvent {
  return emitWorkflowEvent(
    'info',
    projectId,
    `Net Zero pathway off-track: ${targetType}`,
    `Actual performance deviates from the ${targetType} target trajectory by ${deviation.toFixed(1)} percentage points (threshold: 10pp). Review reduction strategy.`,
    ['architect'] as ArchitexRole[],
    'medium' as Priority
  );
}

// ─── Green Star Credit At Risk ───────────────────────────────────────────────

/**
 * Emits an action item when a Green Star credit with targeted points
 * has insufficient evidence progress within 30 days of review submission.
 * Severity: high (action_required type).
 *
 * Requirement: 9.7
 */
export function emitGreenStarAtRisk(
  projectId: string,
  creditName: string,
  category: string
): WorkflowEvent {
  return emitWorkflowEvent(
    'action_required',
    projectId,
    `Green Star credit at risk: ${creditName}`,
    `Credit "${creditName}" in the ${category} category has targeted points but evidence is not yet complete. Review submission is within 30 days.`,
    ['architect'] as ArchitexRole[],
    'high' as Priority
  );
}
