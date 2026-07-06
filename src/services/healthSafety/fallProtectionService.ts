/**
 * Fall Protection Service
 *
 * Manages fall protection plans, inspection schedules, permit linkage,
 * and gating logic for height-related permits per Construction Regulations 2014 (Reg 10).
 */

import type { FallProtectionPlan } from './hsTypes';
import { FallProtectionPlanSchema } from './hsSchemas';

/**
 * Creates a new fall protection plan.
 * Validates input against FallProtectionPlanSchema, generates a unique ID,
 * and sets creation/update timestamps.
 */
export function createFallProtectionPlan(
  input: Omit<FallProtectionPlan, 'id' | 'createdAt' | 'updatedAt'>
): FallProtectionPlan {
  FallProtectionPlanSchema.parse(input);

  const now = new Date().toISOString();
  return {
    ...input,
    id: `hs-fpp-${Date.now()}`,
    linkedPermitIds: input.linkedPermitIds ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Approves a fall protection plan.
 * Sets approvedAt to current ISO timestamp, approvedBy to the approverId,
 * and updates the updatedAt field.
 */
export function approveFallProtectionPlan(
  plan: FallProtectionPlan,
  approverId: string
): FallProtectionPlan {
  const now = new Date().toISOString();
  return {
    ...plan,
    approvedAt: now,
    approvedBy: approverId,
    updatedAt: now,
  };
}

/**
 * Checks whether the plan's inspection schedule is overdue.
 * Compares plan.inspectionSchedule.nextDue against the provided date.
 * Returns true if nextDue < now, false otherwise.
 */
export function checkInspectionOverdue(plan: FallProtectionPlan, now: Date): boolean {
  const nextDue = new Date(plan.inspectionSchedule.nextDue);
  return nextDue < now;
}

/**
 * Links a permit to a fall protection plan.
 * Adds permitId to linkedPermitIds array (avoids duplicates) and updates updatedAt.
 */
export function linkToPermit(plan: FallProtectionPlan, permitId: string): FallProtectionPlan {
  if (plan.linkedPermitIds.includes(permitId)) {
    return {
      ...plan,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...plan,
    linkedPermitIds: [...plan.linkedPermitIds, permitId],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Determines whether a permit for work at height can be issued based on
 * the presence and approval status of a fall protection plan.
 *
 * - If plan is null → not allowed (plan required)
 * - If plan exists but not approved → not allowed (plan not approved)
 * - If plan exists and approved → allowed
 */
export function canIssuePermitForHeight(
  plan: FallProtectionPlan | null
): { allowed: boolean; reason?: string } {
  if (plan === null) {
    return { allowed: false, reason: 'fall_protection_plan_required' };
  }

  if (plan.approvedAt === undefined) {
    return { allowed: false, reason: 'fall_protection_plan_not_approved' };
  }

  return { allowed: true };
}
