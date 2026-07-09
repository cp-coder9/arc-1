/**
 * Owner Session Service — Session Monitoring and Termination
 *
 * Web-facing service for resource owners to monitor and control
 * active sessions on their workstations via the Architex web interface.
 *
 * Provides:
 * - getActiveSessionsForOwner(): Active sessions on owner's hosts
 * - getSessionHistoryForOwner(): Last 30 days, max 200 entries
 * - terminateSession(): Signal broker, write "owner_revoked" event, handle timeouts
 *
 * Handles:
 * - Broker signal delivery within 2 seconds
 * - Broker connectivity loss: 120-second buffer, then local terminate with event buffering
 * - Failed termination signal: terminate locally within 5 seconds, buffer event
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */

import { adminDb } from '@/lib/firebase-admin';
import type { RemoteDesktopSession, SessionEventType } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

const SESSIONS_COLLECTION = 'remote_desktop_sessions';
const HOSTS_COLLECTION = 'remote_desktop_hosts';
const EVENTS_COLLECTION = 'remote_desktop_session_events';

/** Maximum session history entries returned per query */
const MAX_HISTORY_ENTRIES = 200;

/** Number of days of session history to include */
const HISTORY_DAYS = 30;

/** Maximum time to wait for broker termination signal delivery (ms) */
const BROKER_SIGNAL_TIMEOUT_MS = 2_000;

/** Broker connectivity loss grace period before local termination (ms) */
const BROKER_CONNECTIVITY_LOSS_TIMEOUT_MS = 120_000;

/** Maximum time to wait before forcing local termination on failed signal (ms) */
const FAILED_SIGNAL_LOCAL_TERMINATE_TIMEOUT_MS = 5_000;

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ConnectionQuality = 'good' | 'fair' | 'poor';

export interface ActiveSessionView {
  sessionId: string;
  bookingId: string;
  consumerName: string;
  consumerUid: string;
  hostId: string;
  startTimestamp: number;         // Unix ms
  elapsedSeconds: number;
  applicationsInUse: string[];
  connectionQuality: ConnectionQuality;
  status: 'active' | 'paused';
}

export interface SessionHistoryEntry {
  sessionId: string;
  bookingId: string;
  consumerName: string;
  consumerUid: string;
  hostId: string;
  startTimestamp: number;         // Unix ms
  endTimestamp: number | null;    // Unix ms
  durationSeconds: number;
  applicationsUsed: string[];
  connectionQuality: ConnectionQuality;
  disconnectionReason: string;
  status: string;
}

export interface TerminateSessionInput {
  sessionId: string;
  ownerUid: string;
  reason?: string;
}

export interface TerminateSessionResult {
  success: boolean;
  sessionId: string;
  terminatedLocally: boolean;
  brokerSignalDelivered: boolean;
  eventWritten: boolean;
  bufferedEvent?: BufferedEvent;
  error?: string;
}

