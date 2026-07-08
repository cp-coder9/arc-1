/**
 * Session Audit Service — Unit Tests
 *
 * Tests for the audit logging service covering:
 * - Event writing with retry and exponential backoff
 * - All 20 event types
 * - Role-scoped query functions
 * - Pagination (max 200 records)
 * - Append-only immutability enforcement
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (guaranteed to run before any imports) ───────────────────────

const { mockSet, mockGet, mockDocGet, mockBatchSet, mockBatchCommit, mockQueryChain } = vi.hoisted(() => {
  const mockSet = vi.fn();
  const mockGet = vi.fn();
  const mockDocGet = vi.fn();
  const mockBatchSet = vi.fn();
  const mockBatchCommit = vi.fn();

  const mockQueryChain: any = {
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    get: mockGet,
    select: vi.fn(),
  };

  mockQueryChain.where.mockReturnValue(mockQueryChain);
  mockQueryChain.orderBy.mockReturnValue(mockQueryChain);
  mockQueryChain.limit.mockReturnValue(mockQueryChain);
  mockQueryChain.startAfter.mockReturnValue(mockQueryChain);
  mockQueryChain.select.mockReturnValue(mockQueryChain);

  return { mockSet, mockGet, mockDocGet, mockBatchSet, mockBatchCommit, mockQueryChain };
});

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: mockSet,
        get: mockDocGet,
      })),
      where: mockQueryChain.where,
      orderBy: mockQueryChain.orderBy,
      limit: mockQueryChain.limit,
      startAfter: mockQueryChain.startAfter,
      get: mockGet,
      select: mockQueryChain.select,
    })),
    batch: vi.fn(() => ({
      set: mockBatchSet,
      commit: mockBatchCommit,
    })),
  },
}));

// Also mock the firebase-admin SDK modules to prevent actual initialization
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [{ name: 'test' }]),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({})),
}));

// ─── Import after mock ──────────────────────────────────────────────────────────

import {
  writeAuditEvent,
  writeBatchAuditEvents,
  queryAuditEvents,
  querySessionEvents,
  updateAuditEvent,
  deleteAuditEvent,
  SESSION_EVENT_TYPES,
  type WriteAuditEventInput,
} from '../sessionAuditService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createValidEventInput(
  overrides: Partial<WriteAuditEventInput> = {},
): WriteAuditEventInput {
  return {
    sessionId: 'session-001',
    bookingId: 'booking-001',
    eventType: 'session_started',
    actorUid: 'consumer-abc',
    actorRole: 'Consumer',
    hostId: 'host-xyz',
    timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    metadata: { connectionType: 'peer-to-peer' },
    ...overrides,
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(undefined);
  mockBatchCommit.mockResolvedValue(undefined);
  mockGet.mockResolvedValue({ docs: [] });
  mockDocGet.mockResolvedValue({ exists: false, data: () => null });
  // Re-set chainable returns after clear
  mockQueryChain.where.mockReturnValue(mockQueryChain);
  mockQueryChain.orderBy.mockReturnValue(mockQueryChain);
  mockQueryChain.limit.mockReturnValue(mockQueryChain);
  mockQueryChain.startAfter.mockReturnValue(mockQueryChain);
  mockQueryChain.select.mockReturnValue(mockQueryChain);
});

// ─── Event Types Completeness ───────────────────────────────────────────────────

describe('Event Types', () => {
  it('should define all 20 required event types', () => {
    expect(SESSION_EVENT_TYPES).toHaveLength(20);

    const requiredTypes = [
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
    ];

    for (const type of requiredTypes) {
      expect(SESSION_EVENT_TYPES).toContain(type);
    }
  });
});

// ─── Write Operations ───────────────────────────────────────────────────────────

describe('writeAuditEvent', () => {
  it('should write a valid event to Firestore and return the event with eventId', async () => {
    const input = createValidEventInput();

    const result = await writeAuditEvent(input);

    expect(result.eventId).toBeDefined();
    expect(result.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.sessionId).toBe(input.sessionId);
    expect(result.bookingId).toBe(input.bookingId);
    expect(result.eventType).toBe(input.eventType);
    expect(result.actorUid).toBe(input.actorUid);
    expect(result.actorRole).toBe(input.actorRole);
    expect(result.hostId).toBe(input.hostId);
    expect(result.timestamp).toEqual(input.timestamp);
    expect(result.metadata).toEqual(input.metadata);

    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('should write events for all 20 event types', async () => {
    for (const eventType of SESSION_EVENT_TYPES) {
      mockSet.mockResolvedValueOnce(undefined);
      const input = createValidEventInput({ eventType });
      const result = await writeAuditEvent(input);
      expect(result.eventType).toBe(eventType);
    }
  });

  it('should contain all required fields in the event record', async () => {
    const input = createValidEventInput();
    const result = await writeAuditEvent(input);

    // Req 11.1: event type, session ID, booking ID, actor UID, actor role, host ID, UTC timestamp
    expect(result).toHaveProperty('eventId');
    expect(result).toHaveProperty('sessionId');
    expect(result).toHaveProperty('bookingId');
    expect(result).toHaveProperty('eventType');
    expect(result).toHaveProperty('actorUid');
    expect(result).toHaveProperty('actorRole');
    expect(result).toHaveProperty('hostId');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('metadata');
  });

  it('should reject an event with missing sessionId', async () => {
    const input = createValidEventInput({ sessionId: '' });
    await expect(writeAuditEvent(input)).rejects.toThrow('validation failed');
  });

  it('should reject an event with missing bookingId', async () => {
    const input = createValidEventInput({ bookingId: '' });
    await expect(writeAuditEvent(input)).rejects.toThrow('validation failed');
  });

  it('should reject an event with missing actorUid', async () => {
    const input = createValidEventInput({ actorUid: '' });
    await expect(writeAuditEvent(input)).rejects.toThrow('validation failed');
  });

  it('should reject an event with missing hostId', async () => {
    const input = createValidEventInput({ hostId: '' });
    await expect(writeAuditEvent(input)).rejects.toThrow('validation failed');
  });

  it('should reject an event with actorRole exceeding 64 characters', async () => {
    const input = createValidEventInput({ actorRole: 'x'.repeat(65) });
    await expect(writeAuditEvent(input)).rejects.toThrow('validation failed');
  });

  it('should reject metadata exceeding 8KB', async () => {
    const largeMetadata: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      largeMetadata[`key_${i}`] = 'x'.repeat(10);
    }
    const input = createValidEventInput({ metadata: largeMetadata });
    await expect(writeAuditEvent(input)).rejects.toThrow('8KB');
  });

  it('should accept metadata under 8KB boundary', async () => {
    const metadata: Record<string, unknown> = { data: 'x'.repeat(8000) };
    const input = createValidEventInput({ metadata });
    const result = await writeAuditEvent(input);
    expect(result.metadata).toEqual(metadata);
  });
});

// ─── Retry Logic ────────────────────────────────────────────────────────────────

describe('Retry Logic', () => {
  it('should retry up to 3 times on Firestore write failure', async () => {
    mockSet
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined);

    const input = createValidEventInput();
    const result = await writeAuditEvent(input);

    expect(result.eventId).toBeDefined();
    expect(mockSet).toHaveBeenCalledTimes(3);
  });

  it('should throw after 3 failed attempts', async () => {
    mockSet
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockRejectedValueOnce(new Error('Fail 3'));

    const input = createValidEventInput();
    await expect(writeAuditEvent(input)).rejects.toThrow(
      'Failed to write audit event after 3 attempts',
    );
    expect(mockSet).toHaveBeenCalledTimes(3);
  });

  it('should succeed on first attempt without unnecessary retries', async () => {
    mockSet.mockResolvedValueOnce(undefined);

    const input = createValidEventInput();
    await writeAuditEvent(input);

    expect(mockSet).toHaveBeenCalledTimes(1);
  });
});

// ─── Batch Write ────────────────────────────────────────────────────────────────

describe('writeBatchAuditEvents', () => {
  it('should write multiple events in a batch', async () => {
    const events = [
      createValidEventInput({ eventType: 'session_started' }),
      createValidEventInput({ eventType: 'app_launched' }),
      createValidEventInput({ eventType: 'session_ended' }),
    ];

    const results = await writeBatchAuditEvents(events);

    expect(results).toHaveLength(3);
    expect(mockBatchSet).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('should retry batch writes on failure', async () => {
    mockBatchCommit
      .mockRejectedValueOnce(new Error('Batch error'))
      .mockResolvedValueOnce(undefined);

    const events = [createValidEventInput()];
    const results = await writeBatchAuditEvents(events);

    expect(results).toHaveLength(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
  });
});

// ─── Role-Scoped Queries ────────────────────────────────────────────────────────

describe('queryAuditEvents - Role Scoping', () => {
  it('should allow Platform_Admin to see all events', async () => {
    const mockDocs = [
      { data: () => ({ ...createValidEventInput(), eventId: 'e-1' }) },
      { data: () => ({ ...createValidEventInput({ sessionId: 'session-002' }), eventId: 'e-2' }) },
    ];
    mockGet.mockResolvedValueOnce({ docs: mockDocs });

    const result = await queryAuditEvents('admin-uid', 'Platform_Admin');

    expect(result.events).toHaveLength(2);
  });

  it('should restrict Owner to events on their own hosts', async () => {
    // First call: getOwnedHostIds
    const hostDocs = [
      { data: () => ({ hostId: 'host-1' }) },
      { data: () => ({ hostId: 'host-2' }) },
    ];
    mockGet.mockResolvedValueOnce({ docs: hostDocs });
    // Second call: actual events query
    const eventDocs = [
      { data: () => ({ ...createValidEventInput({ hostId: 'host-1' }), eventId: 'e-1' }) },
    ];
    mockGet.mockResolvedValueOnce({ docs: eventDocs });

    const result = await queryAuditEvents('owner-uid', 'Owner');

    expect(result.events).toHaveLength(1);
    expect(mockQueryChain.where).toHaveBeenCalledWith('ownerUid', '==', 'owner-uid');
    expect(mockQueryChain.where).toHaveBeenCalledWith('hostId', 'in', ['host-1', 'host-2']);
  });

  it('should return empty results for Owner with no hosts', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });

    const result = await queryAuditEvents('owner-no-hosts', 'Owner');

    expect(result.events).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('should restrict Consumer to their own sessions only', async () => {
    const eventDocs = [
      { data: () => ({ ...createValidEventInput({ actorUid: 'consumer-abc' }), eventId: 'e-1' }) },
    ];
    mockGet.mockResolvedValueOnce({ docs: eventDocs });

    const result = await queryAuditEvents('consumer-abc', 'Consumer');

    expect(result.events).toHaveLength(1);
    expect(mockQueryChain.where).toHaveBeenCalledWith('actorUid', '==', 'consumer-abc');
  });
});

// ─── Pagination ─────────────────────────────────────────────────────────────────

describe('Pagination', () => {
  it('should enforce maximum 200 records per response', async () => {
    const mockDocs = Array.from({ length: 201 }, (_, i) => ({
      data: () => ({ ...createValidEventInput(), eventId: `event-${i}` }),
    }));
    mockGet.mockResolvedValueOnce({ docs: mockDocs });

    const result = await queryAuditEvents('admin-uid', 'Platform_Admin', {
      limit: 200,
    });

    expect(result.events).toHaveLength(200);
    expect(result.hasMore).toBe(true);
    expect(mockQueryChain.limit).toHaveBeenCalledWith(201);
  });

  it('should cap limit at 200 even if higher is requested', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });

    await queryAuditEvents('admin-uid', 'Platform_Admin', { limit: 500 });

    expect(mockQueryChain.limit).toHaveBeenCalledWith(201);
  });

  it('should indicate hasMore=false when fewer results than limit', async () => {
    const mockDocs = Array.from({ length: 50 }, (_, i) => ({
      data: () => ({ ...createValidEventInput(), eventId: `event-${i}` }),
    }));
    mockGet.mockResolvedValueOnce({ docs: mockDocs });

    const result = await queryAuditEvents('admin-uid', 'Platform_Admin');

    expect(result.events).toHaveLength(50);
    expect(result.hasMore).toBe(false);
  });

  it('should support cursor-based pagination via startAfterEventId', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true });
    mockGet.mockResolvedValueOnce({ docs: [] });

    await queryAuditEvents('admin-uid', 'Platform_Admin', {
      startAfterEventId: 'event-prev-page',
    });

    expect(mockQueryChain.startAfter).toHaveBeenCalled();
  });

  it('should return lastEventId for next page cursor', async () => {
    const mockDocs = [
      { data: () => ({ ...createValidEventInput(), eventId: 'event-last' }) },
    ];
    mockGet.mockResolvedValueOnce({ docs: mockDocs });

    const result = await queryAuditEvents('admin-uid', 'Platform_Admin');

    expect(result.lastEventId).toBe('event-last');
  });

  it('should return undefined lastEventId when no results', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });

    const result = await queryAuditEvents('admin-uid', 'Platform_Admin');

    expect(result.lastEventId).toBeUndefined();
  });
});

// ─── Query Filtering ────────────────────────────────────────────────────────────

describe('Query Filtering', () => {
  it('should filter by sessionId', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });

    await queryAuditEvents('admin-uid', 'Platform_Admin', {
      sessionId: 'session-001',
    });

    expect(mockQueryChain.where).toHaveBeenCalledWith('sessionId', '==', 'session-001');
  });

  it('should filter by eventType', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });

    await queryAuditEvents('admin-uid', 'Platform_Admin', {
      eventType: 'focus_violation_attempted',
    });

    expect(mockQueryChain.where).toHaveBeenCalledWith(
      'eventType',
      '==',
      'focus_violation_attempted',
    );
  });

  it('should filter by hostId for non-Owner roles', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });

    await queryAuditEvents('admin-uid', 'Platform_Admin', {
      hostId: 'host-xyz',
    });

    expect(mockQueryChain.where).toHaveBeenCalledWith('hostId', '==', 'host-xyz');
  });

  it('should filter by date range', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });

    const start = { seconds: 1000000, nanoseconds: 0 };
    const end = { seconds: 2000000, nanoseconds: 0 };

    await queryAuditEvents('admin-uid', 'Platform_Admin', {
      dateRangeStart: start,
      dateRangeEnd: end,
    });

    expect(mockQueryChain.where).toHaveBeenCalledWith('timestamp', '>=', start);
    expect(mockQueryChain.where).toHaveBeenCalledWith('timestamp', '<=', end);
  });

  it('should order results by timestamp ascending', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });

    await queryAuditEvents('admin-uid', 'Platform_Admin');

    expect(mockQueryChain.orderBy).toHaveBeenCalledWith('timestamp', 'asc');
  });
});

// ─── Session-Specific Query ─────────────────────────────────────────────────────

describe('querySessionEvents', () => {
  it('should allow access for session Owner', async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerUid: 'owner-uid', consumerUid: 'consumer-uid' }),
    });
    mockGet.mockResolvedValueOnce({ docs: [{ data: () => ({ hostId: 'host-1' }) }] });
    mockGet.mockResolvedValueOnce({ docs: [] });

    const result = await querySessionEvents('session-001', 'owner-uid', 'Owner');

    expect(result).toBeDefined();
    expect(result.events).toBeDefined();
  });

  it('should deny access if Consumer is not the session consumer', async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerUid: 'owner-uid', consumerUid: 'consumer-uid' }),
    });

    const result = await querySessionEvents('session-001', 'wrong-consumer', 'Consumer');

    expect(result.events).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('should allow Platform_Admin access to any session', async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerUid: 'owner-uid', consumerUid: 'consumer-uid' }),
    });
    mockGet.mockResolvedValueOnce({ docs: [] });

    const result = await querySessionEvents('session-001', 'admin-uid', 'Platform_Admin');

    expect(result).toBeDefined();
  });

  it('should return empty for non-existent session', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false });

    const result = await querySessionEvents('non-existent', 'consumer-uid', 'Consumer');

    expect(result.events).toHaveLength(0);
  });
});

// ─── Immutability ───────────────────────────────────────────────────────────────

describe('Immutability Enforcement', () => {
  it('should reject any attempt to update an audit event', () => {
    expect(() => updateAuditEvent()).toThrow('append-only');
    expect(() => updateAuditEvent()).toThrow('Modification is not permitted');
  });

  it('should reject any attempt to delete an audit event', () => {
    expect(() => deleteAuditEvent()).toThrow('append-only');
    expect(() => deleteAuditEvent()).toThrow('Deletion is not permitted');
  });
});
