/**
 * Host Agent — Session Tray Service
 *
 * Manages the system tray notification for active remote desktop sessions.
 * Shows session status, consumer name, elapsed time, and provides
 * a "Terminate Session" action for the resource owner.
 *
 * Responsibilities:
 * - Display tray icon with session status (active/paused)
 * - Show consumer display name (truncated to 64 chars with ellipsis)
 * - Update elapsed time in HH:MM:SS format every 1 second
 * - Provide "Terminate Session" action
 * - Signal Session Broker within 2 seconds on terminate
 * - Close session-launched apps on terminate
 * - Write "owner_revoked" event on terminate
 * - Handle broker connectivity loss (120s buffer then local terminate)
 * - Handle failed termination signal (local terminate within 5s, buffer event)
 *
 * Requirements: 17.1, 17.2, 17.5, 17.6
 */

import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type TraySessionStatus = 'active' | 'paused' | 'idle' | 'terminating';

export interface TraySessionInfo {
  sessionId: string;
  bookingId: string;
  consumerName: string;
  consumerUid: string;
  hostId: string;
  startTimestamp: number;         // Unix ms
  applicationsLaunched: string[]; // PIDs or app names for cleanup
  status: TraySessionStatus;
}

export interface TrayNotificationState {
  visible: boolean;
  sessionStatus: TraySessionStatus;
  consumerDisplayName: string;    // Truncated to 64 chars
  elapsedTime: string;            // HH:MM:SS format
  elapsedSeconds: number;
  terminateActionEnabled: boolean;
}

export interface TerminationResult {
  success: boolean;
  terminatedLocally: boolean;
  brokerSignalDelivered: boolean;
  eventWritten: boolean;
  error?: string;
}

export interface BufferedAuditEvent {
  eventType: string;
  sessionId: string;
  bookingId: string;
  hostId: string;
  ownerUid: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface SessionTrayServiceConfig {
  ownerUid: string;
  brokerBaseUrl: string;
  authToken: string;
  /** Injected broker signal function for testing */
  brokerSignalFn?: (sessionId: string, ownerUid: string) => Promise<boolean>;
  /** Injected app close function for testing */
  closeAppsFn?: (apps: string[]) => Promise<void>;
  /** Injected audit event writer for testing */
  writeAuditEventFn?: (event: BufferedAuditEvent) => Promise<boolean>;
}

export type TrayEvent =
  | 'session_started'
  | 'session_paused'
  | 'session_resumed'
  | 'session_terminated'
  | 'elapsed_tick'
  | 'broker_signal_failed'
  | 'broker_connectivity_lost'
  | 'local_terminate';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum consumer name display length */
const MAX_CONSUMER_NAME_LENGTH = 64;

/** Timer update interval (ms) */
const ELAPSED_TIMER_INTERVAL_MS = 1_000;

/** Maximum time to wait for broker termination signal (ms) */
const BROKER_SIGNAL_TIMEOUT_MS = 2_000;

/** Time to wait before forcing local termination on failed signal (ms) */
const FAILED_SIGNAL_LOCAL_TERMINATE_MS = 5_000;

/** Broker connectivity loss grace period before local termination (ms) */
const BROKER_CONNECTIVITY_LOSS_TIMEOUT_MS = 120_000;

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Truncate a name to 64 characters with ellipsis if longer.
 */
export function truncateConsumerName(name: string): string {
  if (name.length <= MAX_CONSUMER_NAME_LENGTH) return name;
  return name.substring(0, MAX_CONSUMER_NAME_LENGTH - 3) + '...';
}

/**
 * Format seconds into HH:MM:SS string.
 */
export function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');
}

// ─── SessionTrayService Class ───────────────────────────────────────────────────

/**
 * Manages the system tray notification state for owner session monitoring.
 *
 * Emits events:
 * - 'session_started': When a new session begins displaying in tray
 * - 'session_paused': When session enters paused state
 * - 'session_resumed': When session resumes from paused
 * - 'session_terminated': When session is terminated by owner
 * - 'elapsed_tick': Every 1 second with updated elapsed time
 * - 'broker_signal_failed': When broker termination signal fails
 * - 'broker_connectivity_lost': When broker connectivity is lost during session
 * - 'local_terminate': When session is terminated locally due to broker failure
 */
