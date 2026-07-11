/**
 * Incident Reporter Service
 *
 * Manages incident/accident capture, classification, investigation workflow,
 * and statutory reporting per OHS Act Section 24.
 */

import type { Incident, CorrectiveAction, IncidentState } from './hsTypes';
import type { WorkflowEvent } from '../lifecycleTypes';
import { IncidentReportSchema } from './hsSchemas';
import { InvalidStateTransitionError } from './hsErrors';

/**
 * Reports a new incident with initial state 'reported'.
 * Automatically classifies Section 24 notifiability.
 */
export function reportIncident(
  input: Omit<Incident, 'id' | 'state' | 'isSection24Notifiable' | 'correctiveActions' | 'createdAt' | 'updatedAt'>
): Incident {
  IncidentReportSchema.parse(input);

  const now = new Date().toISOString();
  const incident: Incident = {
    ...input,
    id: `hs-inc-${Date.now()}`,
    state: 'reported',
    isSection24Notifiable: false,
    correctiveActions: [],
    createdAt: now,
    updatedAt: now,
  };

  // Auto-classify Section 24
  incident.isSection24Notifiable = classifySection24(incident);

  return incident;
}

/**
 * Determines whether an incident is Section 24 notifiable.
 *
 * Per OHS Act Section 24:
 * - Fatality → always notifiable
 * - Lost time injury → notifiable (serious injury requiring hospitalisation)
 * - Medical treatment → not automatically notifiable (unless dangerous occurrence)
 * - First aid → never notifiable
 */
export function classifySection24(incident: Pick<Incident, 'injuryClassification'>): boolean {
  switch (incident.injuryClassification) {
    case 'fatality':
      return true;
    case 'lost_time':
      return true;
    case 'medical_treatment':
      return false;
    case 'first_aid':
      return false;
  }
}

/**
 * Assigns an investigation to an incident.
 * Transitions state from 'reported' to 'under_investigation'.
 */
export function assignInvestigation(incident: Incident, investigatorId: string): Incident {
  if (incident.state !== 'reported') {
    throw new InvalidStateTransitionError('Incident', incident.state, 'under_investigation');
  }

  return {
    ...incident,
    state: 'under_investigation',
    investigatorId,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adds a corrective action to an incident.
 * If state is 'under_investigation', transitions to 'corrective_actions'.
 */
export function addCorrectiveAction(
  incident: Incident,
  action: Omit<CorrectiveAction, 'id' | 'status'>
): Incident {
  if (incident.state !== 'under_investigation' && incident.state !== 'corrective_actions') {
    throw new InvalidStateTransitionError('Incident', incident.state, 'corrective_actions');
  }

  const newAction: CorrectiveAction = {
    ...action,
    id: `hs-ca-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'open',
  };

  return {
    ...incident,
    state: 'corrective_actions',
    correctiveActions: [...incident.correctiveActions, newAction],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Closes an incident. All corrective actions must be completed.
 */
export function closeIncident(incident: Incident): Incident {
  if (incident.state !== 'corrective_actions') {
    throw new InvalidStateTransitionError('Incident', incident.state, 'closed');
  }

  const hasOpenActions = incident.correctiveActions.some(a => a.status !== 'completed');
  if (hasOpenActions) {
    throw new Error('Cannot close incident with open corrective actions');
  }

  return {
    ...incident,
    state: 'closed',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Checks for overdue corrective actions and returns high-priority WorkflowEvents.
 *
 * An action is overdue if dueDate < now AND completedAt is null/undefined.
 * Returns empty array if no actions are overdue.
 */
export function checkOverdueActions(incident: Incident, now: Date): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];

  for (const action of incident.correctiveActions) {
    if (action.status === 'completed') continue;

    const dueDate = new Date(action.dueDate);
    if (dueDate < now && !action.completedAt) {
      events.push({
        id: `evt-overdue-${action.id}`,
        projectId: incident.projectId,
        sourceModule: 'health_safety',
        type: 'corrective_action_overdue',
        priority: 'high',
        title: `Overdue corrective action: ${action.description}`,
        detail: `Incident ${incident.id} corrective action assigned to ${action.assignedTo} was due ${action.dueDate}`,
        createdAt: now.toISOString(),
        assignedRoles: ['site_manager'],
      });
    }
  }

  return events;
}
