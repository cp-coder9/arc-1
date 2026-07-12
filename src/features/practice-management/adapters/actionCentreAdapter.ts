/**
 * Practice Management — Action Centre Adapter
 *
 * Publishes firm-level notifications to the platform Action Centre:
 * - Stale enquiry alerts (30+ days without activity)
 * - WIP budget warnings (80% threshold) and critical alerts (100% overrun)
 * - Capacity alerts (>85% firm utilisation)
 * - Compliance alerts (PI insurance and registration expiry)
 *
 * Uses dependency injection for persistence — no direct Firestore imports.
 * Graceful degradation: notification failures log a warning and return a
 * failure result without breaking the calling operation.
 *
 * Requirements: 8.7, 9.4, 9.5, 12.5, 13.2, 13.3, 13.4
 */

import type { ActionCentreNotification } from '../../p2-shared/types';
import type { EnquiryRecord } from '../types';
import type { WIPAlert } from '../services/wipTracker';
import type { CapacityAlert } from '../services/capacityPlanner';
import type { ComplianceAlert } from '../services/staffCompliance';

// ─── Service Result ───────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Dependency Injection ─────────────────────────────────────────────────────

/** Injected persistence callback — writes the notification and returns the stored ID */
export type PersistNotification = (notification: ActionCentreNotification) => Promise<string>;

/** Logger dependency for graceful degradation warnings */
export interface Logger {
  warn: (message: string, context?: Record<string, unknown>) => void;
}