export class SessionTrayService extends EventEmitter {
  private readonly ownerUid: string;
  private readonly brokerBaseUrl: string;
  private readonly authToken: string;
  private readonly brokerSignalFn: (sessionId: string, ownerUid: string) => Promise<boolean>;
  private readonly closeAppsFn: (apps: string[]) => Promise<void>;
  private readonly writeAuditEventFn: (event: BufferedAuditEvent) => Promise<boolean>;

  private currentSession: TraySessionInfo | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private elapsedSeconds = 0;
  private brokerConnectivityLostTimestamp: number | null = null;
  private connectivityCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private bufferedEvents: BufferedAuditEvent[] = [];

  constructor(config: SessionTrayServiceConfig) {
    super();
    this.ownerUid = config.ownerUid;
    this.brokerBaseUrl = config.brokerBaseUrl.replace(/\/$/, '');
    this.authToken = config.authToken;
    this.brokerSignalFn = config.brokerSignalFn ?? this.defaultBrokerSignal.bind(this);
    this.closeAppsFn = config.closeAppsFn ?? this.defaultCloseApps.bind(this);
    this.writeAuditEventFn = config.writeAuditEventFn ?? this.defaultWriteAuditEvent.bind(this);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start displaying session info in the tray.
   * Called when a new session becomes active on this host.
   */
  startSession(session: TraySessionInfo): void {
    this.currentSession = {
      ...session,
      consumerName: truncateConsumerName(session.consumerName),
      status: 'active',
    };
    this.elapsedSeconds = 0;
    this.brokerConnectivityLostTimestamp = null;

    // Start the 1-second timer for elapsed time display
    this.startElapsedTimer();

    this.emit('session_started', this.getNotificationState());
  }

  /**
   * Update session status to paused (e.g., system dialog detected).
   */
  pauseSession(): void {
    if (!this.currentSession) return;
    this.currentSession.status = 'paused';
    this.emit('session_paused', this.getNotificationState());
  }

  /**
   * Resume session from paused state.
   */
  resumeSession(): void {
    if (!this.currentSession) return;
    this.currentSession.status = 'active';
    this.emit('session_resumed', this.getNotificationState());
  }

  /**
   * Terminate the current session.
   *
   * Flow:
   * 1. Signal broker within 2 seconds
   * 2. Close session-launched apps
   * 3. Write "owner_revoked" event
   *
   * If broker signal fails:
   * - Terminate locally within 5 seconds
   * - Buffer "broker_unreachable_on_revoke" event for later flush
   *
   * Requirement 17.2, 17.6
   */
  async terminateSession(): Promise<TerminationResult> {
    if (!this.currentSession) {
      return {
        success: false,
        terminatedLocally: false,
        brokerSignalDelivered: false,
        eventWritten: false,
        error: 'No active session to terminate',
      };
    }

    const session = this.currentSession;
    session.status = 'terminating';

    // Attempt to signal broker within 2 seconds
    let brokerSignalDelivered = false;
    try {
      brokerSignalDelivered = await Promise.race([
        this.brokerSignalFn(session.sessionId, this.ownerUid),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Broker signal timeout')), BROKER_SIGNAL_TIMEOUT_MS),
        ),
      ]);
    } catch {
      brokerSignalDelivered = false;
    }

    // Close session-launched apps
    try {
      await this.closeAppsFn(session.applicationsLaunched);
    } catch {
      // Non-fatal: apps may have already closed
    }

    // Write "owner_revoked" event
    let eventWritten = false;
    const auditEvent: BufferedAuditEvent = {
      eventType: 'owner_revoked',
      sessionId: session.sessionId,
      bookingId: session.bookingId,
      hostId: session.hostId,
      ownerUid: this.ownerUid,
      timestamp: Date.now(),
      metadata: {
        reason: 'owner_initiated_termination',
        brokerSignalDelivered,
      },
    };

    try {
      eventWritten = await this.writeAuditEventFn(auditEvent);
    } catch {
      eventWritten = false;
    }

    // Handle broker signal failure (Requirement 17.6)
    if (!brokerSignalDelivered) {
      this.emit('broker_signal_failed', { sessionId: session.sessionId });

      // Buffer the unreachable event
      const unreachableEvent: BufferedAuditEvent = {
        eventType: 'broker_connectivity_lost',
        sessionId: session.sessionId,
        bookingId: session.bookingId,
        hostId: session.hostId,
        ownerUid: this.ownerUid,
        timestamp: Date.now(),
        metadata: {
          reason: 'broker_unreachable_on_revoke',
          terminatedLocally: true,
        },
      };

      const unreachableWritten = await this.writeAuditEventFn(unreachableEvent).catch(() => false);
      if (!unreachableWritten) {
        this.bufferedEvents.push(unreachableEvent);
      }

      // Terminate locally
      this.performLocalTermination();

      return {
        success: true,
        terminatedLocally: true,
        brokerSignalDelivered: false,
        eventWritten,
      };
    }

    // If event write failed, buffer it
    if (!eventWritten) {
      this.bufferedEvents.push(auditEvent);
    }

    // Clean up tray state
    this.stopSession();

    this.emit('session_terminated', { sessionId: session.sessionId, brokerSignalDelivered: true });

    return {
      success: true,
      terminatedLocally: false,
      brokerSignalDelivered: true,
      eventWritten,
    };
  }

