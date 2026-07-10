/**
 * Session Gate Service — Multi-Condition Session Start Validation
 *
 * Pure function that evaluates whether a remote desktop session can start.
 * All data is passed in — no Firestore calls, no side effects.
 *
 * The gate checks 5 conditions (4 core + app isolation):
 * 1. Booking is confirmed (status === 'confirmed')
 * 2. Owner has approved (approvedBy is defined)
 * 3. Current time is within the time window (start - 15min to end)
 * 4. Host is online with fresh heartbeat (< 90s, status online or idle)
 * 5. At least one app is configured (appCount > 0)
 *
 * Validates: Requirements 4.1, 4.2, 1.1, 12.1, 12.6
 */

import type { SessionGateInput, SessionGateResult, SessionGateError } from './types';
import { GATE_ERROR_CODES, REMOTE_DESKTOP_DEFAULTS } from './types';

/**
 * Evaluates the session start gate conditions.
 *
 * Returns a structured result indicating whether the session can start,
 * per-condition pass/fail, and any error codes for failed conditions.
 *
 * This is a PURE function — no side effects, no Firestore access.
 */
export function evaluateSessionGate(input: SessionGateInput): SessionGateResult {
  const errors: SessionGateError[] = [];

  // ─── Condition 1: Booking must be confirmed ─────────────────────────────────
  const bookingConfirmed = input.booking.status === 'confirmed';
  if (!bookingConfirmed) {
    errors.push({
      code: GATE_ERROR_CODES.BOOKING_NOT_CONFIRMED,
      message: `Booking status is "${input.booking.status}", expected "confirmed"`,
    });
  }

  // ─── Condition 2: Owner must have approved ──────────────────────────────────
  const ownerApproved = input.booking.approvedBy !== undefined && input.booking.approvedBy !== null;
  if (!ownerApproved) {
    errors.push({
      code: GATE_ERROR_CODES.OWNER_NOT_APPROVED,
      message: 'Booking has not been approved by the resource owner',
    });
  }

  // ─── Condition 3: Current time within booking window ────────────────────────
  // Window opens 15 minutes before start, closes at end
  const currentTimeMs = new Date(input.currentTime).getTime();
  const windowStartMs = new Date(input.booking.startsAt).getTime() - REMOTE_DESKTOP_DEFAULTS.EARLY_JOIN_BUFFER_MS;
  const windowEndMs = new Date(input.booking.endsAt).getTime();

  const withinTimeWindow = currentTimeMs >= windowStartMs && currentTimeMs <= windowEndMs;
  if (!withinTimeWindow) {
    errors.push({
      code: GATE_ERROR_CODES.OUTSIDE_TIME_WINDOW,
      message: 'Current time is outside the allowed session window (start - 15min to end)',
    });
  }

  // ─── Condition 4: Host online with fresh heartbeat ──────────────────────────
  // Host status must be 'online' or 'idle' (design doc Property 1 specifies both)
  // Note: HostStatus type only has 'online' | 'offline' | 'in_session' | 'maintenance'
  // The design doc mentions 'idle' as valid — we treat 'online' as the valid status
  // since the HostStatus enum doesn't include 'idle'. Per the design property,
  // we accept both 'online' and 'idle' for forward compatibility.
  const hostStatusValid = input.host.status === 'online' || (input.host.status as string) === 'idle';
  const lastHeartbeatMs = new Date(input.host.lastHeartbeat).getTime();
  const heartbeatAge = currentTimeMs - lastHeartbeatMs;
  const heartbeatFresh = heartbeatAge < REMOTE_DESKTOP_DEFAULTS.HEARTBEAT_TIMEOUT_MS;

  const hostOnline = hostStatusValid && heartbeatFresh;
  if (!hostOnline) {
    errors.push({
      code: GATE_ERROR_CODES.HOST_OFFLINE,
      message: hostStatusValid
        ? `Host heartbeat is ${Math.round(heartbeatAge / 1000)}s old (max ${REMOTE_DESKTOP_DEFAULTS.HEARTBEAT_TIMEOUT_MS / 1000}s)`
        : `Host status is "${input.host.status}", expected "online" or "idle"`,
    });
  }

  // ─── Condition 5: At least one app configured (App Isolation Invariant) ─────
  const hasApps = input.appCount > 0;
  if (!hasApps) {
    errors.push({
      code: GATE_ERROR_CODES.NO_APPS_CONFIGURED,
      message: 'No applications configured in the App Allowlist for this host',
    });
  }

  // ─── Result ─────────────────────────────────────────────────────────────────
  const canStart = bookingConfirmed && ownerApproved && withinTimeWindow && hostOnline && hasApps;

  return {
    canStart,
    conditions: {
      bookingConfirmed,
      ownerApproved,
      withinTimeWindow,
      hostOnline,
    },
    errors,
  };
}
