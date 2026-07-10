/**
 * @vitest-environment node
 *
 * Audit Event Service — Unit & Property-Based Tests
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 *
 * Property 4 — Audit Chain Integrity:
 *   ∀ events: SessionEvent[] ordered by timestamp,
 *     events[0].previousEventHash === null
 *     ∧ ∀ i > 0: events[i].previousEventHash === sha256(serialize(events[i-1]))
 */

import * as fc from 'fast-check';
import { vi } from 'vitest';
import {
  createAuditEvent,
  computeEventHash,
  writeAuditEvent,
  bufferEvent,
  flushBuffer,
  getLastEventHash,
  getBufferSize,
  getBufferedEvents,
  querySessionEvents,
  queryByHostId,
  queryByConsumerUid,
  queryByEventType,
  verifyChainIntegrity,
  setEventWriter,
  clearEventWriter,
  REQUIRED_EVENT_TYPES,
  _clearAllState,
  _getSessionEvents,
  _getTotalBufferCount,
  type CreateAuditEventInput,
  type DateRange,
} from '../auditEventService';
import { SESSION_EVENT_TYPES, REMOTE_DESKTOP_DEFAULTS } from '../types';
import type { SessionEvent, SessionEventType, ActorRole } from '../types';
import { createHash } from 'node:crypto';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createValidInput(overrides?: Partial<CreateAuditEventInput>): CreateAuditEventInput {
  return {
    sessionId: 'session-001',
    bookingId: 'booking-001',
    eventType: SESSION_EVENT_TYPES.SESSION_STARTED,
    actorUid: 'user-001',
    actorRole: 'system',
    hostId: 'host-001',
    metadata: { reason: 'test' },
    ...overrides,
  };
}

