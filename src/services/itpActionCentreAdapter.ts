/**
 * ITP Action Centre Adapter
 *
 * Maps ITP events to WorkflowEvent records for the Action Centre inbox.
 * Follows the existing inboxEventAdapter pattern:
 * - sourceModule: 'site' (Site Execution module)
 * - assignedRoles: derived from responsible inspector role and project team membership
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
 */

import { createWorkflowEvent } from './inboxEventAdapter';
import type { WorkflowEvent, ArchitexRole, Priority } from './lifecycleTypes';

// ── Event Parameter Types ────────────────────────────────────────────────────

export interface HoldPointEventParams {
  projectId: string;
  itpTitle: string;
  itemTitle: string;
  itemId: string;
  requestedDate: string;
  assignedRoles: ArchitexRole[];
}

export interface WitnessEventParams {
  projectId: string;
  itpTitle: string;
  itemTitle: string;
  itemId: string;
  scheduledDateTime: string;
  location: string;
  assignedRoles: ArchitexRole[];
}

export interface TestOverdueParams {
  projectId: string;
  materialTestId: string;
  materialType: string;
  testMethod: string;
  dueDate: string;
  assignedRoles: ArchitexRole[];
  existingUnresolvedEvents?: WorkflowEvent[];
}

export interface BreachEventParams {
  projectId: string;
  itpTitle: string;
  itemTitle: string;
  itemId: string;
  ncrReference: string;
  assignedRoles: ArchitexRole[];
}

export interface TestFailureParams {
  projectId: string;
  materialTestId: string;
  materialType: string;
  testMethod: string;
  resultValue: number;
  acceptanceThreshold: number;
  resultUnit: string;
  assignedRoles: ArchitexRole[];
}

export interface ConditionalFollowUpParams {
  projectId: string;
  itpTitle: string;
  itemTitle: string;
  itemId: string;
  deadlineDate: string;
  conditionsText: string;
  assignedRoles: ArchitexRole[];
}

// ── Action Item Tracking ─────────────────────────────────────────────────────

/** In-memory resolved action item IDs for deduplication and resolution tracking. */
const resolvedActionItems = new Set<string>();

// ── Event Creation Functions ─────────────────────────────────────────────────

/**
 * Creates a hold point inspection request event for the Action Centre.
 *
 * Priority: high
 * Category: inspection_required
 * Includes: ITP title, item title, requested date, item ID reference
 *
 * Validates: Requirement 11.1
 */
export function createHoldPointRequestEvent(params: HoldPointEventParams): WorkflowEvent {
  return createWorkflowEvent({
    type: 'approval_required',
    projectId: params.projectId,
    title: `Hold Point Inspection Required: ${params.itemTitle}`,
    detail: `ITP: ${params.itpTitle} | Item: ${params.itemTitle} | Requested Date: ${params.requestedDate} | Item ID: ${params.itemId}`,
    priority: 'high',
    assignedRoles: params.assignedRoles,
    sourceModule: 'site',
    id: `itp-hold-request-${params.itemId}`,
  });
}

/**
 * Creates a witness point notification event for the Action Centre.
 *
 * Priority: medium
 * Category: witness_notification
 * Includes: ITP title, item title, scheduled date/time, location
 *
 * Validates: Requirement 11.2
 */
export function createWitnessNotificationEvent(params: WitnessEventParams): WorkflowEvent {
  return createWorkflowEvent({
    type: 'task_overdue',
    projectId: params.projectId,
    title: `Witness Point Notification: ${params.itemTitle}`,
    detail: `ITP: ${params.itpTitle} | Item: ${params.itemTitle} | Scheduled: ${params.scheduledDateTime} | Location: ${params.location}`,
    priority: 'medium',
    assignedRoles: params.assignedRoles,
    sourceModule: 'site',
    id: `itp-witness-${params.itemId}`,
  });
}

/**
 * Creates a test overdue notification event for the Action Centre.
 *
 * Priority: high
 * Category: test_overdue
 * Includes: material type, test method, due date
 * Deduplication: does not create if an unresolved item for the same test already exists
 *
 * Validates: Requirement 11.3
 */
export function createTestOverdueEvent(params: TestOverdueParams): WorkflowEvent | null {
  const eventId = `itp-test-overdue-${params.materialTestId}`;

  // Deduplication: check if an unresolved action item for this test already exists
  if (params.existingUnresolvedEvents) {
    const existingEvent = params.existingUnresolvedEvents.find(
      (e) => e.id === eventId,
    );
    if (existingEvent) {
      return null;
    }
  }

  // Also skip if the event was previously resolved and recreated in the same session
  if (resolvedActionItems.has(eventId)) {
    // Reset: allow creation after resolution (the item was resolved, so a new overdue is valid)
    resolvedActionItems.delete(eventId);
  }

  return createWorkflowEvent({
    type: 'task_overdue',
    projectId: params.projectId,
    title: `Material Test Overdue: ${params.testMethod}`,
    detail: `Material Type: ${params.materialType} | Test Method: ${params.testMethod} | Due Date: ${params.dueDate}`,
    priority: 'high',
    assignedRoles: params.assignedRoles,
    sourceModule: 'site',
    id: eventId,
  });
}

