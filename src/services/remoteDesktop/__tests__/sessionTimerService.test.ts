/**
 * Session Timer Service — Unit Tests
 *
 * Coverage for time boundary enforcement, grace period validation,
 * auto-disconnect orchestration, host cleanup timeout, and unreachable host handling.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.6, 9.7
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SessionTimerService,
  MIN_GRACE_PERIOD_MINUTES,
  MAX_GRACE_PERIOD_MINUTES,
  DEFAULT_GRACE_PERIOD_MINUTES,
  HOST_CLEANUP_TIMEOUT_MS,
  HEALTH_CHECK_QUEUE_DEADLINE_MS,
  type SessionTimerConfig,
  type SessionTimerCallbacks,
} from '../sessionTimerService';

// ─── Mock Dependencies ──────────────────────────────────────────────────────────

vi.mock('../tokenEngine', () => ({
  revokeToken: vi.fn(),
}));

vi.mock('../sessionAuditService', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({
    eventId: 'mock-event-id',
    sessionId: 'session-1',
    bookingId: 'booking-1',
    eventType: 'auto_disconnect_triggered',
    actorUid: 'system',
    actorRole: 'system',
    hostId: 'host-1',
    timestamp: { seconds: 1000, nanoseconds: 0 },
    metadata: {},
  }),
}));

// ─── Test Helpers ───────────────────────────────────────────────────────────────

const SESSION_ID = 'session-timer-test-001';
const BOOKING_ID = 'booking-timer-test-001';
const HOST_ID = 'host-timer-test-001';
const CONSUMER_UID = 'consumer-timer-test-001';
const OWNER_UID = 'owner-timer-test-001';
const TOKEN_ID = 'token-timer-test-001';

/** Base time for testing: 2024-01-15 10:00:00 UTC */
const BASE_TIME = new Date('2024-01-15T10:00:00Z').getTime();

/** 1 hour booking window */
const WINDOW_START = BASE_TIME;
const WINDOW_END = BASE_TIME + 60 * 60 * 1000; // 1 hour later

/** Default grace period: 5 minutes = 300 seconds */
const DEFAULT_GRACE_SECONDS = DEFAULT_GRACE_PERIOD_MINUTES * 60;

function createConfig(): SessionTimerConfig {
  return {
    sessionId: SESSION_ID,
    bookingId: BOOKING_ID,
    hostId: HOST_ID,
    consumerUid: CONSUMER_UID,
    ownerUid: OWNER_UID,
    tokenId: TOKEN_ID,
  };
}

function createCallbacks(overrides: Partial<SessionTimerCallbacks> = {}): SessionTimerCallbacks {
  return {
    signalPeersDisconnect: vi.fn().mockResolvedValue(true),
    disconnectViewer: vi.fn().mockResolvedValue(true),
    forceTerminateHost: vi.fn().mockResolvedValue(true),
    queueHealthCheck: vi.fn().mockResolvedValue(true),
    flagForAdminReview: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Constructor & Basic Properties ─────────────────────────────────────────────

describe('SessionTimerService — Construction', () => {
  it('should create a service with correct properties', () => {
    const service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);

    expect(service.getWindowStart()).toBe(WINDOW_START);
    expect(service.getWindowEnd()).toBe(WINDOW_END);
    expect(service.getGracePeriodMs()).toBe(DEFAULT_GRACE_SECONDS * 1000);
  });

  it('should calculate warning time as window end minus grace period', () => {
    const service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);

    // Warning at window end - grace period
    const expectedWarning = WINDOW_END - (DEFAULT_GRACE_SECONDS * 1000);
    expect(service.getWarningTime()).toBe(expectedWarning);
  });

  it('should calculate disconnect time as window end plus grace period', () => {
    const service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);

    // Disconnect at window end + grace period
    const expectedDisconnect = WINDOW_END + (DEFAULT_GRACE_SECONDS * 1000);
    expect(service.getDisconnectTime()).toBe(expectedDisconnect);
  });

  it('should handle zero grace period', () => {
    const service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, 0);

    expect(service.getWarningTime()).toBe(WINDOW_END);
    expect(service.getDisconnectTime()).toBe(WINDOW_END);
  });

  it('should handle maximum grace period (15 minutes = 900 seconds)', () => {
    const service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, 900);

    const expectedWarning = WINDOW_END - 900_000;
    const expectedDisconnect = WINDOW_END + 900_000;

    expect(service.getWarningTime()).toBe(expectedWarning);
    expect(service.getDisconnectTime()).toBe(expectedDisconnect);
  });
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

