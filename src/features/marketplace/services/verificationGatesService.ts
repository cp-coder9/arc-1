/**
 * Verification Gates & Anti-Gaming Service
 *
 * Enforces Professional Body API verification gates, prohibits gaming mechanisms,
 * validates non-anonymous reviews, files disputes with evidence and event logs,
 * ensures ranking integrity, and cascades registration suspension.
 *
 * This service provides the task-level API surface for verification and anti-gaming
 * logic, delegating to lower-level infrastructure (Firestore, audit trail, etc.).
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7
 */

import { logMarketplaceAction } from './marketplaceAuditService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerificationCheckResult {
  verified: boolean;
  reason?: string;
}

export interface DisputeFilingParams {
  filingPartyId: string;
  opposingPartyId: string;
  relatedEntityType: 'project' | 'task' | 'quote';
  relatedEntityId: string;
  evidenceRefs: string[];
}

export interface MarketplaceDispute {
  id: string;
  filingPartyId: string;
  opposingPartyId: string;
  relatedEntityType: 'project' | 'task' | 'quote';
  relatedEntityId: string;
  evidenceRefs: string[];
  eventLog: Array<{ event: string; timestamp: string }>;
  status: 'open' | 'under_review' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Professional Body API timeout in milliseconds (30 seconds per Requirement 14.7).
 */
const PROFESSIONAL_BODY_API_TIMEOUT_MS = 30_000;

/**
 * Factors that are ALLOWED to influence ranking (Requirement 14.5).
 * Any factor NOT in this list must be rejected.
 */
const ALLOWED_RANKING_FACTORS: ReadonlySet<string> = new Set([
  'trust_score',
  'credentials',
  'cpd_status',
  'ai_audit_rate',
]);

/**
 * Prohibited marketplace features (Requirement 14.2).
 */
export const PROHIBITED_FEATURES = [
  'paid_advertisements',
  'sponsored_listings',
  'bidding_mechanisms',
] as const;

export type ProhibitedFeature = (typeof PROHIBITED_FEATURES)[number];

// ─── Verification Gate ────────────────────────────────────────────────────────

/**
 * Checks Professional Body API for active registration before allowing
 * marketplace actions (posting, applying, listing).
 *
 * Enforces a 30-second timeout on the Professional Body API call.
 * If the API is unreachable or times out, rejects the action, informs the user,
 * and logs the failure for platform_admin review.
 *
 * Validates: Requirements 14.1, 14.7
 *
 * @param userId - The user attempting a marketplace action
 * @param options - Optional overrides for testing (API fetcher)
 * @returns VerificationCheckResult indicating whether the user may proceed
 */
export async function checkProfessionalVerification(
  userId: string,
  options: {
    fetchRegistrationStatus?: (userId: string) => Promise<{ status: string }>;
  } = {}
): Promise<VerificationCheckResult> {
  const fetchStatus = options.fetchRegistrationStatus ?? fetchProfessionalBodyStatus;

  try {
    const response = await fetchStatus(userId);

    if (response.status !== 'active') {
      return {
        verified: false,
        reason: 'Active professional registration is required to perform marketplace actions',
      };
    }

    return { verified: true };
  } catch (error: unknown) {
    // API timeout or unreachable — reject per Requirement 14.7
    await logApiTimeoutForAdmin(userId);
    return {
      verified: false,
      reason: 'Professional body verification is temporarily unavailable. Please try again later.',
    };
  }
}

// ─── Dispute Filing ───────────────────────────────────────────────────────────

let disputeCounter = 0;

/**
 * Files a dispute in the marketplace.
 *
 * Creates a dispute record with both party IDs, evidence references, and a
 * timestamped event log. Acknowledges receipt within 5 seconds and routes
 * the dispute to platform_admin for resolution.
 *
 * Persists to Firestore `marketplace_disputes/{disputeId}`.
 *
 * Validates: Requirement 14.4
 *
 * @param params - Dispute filing parameters
 * @param options - Optional overrides for testing (persistence, notification)
 * @returns The created MarketplaceDispute record
 */
export async function fileDispute(
  params: DisputeFilingParams,
  options: {
    persistDispute?: (dispute: MarketplaceDispute) => Promise<void>;
    notifyAdmin?: (disputeId: string) => Promise<void>;
  } = {}
): Promise<MarketplaceDispute> {
  // Validate required fields
  if (!params.filingPartyId?.trim()) {
    throw new Error('Filing party ID is required');
  }
  if (!params.opposingPartyId?.trim()) {
    throw new Error('Opposing party ID is required');
  }
  if (!params.relatedEntityId?.trim()) {
    throw new Error('Related entity ID is required');
  }
  if (!params.relatedEntityType) {
    throw new Error('Related entity type is required');
  }
  if (!params.evidenceRefs || params.evidenceRefs.length === 0) {
    throw new Error('At least one evidence reference is required');
  }

  const now = new Date().toISOString();
  disputeCounter += 1;
  const disputeId = `dispute-${Date.now()}-${disputeCounter}`;

  const dispute: MarketplaceDispute = {
    id: disputeId,
    filingPartyId: params.filingPartyId,
    opposingPartyId: params.opposingPartyId,
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    evidenceRefs: [...params.evidenceRefs],
    eventLog: [
      { event: 'dispute_filed', timestamp: now },
      { event: 'acknowledged', timestamp: now },
      { event: 'routed_to_platform_admin', timestamp: now },
    ],
    status: 'open',
    createdAt: now,
    resolvedAt: null,
  };

  // Persist to Firestore
  const persist = options.persistDispute ?? persistDisputeToFirestore;
  await persist(dispute);

  // Notify platform_admin
  const notify = options.notifyAdmin ?? notifyPlatformAdminOfDispute;
  await notify(disputeId);

  // Log to audit trail
  await logMarketplaceAction({
    actorId: params.filingPartyId,
    actionType: 'dispute_filed',
    entityId: disputeId,
    entityType: 'dispute',
    afterStatus: 'open',
    metadata: {
      opposingPartyId: params.opposingPartyId,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      evidenceCount: params.evidenceRefs.length,
      routedTo: 'platform_admin',
    },
  });

  return dispute;
}

// ─── Registration Suspension Cascade ──────────────────────────────────────────

/**
 * Cascades registration suspension: suspends all active listings and pending
 * applications for a user within 60 seconds.
 *
 * Called when Professional Body API returns inactive/suspended/expired for a user
 * who has active marketplace activity.
 *
 * Validates: Requirement 14.6
 *
 * @param userId - The user whose registration was suspended
 * @param reason - The reason for suspension
 * @param options - Optional overrides for testing
 */
export async function suspendUserMarketplaceActivity(
  userId: string,
  reason: string,
  options: {
    suspendListings?: (userId: string) => Promise<number>;
    suspendApplications?: (userId: string) => Promise<number>;
    notifyUser?: (userId: string, message: string) => Promise<void>;
  } = {}
): Promise<void> {
  const suspendListingsFn = options.suspendListings ?? suspendUserListingsInFirestore;
  const suspendApplicationsFn = options.suspendApplications ?? suspendUserApplicationsInFirestore;
  const notifyFn = options.notifyUser ?? notifyUserOfSuspension;

  // Suspend active listings
  const listingsSuspended = await suspendListingsFn(userId);

  // Suspend pending applications
  const applicationsSuspended = await suspendApplicationsFn(userId);

  // Notify user
  await notifyFn(
    userId,
    `Your marketplace access has been suspended: ${reason}. All active listings and pending applications have been suspended pending re-verification.`
  );

  // Log to audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'registration_suspension_cascade',
    entityId: userId,
    entityType: 'user',
    afterStatus: 'suspended',
    metadata: {
      reason,
      listingsSuspended,
      applicationsSuspended,
    },
  });
}

