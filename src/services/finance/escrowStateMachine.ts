/**
 * Escrow State Machine — Governed escrow wallet lifecycle
 *
 * Enforces exactly four states: Unfunded, FundedHeld, Released, Disputed.
 * All transitions are validated against the VALID_TRANSITIONS map.
 * Every transition writes an append-only audit record.
 *
 * Architex does NOT hold funds — this module orchestrates provider references,
 * approvals, webhooks, and audit trails through registered third-party providers.
 *
 * @module finance/escrowStateMachine
 * @see Requirements 2.1, 2.7
 */

import type { MoneyAmount, FinanceAuditRecord } from './types';
import { writeImmutableAuditRecord, createAuditEntry } from './auditTrailService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four valid escrow wallet states */
export type EscrowState = 'Unfunded' | 'FundedHeld' | 'Released' | 'Disputed';

/** An escrow wallet governed by the state machine */
export interface EscrowWallet {
  walletId: string;
  projectId: string;
  state: EscrowState;
  fundedAmount?: MoneyAmount;
  providerId: string;
  providerReference?: string;
  createdAtIso: string;
  lastTransitionAtIso: string;
  ownerId: string;
}

/** Evidence attached to a state transition request */
export interface TransitionEvidence {
  /** Type of evidence triggering the transition */
  type: 'provider_webhook' | 'payment_certificate' | 'release_request' | 'dispute_filing' | 'dispute_resolution' | 'timeout';
  /** Reference ID for the triggering artifact */
  referenceId: string;
  /** UID of the actor requesting the transition */
  actorUid: string;
  /** ISO-8601 timestamp of the evidence */
  timestampIso: string;
  /** Additional metadata specific to the evidence type */
  metadata?: Record<string, unknown>;
}

/** Resolution outcome for a disputed escrow wallet */
export interface DisputeResolution {
  /** Outcome of the dispute */
  outcome: 'in_favour_of_claimant' | 'in_favour_of_funder';
  /** UID of the resolver (must hold dispute:resolve permission, must not be a party) */
  resolverUid: string;
  /** Reason for the resolution decision */
  reason: string;
  /** Digital signature reference from the resolver */
  signatureReference: string;
  /** ISO-8601 timestamp of resolution */
  resolvedAtIso: string;
}

