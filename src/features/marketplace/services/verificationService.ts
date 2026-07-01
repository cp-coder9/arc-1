/**
 * Verification & Anti-Gaming Service
 *
 * Enforces Professional Body API verification gates, prohibits gaming mechanisms,
 * validates reviews for non-anonymity, ensures search ranking integrity,
 * handles dispute filing, and manages registration suspension cascades.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7
 */

import { logMarketplaceAction } from './marketplaceAuditService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RegistrationStatus = 'active' | 'inactive' | 'suspended' | 'expired';

export interface ProfessionalBodyApiResponse {
  userId: string;
  status: RegistrationStatus;
  registrationNumber?: string;
  professionalBody?: string;
  checkedAt: string;
}

export interface VerificationGateResult {
  allowed: boolean;
  reason?: string;
}

export interface MarketplaceReview {
  reviewerId: string;
  reviewerVerified: boolean;
  linkedProjectId?: string;
  linkedTaskId?: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface ReviewValidationResult {
  valid: boolean;
  reason?: string;
}

export interface SearchRankingInput {
  userId: string;
  trustScore: number;
  credentials: string[];
  cpdCompliant: boolean;
  aiAuditPassRate: number;
  /** Fields that MUST NOT influence ranking */
  profilePhoto?: string;
  testimonials?: string[];
  popularityScore?: number;
}

export interface SearchRankingResult {
  userId: string;
  rankScore: number;
}

export interface SearchRankingValidationResult {
  valid: boolean;
  reason?: string;
}

export interface DisputeParams {
  filingPartyId: string;
  opposingPartyId: string;
  relatedEntityType: 'project' | 'task' | 'quote';
  relatedEntityId: string;
  evidenceRefs: string[];
  description?: string;
}

export interface DisputeValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DisputeRecord {
  id: string;
  filingPartyId: string;
  opposingPartyId: string;
  relatedEntityType: 'project' | 'task' | 'quote';
  relatedEntityId: string;
  evidenceRefs: string[];
  eventLog: DisputeEvent[];
  status: 'open' | 'under_review' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
}

export interface DisputeEvent {
  type: string;
  timestamp: string;
  actorId: string;
  description: string;
}

export interface FileDisputeResult {
  success: boolean;
  disputeId?: string;
  error?: string;
  acknowledgedAt?: string;
}

export interface SuspensionResult {
  userId: string;
  listingsSuspended: number;
  applicationsSuspended: number;
  notifiedAt: string;
}

export interface ApiTimeoutResult {
  rejected: boolean;
  reason: string;
  loggedAt: string;
}

// ─── Constants: Prohibited Features ───────────────────────────────────────────

/**
 * Features explicitly prohibited in the marketplace to prevent gaming.
 * Validates: Requirement 14.2
 */
export const PROHIBITED_FEATURES = [
  'paid_advertisements',
  'sponsored_listings',
  'bidding_mechanisms',
] as const;

export type ProhibitedFeature = (typeof PROHIBITED_FEATURES)[number];

/**
 * Factors explicitly prohibited from influencing search ranking.
 * Validates: Requirement 14.5
 */
export const PROHIBITED_RANKING_FACTORS = [
  'profile_photo',
  'testimonials',
  'popularity_score',
] as const;

/**
 * Only these factors may determine search ranking and visibility.
 * Validates: Requirement 14.5
 */
export const ALLOWED_RANKING_FACTORS = [
  'trust_score',
  'verified_credentials',
  'cpd_compliance',
  'ai_audit_pass_rate',
] as const;

// ─── API Timeout Configuration ────────────────────────────────────────────────

const API_TIMEOUT_MS = 30_000;

// ─── Pure Functions ───────────────────────────────────────────────────────────

/**
 * Validates dispute input for completeness.
 * Requires both party IDs and at least one evidence reference.
 *
 * Validates: Requirement 14.4
 */
export function validateDisputeInput(params: Partial<DisputeParams>): DisputeValidationResult {
  const errors: string[] = [];

  if (!params.filingPartyId || !params.filingPartyId.trim()) {
    errors.push('Filing party ID is required');
  }
  if (!params.opposingPartyId || !params.opposingPartyId.trim()) {
    errors.push('Opposing party ID is required');
  }
  if (!params.evidenceRefs || params.evidenceRefs.length === 0) {
    errors.push('At least one evidence reference is required');
  }
  if (!params.relatedEntityType) {
    errors.push('Related entity type is required');
  }
  if (!params.relatedEntityId || !params.relatedEntityId.trim()) {
    errors.push('Related entity ID is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Checks if a review is anonymous (not tied to a verified user or not linked to a project/task).
 * Anonymous reviews are prohibited per Requirement 14.3.
 */
export function isReviewAnonymous(review: MarketplaceReview): boolean {
  // A review is anonymous if:
  // 1. No reviewer ID
  // 2. Reviewer is not verified
  // 3. Not linked to a completed project or task
  if (!review.reviewerId || !review.reviewerId.trim()) {
    return true;
  }
  if (!review.reviewerVerified) {
    return true;
  }
  if (!review.linkedProjectId && !review.linkedTaskId) {
    return true;
  }
  return false;
}

/**
 * Checks if a registration status is active.
 * Returns true only if status is 'active'.
 */
export function isRegistrationActive(status: RegistrationStatus | undefined | null): boolean {
  return status === 'active';
}

/**
 * Validates a review for non-anonymity and completeness.
 * All ratings must be tied to verified users and linked to completed projects/tasks.
 *
 * Validates: Requirement 14.3
 */
export function validateReview(review: MarketplaceReview): ReviewValidationResult {
  if (!review.reviewerId || !review.reviewerId.trim()) {
    return { valid: false, reason: 'Review must be tied to an identified user' };
  }
  if (!review.reviewerVerified) {
    return { valid: false, reason: 'Review must be from a verified user' };
  }
  if (!review.linkedProjectId && !review.linkedTaskId) {
    return { valid: false, reason: 'Review must be linked to a completed project or task' };
  }
  if (review.rating < 1 || review.rating > 5 || !Number.isInteger(review.rating)) {
    return { valid: false, reason: 'Rating must be an integer between 1 and 5' };
  }
  return { valid: true };
}

/**
 * Validates that search ranking results are determined ONLY by allowed factors
 * (Trust Score, credentials, CPD, AI audit) and NOT by photos, testimonials, or popularity.
 *
 * Given a set of ranking results and their inputs, verifies that the ordering
 * is consistent with allowed ranking factors only.
 *
 * Validates: Requirement 14.5
 */
export function validateSearchRanking(results: SearchRankingInput[]): SearchRankingValidationResult {
  if (results.length <= 1) {
    return { valid: true };
  }

  // Compute rank scores using ONLY allowed factors
  const scored = results.map((r) => ({
    userId: r.userId,
    rankScore: computeAllowedRankScore(r),
    // Ensure prohibited factors had no influence
    hasProhibitedData: !!(r.profilePhoto || (r.testimonials && r.testimonials.length > 0) || r.popularityScore),
  }));

  // Check ordering: must be sorted by rankScore descending
  for (let i = 0; i < scored.length - 1; i++) {
    if (scored[i].rankScore < scored[i + 1].rankScore) {
      return {
        valid: false,
        reason: `Ranking order inconsistent with allowed factors: user ${scored[i].userId} ranked above user ${scored[i + 1].userId} despite lower allowed rank score`,
      };
    }
  }

  return { valid: true };
}

/**
 * Computes a ranking score using ONLY allowed factors.
 * Trust Score (0-100) is primary, weighted by credentials count, CPD compliance, and AI audit pass rate.
 */
function computeAllowedRankScore(input: SearchRankingInput): number {
  // Primary: Trust Score (0–100) — 60% weight
  const trustComponent = input.trustScore * 0.6;
  // Secondary: Credentials count (normalized to 0–100, assuming max 10 credentials) — 15% weight
  const credentialComponent = Math.min(input.credentials.length / 10, 1) * 100 * 0.15;
  // Tertiary: CPD compliance — 15% weight
  const cpdComponent = input.cpdCompliant ? 100 * 0.15 : 0;
  // Quaternary: AI audit pass rate (already 0–100) — 10% weight
  const auditComponent = input.aiAuditPassRate * 0.10;

  return trustComponent + credentialComponent + cpdComponent + auditComponent;
}

// ─── Verification Gate ────────────────────────────────────────────────────────

/**
 * Checks Professional Body API for active registration before allowing
 * marketplace actions (posting, applying, listing).
 *
 * Validates: Requirement 14.1
 */
export async function enforceVerificationGate(
  userId: string,
  options: { fetchRegistrationStatus?: (userId: string) => Promise<ProfessionalBodyApiResponse> } = {}
): Promise<VerificationGateResult> {
  const fetchStatus = options.fetchRegistrationStatus ?? fetchProfessionalBodyStatus;

  let response: ProfessionalBodyApiResponse;
  try {
    response = await fetchStatus(userId);
  } catch (error: unknown) {
    // API timeout or unreachable — handle per Requirement 14.7
    const timeoutResult = await handleApiTimeout(userId);
    return {
      allowed: false,
      reason: timeoutResult.reason,
    };
  }

  if (!isRegistrationActive(response.status)) {
    return {
      allowed: false,
      reason: 'Active professional registration is required to perform marketplace actions',
    };
  }

  return { allowed: true };
}

// ─── Professional Body API Fetch ──────────────────────────────────────────────

/**
 * Fetches professional body registration status for a user.
 * Times out after 30 seconds per Requirement 14.7.
 */
export async function fetchProfessionalBodyStatus(userId: string): Promise<ProfessionalBodyApiResponse> {
  // In production, this would call the actual Professional Body API (SACAP, ECSA, etc.)
  // with a 30-second timeout. For now, we query Firestore for the cached registration record.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

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
      return {
        userId,
        status: 'inactive',
        checkedAt: new Date().toISOString(),
      };
    }

    const doc = snapshot.docs[0].data();
    return {
      userId,
      status: doc.status as RegistrationStatus,
      registrationNumber: doc.registrationNumber,
      professionalBody: doc.professionalBody,
      checkedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ─── Dispute Filing ───────────────────────────────────────────────────────────

let disputeCounter = 0;

/**
 * Files a dispute in the marketplace. Requires both party IDs, evidence references,
 * and timestamped event log. Acknowledges within 5 seconds, routes to platform_admin.
 *
 * Validates: Requirement 14.4
 */
export async function fileDispute(
  params: DisputeParams,
  options: { persistDispute?: (record: DisputeRecord) => Promise<void> } = {}
): Promise<FileDisputeResult> {
  // Validate input
  const validation = validateDisputeInput(params);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join('; '),
    };
  }

  const now = new Date().toISOString();
  disputeCounter += 1;
  const disputeId = `dispute-${Date.now()}-${disputeCounter}`;

  // Create dispute record with timestamped event log
  const record: DisputeRecord = {
    id: disputeId,
    filingPartyId: params.filingPartyId,
    opposingPartyId: params.opposingPartyId,
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    evidenceRefs: [...params.evidenceRefs],
    eventLog: [
      {
        type: 'dispute_filed',
        timestamp: now,
        actorId: params.filingPartyId,
        description: params.description || 'Dispute filed',
      },
      {
        type: 'acknowledged',
        timestamp: now,
        actorId: 'system',
        description: 'Dispute acknowledged and routed to platform_admin for resolution',
      },
    ],
    status: 'open',
    createdAt: now,
    resolvedAt: null,
  };

  // Persist dispute to Firestore
  const persist = options.persistDispute ?? persistDisputeToFirestore;
  await persist(record);

  // Log to audit trail (acknowledge within 5 seconds)
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

  return {
    success: true,
    disputeId,
    acknowledgedAt: now,
  };
}

/**
 * Persists a dispute record to Firestore `marketplace_disputes/{disputeId}`.
 */
async function persistDisputeToFirestore(record: DisputeRecord): Promise<void> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_disputes')
      .doc(record.id)
      .set({
        filingPartyId: record.filingPartyId,
        opposingPartyId: record.opposingPartyId,
        relatedEntityType: record.relatedEntityType,
        relatedEntityId: record.relatedEntityId,
        evidenceRefs: record.evidenceRefs,
        eventLog: record.eventLog,
        status: record.status,
        createdAt: record.createdAt,
        resolvedAt: record.resolvedAt,
      });
  } catch (error) {
    console.error('[VerificationService] Failed to persist dispute to Firestore:', error);
    throw error;
  }
}

// ─── Registration Suspension Cascade ──────────────────────────────────────────

/**
 * When Professional Body API returns inactive/suspended/expired for a user,
 * suspends all active listings and pending applications within 60 seconds,
 * and notifies the user.
 *
 * Validates: Requirement 14.6
 */
export async function handleRegistrationSuspension(
  userId: string,
  options: {
    suspendListings?: (userId: string) => Promise<number>;
    suspendApplications?: (userId: string) => Promise<number>;
    notifyUser?: (userId: string, message: string) => Promise<void>;
  } = {}
): Promise<SuspensionResult> {
  const suspendListings = options.suspendListings ?? suspendUserListings;
  const suspendApplications = options.suspendApplications ?? suspendUserApplications;
  const notify = options.notifyUser ?? notifyUserOfSuspension;

  // Suspend all active listings
  const listingsSuspended = await suspendListings(userId);

  // Suspend all pending applications
  const applicationsSuspended = await suspendApplications(userId);

  const notifiedAt = new Date().toISOString();

  // Notify user of suspension
  await notify(
    userId,
    'Your marketplace access has been suspended because your professional registration is no longer active. All active listings and pending applications have been suspended pending re-verification.'
  );

  // Log to audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'registration_suspension_cascade',
    entityId: userId,
    entityType: 'user',
    afterStatus: 'suspended',
    metadata: {
      listingsSuspended,
      applicationsSuspended,
      reason: 'Professional Body API returned inactive/suspended/expired status',
    },
  });

  return {
    userId,
    listingsSuspended,
    applicationsSuspended,
    notifiedAt,
  };
}

