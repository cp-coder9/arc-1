/**
 * Variation Control Service
 *
 * Manages the variation request lifecycle:
 *   draft → submitted → under_review → approved → incorporated
 *   (or) draft → submitted → under_review → rejected
 *
 * Variations require approval before contract sum changes.
 * Cost and time impact are tracked independently.
 */
import type {
  CommercialBaseline,
  FinancePartyRole,
  MoneyAmount,
  VariationRequest,
  VariationStatus,
} from './types';
import { incorporateVariationIntoBaseline, removeVariationFromBaseline } from './commercialBaselineService';

let variationIdCounter = 0;

/** Valid transitions from each variation status */
const VALID_TRANSITIONS: Record<VariationStatus, VariationStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['incorporated'],
  incorporated: [],
  rejected: ['draft'], // can restart
};

/**
 * Create a new variation request in draft state.
 */
export function createVariationRequest(input: {
  description: string;
  requestedBy: FinancePartyRole;
  estimatedImpact: MoneyAmount;
  programmeImpactDays: number;
  projectId?: string;
}): VariationRequest {
  const slug = input.description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const uniqueId = `var-${slug}-${Date.now()}-${++variationIdCounter}`;
  return {
    variationId: uniqueId,
    description: input.description,
    requestedBy: input.requestedBy,
    estimatedImpact: input.estimatedImpact,
    programmeImpactDays: input.programmeImpactDays,
    approved: false,
    status: 'draft',
  };
}

/**
 * Transition a variation to a new status, validating the transition.
 * Returns the updated variation (immutable).
 */
export function transitionVariation(
  variation: VariationRequest,
  toStatus: VariationStatus,
): VariationRequest {
  const allowed = VALID_TRANSITIONS[variation.status];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new Error(
      `Invalid variation transition: ${variation.status} → ${toStatus}. ` +
        `Allowed: [${(allowed ?? []).join(', ') || 'none'}]`,
    );
  }

  const now = new Date().toISOString();
  const updates: Partial<VariationRequest> = { status: toStatus };

  if (toStatus === 'submitted') {
    updates.submittedAtIso = now;
  }
  if (toStatus === 'approved' || toStatus === 'rejected') {
    updates.approvedAtIso = now;
    updates.approved = toStatus === 'approved';
  }

  return { ...variation, ...updates };
}

/**
 * Quick helper: create a variation and immediately submit it.
 */
export function createAndSubmitVariation(input: {
  description: string;
  requestedBy: FinancePartyRole;
  estimatedImpact: MoneyAmount;
  programmeImpactDays: number;
}): VariationRequest {
  const draft = createVariationRequest(input);
  return transitionVariation(draft, 'submitted');
}

/**
 * Approve a variation and incorporate its cost impact into the baseline.
 * Returns both the updated variation and the updated baseline.
 */
export function approveAndIncorporateVariation(
  baseline: CommercialBaseline,
  variation: VariationRequest,
  reviewerRole: FinancePartyRole = 'quantity_surveyor',
): { baseline: CommercialBaseline; variation: VariationRequest } {
  // Move through the approval chain
  let v = variation;
  if (v.status === 'draft') v = transitionVariation(v, 'submitted');
  if (v.status === 'submitted') v = transitionVariation(v, 'under_review');
  if (v.status === 'under_review') v = transitionVariation(v, 'approved');

  v = {
    ...v,
    reviewedBy: [...(v.reviewedBy ?? []), reviewerRole],
  };

  if (v.status === 'approved') {
    v = transitionVariation(v, 'incorporated');
  }

  const updatedBaseline = incorporateVariationIntoBaseline(
    baseline,
    v.estimatedImpact,
  );

  return { baseline: updatedBaseline, variation: v };
}

/**
 * Reject a variation request.
 */
export function rejectVariation(
  variation: VariationRequest,
  reviewerRole: FinancePartyRole = 'lead_professional',
): VariationRequest {
  let v = variation;
  if (v.status === 'draft') v = transitionVariation(v, 'submitted');
  if (v.status === 'submitted') v = transitionVariation(v, 'under_review');

  if (v.status !== 'under_review') {
    throw new Error(`Cannot reject variation in status: ${v.status}`);
  }

  return {
    ...transitionVariation(v, 'rejected'),
    reviewedBy: [...(v.reviewedBy ?? []), reviewerRole],
  };
}

/**
 * Reverse a previously incorporated variation, removing its impact from
 * the baseline.
 */
export function reverseVariation(
  baseline: CommercialBaseline,
  variation: VariationRequest,
): { baseline: CommercialBaseline; variation: VariationRequest } {
  if (variation.status !== 'incorporated') {
    throw new Error(
      `Can only reverse incorporated variations, got status: ${variation.status}`,
    );
  }

  const removedBaseline = removeVariationFromBaseline(
    baseline,
    variation.estimatedImpact,
  );

  const revertedVariation: VariationRequest = {
    ...variation,
    approved: false,
    status: 'rejected',
  };

  return { baseline: removedBaseline, variation: revertedVariation };
}