describe('SessionTimerService — Lifecycle', () => {
  it('should start as not started', () => {
    const service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
    expect(service.isStarted()).toBe(false);
  });

  it('should mark as started after start() is called', () => {
    const service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
    service.start();
    expect(service.isStarted()).toBe(true);
  });
});

// ─── Time Remaining ─────────────────────────────────────────────────────────────

describe('SessionTimerService — getTimeRemaining', () => {
  let service: SessionTimerService;

  beforeEach(() => {
    service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
  });

  it('should return full remaining time when at window start', () => {
    const remaining = service.getTimeRemaining(WINDOW_START);
    const expectedRemaining = service.getDisconnectTime() - WINDOW_START;
    expect(remaining).toBe(expectedRemaining);
  });

  it('should return correct remaining time during session', () => {
    const midpoint = WINDOW_START + 30 * 60 * 1000; // 30 minutes in
    const remaining = service.getTimeRemaining(midpoint);
    const expectedRemaining = service.getDisconnectTime() - midpoint;
    expect(remaining).toBe(expectedRemaining);
  });

  it('should return 0 when past disconnect time', () => {
    const afterDisconnect = service.getDisconnectTime() + 1000;
    expect(service.getTimeRemaining(afterDisconnect)).toBe(0);
  });

  it('should return 0 when exactly at disconnect time', () => {
    expect(service.getTimeRemaining(service.getDisconnectTime())).toBe(0);
  });
});

// ─── Phase Detection ────────────────────────────────────────────────────────────

describe('SessionTimerService — isWarningPhase', () => {
  let service: SessionTimerService;

  beforeEach(() => {
    service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
  });

  it('should return false when before warning time', () => {
    const beforeWarning = service.getWarningTime() - 1000;
    expect(service.isWarningPhase(beforeWarning)).toBe(false);
  });

  it('should return true when exactly at warning time', () => {
    expect(service.isWarningPhase(service.getWarningTime())).toBe(true);
  });

  it('should return true when between warning and disconnect times', () => {
    const midWarning = service.getWarningTime() + 60_000; // 1 minute after warning
    expect(service.isWarningPhase(midWarning)).toBe(true);
  });

  it('should return false when at disconnect time', () => {
    expect(service.isWarningPhase(service.getDisconnectTime())).toBe(false);
  });

  it('should return false when past disconnect time', () => {
    const pastDisconnect = service.getDisconnectTime() + 1000;
    expect(service.isWarningPhase(pastDisconnect)).toBe(false);
  });
});

describe('SessionTimerService — shouldAutoDisconnect', () => {
  let service: SessionTimerService;

  beforeEach(() => {
    service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
  });

  it('should return false when before disconnect time', () => {
    const beforeDisconnect = service.getDisconnectTime() - 1000;
    expect(service.shouldAutoDisconnect(beforeDisconnect)).toBe(false);
  });

  it('should return true when exactly at disconnect time', () => {
    expect(service.shouldAutoDisconnect(service.getDisconnectTime())).toBe(true);
  });

  it('should return true when past disconnect time', () => {
    const afterDisconnect = service.getDisconnectTime() + 60_000;
    expect(service.shouldAutoDisconnect(afterDisconnect)).toBe(true);
  });

  it('should return false during warning phase', () => {
    const duringWarning = service.getWarningTime() + 30_000;
    expect(service.shouldAutoDisconnect(duringWarning)).toBe(false);
  });
});

