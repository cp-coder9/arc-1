/**
 * Risk Adapter — Town Planning Integration
 *
 * Creates and clears planning blocker risk events in the Risk Engine.
 * Planning blockers are always high severity — they prevent building
 * plan submission until resolved.
 */

import { withRetry, type RetryOptions } from './retryUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanningRiskEvent {
  projectId: string;
  source: 'town_planning';
  severity: 'high';
  reason: string;
  createdAt: string;
}

export interface RiskAdapterDeps {
  /** Function that creates a risk event in the Risk Engine */
  createRiskFn: (event: PlanningRiskEvent) => Promise<void>;
  /** Function that clears a risk event from the Risk Engine */
  clearRiskFn: (projectId: string, source: 'town_planning') => Promise<void>;
  /** Optional retry configuration */
  retryOptions?: RetryOptions;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Creates a high-severity planning blocker risk event.
 * Used when planning prerequisites block project progression.
 */
export async function createPlanningBlockerRisk(
  projectId: string,
  reason: string,
  deps: RiskAdapterDeps
): Promise<void> {
  const event: PlanningRiskEvent = {
    projectId,
    source: 'town_planning',
    severity: 'high',
    reason,
    createdAt: new Date().toISOString(),
  };

  await withRetry(
    () => deps.createRiskFn(event),
    deps.retryOptions
  );
}

/**
 * Clears a previously created planning blocker risk event.
 * Used when planning prerequisites are resolved.
 */
export async function clearPlanningBlockerRisk(
  projectId: string,
  deps: RiskAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.clearRiskFn(projectId, 'town_planning'),
    deps.retryOptions
  );
}
