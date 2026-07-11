/**
 * Payment Certification Controls & Separation-of-Duty Service
 *
 * Enforces three-party separation of duty on payment flows:
 * the claim submitter, certifier, and release approver must always be distinct UIDs.
 *
 * Also provides payout batch creation (max 200 per batch) and FICA threshold
 * reporting (single transaction > R50,000 or daily aggregate > R50,000 per party).
 *
 * Architex does NOT hold funds — this module orchestrates provider references,
 * approvals, and audit trails through registered third-party providers.
 *
 * @module finance/certificationControlService
 * @see Requirements 3.1, 3.3, 3.4, 3.7
 */

import type { MoneyAmount, PaymentCertificate, PaymentClaim, ReleaseRequest } from './types';
import { writeImmutableAuditRecord } from './auditTrailService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Separation-of-duty constraint violations */
export type SeparationOfDutyConstraint =
  | 'submitter_is_certifier'
  | 'submitter_is_releaser'
  | 'certifier_is_releaser';

/** A request to certify a payment claim */
export interface CertificationRequest {
  claimId: string;
  certifierUid: string;
  certifiedAmount: MoneyAmount;
}

/** Result of a separation-of-duty validation check */
export interface SeparationOfDutyCheck {
  submitterUid: string;
  certifierUid: string;
  releaseApproverUid: string;
  violations: Array<{
    constraint: SeparationOfDutyConstraint;
    actorA: string;
    actorB: string;
  }>;
  valid: boolean;
}

/** A batch of certified release requests grouped by provider */
export interface PayoutBatch {
  batchId: string;
  providerId: string;
  providerName: string;
  releases: ReleaseRequest[];
  totalAmount: MoneyAmount;
  batchReference: string;
  createdAtIso: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
}

/** FICA threshold report generated for large or aggregated transactions */
export interface FICAReport {
  reportId: string;
  partyId: string;
  partyRole: string;
  triggerType: 'single_transaction' | 'daily_aggregate';
  triggerAmount: MoneyAmount;
  transactionReferences: string[];
  generatedAtIso: string;
  reportingPeriod: string;
}

/** A financial transaction reference used for FICA aggregation */
export interface Transaction {
  transactionId: string;
  partyId: string;
  amount: MoneyAmount;
  timestampIso: string;
  providerReference?: string;
}

// ---------------------------------------------------------------------------
// Stub Functions (implementation in task 4.1)
// ---------------------------------------------------------------------------

/** Firestore collection for payment claims */
const CLAIMS_COLLECTION = 'payment_claims';

/** Firestore collection for payment certificates */
const CERTIFICATES_COLLECTION = 'payment_certificates';

/**
 * Error thrown when a separation-of-duty or permission constraint is violated.
 */
export class CertificationError extends Error {
  public readonly constraint: SeparationOfDutyConstraint | 'missing_permission';
  public readonly actorA: string;
  public readonly actorB?: string;

  constructor(constraint: SeparationOfDutyConstraint | 'missing_permission', actorA: string, actorB?: string) {
    const message = constraint === 'missing_permission'
      ? `Certification rejected: certifier '${actorA}' does not hold payment:manage permission`
      : `Certification rejected: separation-of-duty violation '${constraint}' — actors '${actorA}' and '${actorB}' must be distinct`;
    super(message);
    this.name = 'CertificationError';
    this.constraint = constraint;
    this.actorA = actorA;
    this.actorB = actorB;
  }
}

/**
 * Certify a payment claim with separation-of-duty enforcement.
 *
 * Verifies the certifier holds `payment:manage` permission and is not the
 * claim submitter. On violation, rejects with the specific constraint that
 * was violated and preserves the claim in pre-certification state.
 *
 * Steps:
 * 1. Read the claim from Firestore to get submitter UID
 * 2. Verify certifier holds payment:manage (via permission service)
 * 3. Validate separation of duty (submitter !== certifier)
 * 4. On success: create PaymentCertificate, write audit record
 * 5. On violation: throw CertificationError, claim remains unchanged
 */
