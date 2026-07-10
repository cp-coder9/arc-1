/**
 * FM Bridge — Action Centre Adapter
 *
 * Surfaces notifications to the platform Action Centre for warranty alerts,
 * DLP countdown notifications, maintenance reminders, and subscription prompts.
 * Uses dependency injection for persistence (no direct Firestore imports).
 * Implements graceful degradation — notification failures never break the
 * calling operation.
 *
 * Requirements: 3.2, 3.3, 5.2, 6.3, 7.7
 */

import type { ActionCentreNotification } from '../../p2-shared/types';

// ─── Service Result Type ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Persistence Callback ─────────────────────────────────────────────────────

/** Injected persistence callback — publishes a notification to the Action Centre */
export type PersistActionCentreNotification = (
  notification: ActionCentreNotification,
) => Promise<string>;

/** Bundled dependencies for the action centre adapter */
export interface ActionCentreAdapterDeps {
  persistNotification: PersistActionCentreNotification;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a unique notification ID */
function generateNotificationId(): string {
  return `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// ─── Notification Factory Inputs ──────────────────────────────────────────────

/** Base input for creating FM Bridge notifications */
interface FMNotificationInput {
  targetUserId: string;
  buildingId: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'urgent' | 'critical';
  entityType: string;
  entityId: string;
  actionUrl?: string;
}

// ─── Warranty Alert Inputs ────────────────────────────────────────────────────

export interface WarrantyAlertInput {
  targetUserId: string;
  buildingId: string;
  warrantyId: string;
  warrantyDescription: string;
  daysUntilExpiry: number;
}

// ─── DLP Notification Inputs ──────────────────────────────────────────────────

export interface DLPCountdownInput {
  targetUserId: string;
  buildingId: string;
  dlpId: string;
  daysRemaining: number;
}

// ─── Maintenance Notification Inputs ──────────────────────────────────────────

export interface MaintenanceReminderInput {
  targetUserId: string;
  buildingId: string;
  scheduleId: string;
  occurrenceId: string;
  taskDescription: string;
  assetDescription?: string;
  isOverdue: boolean;
}

// ─── Subscription Prompt Inputs ───────────────────────────────────────────────

export interface SubscriptionPromptInput {
  targetUserId: string;
  buildingId: string;
  promptType: 'trial_expiring' | 'payment_failed' | 'renewal_due' | 'reactivation';
  daysRemaining?: number;
}

// ─── Internal Helper ──────────────────────────────────────────────────────────

/**
 * Publishes a single notification to the Action Centre with graceful degradation.
 */
async function publishFMNotification(
  input: FMNotificationInput,
  deps: ActionCentreAdapterDeps,
): Promise<ServiceResult<ActionCentreNotification>> {
  const notification: ActionCentreNotification = {
    id: generateNotificationId(),
    targetUserId: input.targetUserId,
    module: 'fm_bridge',
    severity: input.severity,
    title: input.title,
    description: input.description,
    entityType: input.entityType,
    entityId: input.entityId,
    actionUrl: input.actionUrl,
    read: false,
    createdAt: new Date().toISOString(),
  };

  try {
    await deps.persistNotification(notification);
    return { success: true, data: notification };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown persistence error';
    console.warn(
      `[actionCentreAdapter] Failed to publish notification "${input.title}": ${message}`,
    );
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

// ─── Public API: Warranty Alerts ──────────────────────────────────────────────

/**
 * Surfaces a warranty expiry alert in the Action Centre.
 * 90-day alerts are 'warning' severity, 30-day alerts are 'urgent'.
 *
 * Requirement 3.2: 90-day notification
 * Requirement 3.3: 30-day urgent notification
 */
export async function publishWarrantyExpiryAlert(
  input: WarrantyAlertInput,
  deps: ActionCentreAdapterDeps,
): Promise<ServiceResult<ActionCentreNotification>> {
  if (!input.targetUserId || !input.buildingId || !input.warrantyId) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'targetUserId, buildingId, and warrantyId are required',
      },
    };
  }

  const severity: 'warning' | 'urgent' = input.daysUntilExpiry <= 30 ? 'urgent' : 'warning';
  const urgencyLabel = input.daysUntilExpiry <= 30 ? 'URGENT: ' : '';

  return publishFMNotification(
    {
      targetUserId: input.targetUserId,
      buildingId: input.buildingId,
      title: `${urgencyLabel}Warranty expiring in ${input.daysUntilExpiry} days`,
      description: `The warranty for "${input.warrantyDescription}" will expire in ${input.daysUntilExpiry} days. Review and lodge any pending claims before expiry.`,
      severity,
      entityType: 'warranty',
      entityId: input.warrantyId,
      actionUrl: `/fm-bridge/buildings/${input.buildingId}/warranties/${input.warrantyId}`,
    },
    deps,
  );
}

// ─── Public API: DLP Notifications ────────────────────────────────────────────

/**
 * Surfaces a DLP countdown notification in the Action Centre.
 * Thresholds: 60 days (info), 30 days (warning), 14 days (urgent), 7 days (critical).
 *
 * Requirement 5.2: DLP countdown notifications at 60/30/14/7 days
 */
export async function publishDLPCountdownAlert(
  input: DLPCountdownInput,
  deps: ActionCentreAdapterDeps,
): Promise<ServiceResult<ActionCentreNotification>> {
  if (!input.targetUserId || !input.buildingId || !input.dlpId) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'targetUserId, buildingId, and dlpId are required',
      },
    };
  }

  // Determine severity based on days remaining
  let severity: 'info' | 'warning' | 'urgent' | 'critical';
  if (input.daysRemaining <= 7) {
    severity = 'critical';
  } else if (input.daysRemaining <= 14) {
    severity = 'urgent';
  } else if (input.daysRemaining <= 30) {
    severity = 'warning';
  } else {
    severity = 'info';
  }

  return publishFMNotification(
    {
      targetUserId: input.targetUserId,
      buildingId: input.buildingId,
      title: `Defects Liability Period: ${input.daysRemaining} days remaining`,
      description: `The DLP for this building expires in ${input.daysRemaining} days. Ensure all defects are logged and rectification is progressing before expiry.`,
      severity,
      entityType: 'dlp',
      entityId: input.dlpId,
      actionUrl: `/fm-bridge/buildings/${input.buildingId}/dlp/${input.dlpId}`,
    },
    deps,
  );
}

// ─── Public API: Maintenance Notifications ────────────────────────────────────

/**
 * Surfaces a maintenance task reminder or overdue alert in the Action Centre.
 *
 * Requirement 6.3: Maintenance task notifications on scheduled date
 * Overdue tasks get 'urgent' severity.
 */
export async function publishMaintenanceReminder(
  input: MaintenanceReminderInput,
  deps: ActionCentreAdapterDeps,
): Promise<ServiceResult<ActionCentreNotification>> {
  if (!input.targetUserId || !input.buildingId || !input.occurrenceId) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'targetUserId, buildingId, and occurrenceId are required',
      },
    };
  }

  const severity: 'info' | 'urgent' = input.isOverdue ? 'urgent' : 'info';
  const titlePrefix = input.isOverdue ? 'OVERDUE: ' : '';
  const assetRef = input.assetDescription ? ` (${input.assetDescription})` : '';

  return publishFMNotification(
    {
      targetUserId: input.targetUserId,
      buildingId: input.buildingId,
      title: `${titlePrefix}Maintenance due: ${input.taskDescription}`,
      description: `${input.isOverdue ? 'Overdue maintenance task' : 'Scheduled maintenance task'}: "${input.taskDescription}"${assetRef}. Please action this task.`,
      severity,
      entityType: 'maintenance',
      entityId: input.occurrenceId,
      actionUrl: `/fm-bridge/buildings/${input.buildingId}/maintenance/${input.scheduleId}`,
    },
    deps,
  );
}

// ─── Public API: Subscription Prompts ─────────────────────────────────────────

/**
 * Surfaces subscription-related prompts in the Action Centre.
 *
 * Requirement 7.7: Subscription status changes surfaced via Action Centre
 */
export async function publishSubscriptionPrompt(
  input: SubscriptionPromptInput,
  deps: ActionCentreAdapterDeps,
): Promise<ServiceResult<ActionCentreNotification>> {
  if (!input.targetUserId || !input.buildingId || !input.promptType) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'targetUserId, buildingId, and promptType are required',
      },
    };
  }

  // Map prompt type to notification content
  const promptConfig = getSubscriptionPromptConfig(input);

  return publishFMNotification(
    {
      targetUserId: input.targetUserId,
      buildingId: input.buildingId,
      title: promptConfig.title,
      description: promptConfig.description,
      severity: promptConfig.severity,
      entityType: 'subscription',
      entityId: input.buildingId,
      actionUrl: `/fm-bridge/buildings/${input.buildingId}/subscription`,
    },
    deps,
  );
}

// ─── Public API: Batch Publishing ─────────────────────────────────────────────

/**
 * Publishes warranty expiry alerts for multiple users (e.g., all building_owner
 * and facility_manager users on a building). Processes each independently so
 * that a single failure does not prevent others from being notified.
 */
export async function publishWarrantyExpiryAlertBatch(
  inputs: WarrantyAlertInput[],
  deps: ActionCentreAdapterDeps,
): Promise<ServiceResult<ActionCentreNotification>[]> {
  const results: ServiceResult<ActionCentreNotification>[] = [];
  for (const input of inputs) {
    const result = await publishWarrantyExpiryAlert(input, deps);
    results.push(result);
  }
  return results;
}

/**
 * Publishes DLP countdown alerts for multiple users.
 */
export async function publishDLPCountdownAlertBatch(
  inputs: DLPCountdownInput[],
  deps: ActionCentreAdapterDeps,
): Promise<ServiceResult<ActionCentreNotification>[]> {
  const results: ServiceResult<ActionCentreNotification>[] = [];
  for (const input of inputs) {
    const result = await publishDLPCountdownAlert(input, deps);
    results.push(result);
  }
  return results;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function getSubscriptionPromptConfig(input: SubscriptionPromptInput): {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'urgent' | 'critical';
} {
  switch (input.promptType) {
    case 'trial_expiring':
      return {
        title: `Trial expiring${input.daysRemaining != null ? ` in ${input.daysRemaining} days` : ''}`,
        description:
          'Your FM Bridge trial period is ending soon. Activate a subscription to retain full access to Building Passport, warranty tracking, and maintenance scheduling.',
        severity: input.daysRemaining != null && input.daysRemaining <= 7 ? 'urgent' : 'warning',
      };
    case 'payment_failed':
      return {
        title: 'Subscription payment failed',
        description:
          'Your FM Bridge subscription payment could not be processed. Please update your payment method to avoid service interruption.',
        severity: 'urgent',
      };
    case 'renewal_due':
      return {
        title: `Subscription renewal${input.daysRemaining != null ? ` in ${input.daysRemaining} days` : ' due'}`,
        description:
          'Your FM Bridge subscription renewal is approaching. Ensure your payment method is up to date for uninterrupted service.',
        severity: 'info',
      };
    case 'reactivation':
      return {
        title: 'Reactivate your FM Bridge subscription',
        description:
          'Your FM Bridge subscription has lapsed. Your building data is preserved — reactivate to restore full access to all features.',
        severity: 'warning',
      };
    default:
      return {
        title: 'FM Bridge subscription update',
        description: 'Please review your FM Bridge subscription status.',
        severity: 'info',
      };
  }
}
