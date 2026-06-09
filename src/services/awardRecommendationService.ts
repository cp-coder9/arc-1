/**
 * Award Recommendation Service
 *
 * Generates award recommendations from quote comparisons:
 *   - Advisory scoring and ranking (NOT auto-appointment)
 *   - Human-approval gate required before any appointment
 *   - Conflict of interest detection
 *   - Justification and risk notes
 *   - Candidate professional supervision flagging
 *
 * Guardrails enforced:
 *   1. No automatic appointment — human gate required
 *   2. AI may compare and recommend but cannot award
 *   3. Conflicts of interest must be flagged
 *   4. Candidate professionals flagged for supervision
 */

import type { QuoteValidationResult } from './quoteReturnableValidator';

export type AwardRecommendationStatus =
  | 'draft'
  | 'recommended'
  | 'pending_client_approval'
  | 'pending_professional_approval'
  | 'approved'
  | 'rejected'
  | 'appointment_created';

export interface AwardRecommendationInput {
  rfqId: string;
  projectId: string;
  recommendedQuoteId: string;
  recommendedBidderId: string;
  recommendedBidderName: string;
  recommendedPriceZar: number;
  comparedQuoteIds: string[];
  justification: string;
  riskNotes: string[];
  createdBy: string;
  createdByRole: string;
}