describe('SessionTimerService — getCurrentPhase', () => {
  let service: SessionTimerService;

  beforeEach(() => {
    service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
  });

  it('should return "active" when before warning time', () => {
    expect(service.getCurrentPhase(WINDOW_START)).toBe('active');
    expect(service.getCurrentPhase(service.getWarningTime() - 1)).toBe('active');
  });

  it('should return "warning" during the warning phase', () => {
    expect(service.getCurrentPhase(service.getWarningTime())).toBe('warning');
    expect(service.getCurrentPhase(service.getWarningTime() + 60_000)).toBe('warning');
  });

  it('should return "disconnected" when at or past disconnect time', () => {
    expect(service.getCurrentPhase(service.getDisconnectTime())).toBe('disconnected');
    expect(service.getCurrentPhase(service.getDisconnectTime() + 1000)).toBe('disconnected');
  });
});

// ─── Grace Period Validation ────────────────────────────────────────────────────

describe('SessionTimerService.validateGracePeriod', () => {
  it('should accept 0 seconds (0 minutes)', () => {
    const result = SessionTimerService.validateGracePeriod(0);
    expect(result.valid).toBe(true);
  });

  it('should accept 60 seconds (1 minute)', () => {
    const result = SessionTimerService.validateGracePeriod(60);
    expect(result.valid).toBe(true);
  });

  it('should accept 300 seconds (5 minutes — default)', () => {
    const result = SessionTimerService.validateGracePeriod(300);
    expect(result.valid).toBe(true);
  });

  it('should accept 900 seconds (15 minutes — maximum)', () => {
    const result = SessionTimerService.validateGracePeriod(900);
    expect(result.valid).toBe(true);
  });

  it('should accept all valid 1-minute increments from 0 to 15', () => {
    for (let minutes = 0; minutes <= 15; minutes++) {
      const seconds = minutes * 60;
      const result = SessionTimerService.validateGracePeriod(seconds);
      expect(result.valid).toBe(true);
    }
  });

  it('should reject values above 900 seconds (15 minutes)', () => {
    const result = SessionTimerService.validateGracePeriod(960);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most');
  });

  it('should reject negative values', () => {
    const result = SessionTimerService.validateGracePeriod(-60);
    expect(result.valid).toBe(false);
  });

  it('should reject non-60-second increments', () => {
    expect(SessionTimerService.validateGracePeriod(30).valid).toBe(false);
    expect(SessionTimerService.validateGracePeriod(45).valid).toBe(false);
    expect(SessionTimerService.validateGracePeriod(90).valid).toBe(false);
    expect(SessionTimerService.validateGracePeriod(150).valid).toBe(false);
  });

  it('should reject NaN', () => {
    const result = SessionTimerService.validateGracePeriod(NaN);
    expect(result.valid).toBe(false);
  });

  it('should reject Infinity', () => {
    const result = SessionTimerService.validateGracePeriod(Infinity);
    expect(result.valid).toBe(false);
  });

  it('should reject non-integer values', () => {
    const result = SessionTimerService.validateGracePeriod(60.5);
    expect(result.valid).toBe(false);
  });
});

// ─── Auto-Disconnect Orchestration ──────────────────────────────────────────────