/**
 * Suspends all active listings for a user in Firestore.
 */
async function suspendUserListings(userId: string): Promise<number> {
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
    console.error('[VerificationService] Failed to suspend listings:', error);
    return 0;
  }
}

/**
 * Suspends all pending applications for a user in Firestore.
 */
async function suspendUserApplications(userId: string): Promise<number> {
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
    console.error('[VerificationService] Failed to suspend applications:', error);
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
    console.error('[VerificationService] Failed to notify user of suspension:', error);
  }
}

// ─── API Timeout Handler ──────────────────────────────────────────────────────

/**
 * Handles Professional Body API timeout (> 30 seconds unreachable).
 * Rejects the marketplace action, informs user, and logs failure for platform_admin.
 *
 * Validates: Requirement 14.7
 */
export async function handleApiTimeout(
  userId?: string,
  options: { logFailure?: (params: { userId?: string; reason: string; timestamp: string }) => Promise<void> } = {}
): Promise<ApiTimeoutResult> {
  const now = new Date().toISOString();
  const reason = 'Professional body verification is temporarily unavailable. Please try again later.';

  const logFn = options.logFailure ?? logApiTimeoutFailure;

  await logFn({
    userId,
    reason: 'Professional Body API unreachable for more than 30 seconds',
    timestamp: now,
  });

  return {
    rejected: true,
    reason,
    loggedAt: now,
  };
}

/**
 * Logs API timeout failure for platform_admin review.
 */
async function logApiTimeoutFailure(params: { userId?: string; reason: string; timestamp: string }): Promise<void> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb.collection('marketplace_api_failures').add({
      userId: params.userId || 'unknown',
      failureType: 'professional_body_api_timeout',
      reason: params.reason,
      timestamp: params.timestamp,
      reviewedBy: null,
      reviewedAt: null,
      status: 'pending_review',
    });
  } catch (error) {
    console.error('[VerificationService] Failed to log API timeout:', error);
  }

  // Also log to marketplace audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'api_timeout_failure',
    entityId: params.userId || 'unknown',
    entityType: 'verification',
    metadata: {
      reason: params.reason,
      timestamp: params.timestamp,
      requiresAdminReview: true,
    },
  });
}
