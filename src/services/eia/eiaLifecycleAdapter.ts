// ─── EIA Lifecycle Adapter ───────────────────────────────────────────────────
// Bridges the EIA environmental blocker evaluation into the platform's lifecycle
// engine. Exposes a standardised interface that the lifecycle engine can invoke
// to determine whether environmental authorization status blocks construction
// phase advancement.
//
// Requirement 12.5: Authorization not "authorized" or "authorized_with_conditions"
// → blocker for construction_execution phase advancement.

import type { AuthorizationStatus } from './eiaTypes';
import { evaluateEnvironmentalBlockers } from './eiaIntegrationService';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Minimal EIA state required for lifecycle blocker evaluation.
 * The lifecycle engine passes this state object when checking whether
 * environmental authorization permits construction phase advancement.
 */
export interface EIABlockerState {
  authorizationStatus: AuthorizationStatus;
}

/**
 * Result of the EIA lifecycle blocker evaluation, compatible with the
 * lifecycle engine's blocker reporting format.
 */
export interface EIABlockerResult {
  isBlocker: boolean;
  reason: string;
}

// ─── Blocker Evaluation ──────────────────────────────────────────────────────

/**
 * Evaluates whether the project's environmental authorization status
 * constitutes a blocker preventing construction phase advancement.
 *
 * This function is the single integration point exposed to the lifecycle
 * engine. It delegates to the core `evaluateEnvironmentalBlockers` function
 * from the EIA integration service.
 *
 * Non-blocking statuses:
 * - "authorized"
 * - "authorized_with_conditions"
 *
 * All other statuses (pending_decision, refused, appealed, lapsed, amended)
 * block construction_execution phase advancement.
 *
 * @param projectId - The project being evaluated
 * @param eiaState - Object containing the current authorization status
 * @returns Object indicating whether the status is a blocker, with a reason string
 */
export function evaluateEIABlocker(
  projectId: string,
  eiaState: EIABlockerState
): EIABlockerResult {
  return evaluateEnvironmentalBlockers(projectId, eiaState.authorizationStatus);
}

// ─── Lifecycle Engine Registration Helpers ───────────────────────────────────

/**
 * The project phase that this blocker applies to.
 * Environmental authorization gates construction_execution advancement.
 */
export const EIA_BLOCKER_TARGET_PHASE = 'construction_execution' as const;

/**
 * Human-readable label for the EIA blocker in lifecycle evaluation reports.
 */
export const EIA_BLOCKER_LABEL = 'Environmental Authorization';

/**
 * Checks whether a given authorization status would block construction.
 * Convenience function for use in contexts where only the status is available
 * (e.g., Firestore trigger handlers, event processors).
 */
export function isConstructionBlocked(authorizationStatus: AuthorizationStatus): boolean {
  const result = evaluateEnvironmentalBlockers('', authorizationStatus);
  return result.isBlocker;
}
