/**
 * Action Centre Adapter — Town Planning Integration
 *
 * Surfaces deadlines, notifications, and calendar events to the
 * platform Inbox / Action Centre. Ensures town planning actions
 * are visible alongside other project actions.
 */

import { withRetry, type RetryOptions } from './retryUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeadlineActionParams {
  projectId: string;
  applicationId: string;
  title: string;
  description: string;
  dueDate: string;
  severity: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface NotificationParams {
  projectId: string;
  applicationId: string;
  title: string;
  message: string;
  targetRoles?: string[];
  metadata?: Record<string, unknown>;
}

export interface CalendarEventParams {
  projectId: string;
  applicationId: string;
  title: string;
  description: string;
  eventDate: string;
  venue?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionCentreAdapterDeps {
  /** Creates a deadline action in the Action Centre */
  createDeadlineFn: (params: DeadlineActionParams) => Promise<void>;
  /** Creates a notification in the Action Centre */
  createNotificationFn: (params: NotificationParams) => Promise<void>;
  /** Creates a calendar event in the Action Centre */
  createCalendarEventFn: (params: CalendarEventParams) => Promise<void>;
  /** Optional retry configuration */
  retryOptions?: RetryOptions;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Creates a deadline action visible in the Action Centre.
 * Used for acknowledgement deadlines, advertising periods, hearing dates, etc.
 */
export async function createDeadlineAction(
  params: DeadlineActionParams,
  deps: ActionCentreAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.createDeadlineFn(params),
    deps.retryOptions
  );
}

/**
 * Creates a notification entry in the Action Centre.
 * Used for stage transitions, decision outcomes, alerts, etc.
 */
export async function createNotification(
  params: NotificationParams,
  deps: ActionCentreAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.createNotificationFn(params),
    deps.retryOptions
  );
}

/**
 * Creates a calendar event in the Action Centre.
 * Used for hearings, advertising start/end, and scheduled reviews.
 */
export async function createCalendarEvent(
  params: CalendarEventParams,
  deps: ActionCentreAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.createCalendarEventFn(params),
    deps.retryOptions
  );
}