const defaultLogger: Logger = {
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(`[practice-management:actionCentre] ${message}`, context ?? '');
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `pm_notif_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function generateTimestamp(): string {
  return new Date().toISOString();
}

// ─── Stale Enquiry Notifications ──────────────────────────────────────────────

/**
 * Publishes a stale enquiry notification to the Action Centre.
 *
 * Requirement: 8.7 — when an enquiry remains in the same stage for more
 * than 30 calendar days without activity, surface a notification to the
 * firm_admin or owner who created it.
 */
export async function publishStaleEnquiryAlert(
  input: {
    targetUserId: string;
    firmId: string;
    enquiry: Pick<EnquiryRecord, 'id' | 'clientName' | 'currentStage'>;
    daysSinceActivity: number;
  },
  persist: PersistNotification,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<ActionCentreNotification>> {
  const notification: ActionCentreNotification = {
    id: generateId(),
    targetUserId: input.targetUserId,
    module: 'practice_management',
    severity: 'warning',
    title: 'Stale Enquiry',
    description: `Enquiry for "${input.enquiry.clientName}" has been at stage "${input.enquiry.currentStage}" for ${input.daysSinceActivity} days without activity.`,
    entityType: 'enquiry',
    entityId: input.enquiry.id,
    actionUrl: `/practice/pipeline/${input.enquiry.id}`,
    read: false,
    createdAt: generateTimestamp(),
  };

  return persistNotification(notification, persist, logger);
}

// ─── WIP Budget Notifications ─────────────────────────────────────────────────

/**
 * Publishes a WIP budget warning (80% threshold) notification.
 *
 * Requirement: 9.4 — when a project's accumulated WIP exceeds 80% of the
 * total fee budget, surface a warning in the Action Centre.
 */
export async function publishWIPBudgetWarning(
  input: {
    targetUserId: string;
    firmId: string;
    projectId: string;
    projectDescription: string;
    alert: WIPAlert;
  },
  persist: PersistNotification,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<ActionCentreNotification>> {
  const severity = input.alert.alertType === 'budget_critical' ? 'critical' : 'warning';

  const notification: ActionCentreNotification = {
    id: generateId(),
    targetUserId: input.targetUserId,
    module: 'practice_management',
    severity,
    title: severity === 'critical' ? 'WIP Budget Overrun' : 'WIP Budget Warning',
    description: input.alert.message || `Project "${input.projectDescription}" WIP at ${input.alert.percentage}% of fee budget.`,
    entityType: 'project',
    entityId: input.projectId,
    actionUrl: `/practice/wip/${input.projectId}`,
    read: false,
    createdAt: generateTimestamp(),
  };

  return persistNotification(notification, persist, logger);
}

// ─── Capacity Notifications ───────────────────────────────────────────────────

/**
 * Publishes a capacity alert notification (>85% firm utilisation or over-allocation).
 *
 * Requirement: 12.5 — when firm utilisation exceeds 85% for any current or
 * forecast week, surface a capacity warning in the Action Centre.
 */
export async function publishCapacityAlert(
  input: {
    targetUserId: string;
    firmId: string;
    alert: CapacityAlert;
  },
  persist: PersistNotification,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<ActionCentreNotification>> {
  const severity = input.alert.type === 'over_allocation' ? 'urgent' : 'warning';

  const notification: ActionCentreNotification = {
    id: generateId(),
    targetUserId: input.targetUserId,
    module: 'practice_management',
    severity,
    title: input.alert.type === 'over_allocation'
      ? 'Staff Over-Allocation'
      : 'Firm Capacity Warning',
    description: input.alert.message,
    entityType: 'firm',
    entityId: input.firmId,
    actionUrl: '/practice/capacity',
    read: false,
    createdAt: generateTimestamp(),
  };

  return persistNotification(notification, persist, logger);
}

// ─── Compliance Notifications ─────────────────────────────────────────────────

/**
 * Publishes a compliance alert (PI insurance or registration expiry)
 * to the Action Centre.
 *
 * Requirement: 13.2 — PI expiry warning at 60 days
 * Requirement: 13.3 — PI expiry urgent at 30 days
 * Requirement: 13.4 — PI lapsed critical alert
 */
export async function publishComplianceAlert(
  input: {
    targetUserId: string;
    firmId: string;
    alert: ComplianceAlert;
  },
  persist: PersistNotification,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<ActionCentreNotification>> {
  const severityMap: Record<string, ActionCentreNotification['severity']> = {
    warning: 'warning',
    urgent: 'urgent',
    critical: 'critical',
  };

  const notification: ActionCentreNotification = {
    id: generateId(),
    targetUserId: input.targetUserId,
    module: 'practice_management',
    severity: severityMap[input.alert.severity] || 'warning',
    title: input.alert.category === 'pi_insurance'
      ? 'PI Insurance Alert'
      : 'Registration Expiry Alert',
    description: input.alert.message,
    entityType: 'staff',
    entityId: input.alert.staffId,
    actionUrl: `/practice/compliance/${input.alert.staffId}`,
    read: false,
    createdAt: generateTimestamp(),
  };

  return persistNotification(notification, persist, logger);
}

// ─── Batch Publishing ─────────────────────────────────────────────────────────

/**
 * Publishes multiple compliance alerts to the Action Centre in batch.
 * Returns results for each alert individually. Failures do not prevent
 * remaining alerts from being published.
 */
export async function publishComplianceAlertsBatch(
  input: {
    targetUserId: string;
    firmId: string;
    alerts: ComplianceAlert[];
  },
  persist: PersistNotification,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<{ published: number; failed: number }>> {
  let published = 0;
  let failed = 0;

  for (const alert of input.alerts) {
    const result = await publishComplianceAlert(
      { targetUserId: input.targetUserId, firmId: input.firmId, alert },
      persist,
      logger,
    );
    if (result.success) {
      published++;
    } else {
      failed++;
    }
  }

  return {
    success: true,
    data: { published, failed },
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Persists a notification with graceful degradation.
 * Never throws — returns a failure ServiceResult on error.
 */
async function persistNotification(
  notification: ActionCentreNotification,
  persist: PersistNotification,
  logger: Logger,
): Promise<ServiceResult<ActionCentreNotification>> {
  try {
    await persist(notification);
    return { success: true, data: notification };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown persistence error';
    logger.warn(`Failed to publish notification: ${message}`, {
      notificationId: notification.id,
      severity: notification.severity,
      title: notification.title,
    });
    return {
      success: false,
      error: {
        code: 'PERSISTENCE_ERROR',
        message: 'Failed to publish notification — Action Centre unavailable',
        details: { originalError: message },
      },
    };
  }
}
