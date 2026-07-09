/**
 * Remote Desktop Core — Action Centre Integration Adapter
 *
 * Emits WorkflowEvents to the Action Centre for critical session events:
 *   - connection_failed
 *   - focus_violation_attempted
 *   - session_terminated_uac
 *   - auto_disconnect_triggered
 *
 * Events are emitted within 60 seconds of the triggering audit event.
 *
 * Role-specific Action Centre views:
 *   - Resource_Owner:   pending booking confirmations shown as actionable items
 *   - Resource_Consumer: active session info shown as informational items
 *
 * On emission failure, retries 3 times at 30-second intervals, then logs
 * the failure to the Activity_Log (session audit service).
 *
 * Requirements: 13.2, 13.3, 13.7
 */

import { createWorkflowEvent } from '@/services/inboxEventAdapter';
import type { WorkflowEvent, Priority, ArchitexRole } from '@/services/lifecycleTypes';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Critical session event types that trigger Action Centre WorkflowEvents */
export type CriticalSessionEventType =
  | 'connection_failed'
  | 'focus_violation_attempted'
  | 'session_terminated_uac'
  | 'auto_disconnect_triggered';

/** Input for emitting a critical event to the Action Centre */
export interface CriticalEventInput {
  eventType: CriticalSessionEventType;
  sessionId: string;
  bookingId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  projectId?: string;
}

/** Result of an emission attempt */
export interface EmitResult {
  success: boolean;
  eventId?: string;
  error?: string;
  attempts: number;
}

/** A pending booking confirmation item displayed for Resource_Owner */
export interface PendingBookingItem {
  bookingId: string;
  hostName: string;
  requestedWindowStart: string;
  requestedWindowEnd: string;
  consumerName: string;
  consumerUid: string;
  ownerUid: string;
  projectId?: string;
  createdAt: string;
}

/** An active session info item displayed for Resource_Consumer */
export interface ActiveSessionItem {
  sessionId: string;
  bookingId: string;
  hostName: string;
  consumerUid: string;
  ownerUid: string;
  remainingMinutes: number;
  projectId?: string;
  createdAt: string;
}

