/**
 * Remote Desktop Core — Session Broker Service
 *
 * Manages the lifecycle of RemoteDesktopSession objects:
 * - createSession(): Creates a new session with status 'pending'
 * - activateSession(): Transitions from pending to active
 * - endSession(): Transitions to completed/terminated
 * - handleReconnection(): Validates reconnection is allowed
 * - getSession(): Retrieve session by ID
 *
 * State machine:
 * - pending → active (on WebRTC connection established)
 * - active → completed (voluntary disconnect or session ends normally)
 * - active → terminated (forced disconnect: UAC, owner revoke, governance)
 * - pending → failed (connection could not be established within 30s)
 * - No transitions from completed/terminated/failed (terminal states)
 *
 * Governance invariants:
 * - Never auto-confirm bookings
 * - Never auto-generate tokens without owner confirmation
 * - Booking cancellation during active → invalidate token → terminated
 *
 * Requirements: 9.4, 9.5, 14.4
 */

import { randomUUID } from 'node:crypto';
import type { RemoteDesktopSession, RemoteDesktopErrorCode, RemoteDesktopError } from './types';
import { validateToken, revokeToken, type ValidateTokenInput } from './tokenEngine';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type SessionStatus = RemoteDesktopSession['status'];

export type DisconnectionReason =
  | 'user_initiated'
  | 'booking_window_expired'
  | 'uac_terminated'
  | 'connection_lost'
  | 'owner_revoked'
  | 'system_error'
  | 'governance_cancelled'
  | 'connection_failed';

export interface CreateSessionInput {
  bookingId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  tokenId: string;
  windowStart: number;    // Unix ms
  windowEnd: number;      // Unix ms
  gracePeriodSeconds: number;
  projectReference?: string;
}

export interface ActivateSessionInput {
  sessionId: string;
  connectionType: string; // e.g., 'peer-to-peer' or 'turn-relay'
}

export interface EndSessionInput {
  sessionId: string;
  reason: DisconnectionReason;
  terminatedBy: 'consumer' | 'owner' | 'system' | 'governance';
}

export interface ReconnectionInput {
  sessionId: string;
  token: string;
  consumerUid: string;
  hostId: string;
  currentTime?: number; // Unix ms — injectable for testing
}

export interface ReconnectionResult {
  allowed: boolean;
  session?: SessionRecord;
  error?: RemoteDesktopError;
}