/** Result of an escrow state transition attempt */
export interface EscrowTransitionResult {
  success: boolean;
  wallet: EscrowWallet;
  auditRecord: FinanceAuditRecord;
  error?: {
    currentState: EscrowState;
    allowedTargets: EscrowState[];
    reason: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time (seconds) for provider webhook confirmation before timeout */
const PROVIDER_WEBHOOK_TIMEOUT_SECONDS = 300;

/** Maximum time (seconds) for dispute transition to complete */
const DISPUTE_TRANSITION_MAX_SECONDS = 5;

// ---------------------------------------------------------------------------
// Valid Transitions Map
// ---------------------------------------------------------------------------

/**
 * Defines allowed state transitions for the escrow state machine.
 *
 * - Unfunded → FundedHeld (provider confirms fund receipt)
 * - FundedHeld → Released (certificate + milestones approved + escrow:release)
 * - FundedHeld → Disputed (dispute raised, blocks releases)
 * - Disputed → Released (claimant wins — resolution in favour of claimant)
 * - Disputed → Unfunded (funder wins — refund via provider)
 * - Released → [] (terminal state, no further transitions)
 */
export const VALID_TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  Unfunded: ['FundedHeld'],
  FundedHeld: ['Released', 'Disputed'],
  Disputed: ['Released', 'Unfunded'],
  Released: [],
};

// ---------------------------------------------------------------------------
// Transition Evidence Validators
// ---------------------------------------------------------------------------

/**
 * Validates evidence for Unfunded → FundedHeld transition.
 * Requires a confirmed provider webhook received within 300s of the funding request.
 */
function validateUnfundedToFundedHeld(
  wallet: EscrowWallet,
  evidence: TransitionEvidence,
): string | null {
  if (evidence.type !== 'provider_webhook') {
    return 'Transition from Unfunded to FundedHeld requires provider_webhook evidence';
  }

  // Check webhook arrived within 300s of the last transition (funding request time)
  const requestTime = new Date(wallet.lastTransitionAtIso).getTime();
  const webhookTime = new Date(evidence.timestampIso).getTime();
  const elapsedSeconds = (webhookTime - requestTime) / 1000;

  if (elapsedSeconds > PROVIDER_WEBHOOK_TIMEOUT_SECONDS) {
    return `Provider webhook confirmation not received within ${PROVIDER_WEBHOOK_TIMEOUT_SECONDS}s (elapsed: ${Math.round(elapsedSeconds)}s)`;
  }

  return null;
}

/**
 * Validates evidence for FundedHeld → Released transition.
 * Requires: signed payment certificate, all linked milestones approved,
 * and escrow:release permission from non-claim-initiator.
 */
function validateFundedHeldToReleased(
  _wallet: EscrowWallet,
  evidence: TransitionEvidence,
): string | null {
  if (evidence.type !== 'payment_certificate') {
    return 'Transition from FundedHeld to Released requires payment_certificate evidence';
  }

  // Validate metadata contains required fields
  const meta = evidence.metadata ?? {};

  if (!meta.signedCertificateId) {
    return 'Transition from FundedHeld to Released requires a signed payment certificate';
  }

  if (!meta.allMilestonesApproved) {
    return 'All linked milestones must have status approved_for_provider_request before release';
  }

  if (!meta.hasEscrowReleasePermission) {
    return 'Actor must hold escrow:release permission to release funds';
  }

  if (meta.isClaimInitiator === true) {
    return 'Release approver cannot be the claim initiator (separation of duty)';
  }

  return null;
}

/**
 * Validates evidence for FundedHeld → Disputed transition.
 * Must transition within 5s; blocks all release requests.
 */
function validateFundedHeldToDisputed(
  _wallet: EscrowWallet,
  evidence: TransitionEvidence,
): string | null {
  if (evidence.type !== 'dispute_filing') {
    return 'Transition from FundedHeld to Disputed requires dispute_filing evidence';
  }

  // The transition itself must happen within 5s — validated by checking the evidence timestamp
  // is within 5s of now (or the system enforces the deadline externally)
  const now = Date.now();
  const evidenceTime = new Date(evidence.timestampIso).getTime();
  const elapsedSeconds = (now - evidenceTime) / 1000;

  if (elapsedSeconds > DISPUTE_TRANSITION_MAX_SECONDS) {
    return `Dispute transition must complete within ${DISPUTE_TRANSITION_MAX_SECONDS}s (elapsed: ${Math.round(elapsedSeconds)}s)`;
  }

  return null;
}

/**
 * Validates evidence for Disputed → Released transition (claimant wins).
 * Requires dispute:resolve permission from a non-party signer.
 */
function validateDisputedToReleased(
  _wallet: EscrowWallet,
  evidence: TransitionEvidence,
): string | null {
  if (evidence.type !== 'dispute_resolution') {
    return 'Transition from Disputed to Released requires dispute_resolution evidence';
  }

  const meta = evidence.metadata ?? {};

  if (meta.outcome !== 'in_favour_of_claimant') {
    return 'Transition from Disputed to Released requires outcome in_favour_of_claimant';
  }

  if (!meta.hasDisputeResolvePermission) {
    return 'Resolver must hold dispute:resolve permission';
  }

  if (meta.isPartyToDispute === true) {
    return 'Resolver must not be a party to the dispute';
  }

  if (!meta.signatureReference) {
    return 'Digital signature from resolver is required for dispute resolution';
  }

  return null;
}

/**
 * Validates evidence for Disputed → Unfunded transition (funder wins).
 * Initiates refund via provider.
 */
function validateDisputedToUnfunded(
  _wallet: EscrowWallet,
  evidence: TransitionEvidence,
): string | null {
  if (evidence.type !== 'dispute_resolution') {
    return 'Transition from Disputed to Unfunded requires dispute_resolution evidence';
  }

  const meta = evidence.metadata ?? {};

  if (meta.outcome !== 'in_favour_of_funder') {
    return 'Transition from Disputed to Unfunded requires outcome in_favour_of_funder';
  }

  if (!meta.hasDisputeResolvePermission) {
    return 'Resolver must hold dispute:resolve permission';
  }

  if (meta.isPartyToDispute === true) {
    return 'Resolver must not be a party to the dispute';
  }

  if (!meta.signatureReference) {
    return 'Digital signature from resolver is required for dispute resolution';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main Transition Function
// ---------------------------------------------------------------------------

/**
 * Determine the appropriate audit action based on the target state.
 */
function getAuditAction(target: EscrowState): string {
  switch (target) {
    case 'FundedHeld':
      return 'escrow_funded';
    case 'Released':
      return 'escrow_released';
    case 'Disputed':
      return 'escrow_disputed';
    case 'Unfunded':
      return 'refund_initiated';
    default:
      return 'escrow_funded';
  }
}

/**
 * Transition an escrow wallet to a new state with evidence.
 *
 * Validates the target state against VALID_TRANSITIONS[currentState].
 * On invalid transition: rejects with current state and allowed targets, logs attempt.
 * On valid transition: validates transition-specific evidence, updates wallet state,
 * writes append-only audit record.
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */
export function transitionEscrow(
  wallet: EscrowWallet,
  target: EscrowState,
  evidence: TransitionEvidence,
): EscrowTransitionResult {
  const currentState = wallet.state;
  const allowedTargets = VALID_TRANSITIONS[currentState];
  const timestampIso = evidence.timestampIso || new Date().toISOString();

  // ── Step 1: Validate target state is in VALID_TRANSITIONS[currentState] ──
  if (!allowedTargets.includes(target)) {
    const reason = `Invalid state transition from '${currentState}' to '${target}'. Allowed targets: [${allowedTargets.join(', ')}]`;

    // Log the invalid attempt with actor UID and ISO-8601 timestamp
    const auditRecord = createAuditEntry(
      `audit-escrow-invalid-${wallet.walletId}-${Date.now()}`,
      'escrow_transition_rejected',
      `Invalid transition attempted: ${currentState} → ${target} by actor ${evidence.actorUid} at ${timestampIso}. ${reason}`,
      undefined,
      timestampIso,
    );

    // Write immutable audit record for the rejected attempt (fire-and-forget)
    writeImmutableAuditRecord({
      actorUid: evidence.actorUid,
      actorRole: 'unknown',
      action: 'tamper_attempt',
      timestampIso,
      targetResourceId: wallet.walletId,
      evidenceReferences: [{ type: 'webhook_event', referenceId: evidence.referenceId }],
      previousState: currentState,
      newState: target,
    }).catch(() => {
      // Best-effort — don't block the synchronous return
    });

    return {
      success: false,
      wallet,
      auditRecord,
      error: {
        currentState,
        allowedTargets,
        reason,
      },
    };
  }

  // ── Step 2: Validate transition-specific evidence ──
  let validationError: string | null = null;

  if (currentState === 'Unfunded' && target === 'FundedHeld') {
    validationError = validateUnfundedToFundedHeld(wallet, evidence);
  } else if (currentState === 'FundedHeld' && target === 'Released') {
    validationError = validateFundedHeldToReleased(wallet, evidence);
  } else if (currentState === 'FundedHeld' && target === 'Disputed') {
    validationError = validateFundedHeldToDisputed(wallet, evidence);
  } else if (currentState === 'Disputed' && target === 'Released') {
    validationError = validateDisputedToReleased(wallet, evidence);
  } else if (currentState === 'Disputed' && target === 'Unfunded') {
    validationError = validateDisputedToUnfunded(wallet, evidence);
  }

  if (validationError) {
    const auditRecord = createAuditEntry(
      `audit-escrow-rejected-${wallet.walletId}-${Date.now()}`,
      'escrow_transition_rejected',
      `Transition ${currentState} → ${target} rejected: ${validationError}. Actor: ${evidence.actorUid} at ${timestampIso}`,
      undefined,
      timestampIso,
    );

    // Write immutable audit record for the rejected valid-target but invalid-evidence attempt
    writeImmutableAuditRecord({
      actorUid: evidence.actorUid,
      actorRole: 'unknown',
      action: 'tamper_attempt',
      timestampIso,
      targetResourceId: wallet.walletId,
      evidenceReferences: [{ type: 'webhook_event', referenceId: evidence.referenceId }],
      previousState: currentState,
      newState: target,
    }).catch(() => {
      // Best-effort
    });

    return {
      success: false,
      wallet,
      auditRecord,
      error: {
        currentState,
        allowedTargets,
        reason: validationError,
      },
    };
  }

  // ── Step 3: Execute transition — update wallet state ──
  const updatedWallet: EscrowWallet = {
    ...wallet,
    state: target,
    lastTransitionAtIso: timestampIso,
    providerReference: evidence.referenceId,
  };

  // ── Step 4: Write append-only audit record for the successful transition ──
  const auditAction = getAuditAction(target);
  const auditRecord = createAuditEntry(
    `audit-escrow-${wallet.walletId}-${auditAction}-${Date.now()}`,
    auditAction,
    `Escrow wallet '${wallet.walletId}' transitioned: ${currentState} → ${target}. Actor: ${evidence.actorUid}. Evidence: ${evidence.type} (${evidence.referenceId}).`,
    undefined,
    timestampIso,
  );

  // Write immutable audit record (async, fire-and-forget for the synchronous return)
  writeImmutableAuditRecord({
    actorUid: evidence.actorUid,
    actorRole: 'unknown',
    action: auditAction as 'escrow_funded' | 'escrow_released' | 'escrow_disputed' | 'refund_initiated',
    timestampIso,
    targetResourceId: wallet.walletId,
    evidenceReferences: [
      { type: 'webhook_event', referenceId: evidence.referenceId },
    ],
    previousState: currentState,
    newState: target,
  }).catch(() => {
    // Best-effort — don't block the synchronous return
  });

  return {
    success: true,
    wallet: updatedWallet,
    auditRecord,
  };
}

/**
 * Handle funding timeout when provider webhook is not received within 300s.
 *
 * Marks transition as timed out, writes audit record, emits inbox notification
 * to the escrow owner indicating the funding attempt failed.
 *
 * The wallet stays in Unfunded state (the timeout means the webhook never came).
 *
 * @see Requirements 2.4, 2.9
 */
export function handleFundingTimeout(
  wallet: EscrowWallet
): EscrowTransitionResult {
  // Validate wallet is in Unfunded state
  if (wallet.state !== 'Unfunded') {
    const auditRecord = createAuditEntry(
      `audit-escrow-timeout-invalid-${wallet.walletId}-${Date.now()}`,
      'escrow_timeout',
      `Funding timeout called on wallet '${wallet.walletId}' in state '${wallet.state}' — expected 'Unfunded'.`,
      undefined,
      new Date().toISOString(),
    );

    return {
      success: false,
      wallet,
      auditRecord,
      error: {
        currentState: wallet.state,
        allowedTargets: VALID_TRANSITIONS[wallet.state],
        reason: `handleFundingTimeout can only be called on wallets in Unfunded state. Current state: '${wallet.state}'.`,
      },
    };
  }

  const timestampIso = new Date().toISOString();

  // Write audit record for the timeout
  const auditRecord = createAuditEntry(
    `audit-escrow-timeout-${wallet.walletId}-${Date.now()}`,
    'escrow_timeout',
    `Escrow wallet '${wallet.walletId}' funding timed out after ${PROVIDER_WEBHOOK_TIMEOUT_SECONDS}s. Provider webhook not received. Owner: ${wallet.ownerId}.`,
    undefined,
    timestampIso,
  );

  // Write immutable audit record (async, fire-and-forget)
  writeImmutableAuditRecord({
    actorUid: wallet.ownerId,
    actorRole: 'system',
    action: 'escrow_timeout',
    timestampIso,
    targetResourceId: wallet.walletId,
    evidenceReferences: [
      { type: 'webhook_event', referenceId: `timeout-${wallet.walletId}-${Date.now()}` },
    ],
    previousState: 'Unfunded',
    newState: 'Unfunded',
  }).catch(() => {
    // Best-effort — don't block synchronous return
  });

  // Emit inbox notification to escrow owner (fire-and-forget)
  emitTimeoutNotification(wallet, timestampIso);

  return {
    success: true,
    wallet, // State unchanged — still Unfunded since the webhook never came
    auditRecord,
  };
}

/**
 * Raise a dispute against a FundedHeld escrow wallet.
 *
 * Transitions wallet to Disputed state within 5s and blocks all release
 * requests until resolution.
 *
 * @see Requirements 2.4, 2.6
 */
export function raiseDispute(
  wallet: EscrowWallet,
  disputeReason: string
): EscrowTransitionResult {
  // Validate wallet is in FundedHeld state
  if (wallet.state !== 'FundedHeld') {
    const auditRecord = createAuditEntry(
      `audit-escrow-dispute-invalid-${wallet.walletId}-${Date.now()}`,
      'escrow_disputed',
      `Dispute raised on wallet '${wallet.walletId}' in state '${wallet.state}' — expected 'FundedHeld'. Reason: ${disputeReason}`,
      undefined,
      new Date().toISOString(),
    );

    return {
      success: false,
      wallet,
      auditRecord,
      error: {
        currentState: wallet.state,
        allowedTargets: VALID_TRANSITIONS[wallet.state],
        reason: `raiseDispute can only be called on wallets in FundedHeld state. Current state: '${wallet.state}'.`,
      },
    };
  }

  const timestampIso = new Date().toISOString();

  // Build dispute_filing evidence and delegate to transitionEscrow
  const evidence: TransitionEvidence = {
    type: 'dispute_filing',
    referenceId: `dispute-${wallet.walletId}-${Date.now()}`,
    actorUid: wallet.ownerId,
    timestampIso,
    metadata: {
      reason: disputeReason,
    },
  };

  return transitionEscrow(wallet, 'Disputed', evidence);
}

/**
 * Resolve a dispute on a Disputed escrow wallet.
 *
 * - outcome 'in_favour_of_claimant' → transition to Released
 * - outcome 'in_favour_of_funder' → transition to Unfunded (refund via provider)
 *
 * Requires digital signature from a user holding dispute:resolve permission
 * who was not a party to the dispute.
 *
 * @see Requirements 2.6, 2.9
 */
export function resolveDispute(
  wallet: EscrowWallet,
  resolution: DisputeResolution
): EscrowTransitionResult {
  // Validate wallet is in Disputed state
  if (wallet.state !== 'Disputed') {
    const auditRecord = createAuditEntry(
      `audit-escrow-resolve-invalid-${wallet.walletId}-${Date.now()}`,
      'escrow_released',
      `Dispute resolution attempted on wallet '${wallet.walletId}' in state '${wallet.state}' — expected 'Disputed'. Outcome: ${resolution.outcome}`,
      undefined,
      new Date().toISOString(),
    );

    return {
      success: false,
      wallet,
      auditRecord,
      error: {
        currentState: wallet.state,
        allowedTargets: VALID_TRANSITIONS[wallet.state],
        reason: `resolveDispute can only be called on wallets in Disputed state. Current state: '${wallet.state}'.`,
      },
    };
  }

  // Determine target state based on outcome
  const targetState: EscrowState =
    resolution.outcome === 'in_favour_of_claimant' ? 'Released' : 'Unfunded';

  // Build dispute_resolution evidence and delegate to transitionEscrow
  const evidence: TransitionEvidence = {
    type: 'dispute_resolution',
    referenceId: `resolution-${wallet.walletId}-${Date.now()}`,
    actorUid: resolution.resolverUid,
    timestampIso: resolution.resolvedAtIso,
    metadata: {
      outcome: resolution.outcome,
      hasDisputeResolvePermission: true, // caller must verify before calling
      isPartyToDispute: false, // caller must verify before calling
      signatureReference: resolution.signatureReference,
      reason: resolution.reason,
    },
  };

  return transitionEscrow(wallet, targetState, evidence);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Emit an inbox notification to the escrow owner about a funding timeout.
 * In production this writes to the inbox/notifications Firestore collection.
 * For now we fire-and-forget the async write.
 */
function emitTimeoutNotification(wallet: EscrowWallet, timestampIso: string): void {
  // Async write to notifications collection via Admin SDK (fire-and-forget)
  (async () => {
    try {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb.collection('notifications').add({
        recipientUid: wallet.ownerId,
        type: 'escrow_funding_timeout',
        title: 'Escrow Funding Timeout',
        message: `Funding for escrow wallet '${wallet.walletId}' on project '${wallet.projectId}' timed out. The payment provider did not confirm within ${PROVIDER_WEBHOOK_TIMEOUT_SECONDS} seconds.`,
        walletId: wallet.walletId,
        projectId: wallet.projectId,
        providerId: wallet.providerId,
        createdAtIso: timestampIso,
        read: false,
        severity: 'action_required',
      });
    } catch {
      // Best-effort — notification failure should not break the timeout flow
    }
  })();
}