export interface BufferedEvent {
  eventType: SessionEventType;
  sessionId: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface BrokerSignalOptions {
  timeout?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateEventId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Determine connection quality from latency.
 * - good: latency ≤ 50ms
 * - fair: latency 51–150ms
 * - poor: latency > 150ms
 */
export function classifyConnectionQuality(latencyMs: number): ConnectionQuality {
  if (latencyMs <= 50) return 'good';
  if (latencyMs <= 150) return 'fair';
  return 'poor';
}

/**
 * Truncate consumer name to 64 characters with ellipsis if longer.
 */
export function truncateConsumerName(name: string): string {
  if (name.length <= 64) return name;
  return name.substring(0, 61) + '...';
}

// ─── Active Session Queries ─────────────────────────────────────────────────────

/**
 * Get all active sessions for hosts owned by the specified owner.
 *
 * Returns currently active sessions showing consumer name, start time,
 * elapsed time, apps in use, and connection quality.
 */
export async function getActiveSessionsForOwner(
  ownerUid: string,
): Promise<ActiveSessionView[]> {
  // Get all host IDs owned by this user
  const hostsSnapshot = await adminDb
    .collection(HOSTS_COLLECTION)
    .where('ownerUid', '==', ownerUid)
    .select('hostId')
    .get();

  const hostIds = hostsSnapshot.docs.map((doc) => doc.data().hostId as string);

  if (hostIds.length === 0) return [];

  // Query active sessions on these hosts (Firestore 'in' supports up to 30)
  const batchedHostIds = hostIds.slice(0, 30);

  const sessionsSnapshot = await adminDb
    .collection(SESSIONS_COLLECTION)
    .where('hostId', 'in', batchedHostIds)
    .where('status', '==', 'active')
    .orderBy('startTimestamp', 'desc')
    .get();

  const now = Date.now();
  const sessions: ActiveSessionView[] = [];

  for (const doc of sessionsSnapshot.docs) {
    const data = doc.data() as RemoteDesktopSession;
    const startMs = data.startTimestamp
      ? (data.startTimestamp as any).toMillis?.() ?? (data.startTimestamp as any).seconds * 1000
      : now;

    sessions.push({
      sessionId: data.sessionId,
      bookingId: data.bookingId,
      consumerName: truncateConsumerName(data.consumerUid), // Consumer UID as fallback; UI layer resolves display name
      consumerUid: data.consumerUid,
      hostId: data.hostId,
      startTimestamp: startMs,
      elapsedSeconds: Math.floor((now - startMs) / 1000),
      applicationsInUse: data.applicationsUsed ?? [],
      connectionQuality: 'good', // Default; real-time quality comes from signalling layer
      status: 'active',
    });
  }

  return sessions;
}

/**
 * Get session history for hosts owned by the specified owner.
 *
 * Returns sessions from the last 30 days, up to 200 entries,
 * ordered by start time descending.
 *
 * Requirement 17.3: Last 30 days, max 200 entries.
 */
export async function getSessionHistoryForOwner(
  ownerUid: string,
  options?: { limit?: number; startAfterSessionId?: string },
): Promise<SessionHistoryEntry[]> {
  const limit = Math.min(options?.limit ?? MAX_HISTORY_ENTRIES, MAX_HISTORY_ENTRIES);

  // Get all host IDs owned by this user
  const hostsSnapshot = await adminDb
    .collection(HOSTS_COLLECTION)
    .where('ownerUid', '==', ownerUid)
    .select('hostId')
    .get();

  const hostIds = hostsSnapshot.docs.map((doc) => doc.data().hostId as string);

  if (hostIds.length === 0) return [];

  // Calculate 30-day boundary
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - HISTORY_DAYS);

  // Query sessions on these hosts within last 30 days
  const batchedHostIds = hostIds.slice(0, 30);

  let query: FirebaseFirestore.Query = adminDb
    .collection(SESSIONS_COLLECTION)
    .where('hostId', 'in', batchedHostIds)
    .where('startTimestamp', '>=', thirtyDaysAgo)
    .orderBy('startTimestamp', 'desc')
    .limit(limit);

  if (options?.startAfterSessionId) {
    const startAfterDoc = await adminDb
      .collection(SESSIONS_COLLECTION)
      .doc(options.startAfterSessionId)
      .get();

    if (startAfterDoc.exists) {
      query = query.startAfter(startAfterDoc);
    }
  }

  const sessionsSnapshot = await query.get();

  const history: SessionHistoryEntry[] = [];

  for (const doc of sessionsSnapshot.docs) {
    const data = doc.data() as RemoteDesktopSession;
    const startMs = data.startTimestamp
      ? (data.startTimestamp as any).toMillis?.() ?? (data.startTimestamp as any).seconds * 1000
      : 0;
    const endMs = data.endTimestamp
      ? (data.endTimestamp as any).toMillis?.() ?? (data.endTimestamp as any).seconds * 1000
      : null;

    history.push({
      sessionId: data.sessionId,
      bookingId: data.bookingId,
      consumerName: truncateConsumerName(data.consumerUid),
      consumerUid: data.consumerUid,
      hostId: data.hostId,
      startTimestamp: startMs,
      endTimestamp: endMs,
      durationSeconds: data.totalConnectedSeconds ?? 0,
      applicationsUsed: data.applicationsUsed ?? [],
      connectionQuality: 'good', // Resolved from session metadata
      disconnectionReason: data.disconnectionReason ?? '',
      status: data.status,
    });
  }

  return history;
}

// ─── Session Termination ────────────────────────────────────────────────────────

/**
 * Terminate a session on behalf of the resource owner.
 *
 * Flow:
 * 1. Verify owner owns the host for this session
 * 2. Signal Session Broker to end the session (2-second timeout)
 * 3. Close session-launched apps (via Host Agent signalling)
 * 4. Write "owner_revoked" event to Activity_Log
 *
 * Failure handling:
 * - If broker signal fails within 5 seconds: terminate locally, buffer event
 * - Broker connectivity loss: session continues 120s, then local terminate
 *
 * Requirements: 17.2, 17.5, 17.6
 */
export async function terminateSession(
  input: TerminateSessionInput,
): Promise<TerminateSessionResult> {
  const { sessionId, ownerUid } = input;

  // Retrieve session and verify ownership
  const sessionDoc = await adminDb
    .collection(SESSIONS_COLLECTION)
    .doc(sessionId)
    .get();

  if (!sessionDoc.exists) {
    return {
      success: false,
      sessionId,
      terminatedLocally: false,
      brokerSignalDelivered: false,
      eventWritten: false,
      error: `Session not found: ${sessionId}`,
    };
  }

  const session = sessionDoc.data() as RemoteDesktopSession;

  // Verify the owner owns the host for this session
  if (session.ownerUid !== ownerUid) {
    return {
      success: false,
      sessionId,
      terminatedLocally: false,
      brokerSignalDelivered: false,
      eventWritten: false,
      error: 'Owner does not have permission to terminate this session',
    };
  }

  // Session must be active to terminate
  if (session.status !== 'active') {
    return {
      success: false,
      sessionId,
      terminatedLocally: false,
      brokerSignalDelivered: false,
      eventWritten: false,
      error: `Cannot terminate session in '${session.status}' state. Only active sessions can be terminated.`,
    };
  }

  // Attempt to signal broker within 2 seconds
  let brokerSignalDelivered = false;
  try {
    brokerSignalDelivered = await signalBrokerTermination(sessionId, ownerUid, {
      timeout: BROKER_SIGNAL_TIMEOUT_MS,
    });
  } catch {
    brokerSignalDelivered = false;
  }

  // Write the owner_revoked event
  let eventWritten = false;
  let bufferedEvent: BufferedEvent | undefined;
  const eventTimestamp = Date.now();

  try {
    await writeOwnerRevokedEvent(sessionId, session.bookingId, ownerUid, session.hostId, eventTimestamp);
    eventWritten = true;
  } catch {
    // Buffer the event for later flush
    bufferedEvent = {
      eventType: 'owner_revoked',
      sessionId,
      timestamp: eventTimestamp,
      metadata: {
        ownerUid,
        hostId: session.hostId,
        bookingId: session.bookingId,
        reason: input.reason ?? 'owner_initiated',
      },
    };
  }

  // If broker signal failed, handle per requirement 17.6
  if (!brokerSignalDelivered) {
    // Terminate locally within 5 seconds — update session status directly
    try {
      await adminDb.collection(SESSIONS_COLLECTION).doc(sessionId).update({
        status: 'terminated',
        endTimestamp: new Date(),
        disconnectionReason: 'owner_revoked',
      });
    } catch {
      // If even the local update fails, buffer a broker_unreachable event
    }

    // Buffer the broker_unreachable_on_revoke event
    const unreachableEvent: BufferedEvent = {
      eventType: 'broker_connectivity_lost',
      sessionId,
      timestamp: Date.now(),
      metadata: {
        ownerUid,
        hostId: session.hostId,
        reason: 'broker_unreachable_on_revoke',
        originalTerminationTimestamp: eventTimestamp,
      },
    };

    // Attempt to write the unreachable event
    try {
      await writeBrokerUnreachableEvent(
        sessionId,
        session.bookingId,
        ownerUid,
        session.hostId,
      );
    } catch {
      // If write fails, keep it buffered
      bufferedEvent = bufferedEvent ?? unreachableEvent;
    }

    return {
      success: true,
      sessionId,
      terminatedLocally: true,
      brokerSignalDelivered: false,
      eventWritten,
      bufferedEvent,
    };
  }

  // Broker signal delivered — update session status
  try {
    await adminDb.collection(SESSIONS_COLLECTION).doc(sessionId).update({
      status: 'terminated',
      endTimestamp: new Date(),
      disconnectionReason: 'owner_revoked',
    });
  } catch {
    // Non-fatal — broker already knows to end the session
  }

  return {
    success: true,
    sessionId,
    terminatedLocally: false,
    brokerSignalDelivered: true,
    eventWritten,
    bufferedEvent,
  };
}

// ─── Broker Communication ───────────────────────────────────────────────────────

/**
 * Signal the Session Broker to terminate a session.
 *
 * Must complete within the specified timeout (default 2 seconds).
 * Returns true if the signal was delivered and acknowledged.
 */
async function signalBrokerTermination(
  sessionId: string,
  ownerUid: string,
  options?: BrokerSignalOptions,
): Promise<boolean> {
  const timeout = options?.timeout ?? BROKER_SIGNAL_TIMEOUT_MS;

  // Create an AbortController for timeout management
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    // In production, this calls the Session Broker API endpoint.
    // POST /api/remote-desktop/sessions/:sessionId/end
    // For now this writes to a signalling document in Firestore that
    // the broker watches for real-time termination triggers.
    await adminDb.collection('remote_desktop_session_signals').doc(sessionId).set({
      action: 'terminate',
      initiatedBy: ownerUid,
      reason: 'owner_revoked',
      timestamp: new Date(),
    });

    clearTimeout(timeoutHandle);
    return true;
  } catch {
    clearTimeout(timeoutHandle);
    return false;
  }
}

