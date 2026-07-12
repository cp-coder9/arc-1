/**
 * Passport Adapter — Insurance Register
 *
 * Writes insurance compliance summary to Project Passport
 * using PlatformIntegrationService.writeToPassport().
 *
 * Requirements: 4.1, 4.8
 */

import type { PlatformIntegrationService, PassportWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { InsuranceComplianceSummary } from '../types';

// ─── Adapter Payload Type ─────────────────────────────────────────────────────

export interface PassportAdapterPayload {
  projectId: string;
  complianceSummary: InsuranceComplianceSummary;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface InsurancePassportAdapter {
  write(payload: PassportAdapterPayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Insurance Register → Project Passport adapter.
 *
 * Maps InsuranceComplianceSummary to PassportWritePayload and writes
 * via PlatformIntegrationService. On failure, the platform integration
 * service handles retry queue enqueuing automatically.
 */
export function createPassportAdapter(
  platformIntegration: PlatformIntegrationService,
): InsurancePassportAdapter {
  return {
    async write(payload: PassportAdapterPayload): Promise<IntegrationWriteResult> {
      const { projectId, complianceSummary } = payload;

      const passportPayload: PassportWritePayload = {
        projectId,
        moduleId: 'insurance-register',
        statusLabel: complianceSummary.overallStatus,
        activeRecords: complianceSummary.activePolicies,
        overdueItems: complianceSummary.nonCompliantTypes + complianceSummary.expiredPolicies,
        lastUpdated: complianceSummary.lastCheckDate,
      };

      return platformIntegration.writeToPassport(passportPayload);
    },
  };
}
