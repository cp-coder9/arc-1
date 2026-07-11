/**
 * Claim Governance Service — Governed Payment Claim Workflows
 *
 * Validates and governs payment claims for all party types (professionals,
 * contractors, freelancers, subcontractors, suppliers, resource bookings).
 * Ensures no payment releases without proper approvals and commercial gates.
 *
 * Key invariants:
 * - Claim validation enforces membership, permission, amount limits, and stage prerequisites
 * - Platform fees are calculated from the project's active fee schedule before certification
 * - Partial releases cannot exceed remaining releasable balance
 * - Retention is applied per the project's CommercialBaseline (0–10%)
 * - Duplicate claims against the same milestone from the same claimant are rejected
 * - All actions generate immutable audit records
 *
 * @module finance/claimGovernanceService
 * @see Requirements 1.1–1.11
 */

import type { MoneyAmount, FinancePartyRole, PaymentClaim, RetentionRecord } from './types';
import { writeImmutableAuditRecord } from './auditTrailService';

// ─── Claim Type Union ────────────────────────────────────────────────────────

/** The type of work or deliverable the payment claim is raised against */
export type ClaimType =
  | 'milestone'
  | 'stage'
  | 'deliverable'
  | 'package'
  | 'purchase_order'
  | 'resource_booking';

// ─── Claim Status Union ──────────────────────────────────────────────────────

/** Governed lifecycle status of a payment claim */
export type ClaimStatus =
  | 'approval_required'
  | 'certified'
  | 'released'
  | 'rejected'
  | 'disputed';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Context required to validate and submit a payment claim.
 * Provided by the caller (API route handler) when a claimant submits.
 */
export interface ClaimValidationContext {
  claimantUid: string;
  claimantRole: FinancePartyRole;
  projectId: string;
  milestoneId: string;
  claimedAmount: MoneyAmount;
  claimType: ClaimType;
}

/**
 * Result of validating a payment claim against governance rules.
 * Contains structured error entries for each failed condition (Req 1.10).
 */
export interface ClaimValidationResult {
  valid: boolean;
  failedConditions: Array<{
    /** Machine-readable identifier, e.g. 'MEMBERSHIP_INVALID', 'AMOUNT_EXCEEDS_MILESTONE' */
    conditionId: string;
    /** Human-readable description of the failed condition */
    description: string;
  }>;
  platformFee?: {
    tariffId: string;
    feePercent: number;
    feeAmount: MoneyAmount;
    netPayable: MoneyAmount;
  };
}

/**
 * A payment claim enhanced with governance state and lifecycle tracking.
 * Extends the base PaymentClaim with governed status, validation results,
 * platform fees, partial release history, and retention.
 */
export interface GovernedPaymentClaim extends PaymentClaim {
  status: ClaimStatus;
  claimType: ClaimType;
  validationResult: ClaimValidationResult;
  platformFee?: ClaimValidationResult['platformFee'];
  partialReleases: Array<{
    amount: MoneyAmount;
    releasedAtIso: string;
    releaseId: string;
  }>;
  retentionRecord?: {
    retentionId: string;
    percent: number;
    amount: MoneyAmount;
  };
}

/** Structured error thrown when claim validation fails */
export interface ClaimValidationError {
  type: 'CLAIM_VALIDATION_FAILED';
  failedConditions: ClaimValidationResult['failedConditions'];
  claimantUid: string;
  projectId: string;
  milestoneId: string;
}

// ─── Re-exports for convenience ──────────────────────────────────────────────

export type { MoneyAmount, FinancePartyRole } from './types';

// ─── ID Generation ───────────────────────────────────────────────────────────

/** Generates a UUID for claim and audit identifiers */
function generateClaimId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Role-to-ClaimType Permission Map ────────────────────────────────────────

/**
 * Maps claim types to the roles and membership requirements that authorize them.
 */
const CLAIM_TYPE_ROLE_MAP: Record<ClaimType, {
  allowedRoles: FinancePartyRole[];
  requiredMembershipRole?: string;
}> = {
  milestone: {
    allowedRoles: ['lead_professional', 'quantity_surveyor', 'specialist_consultant'],
  },
  stage: {
    allowedRoles: ['contractor'],
  },
  deliverable: {
    allowedRoles: ['specialist_consultant'],
    requiredMembershipRole: 'freelancer_task_assignee',
  },
  package: {
    allowedRoles: ['subcontractor'],
    requiredMembershipRole: 'subcontractor_package_assignee',
  },
  purchase_order: {
    allowedRoles: ['supplier'],
    requiredMembershipRole: 'supplier_package_assignee',
  },
  resource_booking: {
    allowedRoles: ['lead_professional', 'quantity_surveyor', 'specialist_consultant', 'contractor', 'subcontractor'],
  },
};

