/**
 * Audit Event Service — Chain-Hashed Audit Event Management
 *
 * Implements the append-only, chain-hashed audit log for remote desktop sessions.
 * Each event contains a SHA-256 hash of the previous event in the same session,
 * creating a tamper-evident linked chain.
 *
 * Responsibilities:
 * - Event creation with chain hash computation (SHA-256)
 * - Retry logic (3 attempts, exponential backoff: 1s, 2s, 4s)
 * - Local buffer management (10,000 event cap, FIFO eviction)
 * - Paginated query support (max 200 records per page)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { createHash } from 'node:crypto';
import {
  SESSION_EVENT_TYPES,
  REMOTE_DESKTOP_DEFAULTS,
  type SessionEvent,
  type SessionEventType,
  type ActorRole,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum retry attempts for event writes */
const MAX_RETRY_ATTEMPTS = 3;

/** Exponential backoff delays in ms: 1s, 2s, 4s */
const BACKOFF_DELAYS_MS = [1000, 2000, 4000] as const;

/** Maximum local buffer size before FIFO eviction */
const MAX_BUFFER_SIZE = 10_000;

/** Maximum page size for paginated queries */
const MAX_PAGE_SIZE = REMOTE_DESKTOP_DEFAULTS.DEFAULT_PAGE_SIZE; // 200

/** Maximum metadata size in bytes */
const MAX_METADATA_BYTES = REMOTE_DESKTOP_DEFAULTS.MAX_METADATA_BYTES; // 8192

// ─── Event Types (re-exported for convenience) ──────────────────────────────────

export { SESSION_EVENT_TYPES };

/**
 * All required event types as an array of string values.
 * Minimum 21 event types per Requirement 8.2.
 */
export const REQUIRED_EVENT_TYPES: readonly SessionEventType[] = Object.values(
  SESSION_EVENT_TYPES,
) as SessionEventType[];

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateAuditEventInput {
  sessionId: string;
  bookingId: string;
  eventType: SessionEventType;
  actorUid: string;
  actorRole: ActorRole;
  hostId: string;
  metadata?: Record<string, unknown>;
}

export interface WriteResult {
  success: boolean;
  event: SessionEvent;
  attempts: number;
  buffered: boolean;
}

export interface FlushResult {
  flushed: number;
  failed: number;
  remaining: number;
}

export interface DateRange {
  start: string; // ISO timestamp
  end: string;   // ISO timestamp
}

export interface QueryOptions {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface PaginatedResult {
  events: SessionEvent[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

/** Write function signature (injectable for testing) */
export type EventWriter = (event: SessionEvent) => Promise<void>;

// ─── Internal State ─────────────────────────────────────────────────────────────

/** Chain hash state: maps sessionId → last event hash */
const sessionChainHashes = new Map<string, string | null>();

/** In-memory event store: maps sessionId → events[] (ordered by timestamp) */
const sessionEventStore = new Map<string, SessionEvent[]>();

/** Local buffer for failed writes: maps sessionId → buffered events */
const localBuffer = new Map<string, SessionEvent[]>();

/** Total buffer count across all sessions */
let totalBufferCount = 0;

/** External writer function (allows Firestore integration or test mocks) */
let eventWriter: EventWriter | null = null;

// ─── Configuration ──────────────────────────────────────────────────────────────

/**
 * Set the external event writer function.
 * This is called during writes; if not set, events are stored in-memory only.
 */
export function setEventWriter(writer: EventWriter): void {
  eventWriter = writer;
}

/**
 * Clear the event writer (for testing).
 */
export function clearEventWriter(): void {
  eventWriter = null;
}

// ─── Hash Computation ───────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a session event for chain linking.
 *
 * The hash is computed over a serialized representation of the event
 * WITHOUT the `previousEventHash` field (to avoid circular reference).
 */
export function computeEventHash(event: SessionEvent): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { previousEventHash, ...eventWithoutHash } = event;
  const serialized = JSON.stringify(eventWithoutHash);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Get the last event hash for a session chain.
 * Returns null if no events exist for the session (first event case).
 */
export function getLastEventHash(sessionId: string): string | null {
  return sessionChainHashes.get(sessionId) ?? null;
}

// ─── Validation ─────────────────────────────────────────────────────────────────

/**
 * Validate that metadata does not exceed 8KB when serialized.
 */
function validateMetadataSize(metadata: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(metadata);
  return Buffer.byteLength(serialized, 'utf8') <= MAX_METADATA_BYTES;
}

/**
 * Validate that the event type is a known session event type.
 */
function validateEventType(eventType: string): eventType is SessionEventType {
  return Object.values(SESSION_EVENT_TYPES).includes(eventType as SessionEventType);
}

// ─── Event Creation ─────────────────────────────────────────────────────────────

/**
 * Generate a unique event ID (UUIDv4).
 */
function generateEventId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create an audit event with chain hash computation.
 *
 * The first event in a session has previousEventHash = null.
 * Subsequent events hash the previous event using SHA-256.
 *
 * @throws Error if event type is invalid or metadata exceeds 8KB
 */
export function createAuditEvent(input: CreateAuditEventInput): SessionEvent {
  // Validate event type
  if (!validateEventType(input.eventType)) {
    throw new Error(`Invalid event type: ${input.eventType}`);
  }

  // Validate metadata size
  const metadata = input.metadata ?? {};
  if (!validateMetadataSize(metadata)) {
    throw new Error(
      `Metadata exceeds maximum size of ${MAX_METADATA_BYTES} bytes (8KB)`,
    );
  }

  // Get the previous event hash for chain linking
  const previousEventHash = getLastEventHash(input.sessionId);

  // Create the event
  const event: SessionEvent = {
    eventId: generateEventId(),
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    eventType: input.eventType,
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    hostId: input.hostId,
    timestamp: new Date().toISOString(),
    previousEventHash,
    metadata,
  };

  // Compute hash of this event and update the chain state
  const currentHash = computeEventHash(event);
  sessionChainHashes.set(input.sessionId, currentHash);

  // Store event in memory
  const sessionEvents = sessionEventStore.get(input.sessionId) ?? [];
  sessionEvents.push(event);
  sessionEventStore.set(input.sessionId, sessionEvents);

  return event;
}

// ─── Retry Logic ────────────────────────────────────────────────────────────────

/**
 * Sleep utility for backoff delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Write an audit event with retry logic.
 *
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
 * If all retries fail, the event is buffered locally.
 */
export async function writeAuditEvent(event: SessionEvent): Promise<WriteResult> {
  if (!eventWriter) {
    // No external writer configured — event stays in memory only
    return { success: true, event, attempts: 0, buffered: false };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await eventWriter(event);
      return { success: true, event, attempts: attempt + 1, buffered: false };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Apply backoff delay before next attempt (except after last attempt)
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await sleep(BACKOFF_DELAYS_MS[attempt]);
      }
    }
  }