function computeExpectedHash(event: SessionEvent): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { previousEventHash, ...eventWithoutHash } = event;
  const serialized = JSON.stringify(eventWithoutHash);
  return createHash('sha256').update(serialized).digest('hex');
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Audit Event Service', () => {
  beforeEach(() => {
    _clearAllState();
  });

  // ─── Event Types ──────────────────────────────────────────────────────────────

  describe('Event Types', () => {
    it('should export at least 21 event types (Requirement 8.2)', () => {
      expect(REQUIRED_EVENT_TYPES.length).toBeGreaterThanOrEqual(21);
    });

    it('should include all required event types from the specification', () => {
      const requiredTypes = [
        'session_gate_check',
        'session_started',
        'session_ended',
        'app_launched',
        'app_closed',
        'file_created',
        'file_modified',
        'focus_violation_blocked',
        'prolonged_focus_violation',
        'child_process_blocked',
        'clipboard_transfer',
        'input_blocked',
        'input_resumed',
        'quality_profile_changed',
        'auto_disconnect',
        'reconnection_attempted',
        'popia_consent_granted',
        'consent_declined',
        'incident_raised',
        'token_revoked',
        'policy_violation_full_desktop',
      ];

      for (const type of requiredTypes) {
        expect(REQUIRED_EVENT_TYPES).toContain(type);
      }
    });
  });

  // ─── Chain Hash Computation ───────────────────────────────────────────────────

  describe('computeEventHash', () => {
    it('should produce a valid SHA-256 hex string (64 characters)', () => {
      const event = createAuditEvent(createValidInput());
      const hash = computeEventHash(event);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should exclude previousEventHash from the hash computation', () => {
      const event = createAuditEvent(createValidInput());
      const hash1 = computeEventHash(event);

      // Manually change previousEventHash — should NOT affect the hash
      const modifiedEvent = { ...event, previousEventHash: 'different-hash' };
      const hash2 = computeEventHash(modifiedEvent);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different events', () => {
      const event1 = createAuditEvent(createValidInput({ sessionId: 'session-a' }));
      _clearAllState();
      const event2 = createAuditEvent(createValidInput({ sessionId: 'session-b' }));

      const hash1 = computeEventHash(event1);
      const hash2 = computeEventHash(event2);

      expect(hash1).not.toBe(hash2);
    });
  });

  // ─── Chain Linking ────────────────────────────────────────────────────────────

  describe('Chain Linking (Requirement 8.5)', () => {
    it('first event in session should have previousEventHash = null', () => {
      const event = createAuditEvent(createValidInput());
      expect(event.previousEventHash).toBeNull();
    });

    it('second event should hash the first event', () => {
      const event1 = createAuditEvent(createValidInput());
      const event2 = createAuditEvent(createValidInput({ eventType: SESSION_EVENT_TYPES.SESSION_ENDED }));

      const expectedHash = computeExpectedHash(event1);
      expect(event2.previousEventHash).toBe(expectedHash);
    });

    it('should form a valid chain across multiple events', () => {
      const events: SessionEvent[] = [];

      const eventTypes: SessionEventType[] = [
        SESSION_EVENT_TYPES.SESSION_STARTED,
        SESSION_EVENT_TYPES.APP_LAUNCHED,
        SESSION_EVENT_TYPES.FILE_CREATED,
        SESSION_EVENT_TYPES.APP_CLOSED,
        SESSION_EVENT_TYPES.SESSION_ENDED,
      ];

      for (const eventType of eventTypes) {
        const event = createAuditEvent(createValidInput({ eventType }));
        events.push(event);
      }

      // Verify chain integrity
      expect(events[0].previousEventHash).toBeNull();
      for (let i = 1; i < events.length; i++) {
        const expectedHash = computeExpectedHash(events[i - 1]);
        expect(events[i].previousEventHash).toBe(expectedHash);
      }
    });

    it('different sessions should have independent chains', () => {
      const event1 = createAuditEvent(createValidInput({ sessionId: 'session-a' }));
      const event2 = createAuditEvent(createValidInput({ sessionId: 'session-b' }));

      // Both first events should have null hash
      expect(event1.previousEventHash).toBeNull();
      expect(event2.previousEventHash).toBeNull();
    });

    it('getLastEventHash returns null for unknown session', () => {
      expect(getLastEventHash('unknown-session')).toBeNull();
    });

    it('getLastEventHash returns hash after event creation', () => {
      const event = createAuditEvent(createValidInput());
      const lastHash = getLastEventHash('session-001');
      expect(lastHash).toBe(computeExpectedHash(event));
    });

    it('verifyChainIntegrity returns true for valid chain', () => {
      createAuditEvent(createValidInput());
      createAuditEvent(createValidInput({ eventType: SESSION_EVENT_TYPES.APP_LAUNCHED }));
      createAuditEvent(createValidInput({ eventType: SESSION_EVENT_TYPES.SESSION_ENDED }));

      expect(verifyChainIntegrity('session-001')).toBe(true);
    });

    it('verifyChainIntegrity returns true for empty session', () => {
      expect(verifyChainIntegrity('non-existent')).toBe(true);
    });
  });

  // ─── Event Creation & Validation ──────────────────────────────────────────────

  describe('createAuditEvent', () => {
    it('should create an event with all mandatory fields (Requirement 8.1)', () => {
      const event = createAuditEvent(createValidInput());

      expect(event.eventId).toBeDefined();
      expect(event.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(event.sessionId).toBe('session-001');
      expect(event.bookingId).toBe('booking-001');
      expect(event.eventType).toBe(SESSION_EVENT_TYPES.SESSION_STARTED);
      expect(event.actorUid).toBe('user-001');
      expect(event.actorRole).toBe('system');
      expect(event.hostId).toBe('host-001');
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      expect(event.metadata).toEqual({ reason: 'test' });
    });

    it('should reject invalid event type', () => {
      expect(() =>
        createAuditEvent({ ...createValidInput(), eventType: 'invalid_type' as SessionEventType }),
      ).toThrow('Invalid event type');
    });

    it('should reject metadata exceeding 8KB', () => {
      const largeMetadata: Record<string, unknown> = {};
      // Create metadata that exceeds 8KB
      for (let i = 0; i < 200; i++) {
        largeMetadata[`key_${i}`] = 'x'.repeat(50);
      }

      expect(() =>
        createAuditEvent(createValidInput({ metadata: largeMetadata })),
      ).toThrow('Metadata exceeds maximum size');
    });

    it('should accept metadata at exactly 8KB boundary', () => {
      // Create metadata that is close to but under 8KB
      const metadata: Record<string, unknown> = { data: 'x'.repeat(7000) };
      const event = createAuditEvent(createValidInput({ metadata }));
      expect(event.metadata).toEqual(metadata);
    });

    it('should default metadata to empty object when not provided', () => {
      const input = createValidInput();
      delete (input as any).metadata;
      const event = createAuditEvent(input);
      expect(event.metadata).toEqual({});
    });
  });

  // ─── Retry Logic (Requirement 8.6) ───────────────────────────────────────────

  describe('writeAuditEvent — Retry Logic', () => {
    it('should succeed on first attempt when writer works', async () => {
      const writer = vi.fn().mockResolvedValue(undefined);
      setEventWriter(writer);

      const event = createAuditEvent(createValidInput());
      const result = await writeAuditEvent(event);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.buffered).toBe(false);
      expect(writer).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed on second attempt', async () => {
      const writer = vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue(undefined);
      setEventWriter(writer);

      const event = createAuditEvent(createValidInput());
      const result = await writeAuditEvent(event);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.buffered).toBe(false);
      expect(writer).toHaveBeenCalledTimes(2);
    });

    it('should retry 3 times then buffer on total failure', async () => {
      const writer = vi.fn().mockRejectedValue(new Error('persistent failure'));
      setEventWriter(writer);

      const event = createAuditEvent(createValidInput());
      const result = await writeAuditEvent(event);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.buffered).toBe(true);
      expect(writer).toHaveBeenCalledTimes(3);
    });

    it('should succeed when no writer is configured (in-memory mode)', async () => {
      const event = createAuditEvent(createValidInput());
      const result = await writeAuditEvent(event);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(0);
      expect(result.buffered).toBe(false);
    });
  });

  // ─── Buffer Management (Requirement 8.6) ─────────────────────────────────────

  describe('Buffer Management', () => {
    it('should buffer events locally', () => {
      const event = createAuditEvent(createValidInput());
      bufferEvent(event);

      expect(getBufferSize('session-001')).toBe(1);
      expect(getBufferedEvents('session-001')).toHaveLength(1);
    });

    it('should cap buffer at 10,000 events with FIFO eviction', () => {
      // Fill buffer to capacity
      for (let i = 0; i < 10_000; i++) {
        const event = createAuditEvent(
          createValidInput({
            sessionId: `session-${i % 100}`,
            eventType: SESSION_EVENT_TYPES.APP_LAUNCHED,
          }),
        );
        bufferEvent(event);
      }

      expect(_getTotalBufferCount()).toBe(10_000);

      // Add one more — should evict oldest
      const newEvent = createAuditEvent(
        createValidInput({
          sessionId: 'session-overflow',
          eventType: SESSION_EVENT_TYPES.SESSION_ENDED,
        }),
      );
      bufferEvent(newEvent);

      // Still capped at 10,000
      expect(_getTotalBufferCount()).toBe(10_000);
    });

    it('should evict oldest event (FIFO) when buffer is full', () => {
      // Add events from two sessions
      for (let i = 0; i < 5; i++) {
        const event = createAuditEvent(
          createValidInput({
            sessionId: 'session-old',
            eventType: SESSION_EVENT_TYPES.APP_LAUNCHED,
          }),
        );
        bufferEvent(event);
      }

      // Get the first buffered event ID for later check
      const firstEvents = getBufferedEvents('session-old');
      const firstEventId = firstEvents[0].eventId;

      // Fill rest of buffer
      _clearAllState();

      // Refill: add events with known timestamps (earlier = session-old)
      const oldEvent = createAuditEvent(createValidInput({ sessionId: 'session-old' }));
      bufferEvent(oldEvent);

      // Add 9,999 more events to fill buffer
      for (let i = 0; i < 9_999; i++) {
        const event = createAuditEvent(
          createValidInput({
            sessionId: `session-fill-${i}`,
            eventType: SESSION_EVENT_TYPES.APP_LAUNCHED,
          }),
        );
        bufferEvent(event);
      }

      expect(_getTotalBufferCount()).toBe(10_000);

      // The oldest event (session-old) should still be there
      expect(getBufferSize('session-old')).toBe(1);

      // Add one more — oldest should be evicted
      const newest = createAuditEvent(
        createValidInput({
          sessionId: 'session-new',
          eventType: SESSION_EVENT_TYPES.SESSION_ENDED,
        }),
      );
      bufferEvent(newest);

      // session-old should now be empty (evicted)
      expect(getBufferSize('session-old')).toBe(0);
      expect(_getTotalBufferCount()).toBe(10_000);
    });

    it('should return 0 for buffer size of unknown session', () => {
      expect(getBufferSize('unknown')).toBe(0);
    });

    it('should return total buffer count when no session specified', () => {
      const event1 = createAuditEvent(createValidInput({ sessionId: 'session-a' }));
      const event2 = createAuditEvent(createValidInput({ sessionId: 'session-b' }));
      bufferEvent(event1);
      bufferEvent(event2);

      expect(getBufferSize()).toBe(2);
    });
  });

  // ─── Flush Buffer ─────────────────────────────────────────────────────────────

  describe('flushBuffer', () => {
    it('should flush all buffered events successfully', async () => {
      const writer = vi.fn().mockResolvedValue(undefined);
      setEventWriter(writer);

      const event1 = createAuditEvent(createValidInput());
      const event2 = createAuditEvent(createValidInput({ eventType: SESSION_EVENT_TYPES.APP_LAUNCHED }));
      bufferEvent(event1);
      bufferEvent(event2);

      const result = await flushBuffer('session-001');

      expect(result.flushed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);
      expect(getBufferSize('session-001')).toBe(0);
    });

    it('should keep failed events in buffer after flush', async () => {
      const writer = vi.fn().mockRejectedValue(new Error('still broken'));
      setEventWriter(writer);

      const event = createAuditEvent(createValidInput());
      bufferEvent(event);

      const result = await flushBuffer('session-001');

      expect(result.flushed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.remaining).toBe(1);
      expect(getBufferSize('session-001')).toBe(1);
    });

    it('should return zeros for empty buffer', async () => {
      const result = await flushBuffer('unknown-session');
      expect(result).toEqual({ flushed: 0, failed: 0, remaining: 0 });
    });

    it('should return remaining count when no writer configured', async () => {
      clearEventWriter();
      const event = createAuditEvent(createValidInput());
      bufferEvent(event);

      const result = await flushBuffer('session-001');
      expect(result.remaining).toBe(1);
    });
  });

  // ─── Paginated Queries (Requirement 8.4) ──────────────────────────────────────

  describe('Paginated Queries', () => {
    beforeEach(() => {
      // Create a set of events for testing queries
      for (let i = 0; i < 10; i++) {
        createAuditEvent(
          createValidInput({
            sessionId: 'session-query',
            eventType: SESSION_EVENT_TYPES.APP_LAUNCHED,
            hostId: i < 5 ? 'host-a' : 'host-b',
            actorUid: i < 3 ? 'user-alpha' : 'user-beta',
          }),
        );
      }
    });

    describe('querySessionEvents', () => {
      it('should return all events for a session', () => {
        const result = querySessionEvents('session-query');
        expect(result.events).toHaveLength(10);
        expect(result.totalCount).toBe(10);
        expect(result.hasNextPage).toBe(false);
      });

      it('should paginate results', () => {
        const page1 = querySessionEvents('session-query', { pageSize: 3, page: 1 });
        expect(page1.events).toHaveLength(3);
        expect(page1.hasNextPage).toBe(true);
        expect(page1.page).toBe(1);
        expect(page1.pageSize).toBe(3);

        const page2 = querySessionEvents('session-query', { pageSize: 3, page: 2 });
        expect(page2.events).toHaveLength(3);
        expect(page2.hasNextPage).toBe(true);
      });

      it('should cap page size at 200', () => {
        const result = querySessionEvents('session-query', { pageSize: 500 });
        expect(result.pageSize).toBe(200);
      });

      it('should return empty result for unknown session', () => {
        const result = querySessionEvents('unknown');
        expect(result.events).toHaveLength(0);
        expect(result.totalCount).toBe(0);
      });

      it('should support cursor-based pagination', () => {
        const page1 = querySessionEvents('session-query', { pageSize: 3 });
        expect(page1.nextCursor).not.toBeNull();

        const page2 = querySessionEvents('session-query', {
          pageSize: 3,
          cursor: page1.nextCursor!,
        });
        expect(page2.events).toHaveLength(3);
        // Should not overlap with page 1
        const page1Ids = page1.events.map((e) => e.eventId);
        const page2Ids = page2.events.map((e) => e.eventId);
        expect(page1Ids).not.toEqual(expect.arrayContaining(page2Ids));
      });
    });

    describe('queryByHostId', () => {
      it('should filter by host ID within date range', () => {
        const dateRange: DateRange = {
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 60_000).toISOString(),
        };

        const result = queryByHostId('host-a', dateRange);
        expect(result.events).toHaveLength(5);
        expect(result.events.every((e) => e.hostId === 'host-a')).toBe(true);
      });

      it('should return empty for non-matching host', () => {
        const dateRange: DateRange = {
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 60_000).toISOString(),
        };

        const result = queryByHostId('host-nonexistent', dateRange);
        expect(result.events).toHaveLength(0);
      });
    });

    describe('queryByConsumerUid', () => {
      it('should filter by consumer UID within date range', () => {
        const dateRange: DateRange = {
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 60_000).toISOString(),
        };

        const result = queryByConsumerUid('user-alpha', dateRange);
        expect(result.events).toHaveLength(3);
        expect(result.events.every((e) => e.actorUid === 'user-alpha')).toBe(true);
      });
    });

    describe('queryByEventType', () => {
      it('should filter by event type within date range', () => {
        const dateRange: DateRange = {
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 60_000).toISOString(),
        };

        const result = queryByEventType(SESSION_EVENT_TYPES.APP_LAUNCHED, dateRange);
        expect(result.events).toHaveLength(10);
        expect(result.events.every((e) => e.eventType === 'app_launched')).toBe(true);
      });

      it('should return empty for non-matching event type', () => {
        const dateRange: DateRange = {
          start: new Date(Date.now() - 60_000).toISOString(),
          end: new Date(Date.now() + 60_000).toISOString(),
        };

        const result = queryByEventType(SESSION_EVENT_TYPES.INCIDENT_RAISED, dateRange);
        expect(result.events).toHaveLength(0);
      });
    });

    describe('queryByHostId date range filtering', () => {
      it('should exclude events outside date range', () => {
        const dateRange: DateRange = {
          start: new Date(Date.now() + 100_000).toISOString(), // future
          end: new Date(Date.now() + 200_000).toISOString(),
        };

        const result = queryByHostId('host-a', dateRange);
        expect(result.events).toHaveLength(0);
      });
    });
  });

  // ─── Property-Based Test: Audit Chain Integrity (Property 4) ──────────────────

  describe('Property 4 — Audit Chain Integrity', () => {
    /**
     * **Validates: Requirements 8.5**
     *
     * ∀ events: SessionEvent[] ordered by timestamp,
     *   events[0].previousEventHash === null
     *   ∧ ∀ i > 0: events[i].previousEventHash === sha256(serialize(events[i-1]))
     */
    it('chain integrity holds for any sequence of valid events', () => {
      fc.assert(
        fc.property(
          // Generate 1-20 random event types for a single session
          fc.array(
            fc.constantFrom(...Object.values(SESSION_EVENT_TYPES)),
            { minLength: 1, maxLength: 20 },
          ),
          fc.uuid(),
          (eventTypes, sessionId) => {
            // Fresh state for each test case
            _clearAllState();

            const events: SessionEvent[] = [];
            for (const eventType of eventTypes) {
              const event = createAuditEvent({
                sessionId,
                bookingId: 'booking-pbt',
                eventType: eventType as SessionEventType,
                actorUid: 'actor-pbt',
                actorRole: 'system',
                hostId: 'host-pbt',
                metadata: {},
              });
              events.push(event);
            }

            // Property: first event has null previousEventHash
            expect(events[0].previousEventHash).toBeNull();

            // Property: each subsequent event hashes the previous
            for (let i = 1; i < events.length; i++) {
              const expectedHash = computeExpectedHash(events[i - 1]);
              expect(events[i].previousEventHash).toBe(expectedHash);
            }

            // Property: chain integrity verification passes
            expect(verifyChainIntegrity(sessionId)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('independent sessions have independent chains', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom(...Object.values(SESSION_EVENT_TYPES)),
            { minLength: 1, maxLength: 5 },
          ),
          fc.array(
            fc.constantFrom(...Object.values(SESSION_EVENT_TYPES)),
            { minLength: 1, maxLength: 5 },
          ),
          (types1, types2) => {
            _clearAllState();

            const sessionA = 'session-pbt-a';
            const sessionB = 'session-pbt-b';

            // Create events for session A
            for (const eventType of types1) {
              createAuditEvent({
                sessionId: sessionA,
                bookingId: 'booking-a',
                eventType: eventType as SessionEventType,
                actorUid: 'actor-a',
                actorRole: 'consumer',
                hostId: 'host-a',
                metadata: {},
              });
            }

            // Create events for session B
            for (const eventType of types2) {
              createAuditEvent({
                sessionId: sessionB,
                bookingId: 'booking-b',
                eventType: eventType as SessionEventType,
                actorUid: 'actor-b',
                actorRole: 'owner',
                hostId: 'host-b',
                metadata: {},
              });
            }

            // Both chains should be independently valid
            expect(verifyChainIntegrity(sessionA)).toBe(true);
            expect(verifyChainIntegrity(sessionB)).toBe(true);

            // First events of both sessions have null hash
            const eventsA = _getSessionEvents(sessionA);
            const eventsB = _getSessionEvents(sessionB);
            expect(eventsA[0].previousEventHash).toBeNull();
            expect(eventsB[0].previousEventHash).toBeNull();
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