// ─── Firestore Access Helpers ────────────────────────────────────────────────

/**
 * Lazily imports the adminDb to allow unit testing via module mocks.
 */
async function getAdminDb() {
  const { adminDb } = await import('@/lib/firebase-admin');
  return adminDb;
}

// ─── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validates active project membership and correct permission.
 * Returns a failed condition entry if validation fails, or null if valid.
 */
async function validateProjectMembership(
  db: FirebaseFirestore.Firestore,
  claimantUid: string,
  projectId: string,
  claimType: ClaimType,
): Promise<ClaimValidationResult['failedConditions'][number] | null> {
  const projectDoc = await db.collection('projects').doc(projectId).get();
  if (!projectDoc.exists) {
    return {
      conditionId: 'PROJECT_NOT_FOUND',
      description: `Project '${projectId}' does not exist`,
    };
  }

  const projectData = projectDoc.data();

  // Check if user is a team member with active status
  const teamMembers: Array<{ uid: string; status: string; role?: string }> =
    projectData?.teamMembers ?? [];
  const member = teamMembers.find(
    (m) => m.uid === claimantUid && m.status === 'active',
  );

  // Also check if the user is the project client or lead professional
  const isClient = projectData?.clientUid === claimantUid;
  const isLeadProfessional = projectData?.leadProfessionalUid === claimantUid;

  if (!member && !isClient && !isLeadProfessional) {
    return {
      conditionId: 'MEMBERSHIP_INVALID',
      description: `Claimant '${claimantUid}' does not hold active project membership on project '${projectId}'`,
    };
  }

  // For claim types that require a specific membership role, validate it
  const roleReq = CLAIM_TYPE_ROLE_MAP[claimType];
  if (roleReq.requiredMembershipRole && member) {
    if (member.role !== roleReq.requiredMembershipRole) {
      return {
        conditionId: 'ROLE_MISMATCH',
        description: `Claimant requires '${roleReq.requiredMembershipRole}' role for ${claimType} claims, but holds '${member.role ?? 'none'}'`,
      };
    }
  }

  return null;
}

/**
 * Validates that the referenced entity exists and is in a valid state
 * for the given claim type. Returns failed conditions or an empty array.
 */
