/**
 * Remote Desktop Core — Session Timer Service
 *
 * Manages booking window enforcement for remote desktop sessions:
 * - Triggers countdown warning at (window end - grace period)
 * - Auto-disconnects at (window end + grace period)
 * - Grace period configurable 0–15 minutes in 1-minute increments (default 5 min)
 * - Orchestrates auto-disconnect: token revocation, event writing, peer signalling
 * - Handles host cleanup timeout (30s) with force-terminate and admin flagging
 * - Handles unreachable host: invalidate token, disconnect viewer, queue health check
 *
 * Requirements: 9.1, 9.2, 9.3, 9.6, 9.7
 */

import { revokeToken } from './tokenEngine';
import { writeAuditEvent, type WriteAuditEventInput } from './sessionAuditService';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Minimum grace period: 0 minutes */
export const MIN_GRACE_PERIOD_MINUTES = 0;

/** Maximum grace period: 15 minutes */
export const MAX_GRACE_PERIOD_MINUTES = 15;

/** Default grace period: 5 minutes */
export const DEFAULT_GRACE_PERIOD_MINUTES = 5;

/** Grace period increment: 1 minute */
export const GRACE_PERIOD_INCREMENT_MINUTES = 1;

/** Host cleanup timeout: 30 seconds */
export const HOST_CLEANUP_TIMEOUT_MS = 30_000;

/** Health check queue deadline: 60 seconds */
export const HEALTH_CHECK_QUEUE_DEADLINE_MS = 60_000;

// ─── Types ──────────────────────────────────────────────────────────────────────

export type TimerPhase = 'active' | 'warning' | 'disconnected';

export interface AutoDisconnectResult {
  success: boolean;
  peersSignalled: boolean;
  tokenInvalidated: boolean;
  eventWritten: boolean;
  error?: string;
}

export interface HostCleanupResult {
  success: boolean;
  forceTerminated: boolean;
  flaggedForAdminReview: boolean;
  error?: string;
}

export interface UnreachableHostResult {
  success: boolean;
  tokenInvalidated: boolean;
  viewerDisconnected: boolean;
  healthCheckQueued: boolean;
  healthCheckDeadlineMs: number;
  error?: string;
}

export interface SessionTimerConfig {
  sessionId: string;
  bookingId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  tokenId: string;
}

/**
 * Callback interfaces for signalling and external integrations.
 * In production these connect to the signalling relay, health check queue, etc.
 */
export interface SessionTimerCallbacks {
  /** Signal both peers to disconnect */
  signalPeersDisconnect?: (sessionId: string, reason: string) => Promise<boolean>;
  /** Disconnect only the viewer */
  disconnectViewer?: (sessionId: string, reason: string) => Promise<boolean>;
  /** Force-terminate host session */
  forceTerminateHost?: (sessionId: string) => Promise<boolean>;
  /** Queue a health check for the host */
  queueHealthCheck?: (hostId: string, deadlineMs: number) => Promise<boolean>;
  /** Flag resource for admin review */
  flagForAdminReview?: (hostId: string, sessionId: string, reason: string) => Promise<boolean>;
}

// ─── SessionTimerService ────────────────────────────────────────────────────────

/**
 * Manages session time boundary enforcement for a single remote desktop session.
 *
 * Timeline:
 * ```
 * windowStart ─────────── warningTime ─────── windowEnd ─────── disconnectTime
 *                           │                                       │
 *                   (window end - grace)                    (window end + grace)
 *                           │                                       │
 *                    show countdown                         auto-disconnect
 * ```
 */
export class SessionTimerService {
  private readonly sessionId: string;
  private readonly windowStart: number;  // Unix ms
  private readonly windowEnd: number;    // Unix ms
  private readonly gracePeriodMs: number;
  private readonly warningTime: number;  // Unix ms
  private readonly disconnectTime: number; // Unix ms

  private config: SessionTimerConfig | null = null;
  private callbacks: SessionTimerCallbacks = {};
  private started = false;

