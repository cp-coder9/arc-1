/**
 * Passport Adapter — Town Planning Integration
 *
 * Writes planning status, decision outcomes, and conditions compliance %
 * to the Project Passport module. This adapter uses DI for the underlying
 * passport service function, enabling testability and decoupling from
 * the actual projectPassportService implementation.
 */

import type { ApplicationStage, DecisionOutcome } from '../types';
import { withRetry, type RetryOptions } from './retryUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanningPassportUpdate {
  applicationId: string;
  applicationType: string;
  stage: ApplicationStage;
  referenceNumber: string;
  decisionOutcome?: DecisionOutcome;
  conditionsCompliancePercent?: number;
}

export interface PassportAdapterDeps {
  /** Function that writes to the project passport store */
  writeFn: (projectId: string, update: PlanningPassportUpdate) => Promise<void>;
  /** Optional retry configuration */
  retryOptions?: RetryOptions;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Updates the Project Passport with the current planning status.
 * Retries on failure per configured retry policy.
 */
export async function updatePlanningStatus(
  projectId: string,
  status: PlanningPassportUpdate,
  deps: PassportAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.writeFn(projectId, status),
    deps.retryOptions
  );
}

/**
 * Marks the planning phase as complete in the Project Passport.
 * Signals that all town planning prerequisites have been satisfied.
 */
export async function markPlanningPhaseComplete(
  projectId: string,
  deps: PassportAdapterDeps
): Promise<void> {
  const completeUpdate: PlanningPassportUpdate = {
    applicationId: '',
    applicationType: '',
    stage: 'conditions_compliance',
    referenceNumber: '',
    conditionsCompliancePercent: 100,
  };

  await withRetry(
    () => deps.writeFn(projectId, completeUpdate),
    deps.retryOptions
  );
}