describe('SessionTimerService — handleAutoDisconnect', () => {
  let service: SessionTimerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
    service.setConfig(createConfig());
  });

  it('should fail if config is not set', async () => {
    const unconfigured = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
    const result = await unconfigured.handleAutoDisconnect();

    expect(result.success).toBe(false);
    expect(result.error).toContain('config not set');
  });

  it('should signal peers, revoke token, and write event on success', async () => {
    const callbacks = createCallbacks();
    service.setCallbacks(callbacks);

    const result = await service.handleAutoDisconnect();

    expect(result.success).toBe(true);
    expect(result.peersSignalled).toBe(true);
    expect(result.tokenInvalidated).toBe(true);
    expect(result.eventWritten).toBe(true);
    expect(callbacks.signalPeersDisconnect).toHaveBeenCalledWith(SESSION_ID, 'booking_window_expired');
  });

  it('should revoke the token via tokenEngine', async () => {
    const { revokeToken: mockRevoke } = await import('../tokenEngine');
    service.setCallbacks(createCallbacks());

    await service.handleAutoDisconnect();

    expect(mockRevoke).toHaveBeenCalledWith(TOKEN_ID);
  });

  it('should write audit event with correct metadata', async () => {
    const { writeAuditEvent: mockWrite } = await import('../sessionAuditService');
    service.setCallbacks(createCallbacks());

    await service.handleAutoDisconnect();

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        bookingId: BOOKING_ID,
        eventType: 'auto_disconnect_triggered',
        actorUid: 'system',
        hostId: HOST_ID,
        metadata: expect.objectContaining({
          reason: 'booking_window_expired',
          tokenId: TOKEN_ID,
        }),
      }),
    );
  });

  it('should continue to revoke token even if peer signalling fails', async () => {
    const callbacks = createCallbacks({
      signalPeersDisconnect: vi.fn().mockRejectedValue(new Error('network error')),
    });
    service.setCallbacks(callbacks);

    const result = await service.handleAutoDisconnect();

    expect(result.peersSignalled).toBe(false);
    expect(result.tokenInvalidated).toBe(true);
    expect(result.eventWritten).toBe(true);
    expect(result.success).toBe(false);
  });

  it('should work without callbacks (default behavior)', async () => {
    // No callbacks set — uses default "true" paths
    const result = await service.handleAutoDisconnect();

    expect(result.peersSignalled).toBe(true);
    expect(result.tokenInvalidated).toBe(true);
    expect(result.eventWritten).toBe(true);
    expect(result.success).toBe(true);
  });
});

// ─── Host Cleanup Timeout ───────────────────────────────────────────────────────

describe('SessionTimerService — handleHostCleanupTimeout', () => {
  let service: SessionTimerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
    service.setConfig(createConfig());
  });

  it('should fail if config is not set', async () => {
    const unconfigured = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
    const result = await unconfigured.handleHostCleanupTimeout();

    expect(result.success).toBe(false);
    expect(result.error).toContain('config not set');
  });

  it('should force-terminate and flag for admin review on success', async () => {
    const callbacks = createCallbacks();
    service.setCallbacks(callbacks);

    const result = await service.handleHostCleanupTimeout();

    expect(result.success).toBe(true);
    expect(result.forceTerminated).toBe(true);
    expect(result.flaggedForAdminReview).toBe(true);
    expect(callbacks.forceTerminateHost).toHaveBeenCalledWith(SESSION_ID);
    expect(callbacks.flagForAdminReview).toHaveBeenCalledWith(HOST_ID, SESSION_ID, 'host_cleanup_timeout');
  });

  it('should write audit event with host_cleanup_timeout reason', async () => {
    const { writeAuditEvent: mockWrite } = await import('../sessionAuditService');
    service.setCallbacks(createCallbacks());

    await service.handleHostCleanupTimeout();

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        eventType: 'auto_disconnect_triggered',
        metadata: expect.objectContaining({
          reason: 'host_cleanup_timeout',
          cleanupTimeoutMs: HOST_CLEANUP_TIMEOUT_MS,
        }),
      }),
    );
  });

  it('should flag for admin review even if force-terminate fails', async () => {
    const callbacks = createCallbacks({
      forceTerminateHost: vi.fn().mockRejectedValue(new Error('host unresponsive')),
    });
    service.setCallbacks(callbacks);

    const result = await service.handleHostCleanupTimeout();

    expect(result.forceTerminated).toBe(false);
    expect(result.flaggedForAdminReview).toBe(true);
    expect(result.success).toBe(false);
  });
});