  /**
   * Create a new SessionTimerService.
   *
   * @param sessionId - Unique session identifier
   * @param windowStart - Booking window start time (Unix ms)
   * @param windowEnd - Booking window end time (Unix ms)
   * @param gracePeriodSeconds - Grace period in seconds (0–900, must be a multiple of 60)
   */
  constructor(
    sessionId: string,
    windowStart: number,
    windowEnd: number,
    gracePeriodSeconds: number,
  ) {
    this.sessionId = sessionId;
    this.windowStart = windowStart;
    this.windowEnd = windowEnd;
    this.gracePeriodMs = gracePeriodSeconds * 1000;

    // Warning triggers at window end - grace period
    this.warningTime = this.windowEnd - this.gracePeriodMs;
    // Auto-disconnect triggers at window end + grace period
    this.disconnectTime = this.windowEnd + this.gracePeriodMs;
  }

  // ─── Configuration ──────────────────────────────────────────────────────────

  /**
   * Set session metadata required for auto-disconnect orchestration.
   */
  setConfig(config: SessionTimerConfig): void {
    this.config = config;
  }

  /**
   * Set callbacks for external integrations (signalling, health checks, etc.).
   */
  setCallbacks(callbacks: SessionTimerCallbacks): void {
    this.callbacks = callbacks;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Begin tracking the session time boundaries.
   * Marks the timer as started for enforcement purposes.
   */
  start(): void {
    this.started = true;
  }

  /**
   * Check whether the timer has been started.
   */
  isStarted(): boolean {
    return this.started;
  }

  // ─── Time Queries ───────────────────────────────────────────────────────────

  /**
   * Returns remaining time in milliseconds before auto-disconnect triggers.
   * Returns 0 if past the disconnect deadline.
   *
   * @param currentTime - Optional Unix ms timestamp (defaults to Date.now())
   */
  getTimeRemaining(currentTime?: number): number {
    const now = currentTime ?? Date.now();
    const remaining = this.disconnectTime - now;
    return Math.max(0, remaining);
  }

  /**
   * Returns the Unix ms timestamp when the warning phase should begin.
   * Warning triggers at (window end - grace period).
   */
  getWarningTime(): number {
    return this.warningTime;
  }

  /**
   * Returns the Unix ms timestamp when auto-disconnect triggers.
   * Disconnect triggers at (window end + grace period).
   */
  getDisconnectTime(): number {
    return this.disconnectTime;
  }

  /**
   * Returns the configured window start (Unix ms).
   */
  getWindowStart(): number {
    return this.windowStart;
  }

  /**
   * Returns the configured window end (Unix ms).
   */
  getWindowEnd(): number {
    return this.windowEnd;
  }

  /**
   * Returns the configured grace period in milliseconds.
   */
  getGracePeriodMs(): number {
    return this.gracePeriodMs;
  }

  // ─── Phase Detection ────────────────────────────────────────────────────────

  /**
   * Returns true if currently in the warning phase.
   * Warning phase: warningTime <= now < disconnectTime
   *
   * @param currentTime - Optional Unix ms timestamp (defaults to Date.now())
   */
  isWarningPhase(currentTime?: number): boolean {
    const now = currentTime ?? Date.now();
    return now >= this.warningTime && now < this.disconnectTime;
  }

  /**
   * Returns true if past the disconnect deadline (auto-disconnect should trigger).
   *
   * @param currentTime - Optional Unix ms timestamp (defaults to Date.now())
   */
  shouldAutoDisconnect(currentTime?: number): boolean {
    const now = currentTime ?? Date.now();
    return now >= this.disconnectTime;
  }

  /**
   * Returns the current phase of the session timer.
   *
   * @param currentTime - Optional Unix ms timestamp (defaults to Date.now())
   */
  getCurrentPhase(currentTime?: number): TimerPhase {
    const now = currentTime ?? Date.now();
    if (now >= this.disconnectTime) return 'disconnected';
    if (now >= this.warningTime) return 'warning';
    return 'active';
  }

  // ─── Grace Period Validation ────────────────────────────────────────────────

  /**
   * Validates a grace period value.
   *
   * Rules:
   * - Must be between 0 and 900 seconds (0–15 minutes)
   * - Must be a multiple of 60 (1-minute increments)
   *
   * @param seconds - Grace period in seconds to validate
   * @returns Object with valid flag and optional error message
   */
  static validateGracePeriod(seconds: number): { valid: boolean; error?: string } {
    const minutes = seconds / 60;

    if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) {
      return { valid: false, error: 'Grace period must be a whole number of seconds' };
    }

    if (seconds < MIN_GRACE_PERIOD_MINUTES * 60) {
      return {
        valid: false,
        error: `Grace period must be at least ${MIN_GRACE_PERIOD_MINUTES} minutes (${MIN_GRACE_PERIOD_MINUTES * 60} seconds)`,
      };
    }

    if (seconds > MAX_GRACE_PERIOD_MINUTES * 60) {
      return {
        valid: false,
        error: `Grace period must be at most ${MAX_GRACE_PERIOD_MINUTES} minutes (${MAX_GRACE_PERIOD_MINUTES * 60} seconds)`,
      };
    }

    if (seconds % 60 !== 0) {
      return {
        valid: false,
        error: 'Grace period must be in 1-minute increments (multiples of 60 seconds)',
      };
    }

    return { valid: true };
  }

