/**
 * Session Audit Service — Activity Log Writer & Reader
 *
 * Manages the append-only audit trail for remote desktop sessions.
 * Writes events to the `remote_desktop_session_events` Firestore collection
 * with retry logic and exponential backoff.
 *
 * Provides role-scoped query functions:
 * - Platform_Admin: all sessions
 * - Owner: sessions on their own hosts
 * - Consumer: their own sessions only
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { adminDb } from '@/lib/firebase-admin';
import { RemoteDesktopSessionEventSchema } from './schemas';
import type {
  RemoteDesktopSessionEvent,
  SessionEventType,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

const COLLECTION_NAME = 'remote_desktop_session_events';
const SESSIONS_COLLECTION = 'remote_desktop_sessions';
const MAX_PAGE_SIZE = 200;
const MAX_RETRY_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000; // 1s, 2s, 4s

/** All 20 valid session event types */
export const SESSION_EVENT_TYPES: readonly SessionEventType[] = [
  'session_started',
  'session_ended',
  'app_launched',
  'app_closed',
  'file_created',
  'file_modified',
  'focus_violation_attempted',
  'child_process_blocked',
  'clipboard_used',
  'auto_disconnect_triggered',
  'reconnection_attempted',
  'quality_profile_changed',
  'session_terminated_uac',
  'token_revoked',
  'token_integrity_failure',
  'owner_revoked',
  'broker_connectivity_lost',
  'buffer_overflow',
  'workspace_expired',
  'no_active_windows',
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ActorRole = 'Platform_Admin' | 'Owner' | 'Consumer';

export interface WriteAuditEventInput {
  sessionId: string;
  bookingId: string;
  eventType: SessionEventType;
  actorUid: string;
  actorRole: string;
  hostId: string;
  timestamp: { seconds: number; nanoseconds: number };
  metadata: Record<string, unknown>;
}

export interface AuditQueryOptions {
  sessionId?: string;
  hostId?: string;
  eventType?: SessionEventType;
  dateRangeStart?: { seconds: number; nanoseconds: number };
  dateRangeEnd?: { seconds: number; nanoseconds: number };
  limit?: number;
  startAfterEventId?: string;
}

export interface PaginatedAuditResult {
  events: RemoteDesktopSessionEvent[];
  hasMore: boolean;
  lastEventId?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateEventId(): string {
  // UUIDv4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates metadata size does not exceed 8KB when serialized.
 */
function validateMetadataSize(metadata: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(metadata);
  return serialized.length <= 8192;
}

// ─── Write Operations ───────────────────────────────────────────────────────────

/**
 * Write an audit event to the Activity_Log with retry logic.
 *
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
 * Events are append-only — no modify or delete operations exist.
 *
 * @throws Error if all retry attempts fail
 */
export async function writeAuditEvent(
  input: WriteAuditEventInput,
): Promise<RemoteDesktopSessionEvent> {
  const eventId = generateEventId();

  const event: RemoteDesktopSessionEvent = {
    eventId,
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    eventType: input.eventType,
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    hostId: input.hostId,
    timestamp: input.timestamp as any,
    metadata: input.metadata,
  };

  // Validate against schema
  const validation = RemoteDesktopSessionEventSchema.safeParse(event);
  if (!validation.success) {
    throw new Error(
      `Audit event validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`,
    );
  }

  // Validate metadata size
  if (!validateMetadataSize(input.metadata)) {
    throw new Error('Metadata must be at most 8KB when serialized');
  }

  // Retry with exponential backoff: 1s, 2s, 4s
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await adminDb.collection(COLLECTION_NAME).doc(eventId).set(event);
      return event;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }
  }

  throw new Error(
    `Failed to write audit event after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`,
  );
}

/**
 * Write a batch of buffered events (e.g., flushed from Host Agent local buffer).
 * Events are written in a single batch for efficiency.
 *
 * @throws Error if the batch write fails after retries
 */
export async function writeBatchAuditEvents(
  events: WriteAuditEventInput[],
): Promise<RemoteDesktopSessionEvent[]> {
  const results: RemoteDesktopSessionEvent[] = [];

  // Process in Firestore batch limits (max 500 per batch)
  const BATCH_LIMIT = 500;
  const batches = [];

  for (let i = 0; i < events.length; i += BATCH_LIMIT) {
    batches.push(events.slice(i, i + BATCH_LIMIT));
  }

  for (const batchEvents of batches) {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const batch = adminDb.batch();
        const batchResults: RemoteDesktopSessionEvent[] = [];

        for (const input of batchEvents) {
          const eventId = generateEventId();
          const event: RemoteDesktopSessionEvent = {
            eventId,
            sessionId: input.sessionId,
            bookingId: input.bookingId,
            eventType: input.eventType,
            actorUid: input.actorUid,
            actorRole: input.actorRole,
            hostId: input.hostId,
            timestamp: input.timestamp as any,
            metadata: input.metadata,
          };

          const ref = adminDb.collection(COLLECTION_NAME).doc(eventId);
          batch.set(ref, event);
          batchResults.push(event);
        }

        await batch.commit();
        results.push(...batchResults);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await sleep(backoffMs);
        }
      }
    }

    if (results.length < batches.indexOf(batchEvents) * BATCH_LIMIT + batchEvents.length) {
      throw new Error(
        `Failed to write batch audit events after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`,
      );
    }
  }

  return results;
}

// ─── Read Operations (Role-Scoped) ─────────────────────────────────────────────