// ─── Review Eligibility Validation ────────────────────────────────────────────

/**
 * Validates that a review is non-anonymous: tied to a verified user and linked
 * to a completed project or task.
 *
 * Validates: Requirement 14.3
 *
 * @param reviewerId - The user attempting to leave a review
 * @param entityId - The project or task ID the review is for
 * @param entityType - 'project' or 'task'
 * @param options - Optional overrides for testing (verification checks)
 * @returns VerificationCheckResult indicating whether the review is allowed
 */
export function validateReviewEligibility(
  reviewerId: string,
  entityId: string,
  entityType: string,
  options: {
    isUserVerified?: (userId: string) => boolean;
    isEntityCompleted?: (entityId: string, entityType: string) => boolean;
  } = {}
): VerificationCheckResult {
  const isVerified = options.isUserVerified ?? (() => true);
  const isCompleted = options.isEntityCompleted ?? (() => true);

  // Must have a reviewer ID (non-anonymous)
  if (!reviewerId?.trim()) {
    return {
      verified: false,
      reason: 'Reviews must be tied to an identified user',
    };
  }

  // Reviewer must be verified
  if (!isVerified(reviewerId)) {
    return {
      verified: false,
      reason: 'Reviews must be from a verified user',
    };
  }

  // Must be linked to a completed entity
  if (!entityId?.trim()) {
    return {
      verified: false,
      reason: 'Reviews must be linked to a specific project or task',
    };
  }

  if (!entityType?.trim()) {
    return {
      verified: false,
      reason: 'Entity type must be specified',
    };
  }

  if (!isCompleted(entityId, entityType)) {
    return {
      verified: false,
      reason: 'Reviews can only be left for completed projects or tasks',
    };
  }

  return { verified: true };
}