  /**
   * Handle broker connectivity loss during an active session.
   *
   * Requirement 17.5:
   * - Continue session for 120 seconds
   * - If connectivity not restored, terminate locally and buffer events
   */
  handleBrokerConnectivityLoss(): void {
    if (!this.currentSession) return;
    if (this.brokerConnectivityLostTimestamp !== null) return; // Already handling

    this.brokerConnectivityLostTimestamp = Date.now();
    this.emit('broker_connectivity_lost', { sessionId: this.currentSession.sessionId });

    // Set timer for 120 seconds
    this.connectivityCheckTimer = setTimeout(() => {
      this.handleConnectivityTimeout();
    }, BROKER_CONNECTIVITY_LOSS_TIMEOUT_MS);
  }

  /**
   * Restore broker connectivity. Cancels the 120-second termination timer.
   */
  handleBrokerConnectivityRestored(): void {
    this.brokerConnectivityLostTimestamp = null;
    if (this.connectivityCheckTimer) {
      clearTimeout(this.connectivityCheckTimer);
      this.connectivityCheckTimer = null;
    }
  }

  /**
   * Get current tray notification state for UI rendering.
   */
  getNotificationState(): TrayNotificationState {
    if (!this.currentSession) {
      return {
        visible: false,
        sessionStatus: 'idle',
        consumerDisplayName: '',
        elapsedTime: '00:00:00',
        elapsedSeconds: 0,
        terminateActionEnabled: false,
      };
    }

    return {
      visible: true,
      sessionStatus: this.currentSession.status,
      consumerDisplayName: this.currentSession.consumerName,
      elapsedTime: formatElapsedTime(this.elapsedSeconds),
      elapsedSeconds: this.elapsedSeconds,
      terminateActionEnabled: this.currentSession.status === 'active' || this.currentSession.status === 'paused',
    };
  }

  /**
   * Check if there is an active session.
   */
  hasActiveSession(): boolean {
    return this.currentSession !== null && this.currentSession.status !== 'idle';
  }

  /**
   * Get buffered events that need to be flushed when connectivity is restored.
   */
  getBufferedEvents(): ReadonlyArray<BufferedAuditEvent> {
    return [...this.bufferedEvents];
  }

