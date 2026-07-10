/**
 * Remote Desktop Core — Governance Bridge Service
 *
 * Bridges the remote desktop session layer with existing booking governance
 * from `resourceBookingService.ts`. This service wraps the existing governance
 * functions with remote-desktop-specific logic, ensuring:
 *
 * - Booking governance validation via evaluateResourceBookingGovernance
 * - Conflict checking via canConfirmResourceBooking
 * - Usage record creation via buildResourceUsageLedgerEntry
 * - Session-aware booking lifecycle transitions
 * - Preservation of humanApprovalRequired and autoPayoutProhibited invariants
 * - 14-day unfinalised billing detection and flagging
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 *
 * Design Correctness Property 7 — Governance Preservation:
 * ∀ session where session.status === 'completed',
 *   ∃ ledgerEntry: ResourceUsageLedgerEntry
 *     where ledgerEntry.bookingId === session.bookingId
 *   ∧ session.ownerApproved === false → billingNotFinalised(session)
 */

import {
  evaluateResourceBookingGovernance,
  canConfirmResourceBooking,
  buildResourceUsageLedgerEntry,
  type ResourceBookingGovernanceInput,
  type ResourceBookingGovernanceDecision,
  type ResourceBookingWindow,
  type ResourceBookingRequest,
  type ResourceBookingConflict,
  type ResourceUsageLedgerEntry,
  type ResourceUsageLogInput,
  type ResourceUsageBillingPolicy,
} from '@/services/resourceBookingService';

import { REMOTE_DESKTOP_DEFAULTS } from './types';
import type { SessionRecord } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Extended booking lifecycle status for session-aware transitions (Req 12.5) */
export type BookingLifecycleStatus =
  | 'pending'
  | 'confirmed'
  | 'session_active'
  | 'session_completed'
  | 'completed'
  | 'cancelled';

/** Input for booking governance validation */
export interface GovernanceBridgeInput {
  bookingId: string;
  request: ResourceBookingRequest;
  existingBookings: ResourceBookingWindow[];
  requestedBy: string;
  ownerId: string;
  approvedBy?: string;
  cancellationReason?: string;
  checkedAt: string;
}

/** Result of governance validation through the bridge */
export interface GovernanceBridgeResult {
  decision: ResourceBookingGovernanceDecision;
  canProceed: boolean;
  humanApprovalRequired: true;
  autoConfirmProhibited: true;
}

/** Result of conflict check through the bridge */
export interface ConflictCheckResult {
  canConfirm: boolean;
  conflicts: ResourceBookingConflict[];
  tokenBlocked: boolean;
}

/** Input for creating a usage record from a completed session */
export interface SessionUsageInput {
  session: SessionRecord;
  usageLogId: string;
  billingPolicy: ResourceUsageBillingPolicy;
  occurredAt: string;
}

/** Result of usage record creation */
export interface UsageRecordResult {
  ledgerEntry: ResourceUsageLedgerEntry;
  billingFinalised: false;
  autoPayoutProhibited: true;
  humanApprovalRequired: true;
}

/** Booking lifecycle transition record */
export interface LifecycleTransition {
  bookingId: string;
  previousStatus: BookingLifecycleStatus;
  newStatus: BookingLifecycleStatus;
  transitionedAt: string;
  triggeredBy: string;
  sessionId?: string;
}

/** Unfinalised billing record flagged for admin review */
export interface UnfinalisedBillingRecord {
  bookingId: string;
  sessionId: string;
  completedAt: string;
  daysSinceCompletion: number;
  ownerApproved: boolean;
  flaggedAt: string;
  requiresAdminReview: true;
}

/** Billing detection input — a completed session with billing info */
export interface BillingDetectionInput {
  bookingId: string;
  sessionId: string;
  completedAt: string;
  ownerApproved: boolean;
  billingFinalised: boolean;
}

// ─── In-Memory State (lifecycle transitions) ─────────────────────────────────────

