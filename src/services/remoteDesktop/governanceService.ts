/**
 * Remote Desktop Core — Governance Service
 *
 * Enforces platform governance invariants for session-level token generation.
 * This service is the gatekeeper between the marketplace booking layer and
 * the token engine — no token can be generated without passing these checks.
 *
 * Critical governance invariants (must NEVER be bypassed):
 * - humanApprovalRequired: Bookings must be confirmed by a human (Resource_Owner)
 * - autoConfirmProhibited: No automatic booking confirmation
 * - autoPayoutProhibited: No automatic billing finalisation
 *
 * Exported functions:
 * - validateBookingForTokenGeneration: Pre-token-generation gate
 * - handleBookingCancellation: Booking cancelled → token revocation within 5s
 * - detectBookingConflict: Conflict detected → refuse token generation
 *
 * Requirements: 14.1, 14.3, 14.5, 14.6
 */

import type { RemoteDesktopError, RemoteDesktopErrorCode } from './types';
import { revokeToken } from './tokenEngine';
import {
  getSession,
  handleBookingCancellation as brokerHandleBookingCancellation,
  type SessionRecord,
} from './sessionBrokerService';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Minimal booking shape needed for governance validation */
export interface GovernanceBooking {
  id: string;
  status: string;
  ownerId: string;
  consumerId: string;
  startsAt: string;
  endsAt: string;
  confirmedAt?: string;
  projectReference?: string;
}

/** Result of booking validation for token generation */
export interface BookingValidationResult {
  valid: boolean;
  booking?: GovernanceBooking;
  error?: RemoteDesktopError;
  denialReason?: GovernanceDenialReason;
}

/** Denial reasons for token generation refusal */
export type GovernanceDenialReason =
  | 'awaiting_owner_confirmation'
  | 'booking_conflict'
  | 'booking_cancelled'
  | 'booking_expired'
  | 'booking_declined'
  | 'auto_confirm_prohibited';

/** Result of booking cancellation governance action */
export interface CancellationResult {
  success: boolean;
  tokenRevoked: boolean;
  sessionTerminated: boolean;
  revokedWithinDeadline: boolean;
  session?: SessionRecord;
  error?: RemoteDesktopError;
}

/** Result of booking conflict detection */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictingBookingId?: string;
  error?: RemoteDesktopError;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum time (ms) allowed for token revocation after booking cancellation */
const TOKEN_REVOCATION_DEADLINE_MS = 5_000;

// ─── Error Factory ──────────────────────────────────────────────────────────────

function createError(
  code: RemoteDesktopErrorCode,
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
): RemoteDesktopError {
  return { code, message, details, retryable };
}

// ─── Governance: Validate Booking for Token Generation ──────────────────────────

/**
 * Validate that a booking satisfies all governance invariants before
 * allowing token generation.
 *
 * Checks:
 * 1. Booking status MUST be "confirmed" (Req 14.1)
 * 2. humanApprovalRequired: confirmedAt must be present (human confirmed it)
 * 3. autoConfirmProhibited: no auto-confirm path (Req 14.5)
 * 4. Booking must not be in a cancelled/expired/declined state
 *
 * @param booking - The booking to validate
 * @returns Validation result with denial reason if invalid
 */
