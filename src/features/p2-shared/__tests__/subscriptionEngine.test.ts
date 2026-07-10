// @vitest-environment node
/**
 * Unit Tests — Subscription Engine Service
 *
 * Tests for evaluateSubscriptionAccess() and transitionSubscription().
 */

import { describe, expect, it } from 'vitest';

import type { SubscriptionState } from '../types';
import {
  evaluateSubscriptionAccess,
  transitionSubscription,
} from '../services/subscriptionEngine';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createBaseState(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    id: 'sub_001',
    entityType: 'building',
    entityId: 'bld_001',
    tier: 'standard',
    status: 'active',
    trialStartDate: '2025-01-01T00:00:00.000Z',
    currentPeriodStart: '2025-01-01T00:00:00.000Z',
    currentPeriodEnd: '2025-02-01T00:00:00.000Z',
    billingCycle: 'monthly',
    holderId: 'user_001',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}


// ─── evaluateSubscriptionAccess Tests ─────────────────────────────────────────

describe('evaluateSubscriptionAccess', () => {
  describe('active status', () => {
    it('returns full access for active subscriptions', () => {
      const state = createBaseState({ status: 'active' });
      const now = new Date('2025-01-15T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('full');
      }
    });
  });

  describe('trial status', () => {
    it('returns full access when trial is active', () => {
      const state = createBaseState({
        status: 'trial',
        trialEndDate: '2025-04-01T00:00:00.000Z',
      });
      const now = new Date('2025-02-15T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('full');
        expect(result.data.daysRemaining).toBeGreaterThan(0);
      }
    });

    it('returns restricted access when trial has expired', () => {
      const state = createBaseState({
        status: 'trial',
        trialEndDate: '2025-01-15T00:00:00.000Z',
      });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('restricted');
        expect(result.data.daysRemaining).toBe(0);
      }
    });

    it('returns full access with no trial end date', () => {
      const state = createBaseState({
        status: 'trial',
        trialEndDate: undefined,
      });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('full');
      }
    });

    it('returns correct daysRemaining for trial', () => {
      const state = createBaseState({
        status: 'trial',
        trialEndDate: '2025-01-20T00:00:00.000Z',
      });
      const now = new Date('2025-01-10T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.daysRemaining).toBe(10);
      }
    });
  });

  describe('past_due status', () => {
    it('returns full access within grace period', () => {
      const state = createBaseState({
        status: 'past_due',
        gracePeriodEndDate: '2025-02-15T00:00:00.000Z',
      });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('full');
        expect(result.data.daysRemaining).toBeGreaterThan(0);
      }
    });

    it('returns read_only when grace period expired', () => {
      const state = createBaseState({
        status: 'past_due',
        gracePeriodEndDate: '2025-01-20T00:00:00.000Z',
      });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('read_only');
      }
    });

    it('uses default grace period when gracePeriodEndDate not set', () => {
      const state = createBaseState({
        status: 'past_due',
        currentPeriodEnd: '2025-01-01T00:00:00.000Z',
        gracePeriodEndDate: undefined,
      });
      // 30 days after period end = Jan 31
      const now = new Date('2025-01-20T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('full');
      }
    });
  });

  describe('cancelled status', () => {
    it('returns read_only within data retention period', () => {
      const state = createBaseState({
        status: 'cancelled',
        cancelledAt: '2025-01-10T00:00:00.000Z',
        dataRetentionEndDate: '2025-02-10T00:00:00.000Z',
      });
      const now = new Date('2025-01-20T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('read_only');
        expect(result.data.daysRemaining).toBeGreaterThan(0);
      }
    });

    it('returns archived when retention period expired', () => {
      const state = createBaseState({
        status: 'cancelled',
        cancelledAt: '2025-01-01T00:00:00.000Z',
        dataRetentionEndDate: '2025-01-31T00:00:00.000Z',
      });
      const now = new Date('2025-02-15T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('archived');
      }
    });

    it('uses default retention from cancelledAt when no dataRetentionEndDate', () => {
      const state = createBaseState({
        status: 'cancelled',
        cancelledAt: '2025-01-10T00:00:00.000Z',
        dataRetentionEndDate: undefined,
      });
      // 30 days from Jan 10 = Feb 9
      const now = new Date('2025-01-25T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('read_only');
      }
    });
  });

  describe('archived status', () => {
    it('returns archived access level', () => {
      const state = createBaseState({ status: 'archived' });
      const now = new Date('2025-03-01T00:00:00.000Z');

      const result = evaluateSubscriptionAccess(state, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessLevel).toBe('archived');
      }
    });
  });

  describe('error cases', () => {
    it('returns error for null state', () => {
      const result = evaluateSubscriptionAccess(null as unknown as SubscriptionState, new Date());
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATE');
      }
    });
  });
});

// ─── transitionSubscription Tests ─────────────────────────────────────────────