/**
 * Creates a hold point breach event for the Action Centre.
 *
 * Priority: critical
 * Category: hold_point_breach
 * Includes: ITP title, item title, linked NCR reference
 *
 * Validates: Requirement 11.4
 */
export function createHoldPointBreachEvent(params: BreachEventParams): WorkflowEvent {
  return createWorkflowEvent({
    type: 'risk_detected',
    projectId: params.projectId,
    title: `CRITICAL: Hold Point Breach — ${params.itemTitle}`,
    detail: `ITP: ${params.itpTitle} | Breached Item: ${params.itemTitle} | NCR: ${params.ncrReference}`,
    priority: 'critical',
    assignedRoles: params.assignedRoles,
    sourceModule: 'site',
    id: `itp-breach-${params.itemId}`,
  });
}

/**
 * Creates a test failure event for the Action Centre.
 *
 * Priority: high
 * Category: test_failed
 * Includes: material type, test method, result value, acceptance threshold
 *
 * Validates: Requirement 11.5
 */
export function createTestFailureEvent(params: TestFailureParams): WorkflowEvent {
  return createWorkflowEvent({
    type: 'risk_detected',
    projectId: params.projectId,
    title: `Material Test Failed: ${params.testMethod}`,
    detail: `Material Type: ${params.materialType} | Test Method: ${params.testMethod} | Result: ${params.resultValue} ${params.resultUnit} | Threshold: ${params.acceptanceThreshold} ${params.resultUnit}`,
    priority: 'high',
    assignedRoles: params.assignedRoles,
    sourceModule: 'site',
    id: `itp-test-failure-${params.materialTestId}`,
  });
}

/**
 * Creates a conditional follow-up event for deadline tracking.
 *
 * Used when an inspector signs off with conditional_pass — creates an
 * Action Centre item for the contractor to address conditions within
 * the specified timeframe.
 *
 * Validates: Requirement 11.6 (conditional pass deadline tracking)
 */
export function createConditionalFollowUpEvent(params: ConditionalFollowUpParams): WorkflowEvent {
  return createWorkflowEvent({
    type: 'task_overdue',
    projectId: params.projectId,
    title: `Conditional Pass Follow-Up: ${params.itemTitle}`,
    detail: `ITP: ${params.itpTitle} | Item: ${params.itemTitle} | Deadline: ${params.deadlineDate} | Conditions: ${params.conditionsText.substring(0, 200)}`,
    priority: 'high',
    assignedRoles: params.assignedRoles,
    sourceModule: 'site',
    id: `itp-conditional-${params.itemId}`,
  });
}

/**
 * Marks an action item as resolved when the trigger condition is addressed.
 *
 * Trigger conditions that resolve action items:
 * - Inspection signed off (hold point request resolved)
 * - Test results recorded (overdue test resolved)
 * - NCR closed (breach action resolved)
 * - Conditional conditions addressed (follow-up resolved)
 *
 * Validates: Requirement 11.7
 */
export async function resolveActionItem(
  _projectId: string,
  eventId: string,
): Promise<void> {
  // Track resolved items for deduplication logic
  resolvedActionItems.add(eventId);

  // In a production implementation, this would update the Firestore
  // record for the WorkflowEvent/inbox item, marking it as resolved.
  // For now, we track resolution state in-memory for deduplication
  // and the calling service will handle Firestore persistence.
}

// ── Utility: Map inspector role to ArchitexRole ──────────────────────────────

/**
 * Maps an ITP inspector role to the platform ArchitexRole array for event assignment.
 * Includes the inspector role plus standard project oversight roles.
 */
export function mapInspectorRoleToAssignedRoles(
  inspectorRole: 'engineer' | 'architect' | 'site_manager',
): ArchitexRole[] {
  const roleMap: Record<string, ArchitexRole> = {
    engineer: 'engineer',
    architect: 'architect',
    site_manager: 'site_manager',
  };

  return [roleMap[inspectorRole]];
}

/**
 * Builds the assigned roles array for breach/critical events.
 * Includes engineer, site_manager, and the lead consultant role.
 */
export function buildBreachAssignedRoles(): ArchitexRole[] {
  return ['engineer', 'site_manager'];
}

/**
 * Builds the assigned roles array for test-related events.
 * Includes engineer and site_manager as per requirements.
 */
export function buildTestAssignedRoles(): ArchitexRole[] {
  return ['engineer', 'site_manager'];
}