export function validateBookingForTokenGeneration(
  booking: GovernanceBooking,
): BookingValidationResult {
  if (!booking || !booking.id) {
    return {
      valid: false,
      error: createError(
        'token_generation_failed',
        'Booking record is required for token generation',
        { bookingId: booking?.id },
        false,
      ),
    };
  }

  // Check for cancelled bookings
  if (booking.status === 'cancelled_by_consumer') {
    return {
      valid: false,
      denialReason: 'booking_cancelled',
      error: createError(
        'token_generation_failed',
        'Cannot generate token for a cancelled booking',
        { bookingId: booking.id, status: booking.status },
        false,
      ),
    };
  }

  // Check for expired bookings
  if (booking.status === 'expired' || booking.status === 'conflict_expired') {
    return {
      valid: false,
      denialReason: 'booking_expired',
      error: createError(
        'token_generation_failed',
        'Cannot generate token for an expired booking',
        { bookingId: booking.id, status: booking.status },
        false,
      ),
    };
  }

  // Check for declined bookings
  if (booking.status === 'declined') {
    return {
      valid: false,
      denialReason: 'booking_declined',
      error: createError(
        'token_generation_failed',
        'Cannot generate token for a declined booking',
        { bookingId: booking.id, status: booking.status },
        false,
      ),
    };
  }

  // Enforce humanApprovalRequired: status must be "confirmed"
  // This is the critical governance gate — Req 14.1, 14.5
  if (booking.status !== 'confirmed') {
    // If still pending owner confirmation, that's the specific denial reason
    if (booking.status === 'pending_owner_confirmation') {
      return {
        valid: false,
        denialReason: 'awaiting_owner_confirmation',
        error: createError(
          'token_generation_failed',
          'Booking requires owner confirmation before token generation (humanApprovalRequired)',
          { bookingId: booking.id, status: booking.status },
          false,
        ),
      };
    }

    // Any other non-confirmed status is auto-confirm-prohibited territory
    return {
      valid: false,
      denialReason: 'auto_confirm_prohibited',
      error: createError(
        'token_generation_failed',
        'Token generation prohibited: booking is not in confirmed status (autoConfirmProhibited)',
        { bookingId: booking.id, status: booking.status },
        false,
      ),
    };
  }

  // Enforce humanApprovalRequired: a confirmed booking must have confirmedAt
  // This ensures a human actually confirmed it, not an automated process
  if (!booking.confirmedAt) {
    return {
      valid: false,
      denialReason: 'auto_confirm_prohibited',
      error: createError(
        'token_generation_failed',
        'Booking lacks confirmation timestamp — possible auto-confirm bypass (autoConfirmProhibited)',
        { bookingId: booking.id, status: booking.status },
        false,
      ),
    };
  }

  // All governance checks passed
  return {
    valid: true,
    booking,
  };
}

// ─── Governance: Booking Cancellation → Token Revocation ────────────────────────

/**
 * Handle booking cancellation with governance enforcement.
 *
 * Requirement 14.6:
 * - Booking status changes to "cancelled" or "revoked" while Session_Token is active
 * - Session_Broker SHALL immediately invalidate the associated Session_Token
 *   within 5 seconds
 * - Session status transitions to "terminated_governance"
 * - Usage logs recorded up to that point are preserved
 *
 * This function orchestrates:
 * 1. Token revocation (immediate)
 * 2. Session termination via broker
 * 3. Timing validation (must complete within 5 seconds)
 *
 * @param sessionId - The session to terminate due to booking cancellation
 * @param tokenId - The token to revoke (if sessionId lookup fails)
 * @returns CancellationResult with success/timing information
 */
export function handleGovernanceCancellation(
  sessionId: string,
  tokenId?: string,
): CancellationResult {
  const startTime = Date.now();

  try {
    // Try to get the session for full context
    const session = getSession(sessionId);

    if (!session) {
      // If we have a tokenId, revoke it directly even without a session
      if (tokenId) {
        revokeToken(tokenId);
        const elapsed = Date.now() - startTime;
        return {
          success: true,
          tokenRevoked: true,
          sessionTerminated: false,
          revokedWithinDeadline: elapsed <= TOKEN_REVOCATION_DEADLINE_MS,
        };
      }

      return {
        success: false,
        tokenRevoked: false,
        sessionTerminated: false,
        revokedWithinDeadline: false,
        error: createError(
          'connection_failed',
          `Session not found: ${sessionId}`,
          { sessionId },
          false,
        ),
      };
    }

    // Delegate to broker for full session termination + token revocation
    const terminatedSession = brokerHandleBookingCancellation(sessionId);

    const elapsed = Date.now() - startTime;
    const withinDeadline = elapsed <= TOKEN_REVOCATION_DEADLINE_MS;

    return {
      success: true,
      tokenRevoked: true,
      sessionTerminated: true,
      revokedWithinDeadline: withinDeadline,
      session: terminatedSession,
    };
  } catch (error) {
    // Even on error, try to revoke the token directly if we have info
    const effectiveTokenId = tokenId ?? getSession(sessionId)?.tokenId;
    if (effectiveTokenId) {
      try {
        revokeToken(effectiveTokenId);
      } catch {
        // Token revocation failed — critical governance failure
      }
    }

    const elapsed = Date.now() - startTime;

    return {
      success: false,
      tokenRevoked: !!effectiveTokenId,
      sessionTerminated: false,
      revokedWithinDeadline: elapsed <= TOKEN_REVOCATION_DEADLINE_MS,
      error: (error as RemoteDesktopError).code
        ? (error as RemoteDesktopError)
        : createError(
            'connection_failed',
            'Governance cancellation failed',
            { sessionId, originalError: String(error) },
            true,
          ),
    };
  }
}