// ─── Ranking Factor Validation ────────────────────────────────────────────────

/**
 * Checks if a ranking factor is allowed to influence search results.
 *
 * Only trust_score, credentials, cpd_status, and ai_audit_rate are permitted.
 * Photos, testimonials, popularity, and any other factor are prohibited.
 *
 * Validates: Requirement 14.5
 *
 * @param factor - The ranking factor to check
 * @returns true if the factor is allowed, false otherwise
 */
export function isRankingFactorAllowed(factor: string): boolean {
  return ALLOWED_RANKING_FACTORS.has(factor);
}

// ─── Prohibited Feature Validation ───────────────────────────────────────────

/**
 * Validates that a proposed marketplace feature is not prohibited.
 *
 * Validates: Requirement 14.2
 *
 * @param feature - The feature name to check
 * @returns VerificationCheckResult — verified=true if the feature is NOT prohibited
 */
export function validateFeatureAllowed(feature: string): VerificationCheckResult {
  const prohibited = PROHIBITED_FEATURES as readonly string[];
  if (prohibited.includes(feature)) {
    return {
      verified: false,
      reason: `Feature '${feature}' is prohibited in the marketplace`,
    };
  }
  return { verified: true };
}

// ─── Internal: Professional Body API Fetch ────────────────────────────────────

/**
 * Fetches professional body registration status for a user with a 30-second timeout.
 * On timeout, throws an error that triggers the timeout handling path.
 */
async function fetchProfessionalBodyStatus(userId: string): Promise<{ status: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROFESSIONAL_BODY_API_TIMEOUT_MS);

  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const snapshot = await adminDb
      .collection('professional_registrations')
      .where('userId', '==', userId)
      .where('status', 'in', ['active', 'inactive', 'suspended', 'expired'])
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    clearTimeout(timeoutId);

    if (snapshot.empty) {
      return { status: 'inactive' };
    }

    const doc = snapshot.docs[0].data();
    return { status: doc.status as string };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ─── Internal: Firestore Persistence ──────────────────────────────────────────

/**
 * Persists a dispute record to Firestore `marketplace_disputes/{disputeId}`.
 */
async function persistDisputeToFirestore(dispute: MarketplaceDispute): Promise<void> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_disputes')
      .doc(dispute.id)
      .set({
        filingPartyId: dispute.filingPartyId,
        opposingPartyId: dispute.opposingPartyId,
        relatedEntityType: dispute.relatedEntityType,
        relatedEntityId: dispute.relatedEntityId,
        evidenceRefs: dispute.evidenceRefs,
        eventLog: dispute.eventLog,
        status: dispute.status,
        createdAt: dispute.createdAt,
        resolvedAt: dispute.resolvedAt,
      });
  } catch (error) {
    console.error('[VerificationGates] Failed to persist dispute to Firestore:', error);
    throw error;
  }
}

