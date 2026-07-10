/**
 * P2 Shared Module — Type Definitions
 *
 * Cross-cutting types used by all P2 product lane modules:
 * FM Bridge (P2.8), Practice Management (P2.9), Environmental & Heritage (P2.10).
 *
 * Covers subscription management, audit trail, and Action Centre notifications.
 */

// ─── Subscription Management ──────────────────────────────────────────────────

/** Module-specific subscription tiers (each P2 module defines its own tier names) */
export type SubscriptionTier = string;

/** Subscription lifecycle statuses */
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'archived';

/** Billing cycle options */
export type BillingCycle = 'monthly' | 'annual';

/** Core subscription state record scoped to a building or firm entity */
export interface SubscriptionState {
  id: string;
  entityType: 'building' | 'firm';
  entityId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialStartDate: string;
  trialEndDate?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  billingCycle: BillingCycle;
  gracePeriodEndDate?: string;
  cancelledAt?: string;
  dataRetentionEndDate?: string;
  holderId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Audit Trail ──────────────────────────────────────────────────────────────

/** Audit event record shared across all P2 modules */
export interface AuditEvent {
  id: string;
  entityType: 'building' | 'firm' | 'project';
  entityId: string;
  eventType: string;
  actorId: string;
  actorDisplayName: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// ─── Action Centre Notifications ──────────────────────────────────────────────

/** Notification record published to the platform Action Centre */
export interface ActionCentreNotification {
  id: string;
  targetUserId: string;
  module: 'fm_bridge' | 'practice_management' | 'environmental';
  severity: 'info' | 'warning' | 'urgent' | 'critical';
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  actionUrl?: string;
  read: boolean;
  createdAt: string;
}
