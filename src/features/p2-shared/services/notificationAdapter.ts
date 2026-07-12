/**
 * P2 Shared — Notification Adapter
 *
 * Surfaces events to the platform Action Centre. Uses dependency injection
 * for persistence (no direct Firestore imports). Graceful degradation: if
 * persistence fails, logs a warning and returns a failure ServiceResult
 * without breaking the calling operation.
 *
 * Requirements: 1.4, 7.7, 20.7
 */

import type { ActionCentreNotification } from '../types';
import { ActionCentreNotificationSchema } from '../schemas';

// ─── Service Result ───────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Persistence Callback ─────────────────────────────────────────────────────

/** Injected persistence callback — writes the notification to the store and returns the ID */
export type PersistNotification = (
  notification: ActionCentreNotification,
) => Promise<string>;

// ─── Validation ───────────────────────────────────────────────────────────────

function validateNotification(
  notification: ActionCentreNotification,
): ServiceResult<ActionCentreNotification> {
  const result = ActionCentreNotificationSchema.safeParse(notification);
  if (!result.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Notification data failed validation',
        details: result.error.flatten(),
      },
    };
  }
  return { success: true, data: result.data as ActionCentreNotification };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Publishes a notification to the Action Centre.
 *
 * @param notification - The notification payload to publish
 * @param persist - Injected persistence callback
 * @returns ServiceResult containing the created notification ID on success
 */
export async function publishNotification(
  notification: ActionCentreNotification,
  persist: PersistNotification,
): Promise<ServiceResult<{ notificationId: string }>> {
  // 1. Validate notification data
  const validation = validateNotification(notification);
  if (!validation.success) {
    return validation as ServiceResult<{ notificationId: string }>;
  }

  // 2. Persist via injected callback — graceful degradation on failure
  try {
    const notificationId = await persist(notification);
    return { success: true, data: { notificationId } };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown persistence error';
    console.warn(
      `[notificationAdapter] Failed to persist notification: ${message}`,
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
