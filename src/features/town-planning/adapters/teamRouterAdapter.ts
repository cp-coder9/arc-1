/**
 * Team Router Adapter — Town Planning Integration
 *
 * Triggers professional appointment prompts via the Professional
 * Team Router. Used when a required professional (e.g., surveyor)
 * is not yet assigned to the project.
 */

import { withRetry, type RetryOptions } from './retryUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProfessionalAppointmentRequest {
  projectId: string;
  profession: string;
  reason: string;
  requestedAt: string;
}

export interface TeamRouterAdapterDeps {
  /** Function that triggers a professional appointment request */
  requestFn: (request: ProfessionalAppointmentRequest) => Promise<void>;
  /** Optional retry configuration */
  retryOptions?: RetryOptions;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Triggers a professional appointment prompt for the project.
 * Notifies the Team Router that a specific professional role
 * needs to be appointed before work can proceed.
 */
export async function requestProfessionalAppointment(
  projectId: string,
  profession: string,
  reason: string,
  deps: TeamRouterAdapterDeps
): Promise<void> {
  const request: ProfessionalAppointmentRequest = {
    projectId,
    profession,
    reason,
    requestedAt: new Date().toISOString(),
  };

  await withRetry(
    () => deps.requestFn(request),
    deps.retryOptions
  );
}
