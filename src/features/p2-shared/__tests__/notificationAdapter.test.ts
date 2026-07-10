/**
 * Unit tests for the Notification Adapter
 *
 * Tests: validation, successful publish, and graceful degradation on failure.
 */

import { describe, it, expect, vi } from 'vitest';
import { publishNotification } from '../services/notificationAdapter';
import type { ActionCentreNotification } from '../types';

function makeValidNotification(
  overrides: Partial<ActionCentreNotification> = {},
): ActionCentreNotification {
  return {
    id: 'notif-001',
    targetUserId: 'user-abc',
    module: 'fm_bridge',
    severity: 'info',
    title: 'Warranty Expiry Alert',
    description: 'Warranty for roof membrane expires in 30 days',
    entityType: 'building',
    entityId: 'bld-123',
    actionUrl: '/buildings/bld-123/warranties',
    read: false,
    createdAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('publishNotification', () => {
  it('publishes a valid notification and returns the notification ID', async () => {
    const persist = vi.fn().mockResolvedValue('notif-001');
    const notification = makeValidNotification();

    const result = await publishNotification(notification, persist);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notificationId).toBe('notif-001');
    }
    expect(persist).toHaveBeenCalledWith(notification);
  });

  it('returns validation error for missing required fields', async () => {
    const persist = vi.fn();
    const notification = makeValidNotification({ id: '' });

    const result = await publishNotification(notification, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('failed validation');
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns validation error for invalid module value', async () => {
    const persist = vi.fn();
    const notification = makeValidNotification({
      module: 'invalid_module' as ActionCentreNotification['module'],
    });

    const result = await publishNotification(notification, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns validation error for invalid severity value', async () => {
    const persist = vi.fn();
    const notification = makeValidNotification({
      severity: 'extreme' as ActionCentreNotification['severity'],
    });

    const result = await publishNotification(notification, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it('handles persistence failure gracefully without throwing', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('Firestore timeout'));
    const notification = makeValidNotification();

    const result = await publishNotification(notification, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PERSISTENCE_ERROR');
      expect(result.error.message).toContain('Action Centre unavailable');
      expect(result.error.details).toEqual({
        originalError: 'Firestore timeout',
      });
    }
  });

  it('handles non-Error persistence failures gracefully', async () => {
    const persist = vi.fn().mockRejectedValue('raw string error');
    const notification = makeValidNotification();

    const result = await publishNotification(notification, persist);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PERSISTENCE_ERROR');
      expect(result.error.details).toEqual({
        originalError: 'Unknown persistence error',
      });
    }
  });

  it('allows optional actionUrl to be omitted', async () => {
    const persist = vi.fn().mockResolvedValue('notif-002');
    const notification = makeValidNotification();
    delete (notification as Partial<ActionCentreNotification>).actionUrl;

    const result = await publishNotification(notification, persist);

    expect(result.success).toBe(true);
  });
});