  // All retries failed — buffer the event locally
  bufferEvent(event);

  return {
    success: false,
    event,
    attempts: MAX_RETRY_ATTEMPTS,
    buffered: true,
  };
}

// ─── Local Buffer Management ────────────────────────────────────────────────────

/**
 * Buffer an event locally when writes fail.
 * Enforces the 10,000 event cap with FIFO eviction (oldest events evicted first).
 */
export function bufferEvent(event: SessionEvent): void {
  // FIFO eviction: if buffer is at capacity, remove the oldest event
  if (totalBufferCount >= MAX_BUFFER_SIZE) {
    evictOldestBufferedEvent();
  }

  const sessionBuffer = localBuffer.get(event.sessionId) ?? [];
  sessionBuffer.push(event);
  localBuffer.set(event.sessionId, sessionBuffer);
  totalBufferCount++;
}

/**
 * Evict the oldest event from the buffer (FIFO).
 */
function evictOldestBufferedEvent(): void {
  // Find the session with the oldest buffered event
  let oldestSession: string | null = null;
  let oldestTimestamp: string | null = null;

  for (const [sessionId, events] of localBuffer.entries()) {
    if (events.length > 0) {
      const firstEvent = events[0];
      if (oldestTimestamp === null || firstEvent.timestamp < oldestTimestamp) {
        oldestTimestamp = firstEvent.timestamp;
        oldestSession = sessionId;
      }
    }
  }

  if (oldestSession) {
    const sessionBuffer = localBuffer.get(oldestSession)!;
    sessionBuffer.shift(); // Remove oldest (FIFO)
    totalBufferCount--;

    if (sessionBuffer.length === 0) {
      localBuffer.delete(oldestSession);
    }
  }
}

/**
 * Flush buffered events for a specific session.
 * Attempts to write all buffered events using the configured writer.
 */
export async function flushBuffer(sessionId: string): Promise<FlushResult> {
  const sessionBuffer = localBuffer.get(sessionId);
  if (!sessionBuffer || sessionBuffer.length === 0) {
    return { flushed: 0, failed: 0, remaining: 0 };
  }

  if (!eventWriter) {
    return { flushed: 0, failed: 0, remaining: sessionBuffer.length };
  }

  let flushed = 0;
  let failed = 0;
  const remaining: SessionEvent[] = [];

  for (const event of sessionBuffer) {
    let success = false;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        await eventWriter(event);
        success = true;
        break;
      } catch {
        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          await sleep(BACKOFF_DELAYS_MS[attempt]);
        }
      }
    }

    if (success) {
      flushed++;
      totalBufferCount--;
    } else {
      failed++;
      remaining.push(event);
    }
  }

  if (remaining.length === 0) {
    localBuffer.delete(sessionId);
  } else {
    localBuffer.set(sessionId, remaining);
  }

  return { flushed, failed, remaining: remaining.length };
}

