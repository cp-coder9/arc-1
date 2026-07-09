/**
 * Host Agent — Heartbeat Service Tests
 *
 * Tests for the HeartbeatService class covering:
 * - Heartbeat sending at 30-second intervals
 * - System metrics collection (CPU, RAM)
 * - Consecutive failure tracking (3 = connection_lost)
 * - Connection restoration after recovery
 * - App_Allowlist and session policy sync on acknowledgement
 * - Event emission (heartbeat_sent, heartbeat_ack, connection_lost, connection_restored)
 * - Broker-side offline detection (90-second threshold)
 *
 * Requirements: 1.2, 1.3, 1.4, 1.8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HeartbeatService,
  shouldMarkHostOffline,
  getOfflineThresholdMs,
  type HeartbeatServiceConfig,
  type HeartbeatAcknowledgement,
  type HttpClient,
  type HttpResponse,
} from '../heartbeatService';

// ─── Mock HTTP Client ───────────────────────────────────────────────────────────

function createMockHttpClient(responseOverride?: Partial<HttpResponse>): {
  client: HttpClient;
  calls: Array<{ url: string; body: unknown; headers: Record<string, string> }>;
  setResponse: (response: Partial<HttpResponse>) => void;
} {
  const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
  let currentResponse: Partial<HttpResponse> = responseOverride ?? {};

  const client: HttpClient = {
    async post(url: string, body: unknown, headers: Record<string, string>): Promise<HttpResponse> {
      calls.push({ url, body, headers });
      return {
        ok: currentResponse.ok ?? true,
        status: currentResponse.status ?? 200,
        json: currentResponse.json ?? (() => Promise.resolve(createDefaultAck())),
      };
    },
  };

  return {
    client,
    calls,
    setResponse: (response: Partial<HttpResponse>) => { currentResponse = response; },
  };
}

function createDefaultAck(overrides?: Partial<HeartbeatAcknowledgement>): HeartbeatAcknowledgement {
  return {
    hostId: 'test-host-1',
    status: 'online',
    lastHeartbeat: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    configVersion: 1,
    allowlistVersion: 1,
    ...overrides,
  };
}

function createConfig(overrides?: Partial<HeartbeatServiceConfig>): HeartbeatServiceConfig {
  return {
    hostId: 'test-host-1',
    brokerBaseUrl: 'https://api.architex.co.za',
    authToken: 'test-bearer-token',
    intervalMs: 100, // Short interval for tests
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('HeartbeatService', () => {
  let service: HeartbeatService;
  let mockHttp: ReturnType<typeof createMockHttpClient>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockHttp = createMockHttpClient();
  });

  afterEach(() => {
    service?.stop();
    vi.useRealTimers();
  });

  describe('Lifecycle (start/stop)', () => {
    it('should not be running initially', () => {
      service = new HeartbeatService(createConfig(), mockHttp.client);
      expect(service.isRunning()).toBe(false);
    });

    it('should start and send an immediate heartbeat', async () => {
      service = new HeartbeatService(createConfig(), mockHttp.client);
      service.start();

      // Allow the async sendHeartbeat to resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(service.isRunning()).toBe(true);
      expect(mockHttp.calls.length).toBe(1);
    });

    it('should not start twice', async () => {
      service = new HeartbeatService(createConfig(), mockHttp.client);
      service.start();
      service.start(); // Duplicate call

      await vi.advanceTimersByTimeAsync(0);
      expect(mockHttp.calls.length).toBe(1);
    });

    it('should stop and cease sending heartbeats', async () => {
      service = new HeartbeatService(createConfig({ intervalMs: 100 }), mockHttp.client);
      service.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(mockHttp.calls.length).toBe(1);

      service.stop();
      expect(service.isRunning()).toBe(false);

      await vi.advanceTimersByTimeAsync(500);
      expect(mockHttp.calls.length).toBe(1); // No additional calls
    });
  });

  describe('Heartbeat Sending (Requirement 1.2)', () => {
    it('should send heartbeat to correct URL with hostId', async () => {
      service = new HeartbeatService(
        createConfig({ hostId: 'my-host-123', brokerBaseUrl: 'https://api.architex.co.za' }),
        mockHttp.client,
      );
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockHttp.calls[0].url).toBe(
        'https://api.architex.co.za/api/remote-desktop/hosts/my-host-123/heartbeat',
      );
    });

    it('should send heartbeat payload with status, cpuUtilisation, availableRamMb', async () => {
      service = new HeartbeatService(createConfig(), mockHttp.client);
      service.setStatus('idle');
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      const body = mockHttp.calls[0].body as Record<string, unknown>;
      expect(body.status).toBe('online'); // 'idle' maps to 'online' for the broker
      expect(typeof body.cpuUtilisation).toBe('number');
      expect(body.cpuUtilisation).toBeGreaterThanOrEqual(0);
      expect(body.cpuUtilisation).toBeLessThanOrEqual(100);
      expect(typeof body.availableRamMb).toBe('number');
      expect(body.availableRamMb).toBeGreaterThanOrEqual(0);
    });

    it('should map in_session status correctly', async () => {
      service = new HeartbeatService(createConfig(), mockHttp.client);
      service.setStatus('in_session');
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      const body = mockHttp.calls[0].body as Record<string, unknown>;
      expect(body.status).toBe('in_session');
    });

    it('should map unavailable status to offline', async () => {
      service = new HeartbeatService(createConfig(), mockHttp.client);
      service.setStatus('unavailable');
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      const body = mockHttp.calls[0].body as Record<string, unknown>;
      expect(body.status).toBe('offline');
    });

    it('should include Authorization header with bearer token', async () => {
      service = new HeartbeatService(
        createConfig({ authToken: 'secret-token-xyz' }),
        mockHttp.client,
      );
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockHttp.calls[0].headers.Authorization).toBe('Bearer secret-token-xyz');
    });

    it('should send heartbeats at the configured interval', async () => {
      service = new HeartbeatService(createConfig({ intervalMs: 200 }), mockHttp.client);
      service.start();

      // Immediate heartbeat
      await vi.advanceTimersByTimeAsync(0);
      expect(mockHttp.calls.length).toBe(1);

      // After one interval
      await vi.advanceTimersByTimeAsync(200);
      expect(mockHttp.calls.length).toBe(2);

      // After another interval
      await vi.advanceTimersByTimeAsync(200);
      expect(mockHttp.calls.length).toBe(3);
    });

    it('should strip trailing slash from brokerBaseUrl', async () => {
      service = new HeartbeatService(
        createConfig({ brokerBaseUrl: 'https://api.architex.co.za/' }),
        mockHttp.client,
      );
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      // Should not produce double slash between base URL and /api path
      expect(mockHttp.calls[0].url).toBe(
        'https://api.architex.co.za/api/remote-desktop/hosts/test-host-1/heartbeat',
      );
    });
  });

  describe('Consecutive Failure Tracking (Requirement 1.8)', () => {
    it('should track consecutive failures', async () => {
      mockHttp.setResponse({ ok: false, status: 500, json: () => Promise.resolve({}) });
      service = new HeartbeatService(createConfig({ intervalMs: 100 }), mockHttp.client);
      service.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(service.getState().consecutiveFailures).toBe(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(service.getState().consecutiveFailures).toBe(2);
    });

    it('should emit connection_lost after 3 consecutive failures', async () => {
      mockHttp.setResponse({ ok: false, status: 500, json: () => Promise.resolve({}) });
      service = new HeartbeatService(createConfig({ intervalMs: 50 }), mockHttp.client);

      const connectionLostHandler = vi.fn();
      service.on('connection_lost', connectionLostHandler);

      service.start();

      await vi.advanceTimersByTimeAsync(0);   // Failure 1
      await vi.advanceTimersByTimeAsync(50);  // Failure 2
      await vi.advanceTimersByTimeAsync(50);  // Failure 3 → connection_lost

      expect(connectionLostHandler).toHaveBeenCalledTimes(1);
      expect(service.isConnectionLost()).toBe(true);
    });

    it('should only emit connection_lost once even with continued failures', async () => {
      mockHttp.setResponse({ ok: false, status: 500, json: () => Promise.resolve({}) });
      service = new HeartbeatService(createConfig({ intervalMs: 50 }), mockHttp.client);

      const connectionLostHandler = vi.fn();
      service.on('connection_lost', connectionLostHandler);

      service.start();

      await vi.advanceTimersByTimeAsync(0);   // Failure 1
      await vi.advanceTimersByTimeAsync(50);  // Failure 2
      await vi.advanceTimersByTimeAsync(50);  // Failure 3 → connection_lost
      await vi.advanceTimersByTimeAsync(50);  // Failure 4
      await vi.advanceTimersByTimeAsync(50);  // Failure 5

      expect(connectionLostHandler).toHaveBeenCalledTimes(1);
    });

    it('should notify the resource owner on connection_lost', async () => {
      mockHttp.setResponse({ ok: false, status: 500, json: () => Promise.resolve({}) });
      const ownerNotification = vi.fn();

      service = new HeartbeatService(
        createConfig({ intervalMs: 50, onOwnerNotification: ownerNotification }),
        mockHttp.client,
      );
      service.start();

      await vi.advanceTimersByTimeAsync(0);   // Failure 1
      await vi.advanceTimersByTimeAsync(50);  // Failure 2
      await vi.advanceTimersByTimeAsync(50);  // Failure 3 → connection_lost + notification

      expect(ownerNotification).toHaveBeenCalledTimes(1);
      expect(ownerNotification).toHaveBeenCalledWith(
        expect.stringContaining('Lost connectivity'),
      );
    });

    it('should reset consecutive failures on successful heartbeat', async () => {
      mockHttp.setResponse({ ok: false, status: 500, json: () => Promise.resolve({}) });
      service = new HeartbeatService(createConfig({ intervalMs: 50 }), mockHttp.client);
      service.start();

      await vi.advanceTimersByTimeAsync(0);  // Failure 1
      await vi.advanceTimersByTimeAsync(50); // Failure 2

      expect(service.getState().consecutiveFailures).toBe(2);

      // Recover
      mockHttp.setResponse({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createDefaultAck()),
      });

      await vi.advanceTimersByTimeAsync(50);
      expect(service.getState().consecutiveFailures).toBe(0);
    });

    it('should handle network exceptions as failures', async () => {
      const failingClient: HttpClient = {
        async post(): Promise<HttpResponse> {
          throw new Error('Network error: ECONNREFUSED');
        },
      };

      service = new HeartbeatService(createConfig({ intervalMs: 50 }), failingClient);
      service.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(service.getState().consecutiveFailures).toBe(1);
    });
  });

  describe('Connection Restoration', () => {
    it('should emit connection_restored when recovering from connection_lost', async () => {
      mockHttp.setResponse({ ok: false, status: 500, json: () => Promise.resolve({}) });
      service = new HeartbeatService(createConfig({ intervalMs: 50 }), mockHttp.client);

      const connectionRestoredHandler = vi.fn();
      service.on('connection_restored', connectionRestoredHandler);

      service.start();

      // Trigger connection_lost
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);
      expect(service.isConnectionLost()).toBe(true);

      // Recover
      mockHttp.setResponse({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createDefaultAck()),
      });

      await vi.advanceTimersByTimeAsync(50);

      expect(connectionRestoredHandler).toHaveBeenCalledTimes(1);
      expect(service.isConnectionLost()).toBe(false);
    });

    it('should notify owner on connection restoration', async () => {
      mockHttp.setResponse({ ok: false, status: 500, json: () => Promise.resolve({}) });
      const ownerNotification = vi.fn();

      service = new HeartbeatService(
        createConfig({ intervalMs: 50, onOwnerNotification: ownerNotification }),
        mockHttp.client,
      );
      service.start();

      // Trigger connection_lost
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);

      // Recover
      mockHttp.setResponse({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createDefaultAck()),
      });

      await vi.advanceTimersByTimeAsync(50);

      // Should have been called twice: once for lost, once for restored
      expect(ownerNotification).toHaveBeenCalledTimes(2);
      expect(ownerNotification).toHaveBeenLastCalledWith(
        expect.stringContaining('restored'),
      );
    });
  });

  describe('Event Emission', () => {
    it('should emit heartbeat_sent with payload on each send', async () => {
      service = new HeartbeatService(createConfig({ intervalMs: 100 }), mockHttp.client);

      const sentHandler = vi.fn();
      service.on('heartbeat_sent', sentHandler);

      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(sentHandler).toHaveBeenCalledTimes(1);
      expect(sentHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          hostId: 'test-host-1',
          status: 'idle',
          cpuUtilisation: expect.any(Number),
          availableRamMb: expect.any(Number),
        }),
      );
    });

    it('should emit heartbeat_ack with acknowledgement on success', async () => {
      const ack = createDefaultAck({ configVersion: 5, allowlistVersion: 3 });
      mockHttp.setResponse({ ok: true, status: 200, json: () => Promise.resolve(ack) });

      service = new HeartbeatService(createConfig(), mockHttp.client);

      const ackHandler = vi.fn();
      service.on('heartbeat_ack', ackHandler);

      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(ackHandler).toHaveBeenCalledTimes(1);
      expect(ackHandler).toHaveBeenCalledWith(
        expect.objectContaining({ configVersion: 5, allowlistVersion: 3 }),
      );
    });
  });

  describe('App_Allowlist and Session Policy Sync (Requirement 1.4)', () => {
    it('should sync allowlist from acknowledgement when version increases', async () => {
      const allowlist = [
        { appId: 'app-1', displayName: 'AutoCAD', executablePath: 'C:\\AutoCAD\\acad.exe', softwareCategory: 'CAD' },
        { appId: 'app-2', displayName: 'Revit', executablePath: 'C:\\Revit\\revit.exe', softwareCategory: 'BIM' },
      ];

      const ack = createDefaultAck({ allowlistVersion: 2, allowlist });
      mockHttp.setResponse({ ok: true, status: 200, json: () => Promise.resolve(ack) });

      service = new HeartbeatService(createConfig(), mockHttp.client);
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getAllowlist()).toEqual(allowlist);
      expect(service.getState().currentAllowlistVersion).toBe(2);
    });

    it('should sync session policy from acknowledgement when version increases', async () => {
      const sessionPolicy = {
        clipboardPolicy: 'disabled' as const,
        gracePeriodSeconds: 300,
        sessionWorkspacePath: 'C:\\ArchitexSessions',
        recordingEnabled: true,
      };

      const ack = createDefaultAck({ configVersion: 3, sessionPolicy });
      mockHttp.setResponse({ ok: true, status: 200, json: () => Promise.resolve(ack) });

      service = new HeartbeatService(createConfig(), mockHttp.client);
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getSessionPolicy()).toEqual(sessionPolicy);
      expect(service.getState().currentConfigVersion).toBe(3);
    });

    it('should not downgrade allowlist version', async () => {
      // First ack with version 5
      const ack1 = createDefaultAck({
        allowlistVersion: 5,
        allowlist: [{ appId: 'a1', displayName: 'A', executablePath: 'a.exe', softwareCategory: 'CAD' }],
      });
      mockHttp.setResponse({ ok: true, status: 200, json: () => Promise.resolve(ack1) });

      service = new HeartbeatService(createConfig({ intervalMs: 50 }), mockHttp.client);
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getState().currentAllowlistVersion).toBe(5);

      // Second ack with lower version
      const ack2 = createDefaultAck({
        allowlistVersion: 3,
        allowlist: [{ appId: 'a2', displayName: 'B', executablePath: 'b.exe', softwareCategory: 'BIM' }],
      });
      mockHttp.setResponse({ ok: true, status: 200, json: () => Promise.resolve(ack2) });

      await vi.advanceTimersByTimeAsync(50);

      // Should still be version 5 and original allowlist
      expect(service.getState().currentAllowlistVersion).toBe(5);
      expect(service.getAllowlist()[0].appId).toBe('a1');
    });
  });

  describe('Status Management', () => {
    it('should default to idle status', () => {
      service = new HeartbeatService(createConfig(), mockHttp.client);
      expect(service.getCurrentStatus()).toBe('idle');
    });

    it('should allow setting status externally', () => {
      service = new HeartbeatService(createConfig(), mockHttp.client);
      service.setStatus('in_session');
      expect(service.getCurrentStatus()).toBe('in_session');
    });

    it('should record last successful heartbeat timestamp', async () => {
      vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));

      service = new HeartbeatService(createConfig(), mockHttp.client);
      expect(service.getLastHeartbeat()).toBeNull();

      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getLastHeartbeat()).toBe(new Date('2026-01-15T10:00:00Z').getTime());
    });
  });
});

describe('shouldMarkHostOffline (Broker-side Offline Detection, Requirement 1.3)', () => {
  it('should return false when heartbeat was just received', () => {
    const now = Date.now();
    expect(shouldMarkHostOffline(now, now)).toBe(false);
  });

  it('should return false when heartbeat was received less than 90 seconds ago', () => {
    const now = Date.now();
    expect(shouldMarkHostOffline(now - 89_999, now)).toBe(false);
  });

  it('should return true when heartbeat was received exactly 90 seconds ago', () => {
    const now = Date.now();
    expect(shouldMarkHostOffline(now - 90_000, now)).toBe(true);
  });

  it('should return true when heartbeat was received more than 90 seconds ago', () => {
    const now = Date.now();
    expect(shouldMarkHostOffline(now - 120_000, now)).toBe(true);
  });

  it('should use current time when no currentTimeMs provided', () => {
    const longAgo = Date.now() - 200_000;
    expect(shouldMarkHostOffline(longAgo)).toBe(true);
  });
});

describe('getOfflineThresholdMs', () => {
  it('should return 90000 (90 seconds)', () => {
    expect(getOfflineThresholdMs()).toBe(90_000);
  });
});
