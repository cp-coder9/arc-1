/**
 * P2 Shared — Subscription Engine Service
 *
 * Pure business logic for subscription lifecycle management across all P2 modules.
 * Handles access level derivation and subscription state transitions.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 14.3, 14.4, 14.5
 */

import type { AuditEvent, BillingCycle, SubscriptionState, SubscriptionStatus } from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Access Level Types ───────────────────────────────────────────────────────

export type AccessLevel = 'full' | 'read_only' | 'restricted' | 'archived';

export interface SubscriptionAccessResult {
  accessLevel: AccessLevel;
  reason?: string;
  daysRemaining?: number;
}

// ─── Transition Types ─────────────────────────────────────────────────────────

export type SubscriptionAction = 'activate' | 'upgrade' | 'downgrade' | 'cancel' | 'renew' | 'lapse';

export interface TransitionParams {
  newTier?: string;
  billingCycle?: BillingCycle;
}

export interface TransitionResult {
  next: SubscriptionState;
  auditEvent: AuditEvent;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Grace period after payment failure before access degrades (days) */
const GRACE_PERIOD_DAYS = 30;

/** Data retention period after cancellation before archival (days) */
const DATA_RETENTION_DAYS = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function toISOString(date: Date): string {
  return date.toISOString();
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── evaluateSubscriptionAccess ───────────────────────────────────────────────

/**
 * Derives the current access level from subscription state and current date.
 *
 * Rules:
 * - active → full access
 * - trial (within trial period) → full access
 * - trial (expired) → restricted (Basic tier only for FM Bridge, read_only for Practice Mgmt)
 * - past_due + grace period NOT expired → full access
 * - past_due + grace period expired → read_only
 * - cancelled + within data retention (30 days) → read_only
 * - cancelled + retention expired → archived
 * - archived → archived (no access, reactivation available)
 */
export function evaluateSubscriptionAccess(
  state: SubscriptionState,
  now: Date
): ServiceResult<SubscriptionAccessResult> {
  if (!state || !state.status) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: 'Subscription state is required',
      },
    };
  }

  const result = deriveAccessLevel(state, now);
  return { success: true, data: result };
}

function deriveAccessLevel(state: SubscriptionState, now: Date): SubscriptionAccessResult {
  switch (state.status) {
    case 'active': {
      return { accessLevel: 'full', reason: 'Active subscription' };
    }

    case 'trial': {
      if (!state.trialEndDate) {
        return { accessLevel: 'full', reason: 'Trial period (no end date set)' };
      }
      const trialEnd = new Date(state.trialEndDate);
      const remaining = daysBetween(now, trialEnd);

      if (remaining >= 0) {
        return {
          accessLevel: 'full',
          reason: 'Trial period active',
          daysRemaining: remaining,
        };
      }

      // Trial expired
      return {
        accessLevel: 'restricted',
        reason: 'Trial period expired — subscription activation required',
        daysRemaining: 0,
      };
    }

    case 'past_due': {
      if (state.gracePeriodEndDate) {
        const graceEnd = new Date(state.gracePeriodEndDate);
        const remaining = daysBetween(now, graceEnd);

        if (remaining >= 0) {
          return {
            accessLevel: 'full',
            reason: 'Payment past due — within grace period',
            daysRemaining: remaining,
          };
        }

        // Grace period expired
        return {
          accessLevel: 'read_only',
          reason: 'Payment past due — grace period expired',
          daysRemaining: 0,
        };
      }

      // No grace period end date set — treat as within grace (default 30 days from period end)
      const periodEnd = new Date(state.currentPeriodEnd);
      const defaultGraceEnd = addDays(periodEnd, GRACE_PERIOD_DAYS);
      const remaining = daysBetween(now, defaultGraceEnd);

      if (remaining >= 0) {
        return {
          accessLevel: 'full',
          reason: 'Payment past due — within default grace period',
          daysRemaining: remaining,
        };
      }

      return {
        accessLevel: 'read_only',
        reason: 'Payment past due — grace period expired',
        daysRemaining: 0,
      };
    }

    case 'cancelled': {
      if (state.dataRetentionEndDate) {
        const retentionEnd = new Date(state.dataRetentionEndDate);
        const remaining = daysBetween(now, retentionEnd);

        if (remaining >= 0) {
          return {
            accessLevel: 'read_only',
            reason: 'Subscription cancelled — within data retention period',
            daysRemaining: remaining,
          };
        }

        // Retention expired
        return {
          accessLevel: 'archived',
          reason: 'Subscription cancelled — data retention period expired',
          daysRemaining: 0,
        };
      }

      // No retention end date — default 30 days from cancellation
      if (state.cancelledAt) {
        const cancelledDate = new Date(state.cancelledAt);
        const defaultRetentionEnd = addDays(cancelledDate, DATA_RETENTION_DAYS);
        const remaining = daysBetween(now, defaultRetentionEnd);

        if (remaining >= 0) {
          return {
            accessLevel: 'read_only',
            reason: 'Subscription cancelled — within default data retention period',
            daysRemaining: remaining,
          };
        }

        return {
          accessLevel: 'archived',
          reason: 'Subscription cancelled — data retention period expired',
          daysRemaining: 0,
        };
      }

      // Cancelled with no date info — read_only by default
      return {
        accessLevel: 'read_only',
        reason: 'Subscription cancelled',
      };
    }

    case 'archived': {
      return {
        accessLevel: 'archived',
        reason: 'Subscription archived — reactivation available',
      };
    }

    default: {
      return {
        accessLevel: 'restricted',
        reason: `Unknown subscription status: ${state.status}`,
      };
    }
  }
}

