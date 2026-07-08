/**
 * Condition Register Service — Captures, tracks, and manages Record of Decision
 * conditions imposed on planning applications.
 *
 * Handles condition classification (precedent/ongoing), fulfilment tracking with
 * evidence references, approval-effective detection, SpecForge write-through,
 * deadline registration, and condition variation from appeal outcomes.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import type {
  Condition,
  ConditionType,
  Deadline,
} from '../types';

// ── In-Memory Store ─────────────────────────────────────────────────────────

/** In-memory store for conditions (MVP — replaces Firestore). */
let conditions: Condition[] = [];

/** Auto-incrementing counter for generating unique IDs. */
let idCounter = 0;

/**
 * Generates a unique ID with a descriptive prefix.
 */
function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ── Condition Fulfilment Summary Interface ──────────────────────────────────

/**
 * Summary of condition fulfilment status for an application.
 * Used by the dashboard and reporting service to display progress.
 */
export interface ConditionFulfilmentSummary {
  applicationId: string;
  totalConditions: number;
  precedentConditions: number;
  ongoingConditions: number;
  fulfilledPrecedent: number;
  fulfilledOngoing: number;
  overdue: number;
  allPrecedentMet: boolean;
  approvalEffective: boolean;
}

// ── Condition CRUD ──────────────────────────────────────────────────────────

/**
 * Captures a new condition from the Record of Decision.
 *
 * Creates a condition record with an auto-generated ID. The condition is
 * classified as 'precedent' or 'ongoing' based on the provided conditionType.
 * Initial status is 'pending'.
 *
 * @param params - Condition details from the Record of Decision
 * @returns The created Condition record
 */
export function captureCondition(params: {
  applicationId: string;
  conditionNumber: number;
  description: string;
  conditionType: ConditionType;
  responsibleParty: string;
  deadline?: string;
  fulfilmentCriteria: string;
}): Condition {
  const condition: Condition = {
    id: generateId('cond'),
    applicationId: params.applicationId,
    conditionNumber: params.conditionNumber,
    description: params.description,
    conditionType: params.conditionType,
    responsibleParty: params.responsibleParty,
    deadline: params.deadline,
    fulfilmentCriteria: params.fulfilmentCriteria,
    status: 'pending',
    fulfilmentEvidenceIds: [],
  };

  conditions.push(condition);
  return condition;
}

/**
 * Returns all conditions for a given application, sorted by conditionNumber.
 *
 * @param applicationId - The planning application ID
 * @returns Array of Condition records sorted by conditionNumber ascending
 */
export function getConditions(applicationId: string): Condition[] {
  return conditions
    .filter((c) => c.applicationId === applicationId)
    .sort((a, b) => a.conditionNumber - b.conditionNumber);
}

/**
 * Returns conditions for an application filtered by type (precedent or ongoing),
 * sorted by conditionNumber.
 *
 * @param applicationId - The planning application ID
 * @param type - The condition type to filter by ('precedent' or 'ongoing')
 * @returns Array of Condition records matching the specified type
 */
export function getConditionsByType(
  applicationId: string,
  type: ConditionType,
): Condition[] {
  return conditions
    .filter((c) => c.applicationId === applicationId && c.conditionType === type)
    .sort((a, b) => a.conditionNumber - b.conditionNumber);
}

// ── Fulfilment ──────────────────────────────────────────────────────────────

/**
 * Marks a condition as fulfilled with evidence references and a confirming user.
 *
 * Sets the condition status to 'fulfilled', records the fulfilment date,
 * stores evidence document IDs, and records who confirmed fulfilment.
 *
 * @param conditionId - The ID of the condition to mark as fulfilled
 * @param userId - The user confirming fulfilment
 * @param evidenceIds - Array of document IDs providing fulfilment evidence
 * @returns The updated Condition record
 * @throws Error if the condition is not found
 */
export function markFulfilled(
  conditionId: string,
  userId: string,
  evidenceIds: string[],
): Condition {
  const condition = conditions.find((c) => c.id === conditionId);
  if (!condition) {
    throw new Error(`Condition not found: ${conditionId}`);
  }

  condition.status = 'fulfilled';
  condition.fulfilmentDate = new Date().toISOString();
  condition.fulfilmentEvidenceIds = [...evidenceIds];
  condition.confirmedBy = userId;

  return condition;
}

/**
 * Checks whether ALL conditions of type 'precedent' for an application have
 * status 'fulfilled'.
 *
 * Returns true if there are no precedent conditions (vacuously true) or if
 * all precedent conditions are fulfilled. Returns false otherwise.
 *
 * @param applicationId - The planning application ID
 * @returns true if all precedent conditions are fulfilled
 */