// ─── Governance: Booking Conflict Detection → Token Refusal ─────────────────────

/**
 * Detect booking conflicts and refuse token generation.
 *
 * Requirement 14.3:
 * - When a booking conflict is detected by the marketplace `hasBookingConflict`
 *   function, the Session_Broker SHALL refuse to generate Session_Tokens
 *   for the conflicting booking and return an error specifying the conflicting
 *   booking reference.
 *
 * This function checks whether the proposed booking overlaps with any existing
 * confirmed/active bookings on the same resource.
 *
 * @param proposedBooking - The booking requesting a token
 * @param existingBookings - All bookings for the same resource/host
 * @returns ConflictDetectionResult indicating whether a conflict exists
 */
export function detectBookingConflict(
  proposedBooking: GovernanceBooking,
  existingBookings: GovernanceBooking[],
): ConflictDetectionResult {
  if (!proposedBooking || !proposedBooking.id) {
    return {
      hasConflict: false,
      error: createError(
        'token_generation_failed',
        'Proposed booking is required for conflict detection',
        {},
        false,
      ),
    };
  }

  const proposedStart = new Date(proposedBooking.startsAt).getTime();
  const proposedEnd = new Date(proposedBooking.endsAt).getTime();

  // Check for time overlap with existing confirmed/active bookings
  // Exclude the proposed booking itself from the check
  for (const existing of existingBookings) {
    if (existing.id === proposedBooking.id) {
      continue;
    }

    // Only consider bookings that occupy time slots (confirmed or active)
    if (
      existing.status !== 'confirmed' &&
      existing.status !== 'active' &&
      existing.status !== 'pending_owner_confirmation'
    ) {
      continue;
    }

    const existingStart = new Date(existing.startsAt).getTime();
    const existingEnd = new Date(existing.endsAt).getTime();

    // Overlap: proposedStart < existingEnd && proposedEnd > existingStart
    if (proposedStart < existingEnd && proposedEnd > existingStart) {
      return {
        hasConflict: true,
        conflictingBookingId: existing.id,
        error: createError(
          'token_generation_failed',
          `Booking conflict detected with booking ${existing.id}`,
          {
            proposedBookingId: proposedBooking.id,
            conflictingBookingId: existing.id,
            proposedStart: proposedBooking.startsAt,
            proposedEnd: proposedBooking.endsAt,
            conflictStart: existing.startsAt,
            conflictEnd: existing.endsAt,
          },
          false,
        ),
      };
    }
  }

  return {
    hasConflict: false,
  };
}

// ─── Combined Governance Gate ───────────────────────────────────────────────────

/**
 * Full governance validation gate for token generation.
 *
 * Combines all checks into a single entry point:
 * 1. Validate booking status = "confirmed" (Req 14.1)
 * 2. Enforce humanApprovalRequired invariant (Req 14.5)
 * 3. Enforce autoConfirmProhibited invariant (Req 14.5)
 * 4. Detect booking conflicts (Req 14.3)
 *
 * Call this before generateToken() to enforce all governance invariants.
 *
 * @param booking - The booking requesting token generation
 * @param existingBookings - All bookings for the same host/resource (for conflict check)
 * @returns BookingValidationResult — if valid=true, token generation may proceed
 */
export function validateGovernanceForTokenGeneration(
  booking: GovernanceBooking,
  existingBookings: GovernanceBooking[],
): BookingValidationResult {
  // Step 1–3: Validate booking status and governance invariants
  const statusValidation = validateBookingForTokenGeneration(booking);
  if (!statusValidation.valid) {
    return statusValidation;
  }

  // Step 4: Check for booking conflicts
  const conflictResult = detectBookingConflict(booking, existingBookings);
  if (conflictResult.hasConflict) {
    return {
      valid: false,
      denialReason: 'booking_conflict',
      error: conflictResult.error,
    };
  }

  // All governance gates passed
  return {
    valid: true,
    booking,
  };
}

// ─── Constants Export (for testing) ─────────────────────────────────────────────

export const GOVERNANCE_CONSTANTS = {
  TOKEN_REVOCATION_DEADLINE_MS,
} as const;