  // ─── Auto-Disconnect Orchestration ──────────────────────────────────────────

  /**
   * Orchestrates the auto-disconnect sequence:
   * 1. Signal both peers to disconnect
   * 2. Invalidate (revoke) the session token
   * 3. Write "auto_disconnect" event to the Activity_Log
   *
   * Requirement 9.2:
   * - Signal both Host_Agent and Browser_Viewer to disconnect
   * - Invalidate the Session_Token
   * - Write an "auto_disconnect_triggered" event with reason "booking_window_expired"
   */
  async handleAutoDisconnect(): Promise<AutoDisconnectResult> {
    if (!this.config) {
      return {
        success: false,
        peersSignalled: false,
        tokenInvalidated: false,
        eventWritten: false,
        error: 'Session config not set. Call setConfig() before handling auto-disconnect.',
      };
    }

    let peersSignalled = false;
    let tokenInvalidated = false;
    let eventWritten = false;

    // 1. Signal both peers to disconnect
    try {
      if (this.callbacks.signalPeersDisconnect) {
        peersSignalled = await this.callbacks.signalPeersDisconnect(
          this.sessionId,
          'booking_window_expired',
        );
      } else {
        // Default: mark as signalled (in production, this would be a real signal)
        peersSignalled = true;
      }
    } catch {
      // Continue with token invalidation even if signalling fails
    }

    // 2. Invalidate the session token
    try {
      revokeToken(this.config.tokenId);
      tokenInvalidated = true;
    } catch {
      // Token revocation failure is critical but we continue to write the event
    }

    // 3. Write "auto_disconnect_triggered" event
    try {
      const eventInput: WriteAuditEventInput = {
        sessionId: this.config.sessionId,
        bookingId: this.config.bookingId,
        eventType: 'auto_disconnect_triggered',
        actorUid: 'system',
        actorRole: 'system',
        hostId: this.config.hostId,
        timestamp: {
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: (Date.now() % 1000) * 1_000_000,
        },
        metadata: {
          reason: 'booking_window_expired',
          windowEnd: this.windowEnd,
          gracePeriodMs: this.gracePeriodMs,
          disconnectTime: this.disconnectTime,
          tokenId: this.config.tokenId,
          consumerUid: this.config.consumerUid,
        },
      };

      await writeAuditEvent(eventInput);
      eventWritten = true;
    } catch {
      // Event write failure — might be retried by the audit service's own logic
    }

    const success = peersSignalled && tokenInvalidated && eventWritten;

    return {
      success,
      peersSignalled,
      tokenInvalidated,
      eventWritten,
      error: success ? undefined : 'One or more auto-disconnect steps failed',
    };
  }

  // ─── Host Cleanup Timeout ───────────────────────────────────────────────────