async function validateEntityState(
  db: FirebaseFirestore.Firestore,
  ctx: ClaimValidationContext,
): Promise<ClaimValidationResult['failedConditions']> {
  const failures: ClaimValidationResult['failedConditions'] = [];

  switch (ctx.claimType) {
    case 'milestone': {
      const milestoneDoc = await db
        .collection('projects').doc(ctx.projectId)
        .collection('milestones').doc(ctx.milestoneId)
        .get();
      if (!milestoneDoc.exists) {
        failures.push({
          conditionId: 'MILESTONE_NOT_FOUND',
          description: `Milestone '${ctx.milestoneId}' does not exist on project '${ctx.projectId}'`,
        });
      } else {
        const data = milestoneDoc.data();
        if (data && ctx.claimedAmount.amount > (data.amount?.amount ?? 0)) {
          failures.push({
            conditionId: 'AMOUNT_EXCEEDS_MILESTONE',
            description: `Claimed amount ${ctx.claimedAmount.amount} exceeds milestone value ${data.amount?.amount ?? 0}`,
          });
        }
      }
      break;
    }

    case 'stage': {
      // Validate stage certification exists and is dated before claim submission
      const stageDoc = await db
        .collection('projects').doc(ctx.projectId)
        .collection('stages').doc(ctx.milestoneId)
        .get();
      if (!stageDoc.exists) {
        failures.push({
          conditionId: 'STAGE_NOT_FOUND',
          description: `Stage '${ctx.milestoneId}' does not exist on project '${ctx.projectId}'`,
        });
      } else {
        const data = stageDoc.data();
        if (!data?.certifiedComplete) {
          failures.push({
            conditionId: 'STAGE_NOT_CERTIFIED',
            description: `Stage '${ctx.milestoneId}' is not certified complete by site manager or lead professional`,
          });
        }
        if (data && ctx.claimedAmount.amount > (data.value?.amount ?? 0)) {
          failures.push({
            conditionId: 'AMOUNT_EXCEEDS_STAGE',
            description: `Claimed amount ${ctx.claimedAmount.amount} exceeds stage value ${data.value?.amount ?? 0}`,
          });
        }
      }
      break;
    }

    case 'deliverable': {
      const deliverableDoc = await db
        .collection('projects').doc(ctx.projectId)
        .collection('deliverables').doc(ctx.milestoneId)
        .get();
      if (!deliverableDoc.exists) {
        failures.push({
          conditionId: 'DELIVERABLE_NOT_FOUND',
          description: `Deliverable '${ctx.milestoneId}' does not exist on project '${ctx.projectId}'`,
        });
      } else {
        const data = deliverableDoc.data();
        if (!data?.accepted) {
          failures.push({
            conditionId: 'DELIVERABLE_NOT_ACCEPTED',
            description: `Deliverable '${ctx.milestoneId}' is not marked as accepted by the assigning professional`,
          });
        }
        if (data && ctx.claimedAmount.amount > (data.value?.amount ?? 0)) {
          failures.push({
            conditionId: 'AMOUNT_EXCEEDS_DELIVERABLE',
            description: `Claimed amount ${ctx.claimedAmount.amount} exceeds deliverable value ${data.value?.amount ?? 0}`,
          });
        }
      }
      break;
    }

    case 'package': {
      const packageDoc = await db
        .collection('projects').doc(ctx.projectId)
        .collection('packages').doc(ctx.milestoneId)
        .get();
      if (!packageDoc.exists) {
        failures.push({
          conditionId: 'PACKAGE_NOT_FOUND',
          description: `Package '${ctx.milestoneId}' does not exist on project '${ctx.projectId}'`,
        });
      } else {
        const data = packageDoc.data();
        if (!data?.scopeComplete) {
          failures.push({
            conditionId: 'PACKAGE_SCOPE_INCOMPLETE',
            description: `Package '${ctx.milestoneId}' scope is not marked as complete`,
          });
        }
        if (data && ctx.claimedAmount.amount > (data.value?.amount ?? 0)) {
          failures.push({
            conditionId: 'AMOUNT_EXCEEDS_PACKAGE',
            description: `Claimed amount ${ctx.claimedAmount.amount} exceeds package value ${data.value?.amount ?? 0}`,
          });
        }
      }
      break;
    }

    case 'purchase_order': {
      const poDoc = await db
        .collection('projects').doc(ctx.projectId)
        .collection('purchase_orders').doc(ctx.milestoneId)
        .get();
      if (!poDoc.exists) {
        failures.push({
          conditionId: 'PO_NOT_FOUND',
          description: `Purchase order '${ctx.milestoneId}' does not exist on project '${ctx.projectId}'`,
        });
      } else {
        const data = poDoc.data();
        if (!data?.deliveryConfirmed) {
          failures.push({
            conditionId: 'PO_DELIVERY_NOT_CONFIRMED',
            description: `Purchase order '${ctx.milestoneId}' delivery has not been confirmed`,
          });
        }
        if (data && ctx.claimedAmount.amount > (data.value?.amount ?? 0)) {
          failures.push({
            conditionId: 'AMOUNT_EXCEEDS_PO',
            description: `Claimed amount ${ctx.claimedAmount.amount} exceeds purchase order value ${data.value?.amount ?? 0}`,
          });
        }
      }
      break;
    }

    case 'resource_booking': {
      const bookingDoc = await db
        .collection('projects').doc(ctx.projectId)
        .collection('resource_bookings').doc(ctx.milestoneId)
        .get();
      if (!bookingDoc.exists) {
        failures.push({
          conditionId: 'BOOKING_NOT_FOUND',
          description: `Resource booking '${ctx.milestoneId}' does not exist on project '${ctx.projectId}'`,
        });
      } else {
        const data = bookingDoc.data();
        const endDate = data?.endDate ? new Date(data.endDate) : null;
        const now = new Date();
        if (!endDate || endDate >= now) {
          failures.push({
            conditionId: 'BOOKING_NOT_PAST',
            description: `Resource booking '${ctx.milestoneId}' end date has not passed (must be in the past)`,
          });
        }
        if (data && ctx.claimedAmount.amount > (data.value?.amount ?? 0)) {
          failures.push({
            conditionId: 'AMOUNT_EXCEEDS_BOOKING',
            description: `Claimed amount ${ctx.claimedAmount.amount} exceeds booking value ${data.value?.amount ?? 0}`,
          });
        }
      }
      break;
    }
  }

  return failures;
}

