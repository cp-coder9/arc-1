/**
 * Remote Desktop Core — Orchestration Entry Point
 *
 * Central service module providing placeholder exports for all remote desktop
 * session lifecycle operations. Individual implementations will be filled in
 * by subsequent tasks (Token Engine, Session Broker, Audit, Billing, File Handoff).
 */

import type {
  RemoteDesktopSession,
  RemoteDesktopSessionEvent,
  RemoteDesktopFileManifest,
  SessionTokenPayload,
  RemoteDesktopError,
} from './types';

// ─── Token Engine ───────────────────────────────────────────────────────────────

/**
 * Generate a session token for a confirmed booking.
 * Implemented in tokenEngine.ts (Task 2.1).
 */
export function generateSessionToken(
  _bookingId: string,
  _consumerUid: string,
  _hostId: string,
  _windowStart: number,
  _windowEnd: number,
  _gracePeriodSeconds: number,
): SessionTokenPayload {
  throw new Error('Not implemented');
}

/**
 * Validate a session token string, checking signature, expiry, and scope.
 * Implemented in tokenEngine.ts (Task 2.1).
 */
export function validateSessionToken(
  _token: string,
  _consumerUid: string,
  _hostId: string,
): { valid: boolean; payload?: SessionTokenPayload; error?: RemoteDesktopError } {
  throw new Error('Not implemented');
}

/**
 * Revoke a session token (e.g., on booking cancellation).
 * Implemented in tokenEngine.ts (Task 2.1).
 */
export function revokeSessionToken(_tokenId: string): void {
  throw new Error('Not implemented');
}

// ─── Session Lifecycle ──────────────────────────────────────────────────────────

/**
 * Create a new remote desktop session from a confirmed booking.
 * Implemented in sessionBrokerService.ts (Task 3.2).
 */
export function createSession(
  _bookingId: string,
  _consumerUid: string,
  _ownerUid: string,
  _hostId: string,
  _tokenId: string,
): RemoteDesktopSession {
  throw new Error('Not implemented');
}

/**
 * End an active session (voluntary disconnect or auto-disconnect).
 * Implemented in sessionBrokerService.ts (Task 3.2).
 */
export function endSession(
  _sessionId: string,
  _reason: string,
): RemoteDesktopSession {
  throw new Error('Not implemented');
}

/**
 * Retrieve the current state of a session.
 * Implemented in sessionBrokerService.ts (Task 3.2).
 */
export function getSessionState(
  _sessionId: string,
): RemoteDesktopSession | null {
  throw new Error('Not implemented');
}

// ─── Audit Logging ──────────────────────────────────────────────────────────────

/**
 * Write an audit event to the Activity_Log (remote_desktop_session_events).
 * Implemented in sessionAuditService.ts (Task 6.1).
 */
export function writeAuditEvent(
  _event: Omit<RemoteDesktopSessionEvent, 'eventId'>,
): RemoteDesktopSessionEvent {
  throw new Error('Not implemented');
}

/**
 * Query audit events for a session, respecting role-scoped access.
 * Implemented in sessionAuditService.ts (Task 6.1).
 */
export function queryAuditEvents(
  _sessionId: string,
  _actorUid: string,
  _actorRole: string,
  _pagination?: { limit: number; offset: number },
): RemoteDesktopSessionEvent[] {
  throw new Error('Not implemented');
}

// ─── Billing ────────────────────────────────────────────────────────────────────

/**
 * Calculate billing duration for a completed session.
 * Implemented in sessionBillingService.ts (Task 16.1).
 */
export function calculateBilling(
  _sessionId: string,
): { billedDurationMinutes: number; actualConnectedSeconds: number } {
  throw new Error('Not implemented');
}

// ─── File Handoff ───────────────────────────────────────────────────────────────

/**
 * Get the file manifest for a session.
 * Implemented in fileHandoffService.ts (Task 15.1).
 */
export function getFileManifest(
  _sessionId: string,
): RemoteDesktopFileManifest | null {
  throw new Error('Not implemented');
}

/**
 * Approve files for handoff from the session workspace to FileManager.
 * Implemented in fileHandoffService.ts (Task 15.2).
 */
export function approveFileHandoff(
  _manifestId: string,
  _approvedFileNames: string[],
  _ownerUid: string,
): RemoteDesktopFileManifest {
  throw new Error('Not implemented');
}