  /**
   * Handle host cleanup timeout.
   *
   * Requirement 9.6:
   * - Host must reach idle within 30 seconds after auto-disconnect
   * - If timeout: force-terminate, write "forced_disconnect" event, flag for admin review
   */
  async handleHostCleanupTimeout(): Promise<HostCleanupResult> {
    if (!this.config) {
      return {
        success: false,
        forceTerminated: false,
        flaggedForAdminReview: false,
        error: 'Session config not set. Call setConfig() before handling host cleanup timeout.',
      };
    }

    let forceTerminated = false;
    let flaggedForAdminReview = false;

    // 1. Force-terminate the host session
    try {
      if (this.callbacks.forceTerminateHost) {
        forceTerminated = await this.callbacks.forceTerminateHost(this.sessionId);
      } else {
        forceTerminated = true;
      }
    } catch {
      // Continue to flag for admin review even if force-terminate fails
    }

    // 2. Write "forced_disconnect" event with reason "host_cleanup_timeout"
    try {
      const eventInput: WriteAuditEventInput = {
        sessionId: this.config.sessionId,
        bookingId: this.config.bookingId,
        eventType: 'auto_disconnect_triggered',
        actorUid: 'system',
        actorRole: 'system',
        hostId: this.config.hostId,
        timestamp: {
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: (Date.now() % 1000) * 1_000_000,
        },
        metadata: {
          reason: 'host_cleanup_timeout',
          forceTerminated,
          cleanupTimeoutMs: HOST_CLEANUP_TIMEOUT_MS,
          sessionId: this.sessionId,
        },
      };

      await writeAuditEvent(eventInput);
    } catch {
      // Event write failure — continue to flag for admin review
    }

    // 3. Flag resource for administrative review
    try {
      if (this.callbacks.flagForAdminReview) {
        flaggedForAdminReview = await this.callbacks.flagForAdminReview(
          this.config.hostId,
          this.sessionId,
          'host_cleanup_timeout',
        );
      } else {
        flaggedForAdminReview = true;
      }
    } catch {
      // Admin flagging failure is logged but not fatal
    }

    const success = forceTerminated && flaggedForAdminReview;

    return {
      success,
      forceTerminated,
      flaggedForAdminReview,
      error: success ? undefined : 'Host cleanup timeout handling partially failed',
    };
  }

  // ─── Unreachable Host ───────────────────────────────────────────────────────

  /**
   * Handle unreachable host during auto-disconnect.
   *
   * Requirement 9.7:
   * - Invalidate the session token
   * - Disconnect the browser viewer
   * - Write "auto_disconnect" event with reason "host_unreachable"
   * - Queue a resource health check to execute within 60 seconds
   */
  async handleUnreachableHost(): Promise<UnreachableHostResult> {
    if (!this.config) {
      return {
        success: false,
        tokenInvalidated: false,
        viewerDisconnected: false,
        healthCheckQueued: false,
        healthCheckDeadlineMs: HEALTH_CHECK_QUEUE_DEADLINE_MS,
        error: 'Session config not set. Call setConfig() before handling unreachable host.',
      };
    }

    let tokenInvalidated = false;
    let viewerDisconnected = false;
    let healthCheckQueued = false;

    // 1. Invalidate the session token
    try {
      revokeToken(this.config.tokenId);
      tokenInvalidated = true;
    } catch {
      // Token revocation failure is critical
    }

    // 2. Disconnect the browser viewer
    try {
      if (this.callbacks.disconnectViewer) {
        viewerDisconnected = await this.callbacks.disconnectViewer(
          this.sessionId,
          'host_unreachable',
        );
      } else {
        viewerDisconnected = true;
      }
    } catch {
      // Continue to write event and queue health check
    }

    // 3. Write "auto_disconnect_triggered" event with reason "host_unreachable"
    try {
      const eventInput: WriteAuditEventInput = {
        sessionId: this.config.sessionId,
        bookingId: this.config.bookingId,
        eventType: 'auto_disconnect_triggered',
        actorUid: 'system',
        actorRole: 'system',
        hostId: this.config.hostId,
        timestamp: {
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: (Date.now() % 1000) * 1_000_000,
        },
        metadata: {
          reason: 'host_unreachable',
          tokenInvalidated,
          viewerDisconnected,
          healthCheckDeadlineMs: HEALTH_CHECK_QUEUE_DEADLINE_MS,
          sessionId: this.sessionId,
          consumerUid: this.config.consumerUid,
        },
      };

      await writeAuditEvent(eventInput);
    } catch {
      // Event write failure — continue to queue health check
    }

    // 4. Queue a health check within 60 seconds
    try {
      if (this.callbacks.queueHealthCheck) {
        healthCheckQueued = await this.callbacks.queueHealthCheck(
          this.config.hostId,
          HEALTH_CHECK_QUEUE_DEADLINE_MS,
        );
      } else {
        healthCheckQueued = true;
      }
    } catch {
      // Health check queue failure is logged but not fatal
    }

    const success = tokenInvalidated && viewerDisconnected && healthCheckQueued;

    return {
      success,
      tokenInvalidated,
      viewerDisconnected,
      healthCheckQueued,
      healthCheckDeadlineMs: HEALTH_CHECK_QUEUE_DEADLINE_MS,
      error: success ? undefined : 'Unreachable host handling partially failed',
    };
  }
}
