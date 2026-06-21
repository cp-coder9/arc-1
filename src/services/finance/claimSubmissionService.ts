/**
 * Claim Submission Service
 *
 * Handles the claim lifecycle: submit → review → certify → dispute resolution.
 * Claims are submitted by parties (contractor, supplier, consultant) against
 * payment milestones and may reference variations.
 */
import type { FinancePartyRole, MoneyAmount, PaymentClaim } from './types';

let claimIdCounter = 0;

/**
 * Submit a new payment claim.
 * Claims link to a specific milestone and optionally to one or more variations.
 */
export function submitPaymentClaim(input: {
  claimantRole: FinancePartyRole;
  claimedAmount: MoneyAmount;
  linkedMilestoneId: string;
  linkedVariationIds?: string[];
  disputed?: boolean;
  description?: string;
}): PaymentClaim {
  return {
    claimId: `claim-${input.linkedMilestoneId}-${Date.now()}-${++claimIdCounter}`,
    claimantRole: input.claimantRole,
    claimedAmount: input.claimedAmount,
    linkedMilestoneId: input.linkedMilestoneId,
    linkedVariationIds: input.linkedVariationIds ?? [],
    disputed: input.disputed ?? false,
    description: input.description,
    submittedAtIso: new Date().toISOString(),
  };
}

/**
 * Mark a claim as disputed. Disputed claims lock payment release
 * until the dispute is resolved.
 */
export function disputeClaim(claim: PaymentClaim, reason?: string): PaymentClaim {
  return {
    ...claim,
    disputed: true,
    description: reason
      ? `${claim.description ?? ''} [DISPUTED: ${reason}]`.trim()
      : claim.description,
  };
}

/**
 * Resolve a dispute on a claim.
 */
export function resolveDispute(claim: PaymentClaim): PaymentClaim {
  return {
    ...claim,
    disputed: false,
  };
}

/**
 * Amend a claim with updated amounts (before certification).
 * A claim can only be amended if it hasn't been certified yet.
 */
export function amendClaim(
  claim: PaymentClaim,
  updates: {
    claimedAmount?: MoneyAmount;
    linkedVariationIds?: string[];
    description?: string;
  },
): PaymentClaim {
  return {
    ...claim,
    claimedAmount: updates.claimedAmount ?? claim.claimedAmount,
    linkedVariationIds: updates.linkedVariationIds ?? claim.linkedVariationIds,
    description: updates.description ?? claim.description,
  };
}

/**
 * Calculate the total claimed amount across multiple claims.
 */
export function totalClaimedAmount(claims: PaymentClaim[]): MoneyAmount {
  return {
    currency: 'ZAR',
    amount: claims.reduce((sum, c) => sum + c.claimedAmount.amount, 0),
  };
}
