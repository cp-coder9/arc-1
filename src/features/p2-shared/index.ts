/**
 * P2 Shared Module — Public Exports
 *
 * Cross-cutting infrastructure shared by all P2 product lane modules:
 * subscription management, audit trail adapters, and Action Centre notifications.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  AuditEvent,
  ActionCentreNotification,
  SubscriptionState,
  SubscriptionTier,
  SubscriptionStatus,
  BillingCycle,
} from './types';

// ─── Schemas ──────────────────────────────────────────────────────────────────
export {
  SubscriptionTierSchema,
  SubscriptionStatusSchema,
  BillingCycleSchema,
  SubscriptionStateSchema,
  AuditEventSchema,
  ActionCentreNotificationSchema,
} from './schemas';

// ─── Services ─────────────────────────────────────────────────────────────────
export { publishNotification } from './services/notificationAdapter';
export type {
  ServiceResult,
  PersistNotification,
} from './services/notificationAdapter';

export { createAuditEvent } from './services/auditAdapter';
export type {
  CreateAuditEventInput,
  PersistAuditEvent,
} from './services/auditAdapter';