// ─── Unreachable Host ───────────────────────────────────────────────────────────

describe('SessionTimerService — handleUnreachableHost', () => {
  let service: SessionTimerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
    service.setConfig(createConfig());
  });

  it('should fail if config is not set', async () => {
    const unconfigured = new SessionTimerService(SESSION_ID, WINDOW_START, WINDOW_END, DEFAULT_GRACE_SECONDS);
    const result = await unconfigured.handleUnreachableHost();

    expect(result.success).toBe(false);
    expect(result.error).toContain('config not set');
  });

  it('should invalidate token, disconnect viewer, and queue health check', async () => {
    const callbacks = createCallbacks();
    service.setCallbacks(callbacks);

    const result = await service.handleUnreachableHost();

    expect(result.success).toBe(true);
    expect(result.tokenInvalidated).toBe(true);
    expect(result.viewerDisconnected).toBe(true);
    expect(result.healthCheckQueued).toBe(true);
    expect(result.healthCheckDeadlineMs).toBe(HEALTH_CHECK_QUEUE_DEADLINE_MS);
  });

  it('should revoke the token via tokenEngine', async () => {
    const { revokeToken: mockRevoke } = await import('../tokenEngine');
    service.setCallbacks(createCallbacks());

    await service.handleUnreachableHost();

    expect(mockRevoke).toHaveBeenCalledWith(TOKEN_ID);
  });

  it('should disconnect the viewer with host_unreachable reason', async () => {
    const callbacks = createCallbacks();
    service.setCallbacks(callbacks);

    await service.handleUnreachableHost();

    expect(callbacks.disconnectViewer).toHaveBeenCalledWith(SESSION_ID, 'host_unreachable');
  });

  it('should queue health check within 60 seconds', async () => {
    const callbacks = createCallbacks();
    service.setCallbacks(callbacks);

    await service.handleUnreachableHost();

    expect(callbacks.queueHealthCheck).toHaveBeenCalledWith(HOST_ID, HEALTH_CHECK_QUEUE_DEADLINE_MS);
  });

  it('should write audit event with host_unreachable reason', async () => {
    const { writeAuditEvent: mockWrite } = await import('../sessionAuditService');
    service.setCallbacks(createCallbacks());

    await service.handleUnreachableHost();

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        eventType: 'auto_disconnect_triggered',
        metadata: expect.objectContaining({
          reason: 'host_unreachable',
          healthCheckDeadlineMs: HEALTH_CHECK_QUEUE_DEADLINE_MS,
        }),
      }),
    );
  });

  it('should still queue health check if viewer disconnect fails', async () => {
    const callbacks = createCallbacks({
      disconnectViewer: vi.fn().mockRejectedValue(new Error('viewer unreachable')),
    });
    service.setCallbacks(callbacks);

    const result = await service.handleUnreachableHost();

    expect(result.viewerDisconnected).toBe(false);
    expect(result.healthCheckQueued).toBe(true);
    expect(result.tokenInvalidated).toBe(true);
    expect(result.success).toBe(false);
  });
});

// ─── Constants Validation ───────────────────────────────────────────────────────

describe('SessionTimerService — Exported Constants', () => {
  it('should export correct grace period bounds', () => {
    expect(MIN_GRACE_PERIOD_MINUTES).toBe(0);
    expect(MAX_GRACE_PERIOD_MINUTES).toBe(15);
    expect(DEFAULT_GRACE_PERIOD_MINUTES).toBe(5);
  });

  it('should export correct host cleanup timeout (30 seconds)', () => {
    expect(HOST_CLEANUP_TIMEOUT_MS).toBe(30_000);
  });

  it('should export correct health check deadline (60 seconds)', () => {
    expect(HEALTH_CHECK_QUEUE_DEADLINE_MS).toBe(60_000);
  });
});
