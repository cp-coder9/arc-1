/**
 * Unit tests for the Audit Adapter
 *
 * Tests: ID/timestamp generation, validation, successful creation,
 * and graceful degradation on failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAuditEvent } from '../services/auditAdapter';
import type { CreateAuditEventInput } from '../services/auditAdapter';
import type { AuditEvent } from '../types';

function makeValidInput(
  overrides: Partial<CreateAuditEventInput> = {},
): CreateAuditEventInput {
  return {
    entityType: 'building',
    entityId: 'bld-123',
    eventType: 'handover_completed',
    actorId: 'user-abc',
    actorDisplayName: 'John Doe',
    metadata: { documentsTransferred: 12, warrantiesCreated: 5 },
    ...overrides,
  };
}

describe('createAuditEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T14:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an audit event with provided id and timestamp', async () => {
    const persist = vi.fn().mockResolvedValue('audit-001');
    const input = makeValidInput({
      id: 'audit-001',
      timestamp: '2026-03-15T14:00:00.000Z',
    });

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('audit-001');
      expect(result.data.timestamp).toBe('2026-03-15T14:00:00.000Z');
      expect(result.data.entityType).toBe('building');
      expect(result.data.entityId).toBe('bld-123');
      expect(result.data.eventType).toBe('handover_completed');
      expect(result.data.actorId).toBe('user-abc');
      expect(result.data.actorDisplayName).toBe('John Doe');
      expect(result.data.metadata).toEqual({
        documentsTransferred: 12,
        warrantiesCreated: 5,
      });
    }
    expect(persist).toHaveBeenCalledOnce();
  });

  it('generates id when not provided', async () => {
    const persist = vi.fn().mockResolvedValue('generated-id');
    const input = makeValidInput();

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toMatch(/^audit_\d+_[a-z0-9]+$/);
    }
  });

  it('generates timestamp when not provided', async () => {
    const persist = vi.fn().mockResolvedValue('id');
    const input = makeValidInput();

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timestamp).toBe('2026-03-15T14:30:00.000Z');
    }
  });

  it('uses provided timestamp when given', async () => {
    const persist = vi.fn().mockResolvedValue('id');
    const input = makeValidInput({ timestamp: '2025-12-01T08:00:00.000Z' });

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timestamp).toBe('2025-12-01T08:00:00.000Z');
    }
  });

  it('returns validation error for missing required entityId', async () => {
    const persist = vi.fn();
    const input = makeValidInput({ entityId: '' });

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('failed validation');
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns validation error for invalid entityType', async () => {
    const persist = vi.fn();
    const input = makeValidInput({
      entityType: 'invalid' as AuditEvent['entityType'],
    });

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns validation error for missing actorDisplayName', async () => {
    const persist = vi.fn();
    const input = makeValidInput({ actorDisplayName: '' });

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it('handles persistence failure gracefully without throwing', async () => {
    const persist = vi
      .fn()
      .mockRejectedValue(new Error('Connection refused'));
    const input = makeValidInput({ id: 'audit-fail' });

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PERSISTENCE_ERROR');
      expect(result.error.message).toContain('audit trail unavailable');
      expect(result.error.details).toEqual({
        originalError: 'Connection refused',
      });
    }
  });

  it('handles non-Error persistence failures gracefully', async () => {
    const persist = vi.fn().mockRejectedValue(42);
    const input = makeValidInput({ id: 'audit-fail-2' });

    const result = await createAuditEvent(input, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PERSISTENCE_ERROR');
      expect(result.error.details).toEqual({
        originalError: 'Unknown persistence error',
      });
    }
  });

  it('passes the fully assembled event to the persistence callback', async () => {
    const persist = vi.fn().mockResolvedValue('stored-id');
    const input = makeValidInput({ id: 'audit-100' });

    await createAuditEvent(input, persist);

    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audit-100',
        entityType: 'building',
        entityId: 'bld-123',
        eventType: 'handover_completed',
        actorId: 'user-abc',
        actorDisplayName: 'John Doe',
      }),
    );
  });

  it('supports all valid entity types', async () => {
    const persist = vi.fn().mockResolvedValue('id');

    for (const entityType of ['building', 'firm', 'project'] as const) {
      const input = makeValidInput({ entityType, id: `audit-${entityType}` });
      const result = await createAuditEvent(input, persist);
      expect(result.success).toBe(true);
    }
  });
});