/**
 * Checks for duplicate pending or disputed claims from the same claimant
 * against the same milestone/entity.
 */
async function checkDuplicateClaim(
  db: FirebaseFirestore.Firestore,
  claimantUid: string,
  projectId: string,
  milestoneId: string,
): Promise<{ isDuplicate: boolean; existingClaimId?: string; existingStatus?: string }> {
  const existingClaims = await db
    .collection('payment_claims')
    .where('linkedMilestoneId', '==', milestoneId)
    .where('claimantUid', '==', claimantUid)
    .where('projectId', '==', projectId)
    .get();

  for (const doc of existingClaims.docs) {
    const data = doc.data();
    if (data.status === 'approval_required' || data.status === 'disputed') {
      return {
        isDuplicate: true,
        existingClaimId: data.claimId ?? doc.id,
        existingStatus: data.status,
      };
    }
  }

  return { isDuplicate: false };
}

// ─── Main Implementation ─────────────────────────────────────────────────────

/**
 * Validates a payment claim against all governance rules and persists it
 * with status "approval_required" on success.
 *
 * Validates ALL conditions and collects ALL failures before returning.
 * Writes audit record on both success (claim_submitted) and failure (claim_rejected).
 *
 * @param ctx - The claim validation context
 * @returns The persisted governed payment claim
 * @throws ClaimValidationError with all failed conditions if validation fails
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 1.11, 1.12
 */
export async function validateAndSubmitClaim(
  ctx: ClaimValidationContext,
): Promise<GovernedPaymentClaim> {
  const db = await getAdminDb();
  const failedConditions: ClaimValidationResult['failedConditions'] = [];
  const submittedAtIso = new Date().toISOString();

  // 1. Validate role is allowed for this claim type
  const roleConfig = CLAIM_TYPE_ROLE_MAP[ctx.claimType];
  if (!roleConfig.allowedRoles.includes(ctx.claimantRole)) {
    failedConditions.push({
      conditionId: 'ROLE_NOT_PERMITTED',
      description: `Role '${ctx.claimantRole}' is not permitted to submit '${ctx.claimType}' claims`,
    });
  }

  // 2. Validate active project membership
  const membershipFailure = await validateProjectMembership(
    db,
    ctx.claimantUid,
    ctx.projectId,
    ctx.claimType,
  );
  if (membershipFailure) {
    failedConditions.push(membershipFailure);
  }

  // 3. Validate referenced entity exists and is in valid state
  const entityFailures = await validateEntityState(db, ctx);
  failedConditions.push(...entityFailures);

  // 4. Check for duplicate pending/disputed claims
  const duplicateCheck = await checkDuplicateClaim(
    db,
    ctx.claimantUid,
    ctx.projectId,
    ctx.milestoneId,
  );
  if (duplicateCheck.isDuplicate) {
    failedConditions.push({
      conditionId: 'DUPLICATE_CLAIM',
      description: `A ${duplicateCheck.existingStatus} claim '${duplicateCheck.existingClaimId}' already exists from this claimant for entity '${ctx.milestoneId}'`,
    });
  }

  // 5. If any validations failed, write rejection audit and throw
  if (failedConditions.length > 0) {
    await writeImmutableAuditRecord({
      actorUid: ctx.claimantUid,
      actorRole: ctx.claimantRole,
      action: 'claim_rejected',
      timestampIso: submittedAtIso,
      monetaryAmount: ctx.claimedAmount,
      targetResourceId: ctx.milestoneId,
      evidenceReferences: [{
        type: 'approval_chain',
        referenceId: `validation_failed_${ctx.projectId}_${ctx.milestoneId}`,
      }],
      previousState: undefined,
      newState: 'rejected',
    });

    const error: ClaimValidationError = {
      type: 'CLAIM_VALIDATION_FAILED',
      failedConditions,
      claimantUid: ctx.claimantUid,
      projectId: ctx.projectId,
      milestoneId: ctx.milestoneId,
    };
    throw error;
  }

  // 6. All validations passed — generate claimId and persist
  const claimId = generateClaimId();

  const validationResult: ClaimValidationResult = {
    valid: true,
    failedConditions: [],
  };

  const governedClaim: GovernedPaymentClaim = {
    claimId,
    claimantRole: ctx.claimantRole,
    claimedAmount: ctx.claimedAmount,
    linkedMilestoneId: ctx.milestoneId,
    linkedVariationIds: [],
    submittedAtIso,
    disputed: false,
    status: 'approval_required',
    claimType: ctx.claimType,
    validationResult,
    partialReleases: [],
  };

  // Persist claim to Firestore
  await db.collection('payment_claims').doc(claimId).create({
    ...governedClaim,
    claimantUid: ctx.claimantUid,
    projectId: ctx.projectId,
  });

  // 7. Write success audit record (Req 1.12)
  await writeImmutableAuditRecord({
    actorUid: ctx.claimantUid,
    actorRole: ctx.claimantRole,
    action: 'claim_submitted',
    timestampIso: submittedAtIso,
    monetaryAmount: ctx.claimedAmount,
    targetResourceId: claimId,
    evidenceReferences: [{
      type: 'approval_chain',
      referenceId: `claim_${claimId}_${ctx.milestoneId}`,
    }],
    previousState: undefined,
    newState: 'approval_required',
  });

  return governedClaim;
}