export async function certifyWithSeparationOfDuty(
  request: CertificationRequest
): Promise<PaymentCertificate> {
  const { adminDb } = await import('@/lib/firebase-admin');
  const { canUserPerform } = await import('@/services/permissionService');

  const { claimId, certifierUid, certifiedAmount } = request;

  // 1. Verify certifier holds payment:manage permission
  const certifierUser: { uid: string; role?: string; admin?: boolean } = { uid: certifierUid };

  // Read the certifier's role from Firestore users collection
  const userDoc = await adminDb.collection('users').doc(certifierUid).get();
  if (userDoc.exists) {
    const userData = userDoc.data();
    if (userData?.role) {
      certifierUser.role = userData.role;
    }
    if (userData?.admin) {
      certifierUser.admin = userData.admin;
    }
  }

  const hasPermission = canUserPerform(certifierUser, 'payment:manage');
  if (!hasPermission) {
    throw new CertificationError('missing_permission', certifierUid);
  }

  // 2. Read the claim to get the submitter UID
  const claimDoc = await adminDb.collection(CLAIMS_COLLECTION).doc(claimId).get();
  if (!claimDoc.exists) {
    throw new Error(`Claim '${claimId}' not found`);
  }

  const claimData = claimDoc.data() as PaymentClaim & { submitterUid?: string; claimantUid?: string };
  const submitterUid = claimData.submitterUid || claimData.claimantUid;

  if (!submitterUid) {
    throw new Error(`Claim '${claimId}' is missing submitter identity`);
  }

  // 3. Validate separation of duty: certifier must not be submitter
  if (certifierUid === submitterUid) {
    throw new CertificationError('submitter_is_certifier', submitterUid, certifierUid);
  }

  // 4. Create the payment certificate
  const certificateId = `cert-${claimId}-${Date.now()}`;
  const now = new Date().toISOString();

  const certificate: PaymentCertificate = {
    certificateId,
    claimId,
    claimedAmount: claimData.claimedAmount,
    certifiedAmount,
    retentionHeld: { currency: 'ZAR', amount: 0 },
    disputedAmount: { currency: 'ZAR', amount: 0 },
    approvedForRelease: certifiedAmount,
    reviewerRoles: certifierUser.role
      ? [certifierUser.role as import('./types').FinancePartyRole]
      : [],
    status: 'approved_for_provider_request',
    issuedAtIso: now,
  };

  // 5. Persist certificate to Firestore
  await adminDb.collection(CERTIFICATES_COLLECTION).doc(certificateId).create(certificate);

  // 6. Write immutable audit record for successful certification
  await writeImmutableAuditRecord({
    actorUid: certifierUid,
    actorRole: certifierUser.role || 'unknown',
    action: 'claim_certified',
    timestampIso: now,
    monetaryAmount: certifiedAmount,
    targetResourceId: claimId,
    evidenceReferences: [
      { type: 'certificate', referenceId: certificateId },
    ],
    previousState: 'approval_required',
    newState: 'certified',
    humanConfirmation: {
      certifierUid,
      certifierRole: certifierUser.role || 'unknown',
    },
  });

  return certificate;
}

/**
 * Validate that submitter, certifier, and release approver are three distinct UIDs.
 *
 * This is a PURE function — takes 3 UIDs and returns a SeparationOfDutyCheck
 * indicating which constraints (if any) are violated.
 *
 * Violations checked:
 * - submitter_is_certifier: submitter === certifier
 * - certifier_is_releaser: certifier === releaser
 * - submitter_is_releaser: submitter === releaser
 *
 * @param submitter - The UID of the claim submitter
 * @param certifier - The UID of the certifier
 * @param releaser - The UID of the release approver
 * @returns SeparationOfDutyCheck with violations array and valid flag
 */
export function validateSeparationOfDuty(
  submitter: string,
  certifier: string,
  releaser: string
): SeparationOfDutyCheck {
  const violations: SeparationOfDutyCheck['violations'] = [];

  if (submitter === certifier) {
    violations.push({
      constraint: 'submitter_is_certifier',
      actorA: submitter,
      actorB: certifier,
    });
  }

  if (certifier === releaser) {
    violations.push({
      constraint: 'certifier_is_releaser',
      actorA: certifier,
      actorB: releaser,
    });
  }

  if (submitter === releaser) {
    violations.push({
      constraint: 'submitter_is_releaser',
      actorA: submitter,
      actorB: releaser,
    });
  }

  return {
    submitterUid: submitter,
    certifierUid: certifier,
    releaseApproverUid: releaser,
    violations,
    valid: violations.length === 0,
  };
}

/** FICA reporting threshold in ZAR */
export const FICA_THRESHOLD = 50_000;

