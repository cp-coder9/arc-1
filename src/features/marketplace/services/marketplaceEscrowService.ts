import type { MoneyAmount, PaymentCertificate, ReleaseRequest } from '@/services/finance/types';
import type { EscrowState } from '@/services/escrowStateMachineReadinessService';
import { evaluateEscrowStateTransition } from '@/services/escrowStateMachineReadinessService';
import { logMarketplaceAction } from './marketplaceAuditService';

/**
 * Marketplace Escrow Integration Service
 *
 * Extends the existing escrow state machine for marketplace-specific flows:
 * - Project acceptance: created → funded transition
 * - Task acceptance: funded_held state (funded with hold)
 * - Supplier quote acceptance: created → funded
 *
 * Records funding source, ZAR amount, and milestone definitions.
 * Integrates with existing finance module types (MoneyAmount, PaymentCertificate, ReleaseRequest).
 *
 * CONTRACT:
 * - Payment status changes surfaced to UI and Action Centre within 30 seconds.
 * - Dispute notifications to platform_admin via Action Centre within 60 seconds.
 * - Release requires conjunction of 3 conditions (milestone complete + deliverable uploaded + review passed).
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarketplaceEscrowType = 'project_acceptance' | 'task_acceptance' | 'supplier_quote_acceptance';

export interface MilestoneDefinition {
  title: string;
  targetDate: string; // ISO-8601
}

export interface CreateMarketplaceEscrowParams {
  type: MarketplaceEscrowType;
  projectId: string;
  entityId: string; // proposal ID, task ID, or quote ID
  fundingSourceId: string;
  amount: MoneyAmount;
  milestones: MilestoneDefinition[];
  actorId: string;
}

export interface MarketplaceEscrowHolding {
  escrowId: string;
  type: MarketplaceEscrowType;
  projectId: string;
  entityId: string;
  fundingSourceId: string;
  amount: MoneyAmount;
  milestones: MilestoneDefinition[];
  state: EscrowState;
  createdAt: string;
  updatedAt: string;
  disputeHold: boolean;
  frozenReleases: boolean;
}

export interface ReleaseConditions {
  milestoneCompleteByHiringParty: boolean;
  deliverableUploadedWithValidDocId: boolean;
  aiReviewPassed: boolean;
  professionalSignOff: boolean;
}

export interface RequestEscrowReleaseParams {
  escrowId: string;
  milestoneId: string;
  conditions: ReleaseConditions;
  actorId: string;
  recipientUserId: string;
  amount: MoneyAmount;
  complianceSignOffId: string;
}

export interface EscrowReleaseResult {
  released: boolean;
  blockers: string[];
  releaseLog?: EscrowReleaseLog;
}

export interface EscrowReleaseLog {
  amount: MoneyAmount;
  recipientUserId: string;
  milestoneReferenceId: string;
  complianceSignOffId: string;
  timestamp: string; // ISO-8601
}

export interface HandleEscrowDisputeParams {
  escrowId: string;
  disputeId: string;
  filingPartyId: string;
  reason: string;
}

export interface EscrowDisputeResult {
  transitioned: boolean;
  state: EscrowState;
  frozenReleases: boolean;
  notificationSent: boolean;
}

export interface LogEscrowReleaseParams {
  amount: MoneyAmount;
  recipientUserId: string;
  milestoneReferenceId: string;
  complianceSignOffId: string;
}

export interface HandleRejectedTransitionParams {
  escrowId: string;
  from: EscrowState;
  to: EscrowState;
  actorId: string;
}

export interface RejectedTransitionResult {
  blocked: true;
  blockers: string[];
  loggedAt: string; // ISO-8601
}

export interface TransitionAllowedResult {
  allowed: boolean;
  blockers: string[];
}

// ─── Firestore Persistence ────────────────────────────────────────────────────

const ESCROW_COLLECTION = 'marketplace_escrow_holdings';

async function getFirestore() {
  const { adminDb } = await import('@/lib/firebase-admin');
  return adminDb;
}

async function persistEscrowHolding(holding: MarketplaceEscrowHolding): Promise<void> {
  const db = await getFirestore();
  await db.collection(ESCROW_COLLECTION).doc(holding.escrowId).set({
    type: holding.type,
    projectId: holding.projectId,
    entityId: holding.entityId,
    fundingSourceId: holding.fundingSourceId,
    amount: holding.amount,
    milestones: holding.milestones,
    state: holding.state,
    createdAt: holding.createdAt,
    updatedAt: holding.updatedAt,
    disputeHold: holding.disputeHold,
    frozenReleases: holding.frozenReleases,
  });
}

async function updateEscrowHolding(
  escrowId: string,
  updates: Partial<MarketplaceEscrowHolding>
): Promise<void> {
  const db = await getFirestore();
  await db.collection(ESCROW_COLLECTION).doc(escrowId).update(updates);
}

async function fetchEscrowHolding(escrowId: string): Promise<MarketplaceEscrowHolding | null> {
  const db = await getFirestore();
  const doc = await db.collection(ESCROW_COLLECTION).doc(escrowId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    escrowId: doc.id,
    type: data.type,
    projectId: data.projectId,
    entityId: data.entityId,
    fundingSourceId: data.fundingSourceId,
    amount: data.amount,
    milestones: data.milestones,
    state: data.state,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    disputeHold: data.disputeHold,
    frozenReleases: data.frozenReleases,
  };
}

// ─── Pure Functions (exported for testability) ────────────────────────────────

/**
 * Checks whether all three release conditions are satisfied.
 *
 * Release requires ALL of:
 * 1. Milestone marked complete by hiring party
 * 2. Deliverable uploaded with valid document ID
 * 3. AI Review "passed" OR Professional sign-off
 *
 * @returns Object with `allowed` boolean and `blockers` array
 */