const lifecycleTransitions: LifecycleTransition[] = [];
const unfinalisedFlags: UnfinalisedBillingRecord[] = [];

// ─── Governance Bridge: Validate Booking Governance (Req 12.1) ──────────────────

/**
 * Wraps `evaluateResourceBookingGovernance` with remote-desktop-specific validation.
 *
 * Ensures bookings pass the existing governance evaluation before token generation
 * is allowed. Enforces humanApprovalRequired and autoConfirmProhibited invariants.
 *
 * Requirement 12.1: Session_Broker SHALL generate Session_Tokens only for bookings
 * that have passed through evaluateResourceBookingGovernance with status "approved".
 */
export function validateBookingGovernance(input: GovernanceBridgeInput): GovernanceBridgeResult {
  const governanceInput: ResourceBookingGovernanceInput = {
    request: input.request,
    existingBookings: input.existingBookings,
    requestedBy: input.requestedBy,
    ownerId: input.ownerId,
    approvedBy: input.approvedBy,
    cancellationReason: input.cancellationReason,
    checkedAt: input.checkedAt,
  };

  const decision = evaluateResourceBookingGovernance(governanceInput);

  return {
    decision,
    canProceed: decision.status === 'approved',
    humanApprovalRequired: true,
    autoConfirmProhibited: true,
  };
}

// ─── Governance Bridge: Check Booking Conflicts (Req 12.6) ──────────────────────

/**
 * Wraps `canConfirmResourceBooking` for conflict checking.
 *
 * When a conflict is detected, the Session_Broker SHALL refuse to generate
 * a Session_Token for that booking regardless of host readiness (Req 12.6).
 */
export function checkBookingConflicts(
  request: ResourceBookingRequest,
  existingBookings: ResourceBookingWindow[],
): ConflictCheckResult {
  const result = canConfirmResourceBooking(request, existingBookings);

  return {
    canConfirm: result.canConfirm,
    conflicts: result.conflicts,
    tokenBlocked: !result.canConfirm,
  };
}

// ─── Governance Bridge: Create Usage Record (Req 12.3) ──────────────────────────

/**
 * Wraps `buildResourceUsageLedgerEntry` with session data.
 *
 * Creates a usage record through the existing billing pipeline, preserving
 * the autoPayoutProhibited invariant by requiring explicit Resource_Owner
 * approval before billing is finalised (Req 12.3).
 *
 * Correctness Property 7:
 * ∀ session where session.status === 'completed',
 *   ∃ ledgerEntry where ledgerEntry.bookingId === session.bookingId
 *   ∧ session.ownerApproved === false → billingNotFinalised(session)
 */
export function createUsageRecord(input: SessionUsageInput): UsageRecordResult {
  const { session, usageLogId, billingPolicy, occurredAt } = input;

  const usageLog: ResourceUsageLogInput = {
    bookingId: session.bookingId,
    resourceId: session.hostId,
    userId: session.consumerUid,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    meteredUnits: session.billedDurationMinutes,
    notes: `Remote desktop session ${session.sessionId} completed. Duration: ${session.totalConnectedSeconds}s. Apps used: ${session.applicationsUsed.join(', ') || 'none'}.`,
  };

  const ledgerEntry = buildResourceUsageLedgerEntry(
    usageLogId,
    usageLog,
    billingPolicy,
    occurredAt,
  );

  // Billing is NEVER auto-finalised (Req 12.2, 12.3)
  return {
    ledgerEntry,
    billingFinalised: false,
    autoPayoutProhibited: true,
    humanApprovalRequired: true,
  };
}

// ─── Governance Bridge: Booking Lifecycle Extension (Req 12.5) ──────────────────

/**
 * Extends the booking lifecycle with session-aware transitions.
 *
 * Preserves the existing booking lifecycle (pending → confirmed → completed)
 * by extending it with: confirmed → session_active → session_completed (Req 12.5).
 *
 * Each transition is recorded for audit purposes.
 */
