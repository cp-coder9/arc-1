/**
 * Procurement ProjectRecord Adapter
 *
 * Converts procurement events into ProjectRecord envelope records.
 * Each procurement event type produces a typed ProjectRecord suitable
 * for the project timeline, audit trail, and cross-module linking.
 *
 * ProjectRecord types:
 *   - rfq_package
 *   - bidder_invitation
 *   - clarification_question
 *   - addendum
 *   - quote_submission
 *   - quote_comparison
 *   - award_recommendation
 *   - procurement_appointment_placeholder
 */

import type { RfqPackageRecord } from './rfqPackageBuilder';
import type { BidderInvitationRecord } from './bidderInvitationService';
import type { ClarificationQuestionRecord, AddendumRecord } from './clarificationAddendumService';
import type { QuoteSubmissionRecord, QuoteValidationResult } from './quoteReturnableValidator';
import type { AwardRecommendationRecord } from './awardRecommendationService';

export type ProcurementRecordType =
  | 'rfq_package'
  | 'bidder_invitation'
  | 'clarification_question'
  | 'addendum'
  | 'quote_submission'
  | 'quote_comparison'
  | 'award_recommendation'
  | 'procurement_appointment_placeholder';

export interface ProcurementProjectRecord {
  recordId: string;
  projectId: string;
  moduleKey: 'procurement_marketplace';
  recordType: ProcurementRecordType;
  title: string;
  status: string;
  description: string;
  linkedRecordIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

function createRecord(
  projectId: string,
  recordType: ProcurementRecordType,
  title: string,
  status: string,
  description: string,
  linkedRecordIds: string[] = [],
  metadata: Record<string, unknown> = {},
): ProcurementProjectRecord {
  return {
    recordId: `proc_${recordType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    moduleKey: 'procurement_marketplace',
    recordType,
    title,
    status,
    description,
    linkedRecordIds,
    metadata,
    createdAt: new Date().toISOString(),
  };
}

/** Converts an RFQ package into a ProjectRecord */
export function rfqPackageToProjectRecord(
  pkg: RfqPackageRecord,
  projectId: string,
): ProcurementProjectRecord {
  return createRecord(
    projectId,
    'rfq_package',
    `RFQ: ${pkg.title}`,
    pkg.status,
    `RFQ package for ${pkg.scopeSummary.slice(0, 150)}. Classification: ${pkg.procurementClassification}. Budget: R${pkg.budgetEstimateZar.toLocaleString()}. Deadline: ${new Date(pkg.deadlineIso).toLocaleDateString('en-ZA')}.`,
    [],
    {
      rfqId: pkg.rfqId,
      classification: pkg.procurementClassification,
      budget: pkg.budgetEstimateZar,
      deadline: pkg.deadlineIso,
      returnableCount: pkg.returnables.length,
      drawingCount: pkg.drawings.length,
      minimumBidders: pkg.minimumBidders,
      isComplete: pkg.isComplete,
    },
  );
}

/** Converts a bidder invitation into a ProjectRecord */
export function bidderInvitationToProjectRecord(
  invitation: BidderInvitationRecord,
  projectId: string,
): ProcurementProjectRecord {
  return createRecord(
    projectId,
    'bidder_invitation',
    `Invitation: ${invitation.bidderName}`,
    invitation.status,
    `${invitation.bidderName} (${invitation.bidderCategory}) invited to ${invitation.rfqTitle}. Status: ${invitation.status}.`,
    [invitation.rfqId],
    {
      invitationId: invitation.invitationId,
      rfqId: invitation.rfqId,
      bidderId: invitation.bidderId,
      bidderCategory: invitation.bidderCategory,
      expiresAt: invitation.expiresAt,
    },
  );
}

/** Converts a clarification question into a ProjectRecord */
export function clarificationToProjectRecord(
  clarification: ClarificationQuestionRecord,
  projectId: string,
): ProcurementProjectRecord {
  return createRecord(
    projectId,
    'clarification_question',
    `Clarification: ${clarification.question.slice(0, 80)}`,
    clarification.status,
    `Clarification from ${clarification.bidderName} (${clarification.category}). Material: ${clarification.isMaterial ? 'Yes — escalated to addendum' : 'No'}.`,
    [clarification.rfqId],
    {
      questionId: clarification.questionId,
      rfqId: clarification.rfqId,
      bidderId: clarification.bidderId,
      category: clarification.category,
      isMaterial: clarification.isMaterial,
      hasResponse: !!clarification.response,
      linkedAddendumId: clarification.linkedAddendumId,
    },
  );
}

/** Converts an addendum into a ProjectRecord */
export function addendumToProjectRecord(
  addendum: AddendumRecord,
  projectId: string,
): ProcurementProjectRecord {
  return createRecord(
    projectId,
    'addendum',
    `Addendum #${addendum.number}: ${addendum.subject}`,
    addendum.status,
    `Addendum to ${addendum.rfqTitle}. Distributed to ${addendum.distributedToBidderIds.length} bidders. Equal information: ${addendum.equalInformationCompliant ? 'Compliant' : 'VIOLATION'}.`,
    [addendum.rfqId, ...addendum.sourceQuestionIds],
    {
      addendumId: addendum.addendumId,
      number: addendum.number,
      rfqId: addendum.rfqId,
      distributedCount: addendum.distributedToBidderIds.length,
      equalInformationCompliant: addendum.equalInformationCompliant,
    },
  );
}

/** Converts a quote submission into a ProjectRecord */
export function quoteSubmissionToProjectRecord(
  quote: QuoteSubmissionRecord,
  projectId: string,
): ProcurementProjectRecord {
  return createRecord(
    projectId,
    'quote_submission',
    `Quote: ${quote.bidderName} — R${quote.priceZar.toLocaleString()}`,
    quote.status,
    `Quote from ${quote.bidderName}: R${quote.priceZar.toLocaleString()}, ${quote.leadTimeWeeks} weeks lead time. ${quote.exclusions.length} exclusion(s), ${quote.qualifications.length} qualification(s).`,
    [quote.rfqId],
    {
      quoteId: quote.quoteId,
      rfqId: quote.rfqId,
      bidderId: quote.bidderId,
      priceZar: quote.priceZar,
      leadTimeWeeks: quote.leadTimeWeeks,
      exclusionCount: quote.exclusions.length,
      qualificationCount: quote.qualifications.length,
    },
  );
}

/** Converts a quote validation into a ProjectRecord */
export function quoteComparisonToProjectRecord(
  validation: QuoteValidationResult,
  projectId: string,
): ProcurementProjectRecord {
  return createRecord(
    projectId,
    'quote_comparison',
    `Quote Comparison: ${validation.quoteId}`,
    validation.compliant ? 'compliant' : 'non_compliant',
    `Completeness: ${Math.round(validation.completenessScore * 100)}%. ${validation.mandatoryReturnablesProvided}/${validation.mandatoryReturnablesTotal} mandatory returnables. ${validation.riskFlags.length} risk flag(s).`,
    [],
    {
      quoteId: validation.quoteId,
      compliant: validation.compliant,
      completenessScore: validation.completenessScore,
      missingReturnables: validation.missingReturnables,
      riskFlags: validation.riskFlags,
      priceAnomaly: validation.priceAnomaly,
    },
  );
}

/** Converts an award recommendation into a ProjectRecord */
export function awardRecommendationToProjectRecord(
  recommendation: AwardRecommendationRecord,
  projectId: string,
): ProcurementProjectRecord {
  return createRecord(
    projectId,
    'award_recommendation',
    `Award Recommendation: ${recommendation.recommendedBidderName} — R${recommendation.recommendedPriceZar.toLocaleString()}`,
    recommendation.status,
    `Recommended: ${recommendation.recommendedBidderName}. Client approval: ${recommendation.clientApprovedBy ? 'Recorded' : 'Pending'}. Professional approval: ${recommendation.professionalApprovedBy ? 'Recorded' : 'Pending'}. Conflicts: ${recommendation.conflictOfInterestFlags.length}.`,
    [recommendation.rfqId, recommendation.recommendedQuoteId],
    {
      recommendationId: recommendation.recommendationId,
      rfqId: recommendation.rfqId,
      recommendedBidderId: recommendation.recommendedBidderId,
      recommendedQuoteId: recommendation.recommendedQuoteId,
      recommendedPriceZar: recommendation.recommendedPriceZar,
      conflictFlags: recommendation.conflictOfInterestFlags,
      supervisionRequired: recommendation.candidateProfessionalSupervision,
      clientApproved: !!recommendation.clientApprovedBy,
      professionalApproved: !!recommendation.professionalApprovedBy,
    },
  );
}

/** Creates a procurement appointment placeholder record */
export function createAppointmentPlaceholderRecord(
  recommendation: AwardRecommendationRecord,
  projectId: string,
): ProcurementProjectRecord {
  return createRecord(
    projectId,
    'procurement_appointment_placeholder',
    `Appointment: ${recommendation.recommendedBidderName}`,
    'pending_appointment',
    `Appointment placeholder for ${recommendation.recommendedBidderName} based on award recommendation ${recommendation.recommendationId}. Awaiting formal appointment execution.`,
    [recommendation.recommendationId, recommendation.recommendedQuoteId],
    {
      recommendationId: recommendation.recommendationId,
      bidderId: recommendation.recommendedBidderId,
      bidderName: recommendation.recommendedBidderName,
      priceZar: recommendation.recommendedPriceZar,
    },
  );
}