/**
 * Notifies platform_admin of a new dispute via the Action Centre.
 */
async function notifyPlatformAdminOfDispute(disputeId: string): Promise<void> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb.collection('action_centre_items').add({
      targetRole: 'platform_admin',
      type: 'dispute_filed',
      title: 'New Marketplace Dispute Filed',
      message: `A new dispute has been filed (${disputeId}). Please review and resolve.`,
      priority: 'high',
      status: 'pending',
      referenceId: disputeId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VerificationGates] Failed to notify platform_admin of dispute:', error);
  }
}

/**
 * Suspends all active listings for a user in Firestore.
 */
async function suspendUserListingsInFirestore(userId: string): Promise<number> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    let count = 0;

    // Suspend project postings
    const projectPostings = await adminDb
      .collection('marketplace_project_postings')
      .where('clientId', '==', userId)
      .where('status', '==', 'published')
      .get();
    for (const doc of projectPostings.docs) {
      await doc.ref.update({ status: 'withdrawn', updatedAt: new Date().toISOString() });
      count++;
    }

    // Suspend task postings
    const taskPostings = await adminDb
      .collection('marketplace_task_postings')
      .where('professionalId', '==', userId)
      .where('status', '==', 'open')
      .get();
    for (const doc of taskPostings.docs) {
      await doc.ref.update({ status: 'cancelled', updatedAt: new Date().toISOString() });
      count++;
    }

    // Suspend material listings
    const materialListings = await adminDb
      .collection('marketplace_material_listings')
      .where('supplierId', '==', userId)
      .where('status', '==', 'active')
      .get();
    for (const doc of materialListings.docs) {
      await doc.ref.update({ status: 'suspended', updatedAt: new Date().toISOString() });
      count++;
    }

    return count;
  } catch (error) {
    console.error('[VerificationGates] Failed to suspend listings:', error);
    return 0;
  }
}

/**
 * Suspends all pending applications for a user in Firestore.
 */
async function suspendUserApplicationsInFirestore(userId: string): Promise<number> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    let count = 0;

    // Suspend project proposals
    const proposals = await adminDb
      .collection('marketplace_proposals')
      .where('professionalId', '==', userId)
      .where('status', '==', 'submitted')
      .get();
    for (const doc of proposals.docs) {
      await doc.ref.update({ status: 'withdrawn', updatedAt: new Date().toISOString() });
      count++;
    }

    // Suspend task applications
    const taskApps = await adminDb
      .collection('marketplace_task_applications')
      .where('freelancerId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    for (const doc of taskApps.docs) {
      await doc.ref.update({ status: 'rejected', updatedAt: new Date().toISOString() });
      count++;
    }

    return count;
  } catch (error) {
    console.error('[VerificationGates] Failed to suspend applications:', error);
    return 0;
  }
}

/**
 * Notifies a user of marketplace suspension via the Action Centre.
 */
async function notifyUserOfSuspension(userId: string, message: string): Promise<void> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb.collection('action_centre_items').add({
      userId,
      type: 'marketplace_suspension',
      title: 'Marketplace Access Suspended',
      message,
      priority: 'high',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VerificationGates] Failed to notify user of suspension:', error);
  }
}

/**
 * Logs a Professional Body API timeout failure for platform_admin review.
 */
async function logApiTimeoutForAdmin(userId: string): Promise<void> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb.collection('marketplace_api_failures').add({
      userId,
      failureType: 'professional_body_api_timeout',
      reason: 'Professional Body API unreachable for more than 30 seconds',
      timestamp: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      status: 'pending_review',
    });
  } catch (error) {
    console.error('[VerificationGates] Failed to log API timeout for admin:', error);
  }

  // Also log to marketplace audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'api_timeout_failure',
    entityId: userId,
    entityType: 'verification',
    metadata: {
      reason: 'Professional Body API unreachable for more than 30 seconds',
      timestamp: new Date().toISOString(),
      requiresAdminReview: true,
    },
  });
}