export function extendBookingLifecycle(
  bookingId: string,
  previousStatus: BookingLifecycleStatus,
  newStatus: BookingLifecycleStatus,
  triggeredBy: string,
  sessionId?: string,
): LifecycleTransition {
  // Validate allowed transitions
  const allowedTransitions: Record<BookingLifecycleStatus, BookingLifecycleStatus[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['session_active', 'cancelled'],
    session_active: ['session_completed', 'cancelled'],
    session_completed: ['completed'],
    completed: [],
    cancelled: [],
  };

  const allowed = allowedTransitions[previousStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid booking lifecycle transition: ${previousStatus} → ${newStatus}. ` +
      `Allowed transitions from "${previousStatus}": [${allowed?.join(', ') || 'none'}].`,
    );
  }

  const transition: LifecycleTransition = {
    bookingId,
    previousStatus,
    newStatus,
    transitionedAt: new Date().toISOString(),
    triggeredBy,
    sessionId,
  };

  lifecycleTransitions.push(transition);
  return transition;
}

// ─── Governance Bridge: Unfinalised Billing Detection (Req 12.4) ────────────────

/**
 * Detects records that have not been finalised within the threshold period.
 *
 * If the Resource_Owner does not finalise the usage log within 14 calendar days
 * of session completion, the system SHALL flag the record for Platform_Admin
 * review and SHALL NOT auto-finalise the billing (Req 12.4).
 *
 * @param completedSessions — List of completed sessions with billing info
 * @param thresholdDays — Days before flagging (defaults to 14)
 * @param currentTime — Current time for calculation (defaults to now)
 * @returns Array of unfinalised billing records that exceed the threshold
 */
export function detectUnfinalisedBilling(
  completedSessions: BillingDetectionInput[],
  thresholdDays: number = REMOTE_DESKTOP_DEFAULTS.BILLING_FINALISE_THRESHOLD_DAYS,
  currentTime: string = new Date().toISOString(),
): UnfinalisedBillingRecord[] {
  const now = new Date(currentTime).getTime();
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const flagged: UnfinalisedBillingRecord[] = [];

  for (const session of completedSessions) {
    // Skip already-finalised records
    if (session.billingFinalised) {
      continue;
    }

    const completedAt = new Date(session.completedAt).getTime();
    const elapsed = now - completedAt;

    if (elapsed > thresholdMs) {
      const record: UnfinalisedBillingRecord = {
        bookingId: session.bookingId,
        sessionId: session.sessionId,
        completedAt: session.completedAt,
        daysSinceCompletion: Math.floor(elapsed / (24 * 60 * 60 * 1000)),
        ownerApproved: session.ownerApproved,
        flaggedAt: currentTime,
        requiresAdminReview: true,
      };
      flagged.push(record);
      unfinalisedFlags.push(record);
    }
  }

  return flagged;
}

// ─── Governance Invariant Accessors ─────────────────────────────────────────────

/**
 * Returns true — auto-payout is always prohibited (Req 12.3).
 * This is an invariant that MUST NEVER return false.
 */
export function isAutoPayoutProhibited(): true {
  return true;
}

/**
 * Returns true — human approval is always required (Req 12.1, 12.2).
 * This is an invariant that MUST NEVER return false.
 */
export function isHumanApprovalRequired(): true {
  return true;
}

// ─── Test Helpers ───────────────────────────────────────────────────────────────

/** Clear all in-memory state (for testing) */
export function _clearAllState(): void {
  lifecycleTransitions.length = 0;
  unfinalisedFlags.length = 0;
}

/** Get all lifecycle transitions (for testing/audit) */
export function _getLifecycleTransitions(): LifecycleTransition[] {
  return [...lifecycleTransitions];
}

/** Get all unfinalised flags (for testing) */
export function _getUnfinalisedFlags(): UnfinalisedBillingRecord[] {
  return [...unfinalisedFlags];
}