/** Activity log entry for retry/failure tracking */
export interface ActivityLogEntry {
  type: 'inbox_emit_retrying' | 'inbox_emit_failed';
  eventType: CriticalSessionEventType;
  sessionId: string;
  reason: string;
  timestamp: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 30_000;

/** Critical event types that warrant Action Centre notification */
export const CRITICAL_EVENT_TYPES: ReadonlySet<CriticalSessionEventType> = new Set([
  'connection_failed',
  'focus_violation_attempted',
  'session_terminated_uac',
  'auto_disconnect_triggered',
]);

/** Priority mapping per event type */
const EVENT_PRIORITY_MAP: Record<CriticalSessionEventType, Priority> = {
  connection_failed: 'high',
  focus_violation_attempted: 'medium',
  session_terminated_uac: 'critical',
  auto_disconnect_triggered: 'medium',
};

/** Human-readable titles per event type */
const EVENT_TITLE_MAP: Record<CriticalSessionEventType, string> = {
  connection_failed: 'Remote Desktop: Connection Failed',
  focus_violation_attempted: 'Remote Desktop: Focus Violation Attempted',
  session_terminated_uac: 'Remote Desktop: Session Terminated (UAC)',
  auto_disconnect_triggered: 'Remote Desktop: Auto-Disconnect Triggered',
};

/** Detail templates per event type */
const EVENT_DETAIL_MAP: Record<CriticalSessionEventType, (sessionId: string, bookingId: string) => string> = {
  connection_failed: (sid, bid) =>
    `WebRTC connection failed for session ${sid} (booking ${bid}). The host was unreachable or signalling timed out.`,
  focus_violation_attempted: (sid, bid) =>
    `A focus violation was attempted during session ${sid} (booking ${bid}). Input was blocked and the event has been logged.`,
  session_terminated_uac: (sid, bid) =>
    `Session ${sid} (booking ${bid}) was terminated due to a privilege escalation (UAC) attempt.`,
  auto_disconnect_triggered: (sid, bid) =>
    `Session ${sid} (booking ${bid}) was automatically disconnected when the booking window expired.`,
};

// ─── In-Memory Stores ────────────────────────────────────────────────────────────

const emittedEvents: WorkflowEvent[] = [];
const pendingBookingItems: Map<string, PendingBookingItem> = new Map();
const activeSessionItems: Map<string, ActiveSessionItem> = new Map();
const activityLog: ActivityLogEntry[] = [];

// ─── Overridable Emitter ──────────────────────────────────────────────────────────

type EmitFn = (event: WorkflowEvent) => Promise<unknown>;

async function defaultEmitWorkflowEvent(event: WorkflowEvent): Promise<void> {
  emittedEvents.push(event);
}

let _emitOverride: EmitFn | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Core — Critical Event Emission ──────────────────────────────────────────────

/**
 * Determine whether a session event type is a critical type requiring
 * Action Centre notification.
 */
export function isCriticalEventType(eventType: string): eventType is CriticalSessionEventType {
  return CRITICAL_EVENT_TYPES.has(eventType as CriticalSessionEventType);
}

/**
 * Emit a WorkflowEvent for a critical session event to the Action Centre.
 *
 * Retries up to 3 times at 30-second intervals on failure.
 * On exhaustion, logs the failure to the Activity_Log.
 *
 * @param input   - Critical event metadata
 * @param delayMs - Override retry delay (useful in tests)
 */
export async function emitCriticalEvent(
  input: CriticalEventInput,
  delayMs: number = RETRY_INTERVAL_MS,
): Promise<EmitResult> {
  const { eventType, sessionId, bookingId, projectId } = input;

  const assignedRoles: ArchitexRole[] = ['platform_admin'];

  const event = createWorkflowEvent({
    type: 'risk_detected',
    projectId: projectId ?? `rd-session-${sessionId}`,
    title: EVENT_TITLE_MAP[eventType],
    detail: EVENT_DETAIL_MAP[eventType](sessionId, bookingId),
    priority: EVENT_PRIORITY_MAP[eventType],
    assignedRoles,
    sourceModule: 'site',
    id: `rd-inbox-${eventType}-${sessionId}`,
  });

  const emit = _emitOverride ?? defaultEmitWorkflowEvent;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await emit(event);

      return {
        success: true,
        eventId: event.id,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      // Log retry attempt to Activity_Log
      activityLog.push({
        type: attempt < MAX_RETRY_ATTEMPTS ? 'inbox_emit_retrying' : 'inbox_emit_failed',
        eventType,
        sessionId,
        reason: lastError,
        timestamp: new Date().toISOString(),
      });

      if (attempt < MAX_RETRY_ATTEMPTS) {
        await delay(delayMs);
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: MAX_RETRY_ATTEMPTS,
  };
}

// ─── Resource_Owner View — Pending Booking Confirmations ─────────────────────────

/**
 * Add a pending booking confirmation as an actionable item in the
 * Resource_Owner's Action Centre view.
 *
 * Requirement 13.3
 */
export function addPendingBookingItem(item: PendingBookingItem): void {
  pendingBookingItems.set(item.bookingId, item);
}

/**
 * Remove a pending booking confirmation (on approve/reject).
 */
export function removePendingBookingItem(bookingId: string): boolean {
  return pendingBookingItems.delete(bookingId);
}

/**
 * Get all pending booking confirmations for a specific Resource_Owner,
 * sorted by createdAt descending (newest first).
 *
 * Requirement 13.3
 */
export function getPendingBookingsForOwner(ownerUid: string): PendingBookingItem[] {
  return Array.from(pendingBookingItems.values())
    .filter((item) => item.ownerUid === ownerUid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ─── Resource_Consumer View — Active Session Info ─────────────────────────────────

/**
 * Add an active session info item for the Resource_Consumer's
 * Action Centre view.
 *
 * Requirement 13.3
 */
export function addActiveSessionItem(item: ActiveSessionItem): void {
  activeSessionItems.set(item.sessionId, item);
}

/**
 * Update remaining time for an active session item.
 * Returns true if the item was found and updated, false otherwise.
 */
export function updateActiveSessionRemainingTime(
  sessionId: string,
  remainingMinutes: number,
): boolean {
  const item = activeSessionItems.get(sessionId);
  if (!item) return false;
  item.remainingMinutes = remainingMinutes;
  return true;
}

/**
 * Remove an active session item (on session end).
 */
export function removeActiveSessionItem(sessionId: string): boolean {
  return activeSessionItems.delete(sessionId);
}

/**
 * Get all active session items for a specific Resource_Consumer,
 * sorted by createdAt descending (newest first).
 *
 * Requirement 13.3
 */
export function getActiveSessionsForConsumer(consumerUid: string): ActiveSessionItem[] {
  return Array.from(activeSessionItems.values())
    .filter((item) => item.consumerUid === consumerUid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ─── Observability ────────────────────────────────────────────────────────────────

/**
 * Get all emitted WorkflowEvents (for testing/observability).
 */
export function getEmittedEvents(): readonly WorkflowEvent[] {
  return [...emittedEvents];
}

/**
 * Get the Activity_Log entries (retry/failure records).
 */
export function getActivityLog(): readonly ActivityLogEntry[] {
  return [...activityLog];
}

// ─── Test Utilities ────────────────────────────────────────────────────────────────

/**
 * Reset all in-memory state. Used in tests only.
 */
export function _resetInboxAdapterState(): void {
  emittedEvents.length = 0;
  pendingBookingItems.clear();
  activeSessionItems.clear();
  activityLog.length = 0;
  _emitOverride = null;
}

/**
 * Inject a custom emit function for testing failure scenarios.
 * Set to null to restore default behaviour.
 */
export function _setEmitOverride(fn: EmitFn | null): void {
  _emitOverride = fn;
}
