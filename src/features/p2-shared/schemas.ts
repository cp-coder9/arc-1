/**
 * P2 Shared Module — Zod Validation Schemas
 *
 * Runtime validation schemas for shared P2 types: subscription state,
 * audit events, and Action Centre notifications.
 */

import { z } from 'zod';

// ─── Subscription Management Schemas ──────────────────────────────────────────

export const SubscriptionTierSchema = z.string().min(1);

export const SubscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'past_due',
  'cancelled',
  'archived',
]);

export const BillingCycleSchema = z.enum(['monthly', 'annual']);

export const SubscriptionStateSchema = z.object({
  id: z.string().min(1),
  entityType: z.enum(['building', 'firm']),
  entityId: z.string().min(1),
  tier: SubscriptionTierSchema,
  status: SubscriptionStatusSchema,
  trialStartDate: z.string().min(1),
  trialEndDate: z.string().optional(),
  currentPeriodStart: z.string().min(1),
  currentPeriodEnd: z.string().min(1),
  billingCycle: BillingCycleSchema,
  gracePeriodEndDate: z.string().optional(),
  cancelledAt: z.string().optional(),
  dataRetentionEndDate: z.string().optional(),
  holderId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

// ─── Audit Trail Schema ───────────────────────────────────────────────────────

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  entityType: z.enum(['building', 'firm', 'project']),
  entityId: z.string().min(1),
  eventType: z.string().min(1),
  actorId: z.string().min(1),
  actorDisplayName: z.string().min(1),
  metadata: z.record(z.unknown()),
  timestamp: z.string().min(1),
});

// ─── Action Centre Notification Schema ────────────────────────────────────────

export const ActionCentreNotificationSchema = z.object({
  id: z.string().min(1),
  targetUserId: z.string().min(1),
  module: z.enum(['fm_bridge', 'practice_management', 'environmental']),
  severity: z.enum(['info', 'warning', 'urgent', 'critical']),
  title: z.string().min(1),
  description: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  actionUrl: z.string().optional(),
  read: z.boolean(),
  createdAt: z.string().min(1),
});
