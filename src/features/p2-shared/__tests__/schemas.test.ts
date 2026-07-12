// @vitest-environment node
/**
 * Unit Tests — P2 Shared Schemas
 *
 * Validates Zod schemas for subscription state, audit events, and notifications.
 */

import { describe, it, expect } from 'vitest';
import {
  SubscriptionStateSchema,
  AuditEventSchema,
  ActionCentreNotificationSchema,
  SubscriptionStatusSchema,
  BillingCycleSchema,
  SubscriptionTierSchema,
} from '../schemas';

describe('P2 Shared Schemas', () => {
  describe('SubscriptionStateSchema', () => {
    const validSubscription = {
      id: 'sub-001',
      entityType: 'building' as const,
      entityId: 'bld-001',
      tier: 'premium',
      status: 'active' as const,
      trialStartDate: '2026-01-01T00:00:00Z',
      currentPeriodStart: '2026-02-01T00:00:00Z',
      currentPeriodEnd: '2026-03-01T00:00:00Z',
      billingCycle: 'monthly' as const,
      holderId: 'user-001',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    };

    it('accepts a valid subscription state', () => {
      const result = SubscriptionStateSchema.safeParse(validSubscription);
      expect(result.success).toBe(true);
    });

    it('accepts subscription with optional fields', () => {
      const result = SubscriptionStateSchema.safeParse({
        ...validSubscription,
        trialEndDate: '2026-04-01T00:00:00Z',
        gracePeriodEndDate: '2026-05-01T00:00:00Z',
        cancelledAt: '2026-03-15T00:00:00Z',
        dataRetentionEndDate: '2026-04-15T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      const result = SubscriptionStateSchema.safeParse({
        id: 'sub-001',
        entityType: 'building',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid entityType', () => {
      const result = SubscriptionStateSchema.safeParse({
        ...validSubscription,
        entityType: 'project',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = SubscriptionStateSchema.safeParse({
        ...validSubscription,
        status: 'unknown',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty id', () => {
      const result = SubscriptionStateSchema.safeParse({
        ...validSubscription,
        id: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AuditEventSchema', () => {
    const validAuditEvent = {
      id: 'evt-001',
      entityType: 'building' as const,
      entityId: 'bld-001',
      eventType: 'subscription.activated',
      actorId: 'user-001',
      actorDisplayName: 'John Smith',
      metadata: { tier: 'premium', billingCycle: 'monthly' },
      timestamp: '2026-01-15T10:30:00Z',
    };

    it('accepts a valid audit event', () => {
      const result = AuditEventSchema.safeParse(validAuditEvent);
      expect(result.success).toBe(true);
    });

    it('accepts all entity types', () => {
      for (const entityType of ['building', 'firm', 'project']) {
        const result = AuditEventSchema.safeParse({
          ...validAuditEvent,
          entityType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts empty metadata', () => {
      const result = AuditEventSchema.safeParse({
        ...validAuditEvent,
        metadata: {},
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid entityType', () => {
      const result = AuditEventSchema.safeParse({
        ...validAuditEvent,
        entityType: 'unknown',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty actorDisplayName', () => {
      const result = AuditEventSchema.safeParse({
        ...validAuditEvent,
        actorDisplayName: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ActionCentreNotificationSchema', () => {
    const validNotification = {
      id: 'ntf-001',
      targetUserId: 'user-001',
      module: 'fm_bridge' as const,
      severity: 'warning' as const,
      title: 'Warranty expiring soon',
      description: 'Roof waterproofing warranty expires in 30 days',
      entityType: 'building',
      entityId: 'bld-001',
      read: false,
      createdAt: '2026-01-15T10:30:00Z',
    };

    it('accepts a valid notification', () => {
      const result = ActionCentreNotificationSchema.safeParse(validNotification);
      expect(result.success).toBe(true);
    });

    it('accepts notification with optional actionUrl', () => {
      const result = ActionCentreNotificationSchema.safeParse({
        ...validNotification,
        actionUrl: '/buildings/bld-001/warranties/w-001',
      });
      expect(result.success).toBe(true);
    });

    it('accepts all module values', () => {
      for (const module of ['fm_bridge', 'practice_management', 'environmental']) {
        const result = ActionCentreNotificationSchema.safeParse({
          ...validNotification,
          module,
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts all severity values', () => {
      for (const severity of ['info', 'warning', 'urgent', 'critical']) {
        const result = ActionCentreNotificationSchema.safeParse({
          ...validNotification,
          severity,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid module', () => {
      const result = ActionCentreNotificationSchema.safeParse({
        ...validNotification,
        module: 'unknown',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty title', () => {
      const result = ActionCentreNotificationSchema.safeParse({
        ...validNotification,
        title: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Primitive schemas', () => {
    it('SubscriptionStatusSchema accepts valid values', () => {
      for (const status of ['trial', 'active', 'past_due', 'cancelled', 'archived']) {
        expect(SubscriptionStatusSchema.safeParse(status).success).toBe(true);
      }
    });

    it('BillingCycleSchema accepts valid values', () => {
      for (const cycle of ['monthly', 'annual']) {
        expect(BillingCycleSchema.safeParse(cycle).success).toBe(true);
      }
    });

    it('SubscriptionTierSchema accepts any non-empty string', () => {
      expect(SubscriptionTierSchema.safeParse('basic').success).toBe(true);
      expect(SubscriptionTierSchema.safeParse('premium').success).toBe(true);
      expect(SubscriptionTierSchema.safeParse('').success).toBe(false);
    });
  });
});