// ─── transitionSubscription ───────────────────────────────────────────────────

/**
 * Handles subscription state transitions based on the requested action.
 *
 * Actions:
 * - activate: trial/cancelled/archived → active (requires tier selection)
 * - upgrade: active → active (higher tier)
 * - downgrade: active → active (lower tier, effective next billing cycle)
 * - cancel: active/past_due → cancelled (effective at current billing cycle end)
 * - renew: past_due/cancelled → active
 * - lapse: active/past_due → past_due (triggers grace period)
 */
export function transitionSubscription(
  current: SubscriptionState,
  action: SubscriptionAction,
  params: TransitionParams,
  now: Date
): ServiceResult<TransitionResult> {
  const validationError = validateTransition(current, action, params);
  if (validationError) {
    return {
      success: false,
      error: validationError,
    };
  }

  const next = applyTransition(current, action, params, now);
  const auditEvent = createAuditEvent(current, next, action, now);

  return {
    success: true,
    data: { next, auditEvent },
  };
}

// ─── Transition Validation ────────────────────────────────────────────────────

function validateTransition(
  current: SubscriptionState,
  action: SubscriptionAction,
  params: TransitionParams
): { code: string; message: string; details?: unknown } | null {
  const validTransitions: Record<SubscriptionStatus, SubscriptionAction[]> = {
    trial: ['activate', 'cancel'],
    active: ['upgrade', 'downgrade', 'cancel', 'lapse'],
    past_due: ['renew', 'cancel', 'lapse'],
    cancelled: ['activate', 'renew'],
    archived: ['activate'],
  };

  const allowed = validTransitions[current.status];
  if (!allowed || !allowed.includes(action)) {
    return {
      code: 'INVALID_TRANSITION',
      message: `Cannot perform '${action}' on subscription with status '${current.status}'`,
      details: { currentStatus: current.status, action, allowedActions: allowed },
    };
  }

  // Validate required params
  if ((action === 'activate' || action === 'upgrade' || action === 'downgrade') && !params.newTier) {
    return {
      code: 'MISSING_TIER',
      message: `Action '${action}' requires a newTier parameter`,
    };
  }

  // Cannot upgrade/downgrade to same tier
  if ((action === 'upgrade' || action === 'downgrade') && params.newTier === current.tier) {
    return {
      code: 'SAME_TIER',
      message: `Cannot ${action} to the same tier '${current.tier}'`,
    };
  }

  return null;
}

// ─── Transition Application ───────────────────────────────────────────────────

function applyTransition(
  current: SubscriptionState,
  action: SubscriptionAction,
  params: TransitionParams,
  now: Date
): SubscriptionState {
  const updatedAt = toISOString(now);
  const billingCycle = params.billingCycle || current.billingCycle;
  const periodDays = billingCycle === 'annual' ? 365 : 30;

  switch (action) {
    case 'activate': {
      const periodStart = toISOString(now);
      const periodEnd = toISOString(addDays(now, periodDays));

      return {
        ...current,
        status: 'active',
        tier: params.newTier!,
        billingCycle,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        gracePeriodEndDate: undefined,
        cancelledAt: undefined,
        dataRetentionEndDate: undefined,
        updatedAt,
      };
    }

    case 'upgrade': {
      return {
        ...current,
        tier: params.newTier!,
        billingCycle,
        updatedAt,
      };
    }

    case 'downgrade': {
      // Downgrade effective at next billing cycle — tier changes but period stays
      return {
        ...current,
        tier: params.newTier!,
        billingCycle,
        updatedAt,
      };
    }

    case 'cancel': {
      const cancelledAt = toISOString(now);
      const dataRetentionEndDate = toISOString(addDays(new Date(current.currentPeriodEnd), DATA_RETENTION_DAYS));

      return {
        ...current,
        status: 'cancelled',
        cancelledAt,
        dataRetentionEndDate,
        gracePeriodEndDate: undefined,
        updatedAt,
      };
    }

    case 'renew': {
      const periodStart = toISOString(now);
      const periodEnd = toISOString(addDays(now, periodDays));

      return {
        ...current,
        status: 'active',
        tier: params.newTier || current.tier,
        billingCycle,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        gracePeriodEndDate: undefined,
        cancelledAt: undefined,
        dataRetentionEndDate: undefined,
        updatedAt,
      };
    }

    case 'lapse': {
      const gracePeriodEndDate = toISOString(addDays(now, GRACE_PERIOD_DAYS));

      return {
        ...current,
        status: 'past_due',
        gracePeriodEndDate,
        updatedAt,
      };
    }

    default:
      return { ...current, updatedAt };
  }
}

// ─── Audit Event Creation ─────────────────────────────────────────────────────

function createAuditEvent(
  previous: SubscriptionState,
  next: SubscriptionState,
  action: SubscriptionAction,
  now: Date
): AuditEvent {
  return {
    id: generateId(),
    entityType: next.entityType,
    entityId: next.entityId,
    eventType: `subscription.${action}`,
    actorId: next.holderId,
    actorDisplayName: 'System',
    metadata: {
      action,
      previousStatus: previous.status,
      newStatus: next.status,
      previousTier: previous.tier,
      newTier: next.tier,
      effectiveDate: toISOString(now),
      billingCycle: next.billingCycle,
    },
    timestamp: toISOString(now),
  };
}
