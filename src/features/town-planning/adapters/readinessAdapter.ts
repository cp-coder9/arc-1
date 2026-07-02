/**
 * Readiness Adapter — Town Planning Integration
 *
 * Updates the Municipal Submission Readiness service with
 * the current planning readiness status. Used to reflect
 * conditions compliance and SDP approval state.
 */

import { withRetry, type RetryOptions } from './retryUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanningReadinessStatus {
  applicationId: string;
  conditionsCompliant: boolean;
  sdpApproved: boolean;
  splumaDetermined: boolean;
  overallReady: boolean;
  summary?: string;
}

export interface ReadinessAdapterDeps {
  /** Function that updates planning readiness in the Readiness service */
  updateFn: (projectId: string, status: PlanningReadinessStatus) => Promise<void>;
  /** Optional retry configuration */
  retryOptions?: RetryOptions;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Updates the Municipal Submission Readiness service with
 * the current planning status for a project.
 */
export async function updatePlanningReadiness(
  projectId: string,
  status: PlanningReadinessStatus,
  deps: ReadinessAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.updateFn(projectId, status),
    deps.retryOptions
  );
}