/** Internal session record with timing metadata */
export interface SessionRecord {
  sessionId: string;
  bookingId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  tokenId: string;
  projectReference?: string;
  status: SessionStatus;
  connectionType: string;
  startTimestamp: number | null;    // Unix ms
  endTimestamp: number | null;      // Unix ms
  windowStart: number;              // Unix ms
  windowEnd: number;                // Unix ms
  gracePeriodSeconds: number;
  totalConnectedSeconds: number;
  totalDisconnectionGapSeconds: number;
  applicationsUsed: string[];
  filesProducedCount: number;
  disconnectionReason: string;
  ownerApproved: boolean;
  reconnectionAttempts: number;
  lastDisconnectTimestamp: number | null; // Unix ms — for tracking disconnection gaps
  createdAt: number;                // Unix ms
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum reconnection attempts within a booking window + grace period */
const MAX_RECONNECTION_ATTEMPTS = 5;

/** Connection establishment timeout (milliseconds) */
const CONNECTION_TIMEOUT_MS = 30_000;

/** Terminal states — no transitions allowed from these */
const TERMINAL_STATES: ReadonlySet<SessionStatus> = new Set([
  'completed',
  'terminated',
  'failed',
]);

// ─── In-Memory Session Store ────────────────────────────────────────────────────

/** In-memory store (to be backed by Firestore in production) */
const sessions: Map<string, SessionRecord> = new Map();

// ─── Error Factory ──────────────────────────────────────────────────────────────

function createError(
  code: RemoteDesktopErrorCode,
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
): RemoteDesktopError {
  return { code, message, details, retryable };
}

// ─── Session Creation ───────────────────────────────────────────────────────────

/**
 * Create a new session with status 'pending'.
 *
 * Called when a valid Session_Token is presented and signalling begins.
 * The session stays in 'pending' until WebRTC connection is established.
 *
 * Governance: The booking MUST already be in 'confirmed' status.
 * This function does NOT auto-confirm bookings.
 */
export function createSession(input: CreateSessionInput): SessionRecord {
  // Validate required fields
  if (!input.bookingId || !input.hostId || !input.consumerUid || !input.ownerUid || !input.tokenId) {
    throw createError(
      'connection_failed',
      'Missing required fields for session creation',
      {
        bookingId: input.bookingId,
        hostId: input.hostId,
        consumerUid: input.consumerUid,
        ownerUid: input.ownerUid,
        tokenId: input.tokenId,
      },
      true,
    );
  }

  if (input.windowEnd <= input.windowStart) {
    throw createError(
      'connection_failed',
      'Booking window end must be after window start',
      { windowStart: input.windowStart, windowEnd: input.windowEnd },
      false,
    );
  }

  const session: SessionRecord = {
    sessionId: randomUUID(),
    bookingId: input.bookingId,
    hostId: input.hostId,
    consumerUid: input.consumerUid,
    ownerUid: input.ownerUid,
    tokenId: input.tokenId,
    projectReference: input.projectReference,
    status: 'pending',
    connectionType: '',
    startTimestamp: null,
    endTimestamp: null,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    gracePeriodSeconds: input.gracePeriodSeconds,
    totalConnectedSeconds: 0,
    totalDisconnectionGapSeconds: 0,
    applicationsUsed: [],
    filesProducedCount: 0,
    disconnectionReason: '',
    ownerApproved: false,
    reconnectionAttempts: 0,
    lastDisconnectTimestamp: null,
    createdAt: Date.now(),
  };

  sessions.set(session.sessionId, session);
  return session;
}

// ─── Session Activation ─────────────────────────────────────────────────────────

/**
 * Transition session from 'pending' to 'active'.
 *
 * Called when WebRTC connection is successfully established.
 * Records the start timestamp and connection type.
 *
 * Valid transition: pending → active
 */
export function activateSession(input: ActivateSessionInput): SessionRecord {
  const session = sessions.get(input.sessionId);

  if (!session) {
    throw createError(
      'connection_failed',
      `Session not found: ${input.sessionId}`,
      { sessionId: input.sessionId },
      false,
    );
  }

  if (session.status !== 'pending') {
    throw createError(
      'connection_failed',
      `Cannot activate session in '${session.status}' state. Only 'pending' sessions can be activated.`,
      { sessionId: input.sessionId, currentStatus: session.status },
      false,
    );
  }

  if (!input.connectionType) {
    throw createError(
      'connection_failed',
      'Connection type is required when activating a session',
      { sessionId: input.sessionId },
      false,
    );
  }

  session.status = 'active';
  session.startTimestamp = Date.now();
  session.connectionType = input.connectionType;

  return session;
}

// ─── Session End ────────────────────────────────────────────────────────────────

/**
 * End a session by transitioning to 'completed' or 'terminated'.
 *
 * - 'completed': voluntary disconnect or session ends normally
 * - 'terminated': forced disconnect (UAC, owner revoke, governance)
 *
 * Valid transitions: active → completed, active → terminated
 * Also: pending → failed (handled by failSession)
 */
export function endSession(input: EndSessionInput): SessionRecord {
  const session = sessions.get(input.sessionId);

  if (!session) {
    throw createError(
      'connection_failed',
      `Session not found: ${input.sessionId}`,
      { sessionId: input.sessionId },
      false,
    );
  }

  if (TERMINAL_STATES.has(session.status)) {
    throw createError(
      'connection_failed',
      `Cannot end session in terminal state '${session.status}'.`,
      { sessionId: input.sessionId, currentStatus: session.status },
      false,
    );
  }

  if (session.status === 'pending') {
    throw createError(
      'connection_failed',
      `Cannot end a 'pending' session. Use failSession() for pending → failed transitions.`,
      { sessionId: input.sessionId, currentStatus: session.status },
      false,
    );
  }

  const now = Date.now();

  // Determine target status based on reason
  const isVoluntary = input.reason === 'user_initiated' || input.reason === 'booking_window_expired';
  session.status = isVoluntary ? 'completed' : 'terminated';
  session.endTimestamp = now;
  session.disconnectionReason = input.reason;

  // Calculate connected seconds if we have a start timestamp
  if (session.startTimestamp) {
    const rawDurationMs = now - session.startTimestamp;
    session.totalConnectedSeconds = Math.floor(rawDurationMs / 1000) - session.totalDisconnectionGapSeconds;
    if (session.totalConnectedSeconds < 0) {
      session.totalConnectedSeconds = 0;
    }
  }

  return session;
}

// ─── Session Failure ────────────────────────────────────────────────────────────

/**
 * Transition session from 'pending' to 'failed'.
 *
 * Called when WebRTC connection could not be established within timeout.
 *
 * Valid transition: pending → failed
 */
export function failSession(sessionId: string, reason = 'connection_failed'): SessionRecord {
  const session = sessions.get(sessionId);

  if (!session) {
    throw createError(
      'connection_failed',
      `Session not found: ${sessionId}`,
      { sessionId },
      false,
    );
  }

  if (session.status !== 'pending') {
    throw createError(
      'connection_failed',
      `Cannot fail session in '${session.status}' state. Only 'pending' sessions can be failed.`,
      { sessionId, currentStatus: session.status },
      false,
    );
  }

  session.status = 'failed';
  session.endTimestamp = Date.now();
  session.disconnectionReason = reason;

  return session;
}

// ─── Reconnection Handling ──────────────────────────────────────────────────────

/**
 * Handle a reconnection attempt.
 *
 * Requirements 9.4, 9.5:
 * - Token remains valid for reconnection until window end + grace period
 * - Maximum 5 reconnection attempts within that window
 * - Applies whether disconnect is before or after booking window end
 *
 * Validates:
 * 1. Session exists and is in 'active' status (disconnected but not ended)
 * 2. Current time is within booking window + grace period
 * 3. Reconnection attempts have not exceeded maximum (5)
 * 4. Token is still valid (not revoked, not expired)
 */
export function handleReconnection(input: ReconnectionInput): ReconnectionResult {
  const now = input.currentTime ?? Date.now();
  const session = sessions.get(input.sessionId);

  if (!session) {
    return {
      allowed: false,
      error: createError(
        'connection_failed',
        `Session not found: ${input.sessionId}`,
        { sessionId: input.sessionId },
        false,
      ),
    };
  }

  // Only allow reconnection for active sessions
  if (session.status !== 'active') {
    return {
      allowed: false,
      error: createError(
        'connection_failed',
        `Cannot reconnect to session in '${session.status}' state. Only 'active' sessions allow reconnection.`,
        { sessionId: input.sessionId, currentStatus: session.status },
        false,
      ),
    };
  }

  // Check if within booking window + grace period
  const reconnectionDeadline = session.windowEnd + (session.gracePeriodSeconds * 1000);
  if (now > reconnectionDeadline) {
    return {
      allowed: false,
      error: createError(
        'booking_window_expired',
        'Reconnection window has expired. The booking window plus grace period has ended.',
        {
          sessionId: input.sessionId,
          windowEnd: session.windowEnd,
          gracePeriodSeconds: session.gracePeriodSeconds,
          reconnectionDeadline,
          currentTime: now,
        },
        false,
      ),
    };
  }

  // Check reconnection attempt limit
  if (session.reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
    return {
      allowed: false,
      error: createError(
        'connection_failed',
        `Maximum reconnection attempts (${MAX_RECONNECTION_ATTEMPTS}) exceeded.`,
        {
          sessionId: input.sessionId,
          reconnectionAttempts: session.reconnectionAttempts,
          maxAttempts: MAX_RECONNECTION_ATTEMPTS,
        },
        false,
      ),
    };
  }

  // Validate token is still valid for this reconnection
  const tokenValidation = validateToken({
    token: input.token,
    consumerUid: input.consumerUid,
    hostId: input.hostId,
    currentTime: now,
  });

  if (!tokenValidation.valid) {
    return {
      allowed: false,
      error: tokenValidation.error,
    };
  }

  // All checks passed — increment reconnection counter and track gap
  session.reconnectionAttempts += 1;

  // Track disconnection gap if we have a last disconnect timestamp
  if (session.lastDisconnectTimestamp) {
    const gapSeconds = Math.floor((now - session.lastDisconnectTimestamp) / 1000);
    session.totalDisconnectionGapSeconds += gapSeconds;
    session.lastDisconnectTimestamp = null; // Reset for next potential disconnect
  }

  return {
    allowed: true,
    session,
  };
}

/**
 * Record a voluntary disconnect (for reconnection tracking).
 *
 * Called when the consumer disconnects voluntarily but the session
 * remains active for potential reconnection.
 */
export function recordDisconnect(sessionId: string, currentTime?: number): SessionRecord {
  const now = currentTime ?? Date.now();
  const session = sessions.get(sessionId);

  if (!session) {
    throw createError(
      'connection_failed',
      `Session not found: ${sessionId}`,
      { sessionId },
      false,
    );
  }

  if (session.status !== 'active') {
    throw createError(
      'connection_failed',
      `Cannot record disconnect for session in '${session.status}' state.`,
      { sessionId, currentStatus: session.status },
      false,
    );
  }

  session.lastDisconnectTimestamp = now;
  return session;
}

// ─── Governance: Booking Cancellation ───────────────────────────────────────────

/**
 * Handle booking cancellation during an active session.
 *
 * Requirement 14.4:
 * - Booking cancellation during active state → invalidate token → terminated
 *
 * Governance invariant:
 * - Booking status changed to "cancelled" or "revoked" while token is active
 * - Session_Broker SHALL immediately invalidate the associated Session_Token
 * - Transition session to "terminated" with reason "governance_cancelled"
 */
export function handleBookingCancellation(sessionId: string): SessionRecord {
  const session = sessions.get(sessionId);

  if (!session) {
    throw createError(
      'connection_failed',
      `Session not found: ${sessionId}`,
      { sessionId },
      false,
    );
  }

  if (TERMINAL_STATES.has(session.status)) {
    throw createError(
      'connection_failed',
      `Cannot cancel booking for session in terminal state '${session.status}'.`,
      { sessionId, currentStatus: session.status },
      false,
    );
  }

  // Revoke the token
  revokeToken(session.tokenId);

  // Transition to terminated
  session.status = 'terminated';
  session.endTimestamp = Date.now();
  session.disconnectionReason = 'governance_cancelled';

  // Calculate connected seconds if session was active
  if (session.startTimestamp) {
    const rawDurationMs = (session.endTimestamp) - session.startTimestamp;
    session.totalConnectedSeconds = Math.floor(rawDurationMs / 1000) - session.totalDisconnectionGapSeconds;
    if (session.totalConnectedSeconds < 0) {
      session.totalConnectedSeconds = 0;
    }
  }

  return session;
}

// ─── Session Retrieval ──────────────────────────────────────────────────────────

/**
 * Retrieve a session by ID.
 */
export function getSession(sessionId: string): SessionRecord | undefined {
  return sessions.get(sessionId);
}

/**
 * Retrieve all sessions for a given host.
 */
export function getSessionsByHost(hostId: string): SessionRecord[] {
  return Array.from(sessions.values()).filter(s => s.hostId === hostId);
}

/**
 * Retrieve all sessions for a given consumer.
 */
export function getSessionsByConsumer(consumerUid: string): SessionRecord[] {
  return Array.from(sessions.values()).filter(s => s.consumerUid === consumerUid);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────────

/**
 * Check if a session status is a terminal state.
 */
export function isTerminalState(status: SessionStatus): boolean {
  return TERMINAL_STATES.has(status);
}

/**
 * Get the maximum reconnection attempts allowed.
 */
export function getMaxReconnectionAttempts(): number {
  return MAX_RECONNECTION_ATTEMPTS;
}

/**
 * Get the connection timeout in milliseconds.
 */
export function getConnectionTimeoutMs(): number {
  return CONNECTION_TIMEOUT_MS;
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Clear all sessions (for testing only).
 * @internal
 */
export function _clearAllSessions(): void {
  sessions.clear();
}

/**
 * Get the number of sessions in the store (for testing only).
 * @internal
 */
export function _getSessionCount(): number {
  return sessions.size;
}
