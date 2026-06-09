/**
 * Inbox Event Adapter
 *
 * Creates inbox events from analytics alerts and other sources.
 * Events are routed to appropriate recipient roles.
 */

import type { Severity } from '../types/analyticsReporting';

let seq = 1;
const inboxEvents: InboxEvent[] = [];

export interface InboxEvent {
  eventId: string;
  recipientRole: string;
  title: string;
  description?: string;
  sourceObjectId: string;
  priority: Severity;
  projectId?: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

/**
 * Create an inbox event.
 */
export function inbox(
  recipientRole: string,
  title: string,
  sourceObjectId: string,
  priority: Severity,
  options?: {
    description?: string;
    projectId?: string;
  },
): InboxEvent {
  const event: InboxEvent = {
    eventId: `inbox-${seq++}`,
    recipientRole,
    title,
    description: options?.description,
    sourceObjectId,
    priority,
    projectId: options?.projectId,
    createdAt: new Date().toISOString(),
    acknowledged: false,
  };

  inboxEvents.push(event);
  return event;
}

/**
 * Get inbox events for a role or project.
 */
export function getInboxEvents(options?: {
  recipientRole?: string;
  projectId?: string;
  unacknowledgedOnly?: boolean;
  priority?: Severity;
  limit?: number;
}): InboxEvent[] {
  let filtered = [...inboxEvents];

  if (options?.recipientRole) {
    filtered = filtered.filter((e) => e.recipientRole === options.recipientRole);
  }
  if (options?.projectId) {
    filtered = filtered.filter((e) => e.projectId === options.projectId);
  }
  if (options?.unacknowledgedOnly) {
    filtered = filtered.filter((e) => !e.acknowledged);
  }
  if (options?.priority) {
    filtered = filtered.filter((e) => e.priority === options.priority);
  }
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Acknowledge an inbox event.
 */
export function acknowledgeInboxEvent(
  eventId: string,
  acknowledgedBy: string,
): InboxEvent | undefined {
  const event = inboxEvents.find((e) => e.eventId === eventId);
  if (!event) return undefined;
  event.acknowledged = true;
  event.acknowledgedBy = acknowledgedBy;
  event.acknowledgedAt = new Date().toISOString();
  return event;
}

/**
 * Get inbox event count.
 */
export function getInboxEventCount(options?: {
  recipientRole?: string;
  unacknowledgedOnly?: boolean;
}): number {
  return getInboxEvents(options).length;
}

// ── Reset (for testing) ─────────────────────────────────────────────────────────

export function resetInboxState(): void {
  inboxEvents.length = 0;
  seq = 1;
}