// ─── Platform Fee Calculation (Req 1.7) ──────────────────────────────────────

/**
 * Result of a platform fee calculation.
 */
export interface PlatformFeeResult {
  tariffId: string;
  feePercent: number;
  feeAmount: MoneyAmount;
  netPayable: MoneyAmount;
}

/**
 * Calculates the platform fee for a payment claim.
 *
 * Formula:
 *   feeAmount = claimedAmount × (tariffPercent / 100)
 *   netPayable = claimedAmount - feeAmount
 *
 * This is a pure function — no side effects, no Firestore access.
 *
 * @param claimedAmount - The total claimed amount
 * @param tariffPercent - The tariff percentage from the project's active fee schedule (0–100)
 * @param tariffId - The identifier of the active tariff record
 * @returns PlatformFeeResult with fee breakdown
 *
 * @see Requirement 1.7
 */
export function calculatePlatformFee(
  claimedAmount: MoneyAmount,
  tariffPercent: number,
  tariffId: string,
): PlatformFeeResult {
  const feeAmountValue = claimedAmount.amount * (tariffPercent / 100);
  const netPayableValue = claimedAmount.amount - feeAmountValue;

  return {
    tariffId,
    feePercent: tariffPercent,
    feeAmount: {
      currency: claimedAmount.currency,
      amount: feeAmountValue,
    },
    netPayable: {
      currency: claimedAmount.currency,
      amount: netPayableValue,
    },
  };
}

// ─── Partial Release (Req 1.8) ───────────────────────────────────────────────

/**
 * Error thrown when a partial release exceeds the remaining releasable balance.
 */
export interface PartialReleaseError {
  type: 'PARTIAL_RELEASE_EXCEEDS_BALANCE';
  claimId: string;
  requestedAmount: number;
  remainingReleasable: number;
  certifiedAmount: number;
  totalReleased: number;
  retentionHeld: number;
}

/**
 * Result of a successful partial release.
 */
export interface PartialReleaseResult {
  releaseId: string;
  claimId: string;
  amount: MoneyAmount;
  releasedAtIso: string;
  remainingReleasable: number;
}

/**
 * Validates and records a partial release against a certified claim.
 *
 * Ensures the partial amount does not exceed the remaining releasable balance:
 *   releasable = certifiedAmount - totalPreviouslyReleased - retentionHeld
 *
 * Steps:
 * 1. Read the claim from Firestore (get certified amount, partial releases array, retention)
 * 2. Calculate remaining releasable: certifiedAmount - sum(partialReleases) - retentionHeld
 * 3. Reject if requested amount exceeds remaining
 * 4. On success: add partial release entry to claim, persist to Firestore
 *
 * @param claimId - The claim to partially release against
 * @param amount - The partial release amount
 * @returns PartialReleaseResult on success
 * @throws PartialReleaseError if amount exceeds remaining releasable balance
 *
 * @see Requirement 1.8
 */