describe('transitionSubscription', () => {
  describe('activate action', () => {
    it('activates a trial subscription', () => {
      const state = createBaseState({ status: 'trial', tier: 'basic' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'activate', { newTier: 'premium' }, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.status).toBe('active');
        expect(result.data.next.tier).toBe('premium');
        expect(result.data.auditEvent.eventType).toBe('subscription.activate');
      }
    });

    it('activates a cancelled subscription', () => {
      const state = createBaseState({ status: 'cancelled' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'activate', { newTier: 'standard' }, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.status).toBe('active');
        expect(result.data.next.cancelledAt).toBeUndefined();
        expect(result.data.next.dataRetentionEndDate).toBeUndefined();
      }
    });

    it('activates an archived subscription', () => {
      const state = createBaseState({ status: 'archived' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'activate', { newTier: 'standard' }, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.status).toBe('active');
      }
    });

    it('fails to activate an already active subscription', () => {
      const state = createBaseState({ status: 'active' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'activate', { newTier: 'premium' }, now);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });

    it('fails without newTier param', () => {
      const state = createBaseState({ status: 'trial' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'activate', {}, now);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_TIER');
      }
    });

    it('sets billing cycle from params', () => {
      const state = createBaseState({ status: 'trial', billingCycle: 'monthly' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(
        state, 'activate',
        { newTier: 'premium', billingCycle: 'annual' },
        now
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.billingCycle).toBe('annual');
      }
    });
  });

  describe('upgrade action', () => {
    it('upgrades tier on active subscription', () => {
      const state = createBaseState({ status: 'active', tier: 'basic' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'upgrade', { newTier: 'premium' }, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.tier).toBe('premium');
        expect(result.data.next.status).toBe('active');
      }
    });

    it('fails to upgrade to same tier', () => {
      const state = createBaseState({ status: 'active', tier: 'premium' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'upgrade', { newTier: 'premium' }, now);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SAME_TIER');
      }
    });

    it('fails to upgrade a trial subscription', () => {
      const state = createBaseState({ status: 'trial' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'upgrade', { newTier: 'premium' }, now);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });
  });

  describe('downgrade action', () => {
    it('downgrades tier on active subscription', () => {
      const state = createBaseState({ status: 'active', tier: 'premium' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'downgrade', { newTier: 'basic' }, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.tier).toBe('basic');
        expect(result.data.next.status).toBe('active');
      }
    });

    it('fails to downgrade to same tier', () => {
      const state = createBaseState({ status: 'active', tier: 'basic' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'downgrade', { newTier: 'basic' }, now);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SAME_TIER');
      }
    });
  });

  describe('cancel action', () => {
    it('cancels an active subscription', () => {
      const state = createBaseState({ status: 'active' });
      const now = new Date('2025-01-15T00:00:00.000Z');

      const result = transitionSubscription(state, 'cancel', {}, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.status).toBe('cancelled');
        expect(result.data.next.cancelledAt).toBeDefined();
        expect(result.data.next.dataRetentionEndDate).toBeDefined();
      }
    });

    it('cancels a past_due subscription', () => {
      const state = createBaseState({ status: 'past_due' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'cancel', {}, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.status).toBe('cancelled');
      }
    });

    it('sets data retention end date 30 days after current period end', () => {
      const state = createBaseState({
        status: 'active',
        currentPeriodEnd: '2025-02-01T00:00:00.000Z',
      });
      const now = new Date('2025-01-15T00:00:00.000Z');

      const result = transitionSubscription(state, 'cancel', {}, now);

      expect(result.success).toBe(true);
      if (result.success) {
        const retentionEnd = new Date(result.data.next.dataRetentionEndDate!);
        const periodEnd = new Date('2025-02-01T00:00:00.000Z');
        const diff = Math.floor((retentionEnd.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24));
        expect(diff).toBe(30);
      }
    });

    it('fails to cancel an archived subscription', () => {
      const state = createBaseState({ status: 'archived' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'cancel', {}, now);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });
  });

  describe('renew action', () => {
    it('renews a past_due subscription', () => {
      const state = createBaseState({ status: 'past_due' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'renew', {}, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.status).toBe('active');
        expect(result.data.next.gracePeriodEndDate).toBeUndefined();
      }
    });

    it('renews a cancelled subscription', () => {
      const state = createBaseState({ status: 'cancelled' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'renew', {}, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.status).toBe('active');
        expect(result.data.next.cancelledAt).toBeUndefined();
        expect(result.data.next.dataRetentionEndDate).toBeUndefined();
      }
    });

    it('fails to renew an active subscription', () => {
      const state = createBaseState({ status: 'active' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'renew', {}, now);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });
  });

  describe('lapse action', () => {
    it('lapses an active subscription to past_due', () => {
      const state = createBaseState({ status: 'active' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'lapse', {}, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.status).toBe('past_due');
        expect(result.data.next.gracePeriodEndDate).toBeDefined();
      }
    });

    it('sets grace period to 30 days from now', () => {
      const state = createBaseState({ status: 'active' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'lapse', {}, now);

      expect(result.success).toBe(true);
      if (result.success) {
        const graceEnd = new Date(result.data.next.gracePeriodEndDate!);
        const diff = Math.floor((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        expect(diff).toBe(30);
      }
    });

    it('fails to lapse a trial subscription', () => {
      const state = createBaseState({ status: 'trial' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'lapse', {}, now);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });
  });

  describe('audit event generation', () => {
    it('generates audit event with correct metadata', () => {
      const state = createBaseState({ status: 'active', tier: 'basic' });
      const now = new Date('2025-02-01T00:00:00.000Z');

      const result = transitionSubscription(state, 'upgrade', { newTier: 'premium' }, now);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data.auditEvent;
        expect(event.entityType).toBe('building');
        expect(event.entityId).toBe('bld_001');
        expect(event.eventType).toBe('subscription.upgrade');
        expect(event.metadata).toMatchObject({
          action: 'upgrade',
          previousStatus: 'active',
          newStatus: 'active',
          previousTier: 'basic',
          newTier: 'premium',
        });
      }
    });
  });
});