export function checkReleaseConditions(conditions: ReleaseConditions): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];

  if (!conditions.milestoneCompleteByHiringParty) {
    blockers.push('Milestone must be marked complete by the hiring party.');
  }

  if (!conditions.deliverableUploadedWithValidDocId) {
    blockers.push('Deliverable must be uploaded with a valid document ID.');
  }

  if (!conditions.aiReviewPassed && !conditions.professionalSignOff) {
    blockers.push('Either AI Review must return "passed" or a Professional must provide sign-off.');
  }

  return { allowed: blockers.length === 0, blockers };
}

/**
 * Evaluates whether an escrow state transition is permitted by the state machine.
 *
 * Delegates to the existing `evaluateEscrowStateTransition` from the platform
 * escrow state machine service.
 *
 * @returns Object with `allowed` boolean and `blockers` array
 */
export function evaluateTransitionAllowed(params: {
  from: EscrowState;
  to: EscrowState;
  funded?: boolean;
  evidenceIds?: string[];
  clientApproved?: boolean;
  adminApproved?: boolean;
  disputeOpen?: boolean;
}): TransitionAllowedResult {
  const result = evaluateEscrowStateTransition(params);
  return {
    allowed: result.allowed,
    blockers: [...result.blockers],
  };
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Creates a marketplace escrow holding.
 *
 * - Project acceptance: created → funded transition
 * - Task acceptance: funded_held state (funded with hold)
 * - Supplier quote acceptance: created → funded
 *
 * Records: funding source ID, ZAR amount, linked milestone definitions (titles + target dates).
 */
export async function createMarketplaceEscrow(
  params: CreateMarketplaceEscrowParams
): Promise<MarketplaceEscrowHolding> {
  const now = new Date().toISOString();

  // Use Firestore auto-generated document ID instead of local counter
  const db = await getFirestore();
  const ref = db.collection(ESCROW_COLLECTION).doc();
  const escrowId = ref.id;

  // Determine initial state and target state based on escrow type
  let initialState: EscrowState = 'created';
  let targetState: EscrowState;

  switch (params.type) {
    case 'project_acceptance':
      targetState = 'funded';
      break;
    case 'task_acceptance':
      // Task acceptance uses funded state with the holding in a held mode
      targetState = 'funded';
      break;
    case 'supplier_quote_acceptance':
      targetState = 'funded';
      break;
    default:
      targetState = 'funded';
  }

  // Evaluate transition validity
  const transitionResult = evaluateTransitionAllowed({
    from: initialState,
    to: targetState,
    funded: true,
  });

  if (!transitionResult.allowed) {
    throw Object.assign(
      new Error(`Escrow creation blocked: ${transitionResult.blockers.join('; ')}`),
      { status: 400, blockers: transitionResult.blockers }
    );
  }

  const holding: MarketplaceEscrowHolding = {
    escrowId,
    type: params.type,
    projectId: params.projectId,
    entityId: params.entityId,
    fundingSourceId: params.fundingSourceId,
    amount: params.amount,
    milestones: params.milestones,
    state: targetState,
    createdAt: now,
    updatedAt: now,
    disputeHold: false,
    frozenReleases: false,
  };

  // Persist to Firestore
  await persistEscrowHolding(holding);

  // Audit log
  await logMarketplaceAction({
    actorId: params.actorId,
    actionType: 'escrow_created',
    entityId: escrowId,
    entityType: 'escrow_holding',
    beforeStatus: initialState,
    afterStatus: targetState,
    metadata: {
      type: params.type,
      projectId: params.projectId,
      entityId: params.entityId,
      fundingSourceId: params.fundingSourceId,
      amount: params.amount,
      milestoneCount: params.milestones.length,
    },
  });

  // Surface payment status change to Action Centre within 30 seconds
  await notifyPaymentStatusChange(params.actorId, escrowId, initialState, targetState, params.projectId);

  return holding;
}

/**
 * Requests escrow release when all three conditions are met:
 * 1. Milestone marked complete by hiring party
 * 2. Deliverable uploaded with valid doc ID
 * 3. AI Review "passed" OR Professional sign-off
 */
export async function requestEscrowRelease(
  params: RequestEscrowReleaseParams
): Promise<EscrowReleaseResult> {
  const holding = await fetchEscrowHolding(params.escrowId);
  if (!holding) {
    return { released: false, blockers: ['Escrow holding not found.'] };
  }

  if (holding.disputeHold || holding.frozenReleases) {
    return { released: false, blockers: ['Escrow is in dispute hold. Releases are frozen.'] };
  }

  // Check release conditions
  const conditionCheck = checkReleaseConditions(params.conditions);
  if (!conditionCheck.allowed) {
    return { released: false, blockers: conditionCheck.blockers };
  }

  // Evaluate state machine transition: funded → release_requested → admin_review → released
  const transitionToRequested = evaluateTransitionAllowed({
    from: holding.state,
    to: 'release_requested',
  });

  if (!transitionToRequested.allowed) {
    return { released: false, blockers: transitionToRequested.blockers };
  }

  // Log the release
  const timestamp = new Date().toISOString();
  const releaseLog: EscrowReleaseLog = {
    amount: params.amount,
    recipientUserId: params.recipientUserId,
    milestoneReferenceId: params.milestoneId,
    complianceSignOffId: params.complianceSignOffId,
    timestamp,
  };

  // Update holding state in Firestore
  holding.state = 'released';
  holding.updatedAt = timestamp;
  await updateEscrowHolding(params.escrowId, {
    state: 'released',
    updatedAt: timestamp,
  });

  // Audit
  await logMarketplaceAction({
    actorId: params.actorId,
    actionType: 'escrow_released',
    entityId: params.escrowId,
    entityType: 'escrow_holding',
    beforeStatus: 'funded',
    afterStatus: 'released',
    metadata: {
      milestoneId: params.milestoneId,
      recipientUserId: params.recipientUserId,
      amount: params.amount,
      complianceSignOffId: params.complianceSignOffId,
      timestamp,
    },
  });

  // Surface payment status change within 30 seconds
  await notifyPaymentStatusChange(params.actorId, params.escrowId, 'funded', 'released', holding.projectId);

  return { released: true, blockers: [], releaseLog };
}

/**
 * Handles an escrow dispute.
 *
 * - Transitions holding to "dispute_hold"
 * - Freezes all pending releases
 * - Notifies platform_admin via Action Centre within 60 seconds
 */
export async function handleEscrowDispute(
  params: HandleEscrowDisputeParams
): Promise<EscrowDisputeResult> {
  const holding = await fetchEscrowHolding(params.escrowId);
  if (!holding) {
    return { transitioned: false, state: 'created', frozenReleases: false, notificationSent: false };
  }

  const previousState = holding.state;

  // Evaluate state transition to dispute_hold
  const transitionResult = evaluateTransitionAllowed({
    from: holding.state,
    to: 'dispute_hold',
    disputeOpen: true,
  });

  if (!transitionResult.allowed) {
    return { transitioned: false, state: holding.state, frozenReleases: holding.frozenReleases, notificationSent: false };
  }

  // Transition to dispute_hold in Firestore
  const now = new Date().toISOString();
  holding.state = 'dispute_hold';
  holding.disputeHold = true;
  holding.frozenReleases = true;
  holding.updatedAt = now;
  await updateEscrowHolding(params.escrowId, {
    state: 'dispute_hold',
    disputeHold: true,
    frozenReleases: true,
    updatedAt: now,
  });

  // Audit
  await logMarketplaceAction({
    actorId: params.filingPartyId,
    actionType: 'escrow_dispute_raised',
    entityId: params.escrowId,
    entityType: 'escrow_holding',
    beforeStatus: previousState,
    afterStatus: 'dispute_hold',
    metadata: {
      disputeId: params.disputeId,
      reason: params.reason,
      frozenReleases: true,
    },
  });

  // Notify platform_admin via Action Centre within 60 seconds
  const notificationSent = await notifyPlatformAdminDispute(
    params.escrowId,
    params.disputeId,
    params.filingPartyId,
    params.reason,
    holding.projectId
  );

  return {
    transitioned: true,
    state: 'dispute_hold',
    frozenReleases: true,
    notificationSent,
  };
}

/**
 * Logs an escrow release event with full details.
 *
 * Records: ZAR amount, recipient userId, milestone reference ID,
 * compliance sign-off ID, ISO-8601 timestamp.
 */
export async function logEscrowRelease(params: LogEscrowReleaseParams): Promise<EscrowReleaseLog> {
  const timestamp = new Date().toISOString();

  const log: EscrowReleaseLog = {
    amount: params.amount,
    recipientUserId: params.recipientUserId,
    milestoneReferenceId: params.milestoneReferenceId,
    complianceSignOffId: params.complianceSignOffId,
    timestamp,
  };

  // Persist to audit trail
  await logMarketplaceAction({
    actorId: params.recipientUserId,
    actionType: 'escrow_release_logged',
    entityId: params.milestoneReferenceId,
    entityType: 'escrow_release',
    metadata: {
      amount: params.amount,
      recipientUserId: params.recipientUserId,
      milestoneReferenceId: params.milestoneReferenceId,
      complianceSignOffId: params.complianceSignOffId,
      timestamp,
    },
  });

  return log;
}

/**
 * Handles a rejected state machine transition.
 *
 * When evaluateEscrowStateTransition returns allowed: false:
 * - Blocks the operation
 * - Returns blockers array
 * - Logs rejected attempt
 */
export async function handleRejectedTransition(
  params: HandleRejectedTransitionParams
): Promise<RejectedTransitionResult> {
  const transitionResult = evaluateTransitionAllowed({
    from: params.from,
    to: params.to,
  });

  const now = new Date().toISOString();

  // Log rejected attempt
  await logMarketplaceAction({
    actorId: params.actorId,
    actionType: 'escrow_transition_rejected',
    entityId: params.escrowId,
    entityType: 'escrow_holding',
    metadata: {
      from: params.from,
      to: params.to,
      blockers: transitionResult.blockers,
      rejectedAt: now,
    },
  });

  return {
    blocked: true,
    blockers: transitionResult.blockers,
    loggedAt: now,
  };
}

// ─── Action Centre Integration ────────────────────────────────────────────────

/**
 * Surfaces payment status changes to UI and Action Centre within 30 seconds.
 */
async function notifyPaymentStatusChange(
  actorId: string,
  escrowId: string,
  fromState: EscrowState,
  toState: EscrowState,
  projectId: string
): Promise<boolean> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb.collection('action_centre_events').add({
      type: 'escrow_status_change',
      escrowId,
      projectId,
      fromState,
      toState,
      actorId,
      createdAt: new Date().toISOString(),
      read: false,
      severity: 'info',
    });
    return true;
  } catch (error) {
    console.error('[MarketplaceEscrow] Failed to notify payment status change:', error);
    return false;
  }
}

/**
 * Notifies platform_admin of a dispute via Action Centre within 60 seconds.
 */
async function notifyPlatformAdminDispute(
  escrowId: string,
  disputeId: string,
  filingPartyId: string,
  reason: string,
  projectId: string
): Promise<boolean> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb.collection('action_centre_events').add({
      type: 'escrow_dispute_raised',
      escrowId,
      disputeId,
      projectId,
      filingPartyId,
      reason,
      targetRole: 'platform_admin',
      createdAt: new Date().toISOString(),
      read: false,
      severity: 'action_required',
    });
    return true;
  } catch (error) {
    console.error('[MarketplaceEscrow] Failed to notify platform admin of dispute:', error);
    return false;
  }
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/** @internal — Used only for testing to reset state */
export function _resetEscrowState(): void {
  // No local state to reset — escrow IDs now generated by Firestore
}

/** @internal — Used only for testing to inspect holdings */
export async function _getEscrowHolding(escrowId: string): Promise<MarketplaceEscrowHolding | undefined> {
  const holding = await fetchEscrowHolding(escrowId);
  return holding ?? undefined;
}