export interface AwardRecommendationRecord {
  recommendationId: string;
  rfqId: string;
  projectId: string;
  recommendedQuoteId: string;
  recommendedBidderId: string;
  recommendedBidderName: string;
  recommendedPriceZar: number;
  comparedQuoteIds: string[];
  justification: string;
  riskNotes: string[];
  status: AwardRecommendationStatus;
  requiresClientApproval: boolean;
  requiresProfessionalApproval: boolean;
  conflictOfInterestFlags: string[];
  candidateProfessionalSupervision: boolean;
  humanApprovalGate: true;
  createdBy: string;
  createdByRole: string;
  clientApprovedBy?: string;
  clientApprovedAt?: string;
  professionalApprovedBy?: string;
  professionalApprovedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConflictOfInterestCheck {
  bidderId: string;
  bidderName: string;
  checkType: 'related_party' | 'same_director' | 'employment_link' | 'financial_interest';
  flagged: boolean;
  detail: string;
}

const GOVERNANCE_NOTE =
  'AI may compare and recommend but cannot award. Client/professional approval required before appointment.';

// Known conflict patterns for detection
const CONFLICT_PATTERNS = [
  { type: 'related_party' as const, keyword: /related.*party|connected.*person|family/i },
  { type: 'same_director' as const, keyword: /same.*director|common.*director|shared.*ownership/i },
  { type: 'employment_link' as const, keyword: /employee|staff.*member|former.*employee/i },
  { type: 'financial_interest' as const, keyword: /financial.*interest|ownership.*stake|shareholder/i },
];

/**
 * Checks for potential conflicts of interest in a bidder.
 * This is a keyword-based heuristic and must be confirmed by human review.
 */
export function checkConflictOfInterest(
  bidderId: string,
  bidderName: string,
  bidderDeclarations: string[],
  evaluatorId: string,
): ConflictOfInterestCheck[] {
  const checks: ConflictOfInterestCheck[] = [];

  for (const pattern of CONFLICT_PATTERNS) {
    const matchesDeclaration = bidderDeclarations.some((d) => pattern.keyword.test(d));
    checks.push({
      bidderId,
      bidderName,
      checkType: pattern.type,
      flagged: matchesDeclaration,
      detail: matchesDeclaration
        ? `Potential ${pattern.type.replace('_', ' ')} detected for ${bidderName} — requires human review`
        : `No ${pattern.type.replace('_', ' ')} detected`,
    });
  }

  // Check if bidder is the same as evaluator
  if (bidderId === evaluatorId) {
    checks.push({
      bidderId,
      bidderName,
      checkType: 'related_party' as const,
      flagged: true,
      detail: 'CRITICAL: Bidder and evaluator are the same entity — severe conflict of interest',
    });
  }

  return checks;
}

/**
 * Checks whether a bidder requires candidate professional supervision.
 */
export function checkCandidateProfessionalSupervision(
  bidderCategory: string,
  bidderRegistrations: string[],
): { supervisionRequired: boolean; rationale: string } {
  const candidateLabels = [
    'candidate',
    'candidate_professional',
    'freelancer_candidate_professional',
    'trainee',
    'intern',
    'in_training',
  ];

  const isCandidate = candidateLabels.some((label) =>
    bidderCategory.toLowerCase().includes(label),
  );

  const hasProfessionalRegistration = bidderRegistrations.some(
    (reg) =>
      /Pr\.?Arch|Pr\.?Eng|Pr\.?QS|Pr\.?CPM|PrSciNat/i.test(reg) ||
      /SACAP.*professional|ECSA.*professional|SACQSP.*professional/i.test(reg),
  );

  if (isCandidate && !hasProfessionalRegistration) {
    return {
      supervisionRequired: true,
      rationale: `${bidderCategory} requires registered professional supervision per SACAP/ECSA/SACQSP requirements.`,
    };
  }

  if (isCandidate) {
    return {
      supervisionRequired: true,
      rationale: `${bidderCategory} has professional registration but candidate status requires supervision verification.`,
    };
  }

  return {
    supervisionRequired: false,
    rationale: 'Bidder is not a candidate professional.',
  };
}

/**
 * Creates an award recommendation record.
 * This is ADVISORY ONLY. Human approval is always required.
 */
export function createAwardRecommendation(
  input: AwardRecommendationInput,
  conflictChecks: ConflictOfInterestCheck[] = [],
  supervisionCheck?: { supervisionRequired: boolean; rationale: string },
): AwardRecommendationRecord {
  if (!input.rfqId.trim()) throw new Error('RFQ ID is required');
  if (!input.recommendedQuoteId.trim()) throw new Error('Recommended quote ID is required');
  if (!input.justification.trim()) throw new Error('Justification is required');
  if (input.recommendedPriceZar < 0) throw new Error('Price must be non-negative');
  if (input.comparedQuoteIds.length < 1)
    throw new Error('At least one comparison quote is required');

  const now = new Date().toISOString();
  const conflictFlags = conflictChecks
    .filter((c) => c.flagged)
    .map((c) => c.detail);

  const supervisionRequired = supervisionCheck?.supervisionRequired ?? false;

  return {
    recommendationId: `award_${input.rfqId}_${Date.now()}`,
    rfqId: input.rfqId,
    projectId: input.projectId,
    recommendedQuoteId: input.recommendedQuoteId,
    recommendedBidderId: input.recommendedBidderId,
    recommendedBidderName: input.recommendedBidderName,
    recommendedPriceZar: input.recommendedPriceZar,
    comparedQuoteIds: [...input.comparedQuoteIds],
    justification: input.justification.trim(),
    riskNotes: [...input.riskNotes],
    status: 'recommended',
    requiresClientApproval: true,
    requiresProfessionalApproval: true,
    conflictOfInterestFlags: conflictFlags,
    candidateProfessionalSupervision: supervisionRequired,
    humanApprovalGate: true,
    createdBy: input.createdBy,
    createdByRole: input.createdByRole,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Records client approval of the award recommendation.
 * This is step 1 of 2 in the human approval gate.
 */
export function recordClientApproval(
  recommendation: AwardRecommendationRecord,
  clientId: string,
): AwardRecommendationRecord {
  if (recommendation.conflictOfInterestFlags.length > 0) {
    throw new Error(
      'Cannot approve award recommendation with unresolved conflict of interest flags',
    );
  }

  const now = new Date().toISOString();
  return {
    ...recommendation,
    clientApprovedBy: clientId,
    clientApprovedAt: now,
    status: 'pending_professional_approval',
    updatedAt: now,
  };
}

/**
 * Records professional approval of the award recommendation.
 * This is step 2 of 2 in the human approval gate.
 * After both approvals, the recommendation is approved.
 */
export function recordProfessionalApproval(
  recommendation: AwardRecommendationRecord,
  professionalId: string,
): AwardRecommendationRecord {
  if (!recommendation.clientApprovedBy) {
    throw new Error('Client approval must be recorded before professional approval');
  }

  const now = new Date().toISOString();
  return {
    ...recommendation,
    professionalApprovedBy: professionalId,
    professionalApprovedAt: now,
    status: 'approved',
    updatedAt: now,
  };
}

/**
 * Rejects an award recommendation with reason.
 */
export function rejectAwardRecommendation(
  recommendation: AwardRecommendationRecord,
  rejectedBy: string,
  reason: string,
): AwardRecommendationRecord {
  return {
    ...recommendation,
    status: 'rejected',
    riskNotes: [...recommendation.riskNotes, `Rejected by ${rejectedBy}: ${reason}`],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Confirms that an appointment has been created from the recommendation.
 */
export function confirmAppointmentCreated(
  recommendation: AwardRecommendationRecord,
): AwardRecommendationRecord {
  if (recommendation.status !== 'approved') {
    throw new Error('Award recommendation must be approved before creating an appointment');
  }

  return {
    ...recommendation,
    status: 'appointment_created',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Returns the governance statement for award recommendations.
 */
export function getAwardGovernanceStatement(): string {
  return GOVERNANCE_NOTE;
}