  /**
   * Flush buffered events (call when broker connectivity is restored).
   */
  async flushBufferedEvents(): Promise<number> {
    let flushed = 0;
    const remaining: BufferedAuditEvent[] = [];

    for (const event of this.bufferedEvents) {
      try {
        const written = await this.writeAuditEventFn(event);
        if (written) {
          flushed++;
        } else {
          remaining.push(event);
        }
      } catch {
        remaining.push(event);
      }
    }

    this.bufferedEvents = remaining;
    return flushed;
  }

  /**
   * Stop session display and clean up timers.
   */
  stopSession(): void {
    this.stopElapsedTimer();
    this.currentSession = null;
    this.elapsedSeconds = 0;
    this.brokerConnectivityLostTimestamp = null;

    if (this.connectivityCheckTimer) {
      clearTimeout(this.connectivityCheckTimer);
      this.connectivityCheckTimer = null;
    }
  }

  /**
   * Clean up all resources (call on service shutdown).
   */
  destroy(): void {
    this.stopSession();
    this.bufferedEvents = [];
    this.removeAllListeners();
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  /**
   * Start the 1-second elapsed timer.
   */
  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      this.elapsedSeconds++;
      this.emit('elapsed_tick', {
        elapsedSeconds: this.elapsedSeconds,
        elapsedTime: formatElapsedTime(this.elapsedSeconds),
      });
    }, ELAPSED_TIMER_INTERVAL_MS);
  }

  /**
   * Stop the elapsed timer.
   */
  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  /**
   * Handle connectivity timeout after 120 seconds.
   * Terminate session locally and buffer events.
   */
  private handleConnectivityTimeout(): void {
    if (!this.currentSession) return;

    const session = this.currentSession;

    // Buffer the connectivity loss event
    const event: BufferedAuditEvent = {
      eventType: 'broker_connectivity_lost',
      sessionId: session.sessionId,
      bookingId: session.bookingId,
      hostId: session.hostId,
      ownerUid: this.ownerUid,
      timestamp: Date.now(),
      metadata: {
        reason: 'connectivity_loss_timeout',
        lostAt: this.brokerConnectivityLostTimestamp,
        terminatedAfterMs: BROKER_CONNECTIVITY_LOSS_TIMEOUT_MS,
      },
    };

    this.bufferedEvents.push(event);

    // Terminate locally
    this.performLocalTermination();
    this.emit('local_terminate', { sessionId: session.sessionId, reason: 'broker_connectivity_loss' });
  }

  /**
   * Perform local session termination (close apps, stop display).
   */
  private performLocalTermination(): void {
    if (!this.currentSession) return;

    const apps = this.currentSession.applicationsLaunched;

    // Close apps (fire-and-forget)
    this.closeAppsFn(apps).catch(() => {
      // Non-fatal
    });

    this.stopSession();
  }

  /**
   * Default broker signal implementation using HTTP.
   */
  private async defaultBrokerSignal(sessionId: string, ownerUid: string): Promise<boolean> {
    try {
      const url = `${this.brokerBaseUrl}/api/remote-desktop/sessions/${sessionId}/end`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          reason: 'owner_revoked',
          terminatedBy: 'owner',
          ownerUid,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Default app close implementation (platform-specific).
   * In production, this uses native process termination.
   */
  private async defaultCloseApps(apps: string[]): Promise<void> {
    // Native implementation would terminate processes by PID or name.
    // This is a placeholder for the Electron/native layer.
    void apps;
  }

  /**
   * Default audit event writer using HTTP to the broker.
   */
  private async defaultWriteAuditEvent(event: BufferedAuditEvent): Promise<boolean> {
    try {
      const url = `${this.brokerBaseUrl}/api/remote-desktop/audit/${event.sessionId}/events`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify(event),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ─── Exported Constants (for testing) ───────────────────────────────────────────

export const TRAY_CONSTANTS = {
  MAX_CONSUMER_NAME_LENGTH,
  ELAPSED_TIMER_INTERVAL_MS,
  BROKER_SIGNAL_TIMEOUT_MS,
  FAILED_SIGNAL_LOCAL_TERMINATE_MS,
  BROKER_CONNECTIVITY_LOSS_TIMEOUT_MS,
} as const;
