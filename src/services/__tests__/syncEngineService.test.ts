/**
 * Sync Engine Service — serializeQueue / deserializeQueue unit tests
 *
 * Tests the pure round-trip serialization functions for the offline capture queue.
 * Validates: Requirements 4.7, 4.12
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { serializeQueue, deserializeQueue, orderForTransmission, enqueue, reconcile, enqueueIO, flush, QUEUE_CAPACITY, MAX_FLUSH_ATTEMPTS } from '../syncEngineService';
import type { QueuedCapture } from '@/types';

function makeCapture(overrides: Partial<QueuedCapture> = {}): QueuedCapture {
  return {
    clientId: 'client-001',
    kind: 'field_issue',
    payload: { description: 'Crack in wall', severity: 'high' },
    createdAt: '2026-06-15T08:30:00.000Z',
    attempts: 0,
    status: 'queued',
    ...overrides,
  };
}

describe('serializeQueue / deserializeQueue', () => {
  describe('round-trip preserves all fields', () => {
    it('round-trips a queue with a single capture', () => {
      const original: QueuedCapture[] = [makeCapture()];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped).toEqual(original);
    });

    it('round-trips a queue with multiple captures', () => {
      const original: QueuedCapture[] = [
        makeCapture({ clientId: 'c-1', kind: 'field_issue', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'c-2', kind: 'photo_annotation', createdAt: '2026-06-15T08:01:00.000Z' }),
        makeCapture({ clientId: 'c-3', kind: 'checklist_response', createdAt: '2026-06-15T08:02:00.000Z' }),
      ];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped).toEqual(original);
    });

    it('preserves entry count', () => {
      const original: QueuedCapture[] = Array.from({ length: 10 }, (_, i) =>
        makeCapture({ clientId: `client-${i}`, createdAt: `2026-06-15T0${i}:00:00.000Z` })
      );
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped.length).toBe(original.length);
    });

    it('preserves entry order', () => {
      const original: QueuedCapture[] = [
        makeCapture({ clientId: 'first', createdAt: '2026-06-15T01:00:00.000Z' }),
        makeCapture({ clientId: 'second', createdAt: '2026-06-15T02:00:00.000Z' }),
        makeCapture({ clientId: 'third', createdAt: '2026-06-15T03:00:00.000Z' }),
      ];
      const roundTripped = deserializeQueue(serializeQueue(original));
      for (let i = 0; i < original.length; i++) {
        expect(roundTripped[i].clientId).toBe(original[i].clientId);
      }
    });

    it('preserves clientId field', () => {
      const original: QueuedCapture[] = [makeCapture({ clientId: 'unique-uuid-abc-123' })];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].clientId).toBe('unique-uuid-abc-123');
    });

    it('preserves kind field for all capture types', () => {
      const kinds: QueuedCapture['kind'][] = ['field_issue', 'photo_annotation', 'checklist_response'];
      const original: QueuedCapture[] = kinds.map((kind, i) =>
        makeCapture({ clientId: `c-${i}`, kind })
      );
      const roundTripped = deserializeQueue(serializeQueue(original));
      for (let i = 0; i < kinds.length; i++) {
        expect(roundTripped[i].kind).toBe(kinds[i]);
      }
    });

    it('preserves payload field with complex object', () => {
      const complexPayload = {
        description: 'Water ingress at window sill',
        severity: 'critical',
        measurements: [1.5, 2.3, 0.8],
        nested: { level: 'deep', tags: ['urgent', 'structural'] },
      };
      const original: QueuedCapture[] = [makeCapture({ payload: complexPayload })];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].payload).toEqual(complexPayload);
    });

    it('preserves createdAt field', () => {
      const original: QueuedCapture[] = [makeCapture({ createdAt: '2026-12-31T23:59:59.999Z' })];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].createdAt).toBe('2026-12-31T23:59:59.999Z');
    });

    it('preserves attempts field', () => {
      const original: QueuedCapture[] = [makeCapture({ attempts: 3 })];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].attempts).toBe(3);
    });

    it('preserves status field for queued captures', () => {
      const original: QueuedCapture[] = [makeCapture({ status: 'queued' })];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].status).toBe('queued');
    });

    it('preserves status field for failed captures', () => {
      const original: QueuedCapture[] = [makeCapture({ status: 'failed', attempts: 5 })];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].status).toBe('failed');
    });
  });

  describe('edge cases', () => {
    it('round-trips an empty queue', () => {
      const original: QueuedCapture[] = [];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped).toEqual([]);
      expect(roundTripped.length).toBe(0);
    });

    it('round-trips a queue at maximum capacity (500 entries)', () => {
      const original: QueuedCapture[] = Array.from({ length: QUEUE_CAPACITY }, (_, i) =>
        makeCapture({
          clientId: `client-${i}`,
          createdAt: new Date(Date.UTC(2026, 5, 15, 0, 0, i)).toISOString(),
        })
      );
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped).toEqual(original);
      expect(roundTripped.length).toBe(QUEUE_CAPACITY);
    });

    it('round-trips a capture with null payload', () => {
      const original: QueuedCapture[] = [makeCapture({ payload: null })];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].payload).toBeNull();
    });

    it('round-trips a capture with empty object payload', () => {
      const original: QueuedCapture[] = [makeCapture({ payload: {} })];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].payload).toEqual({});
    });

    it('round-trips a capture with special characters in payload', () => {
      const original: QueuedCapture[] = [
        makeCapture({ payload: { note: 'Crack "major" & <visible> — café → fix' } }),
      ];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped[0].payload).toEqual({ note: 'Crack "major" & <visible> — café → fix' });
    });

    it('round-trips captures with mixed statuses and attempt counts', () => {
      const original: QueuedCapture[] = [
        makeCapture({ clientId: 'a', status: 'queued', attempts: 0 }),
        makeCapture({ clientId: 'b', status: 'queued', attempts: 2 }),
        makeCapture({ clientId: 'c', status: 'failed', attempts: 5 }),
      ];
      const roundTripped = deserializeQueue(serializeQueue(original));
      expect(roundTripped).toEqual(original);
    });
  });

  describe('serialization output', () => {
    it('produces a valid JSON string', () => {
      const original: QueuedCapture[] = [makeCapture()];
      const serialized = serializeQueue(original);
      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('produces a string type', () => {
      const original: QueuedCapture[] = [makeCapture()];
      const serialized = serializeQueue(original);
      expect(typeof serialized).toBe('string');
    });

    it('produces an empty JSON array for empty queue', () => {
      const serialized = serializeQueue([]);
      expect(serialized).toBe('[]');
    });
  });

  describe('deserialization', () => {
    it('returns an array from valid JSON', () => {
      const original: QueuedCapture[] = [makeCapture()];
      const serialized = serializeQueue(original);
      const result = deserializeQueue(serialized);
      expect(Array.isArray(result)).toBe(true);
    });

    it('each element has all QueuedCapture fields', () => {
      const original: QueuedCapture[] = [makeCapture()];
      const serialized = serializeQueue(original);
      const result = deserializeQueue(serialized);
      expect(result[0]).toHaveProperty('clientId');
      expect(result[0]).toHaveProperty('kind');
      expect(result[0]).toHaveProperty('payload');
      expect(result[0]).toHaveProperty('createdAt');
      expect(result[0]).toHaveProperty('attempts');
      expect(result[0]).toHaveProperty('status');
    });
  });
});


describe('orderForTransmission', () => {
  function makeCapture(overrides: Partial<QueuedCapture> = {}): QueuedCapture {
    return {
      clientId: 'client-001',
      kind: 'field_issue',
      payload: { description: 'Test' },
      createdAt: '2026-06-15T08:30:00.000Z',
      attempts: 0,
      status: 'queued',
      ...overrides,
    };
  }

  describe('orders by createdAt ascending', () => {
    it('returns captures sorted by createdAt ascending', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'c-3', createdAt: '2026-06-15T10:00:00.000Z' }),
        makeCapture({ clientId: 'c-1', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'c-2', createdAt: '2026-06-15T09:00:00.000Z' }),
      ];
      const ordered = orderForTransmission(queue);
      expect(ordered[0].clientId).toBe('c-1');
      expect(ordered[1].clientId).toBe('c-2');
      expect(ordered[2].clientId).toBe('c-3');
    });

    it('preserves order when queue is already sorted', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'first', createdAt: '2026-06-15T01:00:00.000Z' }),
        makeCapture({ clientId: 'second', createdAt: '2026-06-15T02:00:00.000Z' }),
        makeCapture({ clientId: 'third', createdAt: '2026-06-15T03:00:00.000Z' }),
      ];
      const ordered = orderForTransmission(queue);
      expect(ordered[0].clientId).toBe('first');
      expect(ordered[1].clientId).toBe('second');
      expect(ordered[2].clientId).toBe('third');
    });

    it('handles reverse-ordered input', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'last', createdAt: '2026-06-15T23:59:59.000Z' }),
        makeCapture({ clientId: 'mid', createdAt: '2026-06-15T12:00:00.000Z' }),
        makeCapture({ clientId: 'first', createdAt: '2026-06-15T00:00:00.000Z' }),
      ];
      const ordered = orderForTransmission(queue);
      expect(ordered[0].clientId).toBe('first');
      expect(ordered[1].clientId).toBe('mid');
      expect(ordered[2].clientId).toBe('last');
    });

    it('handles captures across different dates', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'day3', createdAt: '2026-06-17T08:00:00.000Z' }),
        makeCapture({ clientId: 'day1', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'day2', createdAt: '2026-06-16T08:00:00.000Z' }),
      ];
      const ordered = orderForTransmission(queue);
      expect(ordered[0].clientId).toBe('day1');
      expect(ordered[1].clientId).toBe('day2');
      expect(ordered[2].clientId).toBe('day3');
    });
  });

  describe('does not mutate the input', () => {
    it('returns a new array reference', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'a', createdAt: '2026-06-15T02:00:00.000Z' }),
        makeCapture({ clientId: 'b', createdAt: '2026-06-15T01:00:00.000Z' }),
      ];
      const ordered = orderForTransmission(queue);
      expect(ordered).not.toBe(queue);
    });

    it('leaves original array unchanged', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'c-2', createdAt: '2026-06-15T10:00:00.000Z' }),
        makeCapture({ clientId: 'c-1', createdAt: '2026-06-15T08:00:00.000Z' }),
      ];
      const originalOrder = [...queue];
      orderForTransmission(queue);
      expect(queue[0].clientId).toBe(originalOrder[0].clientId);
      expect(queue[1].clientId).toBe(originalOrder[1].clientId);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const ordered = orderForTransmission([]);
      expect(ordered).toEqual([]);
      expect(ordered.length).toBe(0);
    });

    it('returns single-element array unchanged', () => {
      const queue: QueuedCapture[] = [makeCapture({ clientId: 'only' })];
      const ordered = orderForTransmission(queue);
      expect(ordered.length).toBe(1);
      expect(ordered[0].clientId).toBe('only');
    });

    it('preserves relative order for captures with identical createdAt', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'a', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'b', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'c', createdAt: '2026-06-15T08:00:00.000Z' }),
      ];
      const ordered = orderForTransmission(queue);
      // Stable sort preserves original insertion order for equal keys
      expect(ordered[0].clientId).toBe('a');
      expect(ordered[1].clientId).toBe('b');
      expect(ordered[2].clientId).toBe('c');
    });

    it('correctly orders captures with millisecond differences', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'ms-3', createdAt: '2026-06-15T08:00:00.003Z' }),
        makeCapture({ clientId: 'ms-1', createdAt: '2026-06-15T08:00:00.001Z' }),
        makeCapture({ clientId: 'ms-2', createdAt: '2026-06-15T08:00:00.002Z' }),
      ];
      const ordered = orderForTransmission(queue);
      expect(ordered[0].clientId).toBe('ms-1');
      expect(ordered[1].clientId).toBe('ms-2');
      expect(ordered[2].clientId).toBe('ms-3');
    });
  });
});


describe('enqueue', () => {
  function makeCapture(overrides: Partial<QueuedCapture> = {}): QueuedCapture {
    return {
      clientId: 'new-capture-001',
      kind: 'field_issue',
      payload: { description: 'Test capture' },
      createdAt: '2026-06-15T10:00:00.000Z',
      attempts: 0,
      status: 'queued',
      ...overrides,
    };
  }

  describe('adds capture when below capacity', () => {
    it('appends capture to an empty queue', () => {
      const capture = makeCapture();
      const result = enqueue([], capture);
      expect(result.queue).toEqual([capture]);
      expect(result.error).toBeUndefined();
    });

    it('appends capture to the end of a non-empty queue', () => {
      const existing: QueuedCapture[] = [
        makeCapture({ clientId: 'existing-1', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'existing-2', createdAt: '2026-06-15T09:00:00.000Z' }),
      ];
      const newCapture = makeCapture({ clientId: 'new-3', createdAt: '2026-06-15T10:00:00.000Z' });
      const result = enqueue(existing, newCapture);
      expect(result.queue.length).toBe(3);
      expect(result.queue[2]).toEqual(newCapture);
      expect(result.error).toBeUndefined();
    });

    it('accepts captures up to capacity (499 -> 500)', () => {
      const queue: QueuedCapture[] = Array.from({ length: 499 }, (_, i) =>
        makeCapture({ clientId: `c-${i}`, createdAt: new Date(Date.UTC(2026, 5, 15, 0, 0, i)).toISOString() })
      );
      const capture = makeCapture({ clientId: 'c-499' });
      const result = enqueue(queue, capture);
      expect(result.queue.length).toBe(500);
      expect(result.error).toBeUndefined();
    });

    it('supports at least 500 captures', () => {
      // Fill a queue incrementally to 500
      let queue: QueuedCapture[] = [];
      for (let i = 0; i < QUEUE_CAPACITY; i++) {
        const capture = makeCapture({ clientId: `cap-${i}`, createdAt: new Date(Date.UTC(2026, 5, 15, 0, 0, i)).toISOString() });
        const result = enqueue(queue, capture);
        expect(result.error).toBeUndefined();
        queue = result.queue;
      }
      expect(queue.length).toBe(QUEUE_CAPACITY);
    });
  });

  describe('rejects with queue_full at capacity', () => {
    it('returns queue_full error when queue is at capacity (500)', () => {
      const queue: QueuedCapture[] = Array.from({ length: QUEUE_CAPACITY }, (_, i) =>
        makeCapture({ clientId: `c-${i}`, createdAt: new Date(Date.UTC(2026, 5, 15, 0, 0, i)).toISOString() })
      );
      const capture = makeCapture({ clientId: 'overflow' });
      const result = enqueue(queue, capture);
      expect(result.error).toBe('queue_full');
    });

    it('returns the original queue unchanged when full', () => {
      const queue: QueuedCapture[] = Array.from({ length: QUEUE_CAPACITY }, (_, i) =>
        makeCapture({ clientId: `c-${i}`, createdAt: new Date(Date.UTC(2026, 5, 15, 0, 0, i)).toISOString() })
      );
      const capture = makeCapture({ clientId: 'overflow' });
      const result = enqueue(queue, capture);
      expect(result.queue).toBe(queue); // same reference — not modified
      expect(result.queue.length).toBe(QUEUE_CAPACITY);
    });

    it('rejects when queue exceeds capacity', () => {
      // Edge case: queue somehow already above capacity
      const queue: QueuedCapture[] = Array.from({ length: 501 }, (_, i) =>
        makeCapture({ clientId: `c-${i}`, createdAt: new Date(Date.UTC(2026, 5, 15, 0, 0, i)).toISOString() })
      );
      const capture = makeCapture({ clientId: 'overflow' });
      const result = enqueue(queue, capture);
      expect(result.error).toBe('queue_full');
      expect(result.queue).toBe(queue);
    });
  });

  describe('does not mutate the input array', () => {
    it('returns a new array reference on success', () => {
      const queue: QueuedCapture[] = [makeCapture({ clientId: 'existing' })];
      const capture = makeCapture({ clientId: 'new' });
      const result = enqueue(queue, capture);
      expect(result.queue).not.toBe(queue);
    });

    it('original array is unchanged after enqueue', () => {
      const queue: QueuedCapture[] = [
        makeCapture({ clientId: 'a' }),
        makeCapture({ clientId: 'b' }),
      ];
      const originalLength = queue.length;
      const capture = makeCapture({ clientId: 'c' });
      enqueue(queue, capture);
      expect(queue.length).toBe(originalLength);
      expect(queue[0].clientId).toBe('a');
      expect(queue[1].clientId).toBe('b');
    });
  });
});


describe('reconcile', () => {
  function makeCapture(overrides: Partial<QueuedCapture> = {}): QueuedCapture {
    return {
      clientId: 'capture-001',
      kind: 'field_issue',
      payload: { description: 'Test capture' },
      createdAt: '2026-06-15T10:00:00.000Z',
      attempts: 0,
      status: 'queued',
      ...overrides,
    };
  }

  describe('returns persist when client ID not yet persisted', () => {
    it('returns persist for a capture with a new client ID', () => {
      const persisted = new Set<string>();
      const capture = makeCapture({ clientId: 'new-id' });
      expect(reconcile(persisted, capture)).toBe('persist');
    });

    it('returns persist when persisted set contains other IDs but not the capture ID', () => {
      const persisted = new Set(['other-1', 'other-2', 'other-3']);
      const capture = makeCapture({ clientId: 'different-id' });
      expect(reconcile(persisted, capture)).toBe('persist');
    });

    it('returns persist for each unique client ID in a batch', () => {
      const persisted = new Set<string>();
      const captures = [
        makeCapture({ clientId: 'batch-1' }),
        makeCapture({ clientId: 'batch-2' }),
        makeCapture({ clientId: 'batch-3' }),
      ];
      for (const capture of captures) {
        expect(reconcile(persisted, capture)).toBe('persist');
      }
    });
  });

  describe('returns skip when client ID already persisted', () => {
    it('returns skip for a capture whose client ID is in the persisted set', () => {
      const persisted = new Set(['capture-001']);
      const capture = makeCapture({ clientId: 'capture-001' });
      expect(reconcile(persisted, capture)).toBe('skip');
    });

    it('returns skip regardless of capture kind', () => {
      const persisted = new Set(['dup-id']);
      const kinds: QueuedCapture['kind'][] = ['field_issue', 'photo_annotation', 'checklist_response'];
      for (const kind of kinds) {
        const capture = makeCapture({ clientId: 'dup-id', kind });
        expect(reconcile(persisted, capture)).toBe('skip');
      }
    });

    it('returns skip regardless of capture status', () => {
      const persisted = new Set(['dup-id']);
      const capture = makeCapture({ clientId: 'dup-id', status: 'failed', attempts: 5 });
      expect(reconcile(persisted, capture)).toBe('skip');
    });

    it('returns skip regardless of capture payload', () => {
      const persisted = new Set(['dup-id']);
      const capture = makeCapture({ clientId: 'dup-id', payload: { different: 'payload' } });
      expect(reconcile(persisted, capture)).toBe('skip');
    });
  });

  describe('idempotent: produces single record per client ID', () => {
    it('same capture reconciled twice produces one persist and one skip', () => {
      const persisted = new Set<string>();
      const capture = makeCapture({ clientId: 'idempotent-id' });

      // First time: not yet persisted
      const first = reconcile(persisted, capture);
      expect(first).toBe('persist');

      // Simulate successful persistence
      persisted.add(capture.clientId);

      // Second time: already persisted
      const second = reconcile(persisted, capture);
      expect(second).toBe('skip');
    });

    it('multiple reconcile calls for the same ID after persistence all return skip', () => {
      const persisted = new Set(['already-synced']);
      const capture = makeCapture({ clientId: 'already-synced' });

      expect(reconcile(persisted, capture)).toBe('skip');
      expect(reconcile(persisted, capture)).toBe('skip');
      expect(reconcile(persisted, capture)).toBe('skip');
    });

    it('tracks multiple persisted IDs correctly', () => {
      const persisted = new Set(['id-1', 'id-2', 'id-3']);

      expect(reconcile(persisted, makeCapture({ clientId: 'id-1' }))).toBe('skip');
      expect(reconcile(persisted, makeCapture({ clientId: 'id-2' }))).toBe('skip');
      expect(reconcile(persisted, makeCapture({ clientId: 'id-3' }))).toBe('skip');
      expect(reconcile(persisted, makeCapture({ clientId: 'id-4' }))).toBe('persist');
    });
  });

  describe('edge cases', () => {
    it('works with an empty persisted set', () => {
      const persisted = new Set<string>();
      const capture = makeCapture({ clientId: 'any-id' });
      expect(reconcile(persisted, capture)).toBe('persist');
    });

    it('works with a large persisted set', () => {
      const persisted = new Set(
        Array.from({ length: 1000 }, (_, i) => `persisted-${i}`)
      );
      // A new ID not in the set
      expect(reconcile(persisted, makeCapture({ clientId: 'brand-new' }))).toBe('persist');
      // An ID that is in the set
      expect(reconcile(persisted, makeCapture({ clientId: 'persisted-500' }))).toBe('skip');
    });

    it('handles client IDs with special characters', () => {
      const specialId = 'uuid-1234-abcd-5678/with:special@chars!';
      const persisted = new Set([specialId]);
      expect(reconcile(persisted, makeCapture({ clientId: specialId }))).toBe('skip');
    });

    it('client ID matching is case-sensitive', () => {
      const persisted = new Set(['Client-ID']);
      expect(reconcile(persisted, makeCapture({ clientId: 'Client-ID' }))).toBe('skip');
      expect(reconcile(persisted, makeCapture({ clientId: 'client-id' }))).toBe('persist');
      expect(reconcile(persisted, makeCapture({ clientId: 'CLIENT-ID' }))).toBe('persist');
    });
  });
});


describe('enqueueIO', () => {
  // Mock localStorage
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    const localStorageMock = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (index: number) => Object.keys(store)[index] ?? null,
    };
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
  });

  function makeCapture(overrides: Partial<QueuedCapture> = {}): QueuedCapture {
    return {
      clientId: 'io-capture-001',
      kind: 'field_issue',
      payload: { description: 'Test IO capture' },
      createdAt: '2026-06-15T10:00:00.000Z',
      attempts: 0,
      status: 'queued',
      ...overrides,
    };
  }

  describe('successfully enqueues and persists to localStorage', () => {
    it('enqueues a capture to an empty queue and serializes to localStorage', () => {
      const capture = makeCapture();
      const result = enqueueIO('project-1', capture);

      expect(result).toEqual({ success: true });
      expect(store['architex:syncQueue:project-1']).toBeDefined();

      const persisted = JSON.parse(store['architex:syncQueue:project-1']);
      expect(persisted).toEqual([capture]);
    });

    it('appends a capture to an existing queue in localStorage', () => {
      const existing = [makeCapture({ clientId: 'existing-1', createdAt: '2026-06-15T08:00:00.000Z' })];
      store['architex:syncQueue:project-1'] = JSON.stringify(existing);

      const newCapture = makeCapture({ clientId: 'new-2', createdAt: '2026-06-15T09:00:00.000Z' });
      const result = enqueueIO('project-1', newCapture);

      expect(result).toEqual({ success: true });
      const persisted = JSON.parse(store['architex:syncQueue:project-1']);
      expect(persisted.length).toBe(2);
      expect(persisted[0].clientId).toBe('existing-1');
      expect(persisted[1].clientId).toBe('new-2');
    });

    it('uses the correct localStorage key for the project', () => {
      const capture = makeCapture();
      enqueueIO('my-project-xyz', capture);

      expect(store['architex:syncQueue:my-project-xyz']).toBeDefined();
      expect(store['architex:syncQueue:project-1']).toBeUndefined();
    });

    it('isolates queues between different projects', () => {
      const capture1 = makeCapture({ clientId: 'cap-a' });
      const capture2 = makeCapture({ clientId: 'cap-b' });

      enqueueIO('project-a', capture1);
      enqueueIO('project-b', capture2);

      const queueA = JSON.parse(store['architex:syncQueue:project-a']);
      const queueB = JSON.parse(store['architex:syncQueue:project-b']);

      expect(queueA.length).toBe(1);
      expect(queueA[0].clientId).toBe('cap-a');
      expect(queueB.length).toBe(1);
      expect(queueB[0].clientId).toBe('cap-b');
    });
  });

  describe('returns queue_full error when capacity exceeded', () => {
    it('returns queue_full when localStorage already has 500 entries', () => {
      const fullQueue = Array.from({ length: QUEUE_CAPACITY }, (_, i) =>
        makeCapture({ clientId: `c-${i}`, createdAt: new Date(Date.UTC(2026, 5, 15, 0, 0, i)).toISOString() })
      );
      store['architex:syncQueue:project-1'] = JSON.stringify(fullQueue);

      const capture = makeCapture({ clientId: 'overflow' });
      const result = enqueueIO('project-1', capture);

      expect(result).toEqual({ success: false, error: 'queue_full' });
    });

    it('does not modify localStorage when queue is full', () => {
      const fullQueue = Array.from({ length: QUEUE_CAPACITY }, (_, i) =>
        makeCapture({ clientId: `c-${i}`, createdAt: new Date(Date.UTC(2026, 5, 15, 0, 0, i)).toISOString() })
      );
      const serialized = JSON.stringify(fullQueue);
      store['architex:syncQueue:project-1'] = serialized;

      const capture = makeCapture({ clientId: 'overflow' });
      enqueueIO('project-1', capture);

      // localStorage should remain unchanged
      expect(store['architex:syncQueue:project-1']).toBe(serialized);
    });
  });

  describe('serialization survives restart (round-trip)', () => {
    it('queued captures survive simulated app restart', () => {
      const capture1 = makeCapture({ clientId: 'restart-1', createdAt: '2026-06-15T08:00:00.000Z' });
      const capture2 = makeCapture({ clientId: 'restart-2', createdAt: '2026-06-15T09:00:00.000Z' });

      enqueueIO('project-1', capture1);
      enqueueIO('project-1', capture2);

      // Simulate restart: read raw localStorage and deserialize
      const raw = store['architex:syncQueue:project-1'];
      const restored = JSON.parse(raw);

      expect(restored.length).toBe(2);
      expect(restored[0]).toEqual(capture1);
      expect(restored[1]).toEqual(capture2);
    });

    it('preserves all QueuedCapture fields through localStorage round-trip', () => {
      const capture = makeCapture({
        clientId: 'full-fields',
        kind: 'photo_annotation',
        payload: { uri: 'blob://photo-1', shapes: [{ type: 'arrow' }] },
        createdAt: '2026-06-15T14:30:00.000Z',
        attempts: 2,
        status: 'queued',
      });

      enqueueIO('project-1', capture);

      const raw = store['architex:syncQueue:project-1'];
      const restored = JSON.parse(raw);

      expect(restored[0].clientId).toBe('full-fields');
      expect(restored[0].kind).toBe('photo_annotation');
      expect(restored[0].payload).toEqual({ uri: 'blob://photo-1', shapes: [{ type: 'arrow' }] });
      expect(restored[0].createdAt).toBe('2026-06-15T14:30:00.000Z');
      expect(restored[0].attempts).toBe(2);
      expect(restored[0].status).toBe('queued');
    });
  });

  describe('edge cases', () => {
    it('handles an empty string in localStorage gracefully by starting fresh', () => {
      // An empty string is falsy, so getItem returns it but it's handled
      // Actually localStorage.getItem returns null for missing keys, and '' for empty stored values
      // Our implementation checks `raw ? deserialize : []` — empty string is falsy, so starts fresh
      store['architex:syncQueue:project-1'] = '';

      const capture = makeCapture();
      const result = enqueueIO('project-1', capture);

      expect(result).toEqual({ success: true });
      const persisted = JSON.parse(store['architex:syncQueue:project-1']);
      expect(persisted).toEqual([capture]);
    });
  });
});


describe('flush', () => {
  // Mock localStorage
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    const localStorageMock = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (index: number) => Object.keys(store)[index] ?? null,
    };
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
  });

  function makeCapture(overrides: Partial<QueuedCapture> = {}): QueuedCapture {
    return {
      clientId: 'flush-capture-001',
      kind: 'field_issue',
      payload: { description: 'Flush test capture' },
      createdAt: '2026-06-15T10:00:00.000Z',
      attempts: 0,
      status: 'queued',
      ...overrides,
    };
  }

  function setQueue(projectId: string, queue: QueuedCapture[]) {
    store[`architex:syncQueue:${projectId}`] = JSON.stringify(queue);
  }

  function getQueue(projectId: string): QueuedCapture[] {
    const raw = store[`architex:syncQueue:${projectId}`];
    return raw ? JSON.parse(raw) : [];
  }

  describe('empty queue returns zero counts', () => {
    it('returns { flushed: 0, failed: 0 } when queue is empty', async () => {
      const result = await flush('project-1', async () => {});
      expect(result).toEqual({ flushed: 0, failed: 0 });
    });

    it('returns { flushed: 0, failed: 0 } when localStorage key does not exist', async () => {
      const result = await flush('nonexistent-project', async () => {});
      expect(result).toEqual({ flushed: 0, failed: 0 });
    });
  });

  describe('transmits queued captures in creation order', () => {
    it('calls persistFn for each queued capture in createdAt ascending order', async () => {
      const captures = [
        makeCapture({ clientId: 'c-3', createdAt: '2026-06-15T12:00:00.000Z' }),
        makeCapture({ clientId: 'c-1', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'c-2', createdAt: '2026-06-15T10:00:00.000Z' }),
      ];
      setQueue('project-1', captures);

      const callOrder: string[] = [];
      const persistFn = async (capture: QueuedCapture) => {
        callOrder.push(capture.clientId);
      };

      await flush('project-1', persistFn);

      expect(callOrder).toEqual(['c-1', 'c-2', 'c-3']);
    });

    it('returns correct flushed count on full success', async () => {
      const captures = [
        makeCapture({ clientId: 'a', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'b', createdAt: '2026-06-15T09:00:00.000Z' }),
        makeCapture({ clientId: 'c', createdAt: '2026-06-15T10:00:00.000Z' }),
      ];
      setQueue('project-1', captures);

      const result = await flush('project-1', async () => {});
      expect(result.flushed).toBe(3);
      expect(result.failed).toBe(0);
    });
  });

  describe('on success, removes from queue and localStorage', () => {
    it('removes successfully persisted captures from localStorage', async () => {
      const captures = [
        makeCapture({ clientId: 'a', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'b', createdAt: '2026-06-15T09:00:00.000Z' }),
      ];
      setQueue('project-1', captures);

      await flush('project-1', async () => {});

      const remaining = getQueue('project-1');
      expect(remaining.length).toBe(0);
    });

    it('removes only the successfully flushed captures', async () => {
      const captures = [
        makeCapture({ clientId: 'success-1', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'fail-1', createdAt: '2026-06-15T09:00:00.000Z' }),
        makeCapture({ clientId: 'success-2', createdAt: '2026-06-15T10:00:00.000Z' }),
      ];
      setQueue('project-1', captures);

      const persistFn = async (capture: QueuedCapture) => {
        if (capture.clientId === 'fail-1') throw new Error('Network error');
      };

      await flush('project-1', persistFn);

      const remaining = getQueue('project-1');
      expect(remaining.length).toBe(1);
      expect(remaining[0].clientId).toBe('fail-1');
    });
  });

  describe('on failure, retains in queue and increments attempt count', () => {
    it('increments attempts on failed persistence', async () => {
      const captures = [
        makeCapture({ clientId: 'fail-cap', createdAt: '2026-06-15T08:00:00.000Z', attempts: 0 }),
      ];
      setQueue('project-1', captures);

      const persistFn = async () => { throw new Error('Network error'); };

      await flush('project-1', persistFn);

      const remaining = getQueue('project-1');
      expect(remaining.length).toBe(1);
      expect(remaining[0].clientId).toBe('fail-cap');
      expect(remaining[0].attempts).toBe(1);
    });

    it('retains capture in queue on failure', async () => {
      const captures = [
        makeCapture({ clientId: 'retained', createdAt: '2026-06-15T08:00:00.000Z', attempts: 2 }),
      ];
      setQueue('project-1', captures);

      const persistFn = async () => { throw new Error('Timeout'); };

      await flush('project-1', persistFn);

      const remaining = getQueue('project-1');
      expect(remaining.length).toBe(1);
      expect(remaining[0].clientId).toBe('retained');
      expect(remaining[0].attempts).toBe(3);
      expect(remaining[0].status).toBe('queued'); // not yet at 5
    });
  });

  describe('marks as failed after 5 retry attempts', () => {
    it('marks capture as failed when attempts reach 5', async () => {
      const captures = [
        makeCapture({ clientId: 'exhaust', createdAt: '2026-06-15T08:00:00.000Z', attempts: 4 }),
      ];
      setQueue('project-1', captures);

      const persistFn = async () => { throw new Error('Persistent failure'); };

      await flush('project-1', persistFn);

      const remaining = getQueue('project-1');
      expect(remaining.length).toBe(1);
      expect(remaining[0].clientId).toBe('exhaust');
      expect(remaining[0].attempts).toBe(5);
      expect(remaining[0].status).toBe('failed');
    });

    it('reports failed count for exhausted captures', async () => {
      const captures = [
        makeCapture({ clientId: 'exhaust-1', createdAt: '2026-06-15T08:00:00.000Z', attempts: 4 }),
        makeCapture({ clientId: 'exhaust-2', createdAt: '2026-06-15T09:00:00.000Z', attempts: 4 }),
        makeCapture({ clientId: 'ok', createdAt: '2026-06-15T10:00:00.000Z', attempts: 0 }),
      ];
      setQueue('project-1', captures);

      const persistFn = async (capture: QueuedCapture) => {
        if (capture.clientId.startsWith('exhaust')) throw new Error('Fail');
      };

      const result = await flush('project-1', persistFn);

      expect(result.failed).toBe(2);
      expect(result.flushed).toBe(1);
    });

    it('does not mark capture as failed if attempts < 5 after increment', async () => {
      const captures = [
        makeCapture({ clientId: 'retry-3', createdAt: '2026-06-15T08:00:00.000Z', attempts: 3 }),
      ];
      setQueue('project-1', captures);

      const persistFn = async () => { throw new Error('Fail'); };

      await flush('project-1', persistFn);

      const remaining = getQueue('project-1');
      expect(remaining[0].attempts).toBe(4);
      expect(remaining[0].status).toBe('queued');
    });

    it('MAX_FLUSH_ATTEMPTS equals 5', () => {
      expect(MAX_FLUSH_ATTEMPTS).toBe(5);
    });
  });

  describe('returns failed count', () => {
    it('returns failed: 0 when all captures succeed', async () => {
      const captures = [
        makeCapture({ clientId: 'a', createdAt: '2026-06-15T08:00:00.000Z' }),
      ];
      setQueue('project-1', captures);

      const result = await flush('project-1', async () => {});
      expect(result.failed).toBe(0);
    });

    it('counts captures that were already marked failed before flush', async () => {
      const captures = [
        makeCapture({ clientId: 'already-failed', createdAt: '2026-06-15T08:00:00.000Z', attempts: 5, status: 'failed' }),
        makeCapture({ clientId: 'new-ok', createdAt: '2026-06-15T09:00:00.000Z', attempts: 0 }),
      ];
      setQueue('project-1', captures);

      const persistFn = async (capture: QueuedCapture) => {
        if (capture.clientId === 'already-failed') throw new Error('Still fails');
      };

      const result = await flush('project-1', persistFn);

      // already-failed still in queue with status 'failed', new-ok gets flushed
      expect(result.flushed).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('returns combined flushed and failed in a mixed scenario', async () => {
      const captures = [
        makeCapture({ clientId: 'ok-1', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'fail-exhaust', createdAt: '2026-06-15T09:00:00.000Z', attempts: 4 }),
        makeCapture({ clientId: 'ok-2', createdAt: '2026-06-15T10:00:00.000Z' }),
        makeCapture({ clientId: 'fail-retry', createdAt: '2026-06-15T11:00:00.000Z', attempts: 1 }),
      ];
      setQueue('project-1', captures);

      const persistFn = async (capture: QueuedCapture) => {
        if (capture.clientId.startsWith('fail')) throw new Error('Fail');
      };

      const result = await flush('project-1', persistFn);

      expect(result.flushed).toBe(2); // ok-1 and ok-2
      expect(result.failed).toBe(1); // fail-exhaust (attempts now 5, marked failed)
      // fail-retry is still in queue with attempts=2, status='queued' — not counted as failed
    });
  });

  describe('idempotent reconciliation', () => {
    it('skips captures whose clientId is already persisted within the same flush', async () => {
      // Simulate a scenario where two entries have the same clientId (edge case)
      const captures = [
        makeCapture({ clientId: 'dup-id', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'dup-id', createdAt: '2026-06-15T09:00:00.000Z' }),
      ];
      setQueue('project-1', captures);

      let callCount = 0;
      const persistFn = async () => { callCount++; };

      const result = await flush('project-1', persistFn);

      // Only one persist call — second is skipped via reconcile
      expect(callCount).toBe(1);
      // Both entries removed from queue (same clientId matched by flushedClientIds)
      const remaining = getQueue('project-1');
      expect(remaining.length).toBe(0);
      // flushed count is 1 (unique clientIds persisted)
      expect(result.flushed).toBe(1);
    });
  });

  describe('localStorage persistence after flush', () => {
    it('writes remaining queue back to localStorage after flush', async () => {
      const captures = [
        makeCapture({ clientId: 'ok', createdAt: '2026-06-15T08:00:00.000Z' }),
        makeCapture({ clientId: 'fail', createdAt: '2026-06-15T09:00:00.000Z' }),
      ];
      setQueue('project-1', captures);

      const persistFn = async (capture: QueuedCapture) => {
        if (capture.clientId === 'fail') throw new Error('Fail');
      };

      await flush('project-1', persistFn);

      const raw = store['architex:syncQueue:project-1'];
      expect(raw).toBeDefined();
      const remaining = JSON.parse(raw);
      expect(remaining.length).toBe(1);
      expect(remaining[0].clientId).toBe('fail');
    });

    it('writes an empty array to localStorage when all succeed', async () => {
      const captures = [
        makeCapture({ clientId: 'a', createdAt: '2026-06-15T08:00:00.000Z' }),
      ];
      setQueue('project-1', captures);

      await flush('project-1', async () => {});

      const raw = store['architex:syncQueue:project-1'];
      expect(raw).toBeDefined();
      expect(JSON.parse(raw)).toEqual([]);
    });
  });
});