/** Maximum releases allowed per payout batch */
export const MAX_BATCH_SIZE = 200;

/**
 * Create a payout batch from certified release requests.
 *
 * Groups releases by provider, enforces max 200 requests per batch, and assigns
 * a unique batch reference identifier. Submits the batch through the registered
 * provider (mocked provider submission — Architex does NOT hold funds).
 *
 * @param releases - Array of certified release requests to batch
 * @param providerId - The registered third-party provider to submit through
 * @returns PayoutBatch with status 'pending'
 * @throws Error if releases exceed 200 or releases array is empty
 */
export function createPayoutBatch(
  releases: ReleaseRequest[],
  providerId: string
): PayoutBatch {
  if (releases.length === 0) {
    throw new Error('Cannot create payout batch with zero releases');
  }

  if (releases.length > MAX_BATCH_SIZE) {
    throw new Error(
      `Payout batch exceeds maximum size: ${releases.length} releases provided, limit is ${MAX_BATCH_SIZE} per batch`
    );
  }

  // Calculate total amount by summing all release amounts
  const totalAmount: MoneyAmount = {
    currency: 'ZAR',
    amount: releases.reduce((sum, r) => sum + r.amount.amount, 0),
  };

  // Generate unique identifiers
  const batchId = `batch-${providerId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const batchReference = `REF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const batch: PayoutBatch = {
    batchId,
    providerId,
    providerName: `Provider ${providerId}`, // In production, resolve from provider registry
    releases,
    totalAmount,
    batchReference,
    createdAtIso: new Date().toISOString(),
    status: 'pending',
  };

  return batch;
}

/**
 * Generate a FICA report when the threshold is exceeded.
 *
 * Triggered when a single transaction amount exceeds R50,000 OR the aggregate
 * of transactions for a single party within a calendar day (SAST = UTC+2)
 * exceeds R50,000. The report contains the party identifier, transaction
 * references, and the triggering total amount.
 *
 * @param partyId - The party identifier to check
 * @param transactions - Array of transactions to evaluate
 * @returns FICAReport if threshold exceeded, null if no threshold breach
 */
export function generateFICAReport(
  partyId: string,
  transactions: Transaction[]
): FICAReport | null {
  if (transactions.length === 0) {
    return null;
  }

  // Check 1: Single transaction exceeding threshold
  const singleOverThreshold = transactions.find(
    (t) => t.amount.amount > FICA_THRESHOLD
  );

  if (singleOverThreshold) {
    const reportId = `fica-${partyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      reportId,
      partyId,
      partyRole: 'unknown', // Caller should enrich with actual role
      triggerType: 'single_transaction',
      triggerAmount: singleOverThreshold.amount,
      transactionReferences: [singleOverThreshold.transactionId],
      generatedAtIso: new Date().toISOString(),
      reportingPeriod: singleOverThreshold.timestampIso.slice(0, 10), // date portion
    };
  }

  // Check 2: Daily aggregate exceeding threshold (SAST = UTC+2)
  // Group transactions by calendar day in SAST timezone
  const dailyAggregates = new Map<string, { total: number; refs: string[] }>();

  for (const tx of transactions) {
    const sastDate = getSASTDate(tx.timestampIso);
    const existing = dailyAggregates.get(sastDate) || { total: 0, refs: [] };
    existing.total += tx.amount.amount;
    existing.refs.push(tx.transactionId);
    dailyAggregates.set(sastDate, existing);
  }

  // Find first day where aggregate exceeds threshold
  for (const [date, aggregate] of dailyAggregates) {
    if (aggregate.total > FICA_THRESHOLD) {
      const reportId = `fica-${partyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        reportId,
        partyId,
        partyRole: 'unknown', // Caller should enrich with actual role
        triggerType: 'daily_aggregate',
        triggerAmount: { currency: 'ZAR', amount: aggregate.total },
        transactionReferences: aggregate.refs,
        generatedAtIso: new Date().toISOString(),
        reportingPeriod: date,
      };
    }
  }

  return null;
}

/**
 * Convert an ISO timestamp to a SAST (UTC+2) date string (YYYY-MM-DD).
 */
function getSASTDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  // SAST is UTC+2, so add 2 hours
  const sastMs = date.getTime() + 2 * 60 * 60 * 1000;
  const sastDate = new Date(sastMs);
  return sastDate.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Payment Failure Recovery & Refund Handling (Requirements 3.5, 3.6)
