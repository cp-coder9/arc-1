/**
 * Insurance Register Service
 *
 * Manages policy registration, updates, cancellation, and expiry notifications.
 * In-memory storage (Map<string, InsurancePolicy[]>) keyed by projectId.
 * Factory function pattern with injectable clock and notification callbacks for testability.
 *
 * Requirements: 1.1–1.10
 */

import { insurancePolicySchema } from '../schemas';
import type {
  InsurancePolicy,
  InsuranceRegisterService,
  PolicyStatus,
} from '../types';

// ─── Notification Callback Types ──────────────────────────────────────────────

export type ExpiryThreshold = 60 | 30 | 14;

export interface ExpiryNotification {
  projectId: string;
  policyId: string;
  policyType: InsurancePolicy['policyType'];
  policyNumber: string;
  expiryDate: string;
  daysUntilExpiry: number;
  threshold: ExpiryThreshold;
}

export type NotificationCallback = (notification: ExpiryNotification) => void;

export type AutoExpireCallback = (policy: InsurancePolicy) => void;

// ─── Service Options ──────────────────────────────────────────────────────────

export interface InsuranceRegisterServiceOptions {
  /** Injectable clock for testability. Defaults to () => new Date(). */
  now?: () => Date;
  /** Called when a policy crosses a notification threshold (60, 30, 14 days). */
  onExpiryNotification?: NotificationCallback;
  /** Called when a policy is auto-expired past its expiry date. */
  onAutoExpire?: AutoExpireCallback;
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  const timestamp = Date.now().toString(36);
  const counter = idCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).slice(2, 8);
  return `pol_${timestamp}_${counter}_${random}`;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function diffCalendarDays(from: Date, to: Date): number {
  const msPerDay = 86_400_000;
  // Normalize to start of day to avoid DST issues
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toDay.getTime() - fromDay.getTime()) / msPerDay);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInsuranceRegisterService(
  options: InsuranceRegisterServiceOptions = {}
): InsuranceRegisterService {
  const now = options.now ?? (() => new Date());
  const onExpiryNotification = options.onExpiryNotification;
  const onAutoExpire = options.onAutoExpire;

  // In-memory store: Map<projectId, InsurancePolicy[]>
  const store = new Map<string, InsurancePolicy[]>();

  function getProjectStore(projectId: string): InsurancePolicy[] {
    if (!store.has(projectId)) {
      store.set(projectId, []);
    }
    return store.get(projectId)!;
  }

  // ─── Service Implementation ───────────────────────────────────────────────

  const service: InsuranceRegisterService = {
    async registerPolicy(projectId, policyInput, actorId) {
      // Validate input with Zod schema
      const parseResult = insurancePolicySchema.safeParse(policyInput);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
        throw new Error(
          `Validation failed: ${fieldErrors.join('; ')}`
        );
      }

      const validated = parseResult.data;
      const timestamp = now().toISOString();

      const policy: InsurancePolicy = {
        id: generateId(),
        projectId,
        policyType: validated.policyType,
        insurerName: validated.insurerName,
        policyNumber: validated.policyNumber,
        policyholderName: validated.policyholderName,
        inceptionDate: validated.inceptionDate,
        expiryDate: validated.expiryDate,
        sumInsured: validated.sumInsured,
        excessAmount: validated.excessAmount,
        brokerContactName: validated.brokerContactName,
        brokerPhone: validated.brokerPhone,
        brokerEmail: validated.brokerEmail,
        notificationPeriodDays: validated.notificationPeriodDays,
        status: 'active',
        createdBy: actorId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const policies = getProjectStore(projectId);
      policies.push(policy);

      return policy;
    },

    async updatePolicy(projectId, policyId, updates, _actorId) {
      const policies = getProjectStore(projectId);
      const index = policies.findIndex((p) => p.id === policyId);

      if (index === -1) {
        throw new Error(
          `Policy not found: projectId=${projectId}, policyId=${policyId}`
        );
      }

      const existing = policies[index];
      const timestamp = now().toISOString();

      // Apply partial updates (excluding immutable fields)
      const { id: _id, projectId: _pid, createdBy: _cb, createdAt: _ca, ...allowedUpdates } = updates;

      const updated: InsurancePolicy = {
        ...existing,
        ...allowedUpdates,
        // Immutable fields preserved
        id: existing.id,
        projectId: existing.projectId,
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
        updatedAt: timestamp,
      };

      policies[index] = updated;
      return updated;
    },

    async cancelPolicy(projectId, policyId, _actorId) {
      const policies = getProjectStore(projectId);
      const index = policies.findIndex((p) => p.id === policyId);

      if (index === -1) {
        throw new Error(
          `Policy not found: projectId=${projectId}, policyId=${policyId}`
        );
      }

      const timestamp = now().toISOString();
      const cancelled: InsurancePolicy = {
        ...policies[index],
        status: 'cancelled' as PolicyStatus,
        updatedAt: timestamp,
      };

      policies[index] = cancelled;
      return cancelled;
    },

    async getProjectPolicies(projectId) {
      return [...getProjectStore(projectId)];
    },

    async getPolicyById(projectId, policyId) {
      const policies = getProjectStore(projectId);
      return policies.find((p) => p.id === policyId) ?? null;
    },

    async getExpiringPolicies(projectId, withinDays) {
      const policies = getProjectStore(projectId);
      const today = now();

      return policies.filter((policy) => {
        if (policy.status !== 'active') return false;
        const expiryDate = new Date(policy.expiryDate);
        const daysUntil = diffCalendarDays(today, expiryDate);
        return daysUntil >= 0 && daysUntil <= withinDays;
      });
    },

    async processExpiryNotifications(projectId) {
      const policies = getProjectStore(projectId);
      const today = now();
      const thresholds: ExpiryThreshold[] = [60, 30, 14];

      for (const policy of policies) {
        if (policy.status !== 'active') continue;

        const expiryDate = new Date(policy.expiryDate);
        const daysUntilExpiry = diffCalendarDays(today, expiryDate);

        // Auto-expire policies past their expiry date
        if (daysUntilExpiry < 0) {
          const index = policies.indexOf(policy);
          const expired: InsurancePolicy = {
            ...policy,
            status: 'expired' as PolicyStatus,
            updatedAt: today.toISOString(),
          };
          policies[index] = expired;

          if (onAutoExpire) {
            onAutoExpire(expired);
          }
          continue;
        }

        // Check notification thresholds
        for (const threshold of thresholds) {
          if (daysUntilExpiry === threshold) {
            if (onExpiryNotification) {
              onExpiryNotification({
                projectId,
                policyId: policy.id,
                policyType: policy.policyType,
                policyNumber: policy.policyNumber,
                expiryDate: policy.expiryDate,
                daysUntilExpiry,
                threshold,
              });
            }
            break; // Only one threshold can match per policy
          }
        }
      }
    },
  };

  return service;
}