export function checkAllPrecedentFulfilled(applicationId: string): boolean {
  const precedentConditions = getConditionsByType(applicationId, 'precedent');
  if (precedentConditions.length === 0) {
    return true;
  }
  return precedentConditions.every((c) => c.status === 'fulfilled');
}

/**
 * Returns a ConditionFulfilmentSummary with counts of conditions by type and status.
 *
 * Includes total counts, fulfilled counts, overdue count, and flags indicating
 * whether all precedent conditions are met and whether approval is effective.
 *
 * @param applicationId - The planning application ID
 * @returns A ConditionFulfilmentSummary object
 */
export function getFulfilmentStatus(applicationId: string): ConditionFulfilmentSummary {
  const appConditions = getConditions(applicationId);

  const precedentConditions = appConditions.filter(
    (c) => c.conditionType === 'precedent',
  );
  const ongoingConditions = appConditions.filter(
    (c) => c.conditionType === 'ongoing',
  );

  const fulfilledPrecedent = precedentConditions.filter(
    (c) => c.status === 'fulfilled',
  ).length;
  const fulfilledOngoing = ongoingConditions.filter(
    (c) => c.status === 'fulfilled',
  ).length;
  const overdue = appConditions.filter((c) => c.status === 'overdue').length;

  const allPrecedentMet = precedentConditions.length === 0 ||
    precedentConditions.every((c) => c.status === 'fulfilled');

  return {
    applicationId,
    totalConditions: appConditions.length,
    precedentConditions: precedentConditions.length,
    ongoingConditions: ongoingConditions.length,
    fulfilledPrecedent,
    fulfilledOngoing,
    overdue,
    allPrecedentMet,
    approvalEffective: allPrecedentMet && precedentConditions.length > 0,
  };
}

// ── Integration ─────────────────────────────────────────────────────────────

/**
 * Stub for writing conditions to SpecForge as project requirements.
 *
 * This is an integration point that will write condition data into the SpecForge
 * specification spine for downstream tracking. Currently a no-op stub.
 *
 * @param _applicationId - The planning application ID
 * @param _projectId - The Architex project ID for SpecForge context
 */
export function writeConditionsToSpecForge(
  _applicationId: string,
  _projectId: string,
): void {
  // Stub — SpecForge integration point for write-through.
  // Will map conditions to SpecForge specification items when the
  // integration layer is fully wired.
}

/**
 * Creates Deadline records for conditions that have deadlines set.
 *
 * Iterates through all conditions for the application and creates a
 * 'condition' type Deadline for each condition that has a deadline date.
 *
 * @param applicationId - The planning application ID
 * @returns Array of created Deadline records
 */
export function registerConditionDeadlines(applicationId: string): Deadline[] {
  const appConditions = getConditions(applicationId);
  const createdDeadlines: Deadline[] = [];

  for (const condition of appConditions) {
    if (condition.deadline) {
      const dueDate = condition.deadline;
      const now = new Date();
      const due = new Date(dueDate);
      now.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const diffMs = due.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let status: Deadline['status'] = 'pending';
      if (daysRemaining < 0) {
        status = 'overdue';
      } else if (daysRemaining <= 7) {
        status = 'approaching';
      }

      const deadline: Deadline = {
        id: generateId('dl'),
        applicationId,
        type: 'condition',
        label: `Condition ${condition.conditionNumber}: ${condition.description}`,
        dueDate,
        status,
        linkedConditionId: condition.id,
        linkedStage: 'condition_fulfilment',
        daysRemaining,
        alertGenerated: false,
      };

      createdDeadlines.push(deadline);
    }
  }

  return createdDeadlines;
}

/**
 * Replaces conditions with varied versions from an appeal outcome.
 *
 * Removes all existing conditions for the application and replaces them with
 * the provided varied conditions. Used when an appeal outcome results in
 * modified conditions.
 *
 * @param applicationId - The planning application ID
 * @param variedConditions - The new set of conditions from the appeal outcome
 */
export function updateConditionsFromAppeal(
  applicationId: string,
  variedConditions: Condition[],
): void {
  // Remove existing conditions for this application
  conditions = conditions.filter((c) => c.applicationId !== applicationId);

  // Add the varied conditions (ensure they are linked to this application)
  for (const vc of variedConditions) {
    conditions.push({
      ...vc,
      applicationId,
      id: vc.id || generateId('cond'),
    });
  }
}

// ── Store Management (for testing) ──────────────────────────────────────────

/**
 * Resets the in-memory store. Intended for use in tests only.
 */
export function _resetStore(): void {
  conditions = [];
  idCounter = 0;
}
