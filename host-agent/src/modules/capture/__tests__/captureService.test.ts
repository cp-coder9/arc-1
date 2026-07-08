/**
 * Host Agent — Capture Service Tests
 *
 * Tests for the CaptureService class covering:
 * - App launching from allowlist (max 10 apps, 30s timeout)
 * - Window enumeration and matching to launched processes
 * - System window filtering (taskbar, desktop, tray, start menu)
 * - Capture session lifecycle (start/stop)
 * - App launch failure handling (write "app_unavailable", continue)
 * - Placeholder frame when no active windows exist
 * - State transitions
 *
 * Requirements: 5.1, 5.2, 5.3, 5.7, 5.8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CaptureService,
  type WindowCaptureAddon,
  type ProcessLauncher,
  type AllowlistApp,
  type WindowInfo,
  type CaptureSession,
  type CaptureOptions,
  type FrameBuffer,
  type LaunchedProcess,
} from '../captureService';

// ─── Mock Factories ─────────────────────────────────────────────────────────────

let sessionIdCounter = 0;

function createMockCaptureAddon(
  windowOverrides?: WindowInfo[],
): WindowCaptureAddon & { setWindows: (w: WindowInfo[]) => void } {
  let windows: WindowInfo[] = windowOverrides ?? [];

  return {
    setWindows(w: WindowInfo[]) {
      windows = w;
    },
    enumerateWindows(): WindowInfo[] {
      return windows;
    },
    startCapture(hwnd: number, _options: CaptureOptions): CaptureSession {
      sessionIdCounter++;
      return {
        id: `session-${sessionIdCounter}`,
        hwnd,
        processId: 0,
        appId: '',
        active: true,
      };
    },
    getFrame(_session: CaptureSession): FrameBuffer | null {
      return {
        data: Buffer.alloc(1920 * 1080),
        width: 1920,
        height: 1080,
        format: 'NV12',
        timestamp: Date.now(),
      };
    },
    stopCapture(_session: CaptureSession): void {
      // No-op
    },
  };
}

function createMockProcessLauncher(
  overrides?: Partial<ProcessLauncher>,
): ProcessLauncher & { launchCalls: string[] } {
  let pidCounter = 1000;
  const launchCalls: string[] = [];

  return {
    launchCalls,
    async launch(executablePath: string): Promise<LaunchedProcess | null> {
      launchCalls.push(executablePath);
      if (overrides?.launch) {
        return overrides.launch(executablePath);
      }
      pidCounter++;
      return { pid: pidCounter, executablePath };
    },
  };
}

function createAllowlist(count: number): AllowlistApp[] {
  return Array.from({ length: count }, (_, i) => ({
    appId: `app-${i + 1}`,
    displayName: `App ${i + 1}`,
    executablePath: `C:\\Program Files\\App${i + 1}\\app${i + 1}.exe`,
    softwareCategory: 'CAD',
  }));
}

function createWindowForProcess(pid: number, appIndex: number): WindowInfo {
  return {
    hwnd: 100 + appIndex,
    title: `App ${appIndex} Window`,
    processId: pid,
    processName: `app${appIndex}.exe`,
    className: 'AppWindowClass',
    isVisible: true,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('CaptureService', () => {
  let captureAddon: ReturnType<typeof createMockCaptureAddon>;
  let processLauncher: ReturnType<typeof createMockProcessLauncher>;
  let service: CaptureService;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionIdCounter = 0;
    captureAddon = createMockCaptureAddon();
    processLauncher = createMockProcessLauncher();
  });

  afterEach(() => {
    service?.stopSession();
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should start in idle state', () => {
      service = new CaptureService(captureAddon, processLauncher);
      expect(service.getState()).toBe('idle');
    });

    it('should have no active sessions initially', () => {
      service = new CaptureService(captureAddon, processLauncher);
      expect(service.getActiveSessions()).toEqual([]);
    });

    it('should not have placeholder active initially', () => {
      service = new CaptureService(captureAddon, processLauncher);
      expect(service.isPlaceholderActive()).toBe(false);
    });
  });

  describe('App Launching (Requirement 5.1)', () => {
    it('should launch all allowlisted apps', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      const allowlist = createAllowlist(3);

      const result = await service.startSession(allowlist);

      expect(result.launched.length).toBe(3);
      expect(result.failed.length).toBe(0);
      expect(processLauncher.launchCalls).toEqual([
        allowlist[0].executablePath,
        allowlist[1].executablePath,
        allowlist[2].executablePath,
      ]);
    });

    it('should enforce max 10 apps limit', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      const allowlist = createAllowlist(15);

      const result = await service.startSession(allowlist);

      // Should only launch first 10
      expect(result.launched.length).toBe(10);
      expect(processLauncher.launchCalls.length).toBe(10);
    });

    it('should emit app_launched event for each successful launch', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      const handler = vi.fn();
      service.on('app_launched', handler);

      await service.startSession(createAllowlist(2));

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ appId: 'app-1', displayName: 'App 1' }),
      );
    });

    it('should transition to capturing state after successful launches', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      await service.startSession(createAllowlist(2));
      expect(service.getState()).toBe('capturing');
    });

    it('should record launched processes', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      await service.startSession(createAllowlist(2));

      const processes = service.getLaunchedProcesses();
      expect(processes.size).toBe(2);
      expect(processes.has('app-1')).toBe(true);
      expect(processes.has('app-2')).toBe(true);
    });
  });

  describe('App Launch Failure (Requirement 5.7)', () => {
    it('should handle individual app launch failure and continue', async () => {
      const failingLauncher = createMockProcessLauncher({
        async launch(path: string) {
          if (path.includes('App2')) return null; // App 2 fails
          return { pid: 2000 + Math.random(), executablePath: path };
        },
      });

      service = new CaptureService(captureAddon, failingLauncher);
      const result = await service.startSession(createAllowlist(3));

      expect(result.launched.length).toBe(2);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].appId).toBe('app-2');
      expect(result.failed[0].reason).toBe('launch_failed');
    });

    it('should emit app_unavailable event on launch failure', async () => {
      const failingLauncher = createMockProcessLauncher({
        async launch(path: string) {
          if (path.includes('App1')) return null;
          return { pid: 3000, executablePath: path };
        },
      });

      service = new CaptureService(captureAddon, failingLauncher);
      const handler = vi.fn();
      service.on('app_unavailable', handler);

      await service.startSession(createAllowlist(2));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'app-1',
          reason: 'launch_failed',
        }),
      );
    });

    it('should write audit event on app launch failure', async () => {
      const failingLauncher = createMockProcessLauncher({
        async launch(path: string) {
          if (path.includes('App1')) return null;
          return { pid: 3000, executablePath: path };
        },
      });

      const auditHandler = vi.fn();
      service = new CaptureService(captureAddon, failingLauncher, {
        onAuditEvent: auditHandler,
      });

      await service.startSession(createAllowlist(2));

      expect(auditHandler).toHaveBeenCalledWith(
        'app_unavailable',
        expect.objectContaining({
          appId: 'app-1',
          reason: 'launch_failed',
        }),
      );
    });

    it('should handle exception during launch', async () => {
      const throwingLauncher = createMockProcessLauncher({
        async launch(path: string) {
          if (path.includes('App2')) throw new Error('Access denied');
          return { pid: 4000, executablePath: path };
        },
      });

      service = new CaptureService(captureAddon, throwingLauncher);
      const result = await service.startSession(createAllowlist(3));

      expect(result.launched.length).toBe(2);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].reason).toBe('Access denied');
    });

    it('should enter placeholder state if all apps fail to launch', async () => {
      const allFailLauncher = createMockProcessLauncher({
        async launch() {
          return null;
        },
      });

      service = new CaptureService(captureAddon, allFailLauncher);
      const result = await service.startSession(createAllowlist(3));

      expect(result.launched.length).toBe(0);
      expect(result.failed.length).toBe(3);
      expect(service.getState()).toBe('no_active_windows');
      expect(service.isPlaceholderActive()).toBe(true);
    });
  });

  describe('Launch Timeout (30 seconds, Requirement 5.1)', () => {
    it('should fail remaining apps when timeout is exceeded', async () => {
      // Slow launcher that takes 20 seconds per app
      const slowLauncher: ProcessLauncher = {
        async launch(path: string) {
          await new Promise((r) => setTimeout(r, 20_000));
          return { pid: 5000, executablePath: path };
        },
      };

      service = new CaptureService(captureAddon, slowLauncher, {
        launchTimeoutMs: 30_000,
      });

      const resultPromise = service.startSession(createAllowlist(3));

      // First app takes 20s - succeeds (within 30s deadline)
      await vi.advanceTimersByTimeAsync(20_000);
      // Second app would take until 40s - exceeds 30s deadline
      await vi.advanceTimersByTimeAsync(10_000);

      const result = await resultPromise;

      expect(result.launched.length).toBe(1);
      // Remaining apps should be failed due to timeout
      expect(result.failed.length).toBe(2);
      expect(result.failed[0].reason).toBe('launch_timeout');
    });
  });

  describe('Window Capture (Requirement 5.2)', () => {
    it('should start capture when windows from launched processes appear', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      // Simulate window appearing after launch
      captureAddon.setWindows([createWindowForProcess(pid, 1)]);

      // Trigger poll
      await vi.advanceTimersByTimeAsync(100);

      const sessions = service.getActiveSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].hwnd).toBe(101);
    });

    it('should emit capture_started when capture begins for a window', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const handler = vi.fn();
      service.on('capture_started', handler);

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([createWindowForProcess(pid, 1)]);
      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ appId: 'app-1', hwnd: 101 }),
      );
    });

    it('should not capture windows from non-allowlisted processes', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      await service.startSession(createAllowlist(1));

      // Window from a different PID (not launched by us)
      captureAddon.setWindows([{
        hwnd: 999,
        title: 'Unknown App',
        processId: 9999,
        processName: 'unknown.exe',
        className: 'UnknownClass',
        isVisible: true,
      }]);

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getActiveSessions().length).toBe(0);
    });

    it('should get frames from active capture sessions', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([createWindowForProcess(pid, 1)]);
      await vi.advanceTimersByTimeAsync(100);

      const frames = service.getFrames();
      expect(frames.size).toBe(1);
      expect(frames.get('app-1')).not.toBeNull();
      expect(frames.get('app-1')?.width).toBe(1920);
    });
  });

  describe('System Window Filtering (Requirement 5.3)', () => {
    it('should filter out taskbar windows (Shell_TrayWnd)', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([
        createWindowForProcess(pid, 1),
        {
          hwnd: 200,
          title: '',
          processId: pid,
          processName: 'explorer.exe',
          className: 'Shell_TrayWnd',
          isVisible: true,
        },
      ]);

      await vi.advanceTimersByTimeAsync(100);

      // Only the app window should be captured, not taskbar
      const sessions = service.getActiveSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].hwnd).toBe(101);
    });

    it('should filter out desktop icons (Progman)', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([
        createWindowForProcess(pid, 1),
        {
          hwnd: 201,
          title: 'Program Manager',
          processId: pid,
          processName: 'explorer.exe',
          className: 'Progman',
          isVisible: true,
        },
      ]);

      await vi.advanceTimersByTimeAsync(100);

      const sessions = service.getActiveSessions();
      expect(sessions.length).toBe(1);
    });

    it('should filter out Start menu (Windows.UI.Core.CoreWindow)', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([
        createWindowForProcess(pid, 1),
        {
          hwnd: 202,
          title: 'Start',
          processId: pid,
          processName: 'StartMenuExperienceHost.exe',
          className: 'Windows.UI.Core.CoreWindow',
          isVisible: true,
        },
      ]);

      await vi.advanceTimersByTimeAsync(100);

      const sessions = service.getActiveSessions();
      expect(sessions.length).toBe(1);
    });

    it('should filter out system tray overflow', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([
        createWindowForProcess(pid, 1),
        {
          hwnd: 203,
          title: '',
          processId: pid,
          processName: 'explorer.exe',
          className: 'NotifyIconOverflowWindow',
          isVisible: true,
        },
      ]);

      await vi.advanceTimersByTimeAsync(100);

      const sessions = service.getActiveSessions();
      expect(sessions.length).toBe(1);
    });

    it('should filter out hidden/invisible windows', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([
        { ...createWindowForProcess(pid, 1), isVisible: false },
      ]);

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getActiveSessions().length).toBe(0);
    });

    it('should filter windows from system processes (explorer.exe)', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([
        createWindowForProcess(pid, 1),
        {
          hwnd: 300,
          title: 'File Explorer',
          processId: pid,
          processName: 'explorer.exe',
          className: 'CabinetWClass',
          isVisible: true,
        },
      ]);

      await vi.advanceTimersByTimeAsync(100);

      // Only app window, not explorer
      const sessions = service.getActiveSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].hwnd).toBe(101);
    });
  });

  describe('Placeholder Frame (Requirement 5.8)', () => {
    it('should enter placeholder state when all windows close', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      // Window appears
      captureAddon.setWindows([createWindowForProcess(pid, 1)]);
      await vi.advanceTimersByTimeAsync(100);
      expect(service.getState()).toBe('capturing');

      // Window disappears
      captureAddon.setWindows([]);
      await vi.advanceTimersByTimeAsync(100);

      expect(service.getState()).toBe('no_active_windows');
      expect(service.isPlaceholderActive()).toBe(true);
    });

    it('should emit no_active_windows event', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const handler = vi.fn();
      service.on('no_active_windows', handler);

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([createWindowForProcess(pid, 1)]);
      await vi.advanceTimersByTimeAsync(100);

      captureAddon.setWindows([]);
      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should write audit event for no_active_windows', async () => {
      const auditHandler = vi.fn();
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
        onAuditEvent: auditHandler,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([createWindowForProcess(pid, 1)]);
      await vi.advanceTimersByTimeAsync(100);

      captureAddon.setWindows([]);
      await vi.advanceTimersByTimeAsync(100);

      expect(auditHandler).toHaveBeenCalledWith(
        'no_active_windows',
        expect.objectContaining({ reason: 'all_windows_closed_or_unavailable' }),
      );
    });

    it('should exit placeholder state when windows reappear', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      // Window appears then disappears
      captureAddon.setWindows([createWindowForProcess(pid, 1)]);
      await vi.advanceTimersByTimeAsync(100);
      captureAddon.setWindows([]);
      await vi.advanceTimersByTimeAsync(100);
      expect(service.isPlaceholderActive()).toBe(true);

      // Window reappears
      captureAddon.setWindows([createWindowForProcess(pid, 1)]);
      await vi.advanceTimersByTimeAsync(100);

      expect(service.isPlaceholderActive()).toBe(false);
      expect(service.getState()).toBe('capturing');
    });
  });

  describe('Session Lifecycle', () => {
    it('should stop all capture sessions on stopSession()', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const result = await service.startSession(createAllowlist(2));
      const pid1 = result.launched[0].pid!;
      const pid2 = result.launched[1].pid!;

      captureAddon.setWindows([
        createWindowForProcess(pid1, 1),
        createWindowForProcess(pid2, 2),
      ]);
      await vi.advanceTimersByTimeAsync(100);

      expect(service.getActiveSessions().length).toBe(2);

      service.stopSession();

      expect(service.getState()).toBe('stopped');
      expect(service.getActiveSessions().length).toBe(0);
      expect(service.getLaunchedProcesses().size).toBe(0);
    });

    it('should emit capture_stopped on stop', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      const handler = vi.fn();
      service.on('capture_stopped', handler);

      await service.startSession(createAllowlist(1));
      service.stopSession();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should throw if startSession called while not idle/stopped', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      await service.startSession(createAllowlist(1));

      await expect(
        service.startSession(createAllowlist(1)),
      ).rejects.toThrow('Cannot start session in state: capturing');
    });

    it('should allow restarting after stop', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      await service.startSession(createAllowlist(1));
      service.stopSession();

      // Should not throw
      const result = await service.startSession(createAllowlist(1));
      expect(result.launched.length).toBe(1);
      expect(service.getState()).toBe('capturing');
    });
  });

  describe('State Transitions', () => {
    it('should emit state_changed events', async () => {
      service = new CaptureService(captureAddon, processLauncher);
      const handler = vi.fn();
      service.on('state_changed', handler);

      await service.startSession(createAllowlist(1));

      // idle -> launching -> capturing
      expect(handler).toHaveBeenCalledWith({ from: 'idle', to: 'launching' });
      expect(handler).toHaveBeenCalledWith({ from: 'launching', to: 'capturing' });
    });

    it('should transition through launching -> no_active_windows when all fail', async () => {
      const allFailLauncher = createMockProcessLauncher({
        async launch() { return null; },
      });

      service = new CaptureService(captureAddon, allFailLauncher);
      const handler = vi.fn();
      service.on('state_changed', handler);

      await service.startSession(createAllowlist(2));

      expect(handler).toHaveBeenCalledWith({ from: 'idle', to: 'launching' });
      expect(handler).toHaveBeenCalledWith({ from: 'launching', to: 'no_active_windows' });
    });
  });

  describe('Window Close Detection', () => {
    it('should detect when a captured window closes and stop capture', async () => {
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
      });

      const closeHandler = vi.fn();
      service.on('app_closed', closeHandler);

      const result = await service.startSession(createAllowlist(2));
      const pid1 = result.launched[0].pid!;
      const pid2 = result.launched[1].pid!;

      // Both windows visible
      captureAddon.setWindows([
        createWindowForProcess(pid1, 1),
        createWindowForProcess(pid2, 2),
      ]);
      await vi.advanceTimersByTimeAsync(100);
      expect(service.getActiveSessions().length).toBe(2);

      // First window closes
      captureAddon.setWindows([createWindowForProcess(pid2, 2)]);
      await vi.advanceTimersByTimeAsync(100);

      expect(service.getActiveSessions().length).toBe(1);
      expect(closeHandler).toHaveBeenCalledWith({ appId: 'app-1' });
    });

    it('should write audit event when app window closes', async () => {
      const auditHandler = vi.fn();
      service = new CaptureService(captureAddon, processLauncher, {
        windowPollIntervalMs: 100,
        onAuditEvent: auditHandler,
      });

      const result = await service.startSession(createAllowlist(1));
      const pid = result.launched[0].pid!;

      captureAddon.setWindows([createWindowForProcess(pid, 1)]);
      await vi.advanceTimersByTimeAsync(100);

      captureAddon.setWindows([]);
      await vi.advanceTimersByTimeAsync(100);

      expect(auditHandler).toHaveBeenCalledWith('app_closed', { appId: 'app-1' });
    });
  });
});