/**
 * Query audit events scoped by the caller's role.
 *
 * - Platform_Admin: sees all sessions
 * - Owner: sees only sessions on their own hosts
 * - Consumer: sees only their own sessions
 *
 * Results are ordered by timestamp ascending and paginated (max 200 per response).
 */
export async function queryAuditEvents(
  actorUid: string,
  actorRole: ActorRole,
  options: AuditQueryOptions = {},
): Promise<PaginatedAuditResult> {
  const limit = Math.min(options.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);

  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION_NAME);

  // Apply role-based scoping
  switch (actorRole) {
    case 'Platform_Admin':
      // Platform_Admin sees all — no additional filter
      break;

    case 'Owner':
      // Owner sees only sessions on their own hosts
      // We need the host IDs owned by this user
      if (options.hostId) {
        // If a specific host is queried, verify ownership is handled by the caller
        query = query.where('hostId', '==', options.hostId);
      } else {
        // Query all hosts owned by this user, then filter events
        const ownedHosts = await getOwnedHostIds(actorUid);
        if (ownedHosts.length === 0) {
          return { events: [], hasMore: false };
        }
        // Firestore 'in' query supports up to 30 values
        if (ownedHosts.length <= 30) {
          query = query.where('hostId', 'in', ownedHosts);
        } else {
          // For owners with many hosts, filter by first 30 and note limitation
          query = query.where('hostId', 'in', ownedHosts.slice(0, 30));
        }
      }
      break;

    case 'Consumer':
      // Consumer sees only their own sessions
      query = query.where('actorUid', '==', actorUid);
      break;
  }

  // Apply additional filters
  if (options.sessionId) {
    query = query.where('sessionId', '==', options.sessionId);
  }

  if (options.hostId && actorRole !== 'Owner') {
    query = query.where('hostId', '==', options.hostId);
  }

  if (options.eventType) {
    query = query.where('eventType', '==', options.eventType);
  }

  if (options.dateRangeStart) {
    query = query.where('timestamp', '>=', options.dateRangeStart);
  }

  if (options.dateRangeEnd) {
    query = query.where('timestamp', '<=', options.dateRangeEnd);
  }

  // Order by timestamp ascending (as required by spec)
  query = query.orderBy('timestamp', 'asc');

  // Pagination: start after a specific document if provided
  if (options.startAfterEventId) {
    const startAfterDoc = await adminDb
      .collection(COLLECTION_NAME)
      .doc(options.startAfterEventId)
      .get();

    if (startAfterDoc.exists) {
      query = query.startAfter(startAfterDoc);
    }
  }

  // Fetch one extra to determine if there are more results
  query = query.limit(limit + 1);

  const snapshot = await query.get();
  const docs = snapshot.docs;

  const hasMore = docs.length > limit;
  const resultDocs = hasMore ? docs.slice(0, limit) : docs;

  const events: RemoteDesktopSessionEvent[] = resultDocs.map(
    (doc) => doc.data() as RemoteDesktopSessionEvent,
  );

  return {
    events,
    hasMore,
    lastEventId: events.length > 0 ? events[events.length - 1].eventId : undefined,
  };
}

/**
 * Query audit events for a specific session.
 * Results ordered by timestamp ascending.
 * Respects role-scoped access.
 */
export async function querySessionEvents(
  sessionId: string,
  actorUid: string,
  actorRole: ActorRole,
  options: { limit?: number; startAfterEventId?: string } = {},
): Promise<PaginatedAuditResult> {
  // Verify the actor has access to this session
  const hasAccess = await verifySessionAccess(sessionId, actorUid, actorRole);
  if (!hasAccess) {
    return { events: [], hasMore: false };
  }

  return queryAuditEvents(actorUid, actorRole, {
    sessionId,
    limit: options.limit,
    startAfterEventId: options.startAfterEventId,
  });
}

// ─── Access Control Helpers ─────────────────────────────────────────────────────

/**
 * Verify that an actor has access to view events for a given session.
 */
async function verifySessionAccess(
  sessionId: string,
  actorUid: string,
  actorRole: ActorRole,
): Promise<boolean> {
  if (actorRole === 'Platform_Admin') {
    return true;
  }

  try {
    const sessionDoc = await adminDb
      .collection(SESSIONS_COLLECTION)
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      return false;
    }

    const session = sessionDoc.data();
    if (!session) return false;

    if (actorRole === 'Owner') {
      return session.ownerUid === actorUid;
    }

    if (actorRole === 'Consumer') {
      return session.consumerUid === actorUid;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get all host IDs owned by a specific user.
 */
async function getOwnedHostIds(ownerUid: string): Promise<string[]> {
  try {
    const snapshot = await adminDb
      .collection('remote_desktop_hosts')
      .where('ownerUid', '==', ownerUid)
      .select('hostId')
      .get();

    return snapshot.docs.map((doc) => doc.data().hostId as string);
  } catch {
    return [];
  }
}

// ─── Immutability Enforcement ───────────────────────────────────────────────────

/**
 * Activity_Log is append-only. These functions intentionally reject any
 * attempt to modify or delete records, preserving the immutability invariant
 * (Requirement 11.4).
 */
export function updateAuditEvent(): never {
  throw new Error(
    'Activity_Log records are append-only. Modification is not permitted for any role.',
  );
}

export function deleteAuditEvent(): never {
  throw new Error(
    'Activity_Log records are append-only. Deletion is not permitted for any role.',
  );
}
