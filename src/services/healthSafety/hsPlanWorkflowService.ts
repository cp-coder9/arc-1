/**
 * H&S Plan Workflow Service
 *
 * Implements the H&S Plan approval state machine:
 *   draft → submitted/pending_approval → approved
 *                                      → rejected → (back to draft for resubmission)
 *
 * Integrates with Action Centre via WorkflowEvent for escalation.
 */

import type { HSPlan } from './hsTypes';
import { InvalidStateTransitionError } from './hsErrors';
import { ESCALATION_BUSINESS_DAYS, calculateBusinessDays } from './hsConstants';
import type { WorkflowEvent } from '../lifecycleTypes';

/**
 * Submits an H&S Plan for approval.
 * The plan must be in 'draft' state. Transitions through 'submitted' to 'pending_approval'.
 * Increments version by 1 if resubmitting after rejection.
 */
export function submitPlan(plan: HSPlan, submitterId: string): HSPlan {
  if (plan.state !== 'draft') {
    throw new InvalidStateTransitionError('HSPlan', plan.state, 'submit');
  }

  return {
    ...plan,
    state: 'pending_approval',
    submittedBy: submitterId,
    submittedAt: new Date().toISOString(),
    version: plan.version + 1,
    // Clear previous rejection data on resubmission
    rejectionReasons: undefined,
    approvedBy: undefined,
    approvedAt: undefined,
  };
}

/**
 * Approves an H&S Plan.
 * The plan must be in 'pending_approval' state.
 */
export function approvePlan(plan: HSPlan, approverId: string): HSPlan {
  if (plan.state !== 'pending_approval') {
    throw new InvalidStateTransitionError('HSPlan', plan.state, 'approve');
  }

  return {
    ...plan,
    state: 'approved',
    approvedBy: approverId,
    approvedAt: new Date().toISOString(),
  };
}

/**
 * Rejects an H&S Plan with reasons.
 * The plan must be in 'pending_approval' state.
 */
export function rejectPlan(plan: HSPlan, approverId: string, reasons: string[]): HSPlan {
  if (plan.state !== 'pending_approval') {
    throw new InvalidStateTransitionError('HSPlan', plan.state, 'reject');
  }

  return {
    ...plan,
    state: 'rejected',
    rejectionReasons: reasons,
  };
}

/**
 * Determines whether a site diary can be created for the project.
 * Returns true ONLY when the plan is in 'approved' state.
 */
export function canCreateSiteDiary(projectId: string, plan: HSPlan | null): boolean {
  if (!plan) {
    return false;
  }
  return plan.state === 'approved';
}

/**
 * Checks whether a pending approval has exceeded the escalation threshold.
 * Only checks plans in 'pending_approval' state with a submittedAt timestamp.
 * Returns a WorkflowEvent if > 5 business days have elapsed, null otherwise.
 */
export function checkEscalation(plan: HSPlan, now: Date): WorkflowEvent | null {
  if (plan.state !== 'pending_approval' || !plan.submittedAt) {
    return null;
  }

  const submittedAtDate = new Date(plan.submittedAt);
  const businessDays = calculateBusinessDays(submittedAtDate, now);

  if (businessDays > ESCALATION_BUSINESS_DAYS) {
    return {
      id: `escalation-${plan.id}-${now.toISOString()}`,
      type: 'task_overdue',
      projectId: plan.projectId,
      title: 'H&S Plan approval overdue',
      detail: `H&S Plan has been pending approval for more than ${ESCALATION_BUSINESS_DAYS} business days. Immediate action required.`,
      priority: 'high',
      sourceModule: 'health_safety',
      assignedRoles: ['client_developer'],
      createdAt: now.toISOString(),
    };
  }

  return null;
}
