/**
 * Conditions Register Service
 *
 * Manages conditions of approval for town planning applications.
 * Enforces forward-only status transitions:
 *   outstanding → in_progress → fulfilled/waived
 * No reverse transitions permitted.
 */

import type { ConditionOfApproval, ConditionStatus } from '../types';
import type { ConditionInput } from '../schemas';
import type { FirestoreDB } from './accessControl';

// ─── Status Transitions ───────────────────────────────────────────────────────

/**
 * Forward-only condition status transitions.
 * outstanding → in_progress → fulfilled OR waived
 */
export const CONDITION_STATUS_TRANSITIONS: Record<ConditionStatus, ConditionStatus[]> = {
  outstanding: ['in_progress'],
  in_progress: ['fulfilled', 'waived'],
  fulfilled: [],
  waived: [],
};

// ─── Condition Status Error ───────────────────────────────────────────────────

export class ConditionStatusError extends Error {
  public readonly currentStatus: ConditionStatus;
  public readonly targetStatus: ConditionStatus;
  public readonly code: string;

  constructor(currentStatus: ConditionStatus, targetStatus: ConditionStatus, message: string) {
    super(message);
    this.name = 'ConditionStatusError';
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
    this.code = 'INVALID_CONDITION_TRANSITION';
  }
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Create a new condition of approval.
 */
export function createCondition(
  input: ConditionInput,
  createdBy: string,
): ConditionOfApproval {
  const now = new Date().toISOString();
  const id = `cond_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  return {
    id,
    applicationId: input.applicationId,
    conditionNumber: input.conditionNumber,
    description: input.description,
    responsibleParty: input.responsibleParty,
    status: 'outstanding',
    dueDate: input.dueDate,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a condition's status. Enforces forward-only transitions.
 * Throws ConditionStatusError if the transition is not permitted.
 */
export function updateConditionStatus(
  condition: ConditionOfApproval,
  targetStatus: ConditionStatus,
  updatedBy: string,
  options?: { waiverReason?: string; evidence?: string[] },
): ConditionOfApproval {
  const permitted = CONDITION_STATUS_TRANSITIONS[condition.status];

  if (!permitted.includes(targetStatus)) {
    throw new ConditionStatusError(
      condition.status,
      targetStatus,
      `Cannot transition condition from '${condition.status}' to '${targetStatus}'. Permitted: [${permitted.join(', ') || 'none (terminal)'}]`,
    );
  }

  const now = new Date().toISOString();
  const updated: ConditionOfApproval = {
    ...condition,
    status: targetStatus,
    updatedAt: now,
  };

  if (targetStatus === 'fulfilled') {
    updated.fulfilledDate = now;
    if (options?.evidence) {
      updated.evidence = [...(condition.evidence ?? []), ...options.evidence];
    }
  }

  if (targetStatus === 'waived') {
    updated.waivedDate = now;
    updated.waivedBy = updatedBy;
    updated.waiverReason = options?.waiverReason;
  }

  return updated;
}

/**
 * Check if all conditions for an application are compliant (fulfilled or waived).
 */
export function isConditionsCompliant(conditions: ConditionOfApproval[]): boolean {
  if (conditions.length === 0) return true;
  return conditions.every(
    (c) => c.status === 'fulfilled' || c.status === 'waived',
  );
}

/**
 * Get a summary of conditions grouped by status.
 */
export function getConditionsSummary(conditions: ConditionOfApproval[]): {
  total: number;
  outstanding: number;
  inProgress: number;
  fulfilled: number;
  waived: number;
  compliancePercentage: number;
} {
  const summary = {
    total: conditions.length,
    outstanding: 0,
    inProgress: 0,
    fulfilled: 0,
    waived: 0,
    compliancePercentage: 0,
  };

  for (const condition of conditions) {
    switch (condition.status) {
      case 'outstanding':
        summary.outstanding++;
        break;
      case 'in_progress':
        summary.inProgress++;
        break;
      case 'fulfilled':
        summary.fulfilled++;
        break;
      case 'waived':
        summary.waived++;
        break;
    }
  }

  if (summary.total > 0) {
    summary.compliancePercentage = Math.round(
      ((summary.fulfilled + summary.waived) / summary.total) * 100,
    );
  }

  return summary;
}

/**
 * Persist a condition to Firestore.
 */
export async function persistCondition(
  db: FirestoreDB,
  condition: ConditionOfApproval,
): Promise<void> {
  const docRef = db.collection('town_planning_conditions').doc(condition.id);
  await docRef.set(condition as unknown as Record<string, unknown>);
}

/**
 * Load all conditions for an application from Firestore.
 */
export async function loadConditions(
  db: FirestoreDB,
  applicationId: string,
): Promise<ConditionOfApproval[]> {
  const snapshot = await db
    .collection('town_planning_conditions')
    .where('applicationId', '==', applicationId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as unknown as ConditionOfApproval[];
}
