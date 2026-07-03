/**
 * Contract Admin Adapter — Dispute Resolution
 *
 * Manages bidirectional cross-references with the Contract Administration module.
 * Writes claim resolutions and adjudication outcome metadata back to Contract Admin.
 * Handles retry on failure via the PlatformIntegrationService retry mechanism.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.8
 */

import type { PlatformIntegrationService } from '@/features/p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '@/features/p1-shared/types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface CrossReferencePayload {
  projectId: string;
  contractAdminClaimId: string;
  disputeClaimId: string;
  disputeClaimReference: string;
}

export interface ResolutionWriteBackPayload {
  projectId: string;
  contractAdminClaimId: string;
  disputeClaimId: string;
  resolutionType: 'settled' | 'awarded_in_full' | 'awarded_in_part' | 'dismissed';
  resolvedDate: string;
  awardedAmount?: number;
  awardedTime?: number;
}

export interface AdjudicationOutcomePayload {
  projectId: string;
  contractAdminClaimId: string;
  disputeClaimId: string;
  adjudicationId: string;
  /** Revised completion date when time extension awarded */
  revisedCompletionDate?: string;
  /** Payment instruction reference for monetary awards */
  paymentInstructionRef?: string;
  amountAwarded?: number;
  timeAwarded?: number;
  decisionDate: string;
  decisionSummary?: string;
}

export interface EvidencePrePopulatePayload {
  projectId: string;
  contractAdminClaimId: string;
  disputeClaimId: string;
  evidenceRefs: string[];
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface DisputeContractAdminAdapter {
  /** Create bidirectional cross-reference between contract admin and dispute claims (Req 10.2) */
  writeCrossReference(payload: CrossReferencePayload): Promise<IntegrationWriteResult>;

  /** Write resolution metadata back to Contract Admin claim (Req 10.5) */
  writeResolution(payload: ResolutionWriteBackPayload): Promise<IntegrationWriteResult>;

  /** Write adjudication outcome back to Contract Admin — revised dates and payment refs (Req 10.4) */
  writeAdjudicationOutcome(payload: AdjudicationOutcomePayload): Promise<IntegrationWriteResult>;

  /** Pre-populate evidence cross-references from Contract Admin claim (Req 10.3) */
  writeEvidencePrePopulate(payload: EvidencePrePopulatePayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates the Dispute Resolution Contract Admin adapter.
 *
 * Accepts a PlatformIntegrationService and returns an object with
 * typed write methods for bidirectional cross-references, resolution
 * write-back, adjudication outcomes, and evidence pre-population.
 *
 * On failure, operations are automatically retried via the platform
 * integration retry queue (exponential backoff, 3 retries).
 */
export function createDisputeContractAdminAdapter(
  platform: PlatformIntegrationService,
): DisputeContractAdminAdapter {
  return {
    async writeCrossReference(payload: CrossReferencePayload): Promise<IntegrationWriteResult> {
      return platform.writeToAuditTrail({
        projectId: payload.projectId,
        moduleId: 'dispute-resolution',
        action: 'cross_reference_created',
        recordRef: payload.disputeClaimReference,
        actorId: 'system',
        timestamp: new Date().toISOString(),
        newValues: {
          contractAdminClaimId: payload.contractAdminClaimId,
          disputeClaimId: payload.disputeClaimId,
          disputeClaimReference: payload.disputeClaimReference,
          linkType: 'bidirectional_cross_reference',
        },
      });
    },

    async writeResolution(payload: ResolutionWriteBackPayload): Promise<IntegrationWriteResult> {
      return platform.writeToAuditTrail({
        projectId: payload.projectId,
        moduleId: 'dispute-resolution',
        action: 'resolution_write_back',
        recordRef: payload.disputeClaimId,
        actorId: 'system',
        timestamp: new Date().toISOString(),
        newValues: {
          contractAdminClaimId: payload.contractAdminClaimId,
          resolutionType: payload.resolutionType,
          resolvedDate: payload.resolvedDate,
          ...(payload.awardedAmount !== undefined && { awardedAmount: payload.awardedAmount }),
          ...(payload.awardedTime !== undefined && { awardedTime: payload.awardedTime }),
          targetStatus: 'disputed',
        },
      });
    },

    async writeAdjudicationOutcome(payload: AdjudicationOutcomePayload): Promise<IntegrationWriteResult> {
      return platform.writeToAuditTrail({
        projectId: payload.projectId,
        moduleId: 'dispute-resolution',
        action: 'adjudication_outcome_write_back',
        recordRef: payload.adjudicationId,
        actorId: 'system',
        timestamp: new Date().toISOString(),
        newValues: {
          contractAdminClaimId: payload.contractAdminClaimId,
          disputeClaimId: payload.disputeClaimId,
          decisionDate: payload.decisionDate,
          ...(payload.revisedCompletionDate && { revisedCompletionDate: payload.revisedCompletionDate }),
          ...(payload.paymentInstructionRef && { paymentInstructionRef: payload.paymentInstructionRef }),
          ...(payload.amountAwarded !== undefined && { amountAwarded: payload.amountAwarded }),
          ...(payload.timeAwarded !== undefined && { timeAwarded: payload.timeAwarded }),
          ...(payload.decisionSummary && { decisionSummary: payload.decisionSummary }),
        },
      });
    },

    async writeEvidencePrePopulate(payload: EvidencePrePopulatePayload): Promise<IntegrationWriteResult> {
      return platform.writeToAuditTrail({
        projectId: payload.projectId,
        moduleId: 'dispute-resolution',
        action: 'evidence_pre_populated',
        recordRef: payload.disputeClaimId,
        actorId: 'system',
        timestamp: new Date().toISOString(),
        newValues: {
          contractAdminClaimId: payload.contractAdminClaimId,
          evidenceRefs: payload.evidenceRefs,
          evidenceCount: payload.evidenceRefs.length,
        },
      });
    },
  };
}
