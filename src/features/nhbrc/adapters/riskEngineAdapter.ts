/**
 * NHBRC → Risk Engine Adapter
 *
 * Creates risk events for failed inspections with category
 * "construction compliance" and severity "high".
 *
 * Requirements: 15.2
 */

import type { PlatformIntegrationService } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { InspectionStage } from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface InspectionFailureRiskPayload {
  projectId: string;
  unitId: string;
  stage: InspectionStage;
  inspectionId: string;
  description: string;
  mitigationAction?: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface NHBRCRiskEngineAdapter {
  /** Create a risk event for a failed inspection. */
  raiseInspectionFailureRisk(payload: InspectionFailureRiskPayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const RISK_CATEGORY = 'construction compliance';
const RISK_SEVERITY = 'high' as const;

/**
 * Creates an NHBRC Risk Engine Adapter backed by the shared PlatformIntegrationService.
 */
export function createNHBRCRiskEngineAdapter(
  platform: PlatformIntegrationService,
): NHBRCRiskEngineAdapter {
  return {
    async raiseInspectionFailureRisk(payload: InspectionFailureRiskPayload): Promise<IntegrationWriteResult> {
      const description = payload.description ||
        `NHBRC inspection failed at ${payload.stage} stage for unit ${payload.unitId}. Construction may not proceed at this hold point until rectification is complete.`;

      const recordRef = `nhbrc:inspection:${payload.inspectionId}:${payload.unitId}:${payload.stage}`;

      return platform.writeToRiskEngine({
        projectId: payload.projectId,
        category: RISK_CATEGORY,
        severity: RISK_SEVERITY,
        description,
        recordRef,
        mitigationAction: payload.mitigationAction ?? 'Complete rectification and schedule re-inspection',
      });
    },
  };
}