// ---------------------------------------------------------------------------

/** Request to initiate a refund */
export interface RefundRequest {
  requestingUserUid: string;
  requestingUserRole: string;
  reason: string;
  providerId: string;
}

/** A refund record created after successful refund initiation */
export interface RefundRecord {
  refundId: string;
  certificateId: string;
  reason: string;
  initiatedByUid: string;
  initiatedByRole: string;
  providerId: string;
  providerReference: string;
  createdAtIso: string;
  status: 'initiated' | 'provider_confirmed' | 'failed';
}

/** A notification record written to the notifications collection */
export interface PaymentNotification {
  notificationId: string;
  recipientUid: string;
  type: 'payment_failure' | 'refund_initiated';
  title: string;
  message: string;
  releaseRequestId?: string;
  certificateId?: string;
  createdAtIso: string;
}

/** Firestore collection for release requests */
const RELEASE_REQUESTS_COLLECTION = 'release_requests';

/** Firestore collection for escrow wallets */
const ESCROW_WALLETS_COLLECTION = 'escrow_wallets';

/** Firestore collection for notifications */
const NOTIFICATIONS_COLLECTION = 'notifications';

/** Firestore collection for refund records */
const REFUNDS_COLLECTION = 'refund_records';

/**
 * Handle a provider payment failure event.
 *
 * When a provider-mediated payment fails:
 * 1. Read the release request and linked escrow wallet
 * 2. Revert escrow state to FundedHeld
 * 3. Record the provider-returned failure reason in audit trail (payment_failed action)
 * 4. Send notifications to release approver and claim submitter within 60s
 *
 * @param releaseRequestId - The release request that failed at the provider
 * @param failureReason - The provider-returned failure reason
 * @returns The updated release request status
 * @throws Error if release request not found or escrow wallet not found
 *
 * @see Requirements 3.5
 */
export async function handlePaymentFailure(
  releaseRequestId: string,
  failureReason: string
): Promise<{ releaseRequestId: string; escrowReverted: boolean; notificationsSent: boolean }> {
  const { adminDb } = await import('@/lib/firebase-admin');

  const now = new Date().toISOString();

  // 1. Read the release request
  const releaseDoc = await adminDb.collection(RELEASE_REQUESTS_COLLECTION).doc(releaseRequestId).get();
  if (!releaseDoc.exists) {
    throw new Error(`Release request '${releaseRequestId}' not found`);
  }
  const releaseData = releaseDoc.data() as ReleaseRequest & {
    escrowWalletId?: string;
    releaseApproverUid?: string;
    claimSubmitterUid?: string;
  };

  // 2. Find and revert the linked escrow wallet to FundedHeld
  const escrowWalletId = releaseData.escrowWalletId;
  let escrowReverted = false;

  if (escrowWalletId) {
    const escrowDoc = await adminDb.collection(ESCROW_WALLETS_COLLECTION).doc(escrowWalletId).get();
    if (escrowDoc.exists) {
      // Revert to FundedHeld state directly
      await adminDb.collection(ESCROW_WALLETS_COLLECTION).doc(escrowWalletId).update({
        state: 'FundedHeld',
        lastTransitionAtIso: now,
      });
      escrowReverted = true;
    }
  }

  // 3. Record the failure reason in audit trail (payment_failed action)
  await writeImmutableAuditRecord({
    actorUid: 'system',
    actorRole: 'system',
    action: 'payment_failed',
    timestampIso: now,
    monetaryAmount: releaseData.amount,
    targetResourceId: releaseRequestId,
    evidenceReferences: [
      { type: 'provider_transaction', referenceId: releaseData.providerReference || releaseRequestId },
    ],
    previousState: 'submitted_to_provider',
    newState: 'FundedHeld',
  });

  // 4. Update the release request status
  await adminDb.collection(RELEASE_REQUESTS_COLLECTION).doc(releaseRequestId).update({
    status: 'approved_for_provider_request', // reverted to pre-submission state
    failureReason,
    failedAtIso: now,
  });

  // 5. Send notifications to release approver and claim submitter
  let notificationsSent = false;
  const releaseApproverUid = releaseData.releaseApproverUid;
  const claimSubmitterUid = releaseData.claimSubmitterUid;

  const notifications: PaymentNotification[] = [];

  if (releaseApproverUid) {
    notifications.push({
      notificationId: `notif-fail-approver-${releaseRequestId}-${Date.now()}`,
      recipientUid: releaseApproverUid,
      type: 'payment_failure',
      title: 'Payment Release Failed',
      message: `Payment release ${releaseRequestId} has failed. Reason: ${failureReason}. Escrow has been reverted to FundedHeld state.`,
      releaseRequestId,
      createdAtIso: now,
    });
  }

  if (claimSubmitterUid) {
    notifications.push({
      notificationId: `notif-fail-submitter-${releaseRequestId}-${Date.now()}`,
      recipientUid: claimSubmitterUid,
      type: 'payment_failure',
      title: 'Payment Release Failed',
      message: `Payment release ${releaseRequestId} has failed. Reason: ${failureReason}. The escrow remains held and will be retried.`,
      releaseRequestId,
      createdAtIso: now,
    });
  }

  // Write all notifications to Firestore
  for (const notification of notifications) {
    await adminDb.collection(NOTIFICATIONS_COLLECTION).doc(notification.notificationId).create(notification);
  }

  notificationsSent = notifications.length > 0;

  return { releaseRequestId, escrowReverted, notificationsSent };
}

