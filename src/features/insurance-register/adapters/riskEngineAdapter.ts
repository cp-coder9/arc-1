/**
 * Risk Engine Adapter — Insurance Register
 *
 * Creates risk events for lapsed/expired policies using
 * PlatformIntegrationService.writeToRiskEngine().
 *
 * Severity mapping by policy type:
 *   CAR / public_liability → critical
 *   PI → high
 *   SASRIA / LDI → medium
 *
 * Requirements: 4.2, 4.8
 */

import type { PlatformIntegrationService, RiskEngineWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { InsurancePolicyType } from '../types';

// ─── Adapter Payload Type ─────────────────────────────────────────────────────

export interface RiskEngineAdapterPayload {
  projectId: string;
  policyType: InsurancePolicyType;
  policyNumber: string;
  description: string;
  mitigationAction?: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface InsuranceRiskEngineAdapter {
  write(payload: RiskEngineAdapterPayload): Promise<IntegrationWriteResult>;
}

// ─── Severity Mapping ─────────────────────────────────────────────────────────

function getSeverityForPolicyType(policyType: InsurancePolicyType): RiskEngineWritePayload['severity'] {
  switch (policyType) {
    case 'CAR':
    case 'public_liability':
      return 'critical';
    case 'PI':
      return 'high';
    case 'SASRIA':
    case 'LDI':
      return 'medium';
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Insurance Register → Risk Engine adapter.
 *
 * Maps lapsed/expired policy events to RiskEngineWritePayload with
 * severity determined by policy type. On failure, the platform integration
 * service handles retry queue enqueuing automatically.
 */
export function createRiskEngineAdapter(
  platformIntegration: PlatformIntegrationService,
): InsuranceRiskEngineAdapter {
  return {
    async write(payload: RiskEngineAdapterPayload): Promise<IntegrationWriteResult> {
      const riskPayload: RiskEngineWritePayload = {
        projectId: payload.projectId,
        category: 'insurance',
        severity: getSeverityForPolicyType(payload.policyType),
        description: payload.description,
        recordRef: payload.policyNumber,
        mitigationAction: payload.mitigationAction,
      };

      return platformIntegration.writeToRiskEngine(riskPayload);
    },
  };
}