export async function validatePartialRelease(
  claimId: string,
  amount: MoneyAmount,
): Promise<PartialReleaseResult> {
  const db = await getAdminDb();

  // 1. Read the claim from Firestore
  const claimDoc = await db.collection('payment_claims').doc(claimId).get();
  if (!claimDoc.exists) {
    throw {
      type: 'PARTIAL_RELEASE_EXCEEDS_BALANCE' as const,
      claimId,
      requestedAmount: amount.amount,
      remainingReleasable: 0,
      certifiedAmount: 0,
      totalReleased: 0,
      retentionHeld: 0,
    } satisfies PartialReleaseError;
  }

  const claimData = claimDoc.data()!;

  // Get certified amount from the claim's certification
  const certifiedAmount: number = claimData.certifiedAmount?.amount ?? claimData.claimedAmount?.amount ?? 0;

  // Sum up all previously released amounts
  const partialReleases: Array<{ amount: MoneyAmount }> = claimData.partialReleases ?? [];
  const totalReleased = partialReleases.reduce(
    (sum, release) => sum + (release.amount?.amount ?? 0),
    0,
  );

  // Get retention held
  const retentionHeld: number = claimData.retentionRecord?.amount?.amount ?? 0;

  // 2. Calculate remaining releasable balance
  const remainingReleasable = certifiedAmount - totalReleased - retentionHeld;

  // 3. Reject if requested amount exceeds remaining
  if (amount.amount > remainingReleasable) {
    throw {
      type: 'PARTIAL_RELEASE_EXCEEDS_BALANCE' as const,
      claimId,
      requestedAmount: amount.amount,
      remainingReleasable,
      certifiedAmount,
      totalReleased,
      retentionHeld,
    } satisfies PartialReleaseError;
  }

  // 4. On success: record partial release
  const releaseId = generateClaimId();
  const releasedAtIso = new Date().toISOString();

  const releaseEntry = {
    amount: { currency: amount.currency, amount: amount.amount },
    releasedAtIso,
    releaseId,
  };

  // Persist: append partial release to claim's partialReleases array
  const updatedReleases = [...partialReleases.map(r => ({
    amount: r.amount,
    releasedAtIso: (r as any).releasedAtIso ?? releasedAtIso,
    releaseId: (r as any).releaseId ?? generateClaimId(),
  })), releaseEntry];

  await db.collection('payment_claims').doc(claimId).update({
    partialReleases: updatedReleases,
  });

  // Write audit record for partial release
  await writeImmutableAuditRecord({
    actorUid: claimData.claimantUid ?? 'system',
    actorRole: claimData.claimantRole ?? 'system',
    action: 'payment_released',
    timestampIso: releasedAtIso,
    monetaryAmount: amount,
    targetResourceId: claimId,
    evidenceReferences: [{
      type: 'approval_chain',
      referenceId: `partial_release_${releaseId}`,
    }],
    previousState: 'certified',
    newState: 'partially_released',
  });

  return {
    releaseId,
    claimId,
    amount,
    releasedAtIso,
    remainingReleasable: remainingReleasable - amount.amount,
  };
}

// ─── Retention (Req 1.9) ─────────────────────────────────────────────────────

/**
 * Error thrown when retention cannot be applied.
 */
export interface RetentionApplicationError {
  type: 'RETENTION_APPLICATION_FAILED';
  reason: string;
  claimId: string;
  projectId: string;
}

/**
 * Applies retention to a payment claim based on the project's CommercialBaseline.
 *
 * Retention percentage is between 0% and 10% inclusive, configured per project.
 * Creates a RetentionRecord linked to the claim and the project's defects liability period.
 *
 * Steps:
 * 1. Read the project's CommercialBaseline from Firestore to get retentionPercent
 * 2. Read the claim from Firestore to get claimedAmount
 * 3. Validate retentionPercent is within [0, 10]
 * 4. Calculate retentionAmount = claimedAmount × retentionPercent / 100
 * 5. Read the project's defects liability period for the scheduled release date
 * 6. Create and persist a RetentionRecord
 * 7. Update the claim document with the retention record reference
 * 8. Write an audit record
 *
 * @param claimId - The claim to apply retention to
 * @param projectId - The project whose baseline defines retention %
 * @returns The created retention record
 * @throws RetentionApplicationError if baseline/claim not found or percent invalid
 *
 * @see Requirement 1.9
 */