/**
 * Get the current buffer size for a session.
 */
export function getBufferSize(sessionId?: string): number {
  if (sessionId) {
    return localBuffer.get(sessionId)?.length ?? 0;
  }
  return totalBufferCount;
}

/**
 * Get all buffered events for a session.
 */
export function getBufferedEvents(sessionId: string): SessionEvent[] {
  return [...(localBuffer.get(sessionId) ?? [])];
}

// ─── Paginated Query Helpers ────────────────────────────────────────────────────

/**
 * Query events for a session, ordered by timestamp ascending.
 * Returns paginated results with max 200 records per page.
 */
export function querySessionEvents(
  sessionId: string,
  options?: QueryOptions,
): PaginatedResult {
  const events = sessionEventStore.get(sessionId) ?? [];
  return paginateEvents(events, options);
}

/**
 * Query events by host ID within a date range.
 */
export function queryByHostId(
  hostId: string,
  dateRange: DateRange,
  options?: QueryOptions,
): PaginatedResult {
  const allEvents = getAllEventsInRange(dateRange);
  const filtered = allEvents.filter((e) => e.hostId === hostId);
  return paginateEvents(filtered, options);
}

/**
 * Query events by consumer UID within a date range.
 */
export function queryByConsumerUid(
  uid: string,
  dateRange: DateRange,
  options?: QueryOptions,
): PaginatedResult {
  const allEvents = getAllEventsInRange(dateRange);
  const filtered = allEvents.filter((e) => e.actorUid === uid);
  return paginateEvents(filtered, options);
}

/**
 * Query events by event type within a date range.
 */
export function queryByEventType(
  type: SessionEventType,
  dateRange: DateRange,
  options?: QueryOptions,
): PaginatedResult {
  const allEvents = getAllEventsInRange(dateRange);
  const filtered = allEvents.filter((e) => e.eventType === type);
  return paginateEvents(filtered, options);
}

// ─── Chain Integrity Verification ───────────────────────────────────────────────

/**
 * Verify the integrity of the event chain for a session.
 * Returns true if the chain is valid (all hashes match).
 */
export function verifyChainIntegrity(sessionId: string): boolean {
  const events = sessionEventStore.get(sessionId) ?? [];
  if (events.length === 0) return true;

  // First event must have null previousEventHash
  if (events[0].previousEventHash !== null) return false;

  // Each subsequent event must reference the hash of the previous event
  for (let i = 1; i < events.length; i++) {
    const expectedHash = computeEventHash(events[i - 1]);
    if (events[i].previousEventHash !== expectedHash) return false;
  }

  return true;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────────

/**
 * Get all events across all sessions within a date range.
 */
function getAllEventsInRange(dateRange: DateRange): SessionEvent[] {
  const start = new Date(dateRange.start).getTime();
  const end = new Date(dateRange.end).getTime();
  const allEvents: SessionEvent[] = [];

  for (const events of sessionEventStore.values()) {
    for (const event of events) {
      const eventTime = new Date(event.timestamp).getTime();
      if (eventTime >= start && eventTime <= end) {
        allEvents.push(event);
      }
    }
  }

  // Sort by timestamp ascending
  allEvents.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return allEvents;
}

/**
 * Paginate an array of events.
 * Caps page size at MAX_PAGE_SIZE (200).
 */
function paginateEvents(
  events: SessionEvent[],
  options?: QueryOptions,
): PaginatedResult {
  const pageSize = Math.min(options?.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(options?.page ?? 1, 1);

  // If cursor provided, find the starting index
  let startIndex = (page - 1) * pageSize;
  if (options?.cursor) {
    const cursorIndex = events.findIndex((e) => e.eventId === options.cursor);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }

  const pageEvents = events.slice(startIndex, startIndex + pageSize);
  const hasNextPage = startIndex + pageSize < events.length;
  const nextCursor =
    hasNextPage && pageEvents.length > 0
      ? pageEvents[pageEvents.length - 1].eventId
      : null;

  return {
    events: pageEvents,
    totalCount: events.length,
    page,
    pageSize,
    hasNextPage,
    nextCursor,
  };
}

// ─── State Management (for testing) ────────────────────────────────────────────

/**
 * Clear all internal state. Used for test isolation.
 */
export function _clearAllState(): void {
  sessionChainHashes.clear();
  sessionEventStore.clear();
  localBuffer.clear();
  totalBufferCount = 0;
  eventWriter = null;
}

/**
 * Get the number of sessions tracked.
 */
export function _getSessionCount(): number {
  return sessionEventStore.size;
}

/**
 * Get all events for a session (direct access for testing).
 */
export function _getSessionEvents(sessionId: string): SessionEvent[] {
  return [...(sessionEventStore.get(sessionId) ?? [])];
}

/**
 * Get total buffer count across all sessions.
 */
export function _getTotalBufferCount(): number {
  return totalBufferCount;
}