/**
 * Initiate a refund against a certified payment.
 *
 * Validates:
 * 1. The requesting user holds `admin:override` permission
 * 2. The reason is at least 10 characters
 * 3. Creates a refund audit record linking the original certificate and reason
 * 4. Routes the refund instruction through the registered provider (mock)
 *
 * @param certificateId - The certificate to refund against
 * @param refundRequest - The refund request details
 * @returns The created refund record
 * @throws Error if user lacks permission, reason too short, or certificate not found
 *
 * @see Requirements 3.6
 */
export async function initiateRefund(
  certificateId: string,
  refundRequest: RefundRequest
): Promise<RefundRecord> {
  const { adminDb } = await import('@/lib/firebase-admin');
  const { canUserPerform } = await import('@/services/permissionService');

  const { requestingUserUid, requestingUserRole, reason, providerId } = refundRequest;
  const now = new Date().toISOString();

  // 1. Validate requesting user holds admin:override permission
  const userDoc = await adminDb.collection('users').doc(requestingUserUid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const authzUser = {
    uid: requestingUserUid,
    role: userData?.role || requestingUserRole,
    admin: userData?.admin || false,
  };

  const hasPermission = canUserPerform(authzUser, 'admin:override' as import('@/services/permissionService').PermissionAction);
  if (!hasPermission) {
    throw new Error(
      `Refund rejected: user '${requestingUserUid}' does not hold admin:override permission`
    );
  }

  // 2. Validate reason is at least 10 characters
  if (!reason || reason.length < 10) {
    throw new Error(
      `Refund rejected: reason must be at least 10 characters (provided ${reason?.length || 0} characters)`
    );
  }

  // 3. Verify the certificate exists
  const certDoc = await adminDb.collection(CERTIFICATES_COLLECTION).doc(certificateId).get();
  if (!certDoc.exists) {
    throw new Error(`Certificate '${certificateId}' not found`);
  }
  const certData = certDoc.data() as PaymentCertificate;

  // 4. Create refund record
  const refundId = `refund-${certificateId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const providerReference = `REFUND-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const refundRecord: RefundRecord = {
    refundId,
    certificateId,
    reason,
    initiatedByUid: requestingUserUid,
    initiatedByRole: requestingUserRole,
    providerId,
    providerReference,
    createdAtIso: now,
    status: 'initiated',
  };

  // 5. Persist refund record to Firestore
  await adminDb.collection(REFUNDS_COLLECTION).doc(refundId).create(refundRecord);

  // 6. Create refund audit record linking original certificate and reason
  await writeImmutableAuditRecord({
    actorUid: requestingUserUid,
    actorRole: requestingUserRole,
    action: 'refund_initiated',
    timestampIso: now,
    monetaryAmount: certData.certifiedAmount,
    targetResourceId: certificateId,
    evidenceReferences: [
      { type: 'certificate', referenceId: certificateId },
      { type: 'provider_transaction', referenceId: providerReference },
    ],
    previousState: 'approved_for_provider_request',
    newState: 'refund_initiated',
    humanConfirmation: {
      approverUid: requestingUserUid,
      approverRole: requestingUserRole,
    },
  });

  return refundRecord;
}