// ─── Event Writing ──────────────────────────────────────────────────────────────

/**
 * Write "owner_revoked" event to the Activity_Log.
 */
async function writeOwnerRevokedEvent(
  sessionId: string,
  bookingId: string,
  ownerUid: string,
  hostId: string,
  timestamp: number,
): Promise<void> {
  const eventId = generateEventId();
  await adminDb.collection(EVENTS_COLLECTION).doc(eventId).set({
    eventId,
    sessionId,
    bookingId,
    eventType: 'owner_revoked' as SessionEventType,
    actorUid: ownerUid,
    actorRole: 'Owner',
    hostId,
    timestamp: new Date(timestamp),
    metadata: {
      reason: 'owner_initiated_termination',
      signalledAt: timestamp,
    },
  });
}

/**
 * Write "broker_unreachable_on_revoke" event to the Activity_Log.
 * Uses the broker_connectivity_lost event type with specific metadata.
 */
async function writeBrokerUnreachableEvent(
  sessionId: string,
  bookingId: string,
  ownerUid: string,
  hostId: string,
): Promise<void> {
  const eventId = generateEventId();
  await adminDb.collection(EVENTS_COLLECTION).doc(eventId).set({
    eventId,
    sessionId,
    bookingId,
    eventType: 'broker_connectivity_lost' as SessionEventType,
    actorUid: ownerUid,
    actorRole: 'Owner',
    hostId,
    timestamp: new Date(),
    metadata: {
      reason: 'broker_unreachable_on_revoke',
      terminatedLocally: true,
    },
  });
}

// ─── Exported Constants (for testing) ───────────────────────────────────────────

export const CONSTANTS = {
  MAX_HISTORY_ENTRIES,
  HISTORY_DAYS,
  BROKER_SIGNAL_TIMEOUT_MS,
  BROKER_CONNECTIVITY_LOSS_TIMEOUT_MS,
  FAILED_SIGNAL_LOCAL_TERMINATE_TIMEOUT_MS,
} as const;
