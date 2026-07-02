/**
 * Compliance Hub Adapter — Town Planning Integration
 *
 * Feeds zoning parameters from the Property Intelligence Register
 * to the Compliance Hub. Enables SANS compliance checks to reference
 * current zoning data for the project property.
 */

import type { ZoningParameters } from '../types';
import { withRetry, type RetryOptions } from './retryUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ComplianceHubAdapterDeps {
  /** Function that updates zoning parameters in the Compliance Hub */
  updateZoningFn: (projectId: string, params: ZoningParameters) => Promise<void>;
  /** Optional retry configuration */
  retryOptions?: RetryOptions;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Updates zoning parameters in the Compliance Hub.
 * Called when property intelligence data is updated, ensuring
 * compliance checks reference the latest zoning information.
 */
export async function updateZoningParameters(
  projectId: string,
  params: ZoningParameters,
  deps: ComplianceHubAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.updateZoningFn(projectId, params),
    deps.retryOptions
  );
}