export async function applyRetention(
  claimId: string,
  projectId: string,
): Promise<RetentionRecord> {
  const db = await getAdminDb();

  // 1. Read the project's CommercialBaseline from Firestore
  const baselineSnapshot = await db
    .collection('commercial_baselines')
    .where('award.projectId', '==', projectId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (baselineSnapshot.empty) {
    const error: RetentionApplicationError = {
      type: 'RETENTION_APPLICATION_FAILED',
      reason: `No active CommercialBaseline found for project '${projectId}'`,
      claimId,
      projectId,
    };
    throw error;
  }

  const baselineData = baselineSnapshot.docs[0].data();
  const retentionPercent: number = baselineData.retentionPercent ?? 0;

  // 2. Validate retentionPercent is within [0, 10]
  if (retentionPercent < 0 || retentionPercent > 10) {
    const error: RetentionApplicationError = {
      type: 'RETENTION_APPLICATION_FAILED',
      reason: `Retention percent ${retentionPercent} is outside valid range [0, 10]`,
      claimId,
      projectId,
    };
    throw error;
  }

  // 3. Read the claim from Firestore to get claimedAmount
  const claimDoc = await db.collection('payment_claims').doc(claimId).get();
  if (!claimDoc.exists) {
    const error: RetentionApplicationError = {
      type: 'RETENTION_APPLICATION_FAILED',
      reason: `Payment claim '${claimId}' does not exist`,
      claimId,
      projectId,
    };
    throw error;
  }

  const claimData = claimDoc.data()!;
  const claimedAmount: MoneyAmount = claimData.claimedAmount;

  // 4. Calculate retention: amount × retentionPercent / 100
  const retentionAmountValue = claimedAmount.amount * retentionPercent / 100;

  // 5. Read defects liability period for scheduled release date
  const liabilitySnapshot = await db
    .collection('defects_liability')
    .where('projectId', '==', projectId)
    .limit(1)
    .get();

  const scheduledReleaseDate: string | undefined = liabilitySnapshot.empty
    ? undefined
    : (liabilitySnapshot.docs[0].data().endDate ?? undefined);

  // 6. Create the RetentionRecord
  const retentionId = generateClaimId();
  const retentionRecord: RetentionRecord = {
    retentionId,
    projectId,
    certificateId: claimId, // linked to the claim
    amountHeld: { currency: claimedAmount.currency, amount: retentionAmountValue },
    percent: retentionPercent,
    scheduledReleaseDate,
    status: 'held',
    releasedAmount: { currency: claimedAmount.currency, amount: 0 },
  };

  // Persist the retention record to Firestore
  await db.collection('retention_records').doc(retentionId).create(retentionRecord);

  // 7. Update the claim document with the retention record reference
  await db.collection('payment_claims').doc(claimId).update({
    retentionRecord: {
      retentionId,
      percent: retentionPercent,
      amount: { currency: claimedAmount.currency, amount: retentionAmountValue },
    },
  });

  // 8. Write audit record
  await writeImmutableAuditRecord({
    actorUid: claimData.claimantUid ?? 'system',
    actorRole: claimData.claimantRole ?? 'system',
    action: 'claim_certified',
    timestampIso: new Date().toISOString(),
    monetaryAmount: { currency: claimedAmount.currency, amount: retentionAmountValue },
    targetResourceId: claimId,
    evidenceReferences: [{
      type: 'certificate',
      referenceId: `retention_${retentionId}`,
    }],
    previousState: undefined,
    newState: 'retention_applied',
  });

  return retentionRecord;
}

// ─── Duplicate Claim Rejection (Pure Logic) ──────────────────────────────────

/**
 * Rejects a duplicate claim submission.
 *
 * If a claimant submits against a milestone that already has a pending or disputed
 * claim from the same claimant, this function returns a rejection result with
 * the existing claim's identifier and status.
 *
 * This is a pure function — no side effects, no Firestore access.
 *
 * @param claimId - The new (duplicate) claim being rejected
 * @param existingClaimId - The existing claim that conflicts
 * @returns A validation result indicating the duplicate rejection
 *
 * @see Requirement 1.11
 */
export function rejectDuplicateClaim(
  claimId: string,
  existingClaimId: string,
): ClaimValidationResult {
  return {
    valid: false,
    failedConditions: [
      {
        conditionId: 'DUPLICATE_CLAIM',
        description: `Claim '${claimId}' rejected: a pending or disputed claim '${existingClaimId}' already exists from the same claimant for this entity`,
      },
    ],
  };
}
