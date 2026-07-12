/**
 * Town Planning Adapter — Survey & Geomatics
 *
 * Integrates with the Town Planning module (P0.3):
 * - Updates subdivision/consolidation condition fulfilment when SG diagram approved
 * - Blocks decision-stage transition if no diagram lodged
 * - Creates risk events for incomplete property data
 *
 * Requirements: 20.1, 20.2, 20.3, 20.5, 20.6
 */

import type { PlatformIntegrationService } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface ConditionFulfilmentPayload {
  projectId: string;
  townPlanningAppId: string;
  conditionId: string;
  sgApprovalNumber: string;
  sgApprovalDate: string;
  diagramReference: string;
  surveyInstructionId: string;
}

export interface DecisionBlockPayload {
  projectId: string;
  townPlanningAppId: string;
  /** Whether at least one linked SG diagram has reached 'lodged' or later stage */
  hasDiagramLodged: boolean;
  /** Whether the survey requirement has been marked not_applicable */
  surveyNotApplicable: boolean;
  notApplicableReason?: string;
  notApplicableAuthoriser?: string;
}

export interface DecisionBlockResult {
  blocked: boolean;
  reason?: string;
}

export interface IncompletePropertyDataPayload {
  projectId: string;
  townPlanningAppId: string;
  missingFields: string[];
  surveyInstructionId?: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface SurveyTownPlanningAdapter {
  /**
   * Update condition fulfilment when SG diagram approved.
   * Transitions the corresponding condition from "in_progress" to "fulfilled"
   * with SG approval evidence. (Req 20.3)
   */
  writeConditionFulfilment(payload: ConditionFulfilmentPayload): Promise<IntegrationWriteResult>;

  /**
   * Check whether the decision-stage transition should be blocked.
   * Returns blocked=true unless a linked SG diagram has reached 'lodged' stage
   * or later, OR the survey requirement is marked not_applicable. (Req 20.6)
   */
  checkDecisionBlock(payload: DecisionBlockPayload): DecisionBlockResult;

  /**
   * Create a risk event for incomplete property data blocking
   * survey instruction generation. (Req 20.2)
   */
  writeIncompletePropertyDataRisk(payload: IncompletePropertyDataPayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const SOURCE_MODULE = 'survey-geomatics';

/**
 * Creates a Survey & Geomatics → Town Planning adapter.
 *
 * Manages the integration between survey workflows and Town Planning conditions:
 * condition fulfilment on diagram approval, decision-stage blocking when no
 * diagram is lodged, and risk events for incomplete data.
 *
 * On failure, operations are automatically retried via the platform
 * integration retry queue (exponential backoff, 3 retries).
 */
export function createSurveyTownPlanningAdapter(
  platform: PlatformIntegrationService,
): SurveyTownPlanningAdapter {
  return {
    async writeConditionFulfilment(payload: ConditionFulfilmentPayload): Promise<IntegrationWriteResult> {
      // Record condition fulfilment via audit trail (cross-module write-back)
      return platform.writeToAuditTrail({
        projectId: payload.projectId,
        moduleId: SOURCE_MODULE,
        action: 'condition_fulfilled',
        recordRef: payload.surveyInstructionId,
        actorId: 'system',
        timestamp: new Date().toISOString(),
        newValues: {
          townPlanningAppId: payload.townPlanningAppId,
          conditionId: payload.conditionId,
          sgApprovalNumber: payload.sgApprovalNumber,
          sgApprovalDate: payload.sgApprovalDate,
          diagramReference: payload.diagramReference,
          conditionStatus: 'fulfilled',
        },
      });
    },

    checkDecisionBlock(payload: DecisionBlockPayload): DecisionBlockResult {
      // If survey requirement is marked not applicable with a reason and authoriser, allow
      if (
        payload.surveyNotApplicable &&
        payload.notApplicableReason &&
        payload.notApplicableAuthoriser
      ) {
        return { blocked: false };
      }

      // If at least one linked SG diagram has reached 'lodged' or later, allow
      if (payload.hasDiagramLodged) {
        return { blocked: false };
      }

      // Block the transition
      return {
        blocked: true,
        reason: 'Decision-stage transition blocked: no linked SG diagram has reached "lodged" stage or later, and the survey requirement has not been marked as not applicable.',
      };
    },

    async writeIncompletePropertyDataRisk(payload: IncompletePropertyDataPayload): Promise<IntegrationWriteResult> {
      const missingFieldsList = payload.missingFields.join(', ');
      const description = `Incomplete property data blocking survey instruction generation for Town Planning application ${payload.townPlanningAppId}. Missing: ${missingFieldsList}`;

      return platform.writeToRiskEngine({
        projectId: payload.projectId,
        category: 'survey',
        severity: 'low',
        description: description.slice(0, 500),
        recordRef: payload.surveyInstructionId ?? payload.townPlanningAppId,
        mitigationAction: `Complete the following fields on the Town Planning application: ${missingFieldsList}`,
      });
    },
  };
}
