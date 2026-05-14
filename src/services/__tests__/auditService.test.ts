import { describe, expect, it, vi } from 'vitest';
import { assertAuditEventImmutableUpdateAttempt, buildAuditEvent, writeAuditEvent } from '../auditService';

describe('auditService', () => {
  it('builds immutable audit events with required actor, category, action, and timestamp', () => {
    const event = buildAuditEvent({
      category: 'role',
      action: ' role.assigned ',
      actor: { uid: 'admin-1', role: 'admin' },
      target: { type: 'user', id: 'user-1' },
      metadata: { newRole: 'bep' },
      createdAt: '2026-05-14T21:00:00.000Z',
    });

    expect(event).toMatchObject({
      category: 'role',
      action: 'role.assigned',
      immutable: true,
      createdAt: '2026-05-14T21:00:00.000Z',
      actor: { uid: 'admin-1', role: 'admin' },
      target: { type: 'user', id: 'user-1' },
    });
  });

  it('rejects audit events without a durable actor identity', () => {
    expect(() => buildAuditEvent({ category: 'access', action: 'project.read', actor: { uid: '' } })).toThrow(/actor uid/);
  });

  it('writes audit events through an injected persistent writer', async () => {
    const add = vi.fn(async () => ({ id: 'audit-1' }));
    const event = await writeAuditEvent({ add }, {
      category: 'payment',
      action: 'payment.callback.accepted',
      actor: { uid: 'system', role: 'admin', authorizationType: 'webhook' },
      target: { type: 'payment_attempt', id: 'pay-1', projectId: 'project-1' },
    });

    expect(add).toHaveBeenCalledWith('audit_logs', expect.objectContaining({
      category: 'payment',
      action: 'payment.callback.accepted',
      immutable: true,
    }));
    expect(event.id).toBe('audit-1');
  });

  it('guards the append-only audit model', () => {
    expect(() => assertAuditEventImmutableUpdateAttempt(['metadata'])).toThrow(/immutable/);
    expect(() => assertAuditEventImmutableUpdateAttempt([])).not.toThrow();
  });
});
