/**
 * Host Agent — Window Capture Service
 *
 * Orchestrates window-level capture for approved applications during remote sessions.
 * Uses a native addon (WindowCaptureAddon) for OS-level window capture via
 * the Windows Graphics Capture API (Win10 1903+).
 *
 * Responsibilities:
 * - Launch only App_Allowlist applications (max 10) on session start
 * - Complete all application launches within 30 seconds
 * - Manage window enumeration and match launched processes to their windows
 * - Start/stop capture sessions via the native addon interface
 * - Hide taskbar, desktop icons, system tray, Start menu from captured stream
 * - Handle app launch failure (write "app_unavailable" event, continue with remaining)
 * - Display static placeholder frame when no active windows exist
 * - Report capture state and handle application lifecycle events
 *
 * Requirements: 5.1, 5.2, 5.3, 5.7, 5.8
 */

import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface WindowInfo {
  hwnd: number;
  title: string;
  processId: number;
  processName: string;
  className: string;
  isVisible: boolean;
}

export interface CaptureOptions {
  /** Target frame rate (default 30) */
  frameRate?: number;
  /** Whether to include the cursor in captured frames */
  includeCursor?: boolean;
}

export interface CaptureSession {
  id: string;
  hwnd: number;
  processId: number;
  appId: string;
  active: boolean;
}

export interface FrameBuffer {
  data: Buffer;
  width: number;
  height: number;
  format: 'NV12' | 'I420';
  timestamp: number;
}

/**
 * Native addon interface for Windows Graphics Capture API.
 * In production, this is a C++ node-gyp addon.
 * For testing, a mock implementation is injected.
 */
export interface WindowCaptureAddon {
  /** Get list of visible windows with process info */
  enumerateWindows(): WindowInfo[];
  /** Start capturing a specific window by HWND */
  startCapture(hwnd: number, options: CaptureOptions): CaptureSession;
  /** Get next frame as NV12/I420 buffer */
  getFrame(session: CaptureSession): FrameBuffer | null;
  /** Release capture session */
  stopCapture(session: CaptureSession): void;
}

/**
 * Abstraction over child_process.spawn for launching applications.
 */
export interface ProcessLauncher {
  /** Spawn a process and return its PID (or null on failure) */
  launch(executablePath: string): Promise<LaunchedProcess | null>;
}

export interface LaunchedProcess {
  pid: number;
  executablePath: string;
}

export interface AllowlistApp {
  appId: string;
  displayName: string;
  executablePath: string;
  softwareCategory: string;
}

export interface CaptureServiceConfig {
  /** Maximum number of apps to launch (max 10) */
  maxApps?: number;
  /** Timeout for all app launches in ms (default 30000) */
  launchTimeoutMs?: number;
  /** Interval for window enumeration polling in ms (default 1000) */
  windowPollIntervalMs?: number;
  /** Default capture options */
  captureOptions?: CaptureOptions;
  /** Callback to emit audit events */
  onAuditEvent?: (eventType: string, metadata: Record<string, unknown>) => void;
}

export type CaptureState =
  | 'idle'
  | 'launching'
  | 'capturing'
  | 'no_active_windows'
  | 'stopped';

export type CaptureServiceEvent =
  | 'state_changed'
  | 'app_launched'
  | 'app_unavailable'
  | 'app_closed'
  | 'no_active_windows'
  | 'capture_started'
  | 'capture_stopped'
  | 'placeholder_frame';

/** System window class names that must be hidden from capture */
const SYSTEM_WINDOW_CLASSES = [
  'Shell_TrayWnd',         // Taskbar
  'Shell_SecondaryTrayWnd', // Secondary taskbar
  'Progman',               // Desktop icons (Program Manager)
  'WorkerW',               // Desktop icons (alternative)
  'Windows.UI.Core.CoreWindow', // Start menu
  'NotifyIconOverflowWindow',   // System tray overflow
  'TrayNotifyWnd',         // System tray notification area
];

/** System process names to exclude from enumeration */
const SYSTEM_PROCESS_NAMES = [
  'explorer.exe',
  'SearchUI.exe',
  'SearchApp.exe',
  'ShellExperienceHost.exe',
  'StartMenuExperienceHost.exe',
  'SystemSettings.exe',
];

// ─── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_APPS = 10;
const DEFAULT_LAUNCH_TIMEOUT_MS = 30_000;
const DEFAULT_WINDOW_POLL_INTERVAL_MS = 1_000;
const DEFAULT_CAPTURE_OPTIONS: CaptureOptions = {
  frameRate: 30,
  includeCursor: true,
};

// ─── CaptureService Class ───────────────────────────────────────────────────────

export class CaptureService extends EventEmitter {
  private readonly captureAddon: WindowCaptureAddon;
  private readonly processLauncher: ProcessLauncher;
  private readonly maxApps: number;
  private readonly launchTimeoutMs: number;
  private readonly windowPollIntervalMs: number;
  private readonly captureOptions: CaptureOptions;
  private readonly onAuditEvent?: (eventType: string, metadata: Record<string, unknown>) => void;

  private state: CaptureState = 'idle';
  private allowlist: AllowlistApp[] = [];
  private launchedProcesses: Map<string, LaunchedProcess> = new Map(); // appId -> process
  private activeSessions: Map<string, CaptureSession> = new Map(); // appId -> session
  private windowPollTimer: ReturnType<typeof setInterval> | null = null;
  private placeholderActive = false;

  constructor(
    captureAddon: WindowCaptureAddon,
    processLauncher: ProcessLauncher,
    config?: CaptureServiceConfig,
  ) {
    super();
    this.captureAddon = captureAddon;
    this.processLauncher = processLauncher;
    this.maxApps = Math.min(config?.maxApps ?? DEFAULT_MAX_APPS, DEFAULT_MAX_APPS);
    this.launchTimeoutMs = config?.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
    this.windowPollIntervalMs = config?.windowPollIntervalMs ?? DEFAULT_WINDOW_POLL_INTERVAL_MS;
    this.captureOptions = config?.captureOptions ?? DEFAULT_CAPTURE_OPTIONS;
    this.onAuditEvent = config?.onAuditEvent;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start a capture session: launch allowlisted apps and begin capturing windows.
   * Must complete all launches within 30 seconds.
   */
  async startSession(allowlist: AllowlistApp[]): Promise<CaptureSessionResult> {
    if (this.state !== 'idle' && this.state !== 'stopped') {
      throw new Error(`Cannot start session in state: ${this.state}`);
    }

    this.allowlist = allowlist.slice(0, this.maxApps);
    this.setState('launching');

    const result = await this.launchApplications();

    // After launching, start window polling to detect and capture windows
    if (result.launched.length > 0) {
      this.startWindowPolling();
      this.setState('capturing');
    } else {
      // No apps launched successfully — enter placeholder state
      this.enterPlaceholderState();
    }

    return result;
  }

  /**
   * Stop all capture sessions and cleanup.
   */
  stopSession(): void {
    this.stopWindowPolling();

    // Stop all active capture sessions
    for (const [appId, session] of this.activeSessions) {
      try {
        this.captureAddon.stopCapture(session);
      } catch {
        // Best-effort cleanup
      }
      this.activeSessions.delete(appId);
    }

    this.launchedProcesses.clear();
    this.allowlist = [];
    this.placeholderActive = false;
    this.setState('stopped');

    this.emit('capture_stopped');
  }

  /**
   * Get the current capture state.
   */
  getState(): CaptureState {
    return this.state;
  }

  /**
   * Get the list of currently active capture sessions.
   */
  getActiveSessions(): CaptureSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get frames from all active capture sessions.
   * Returns frames keyed by appId.
   */
  getFrames(): Map<string, FrameBuffer | null> {
    const frames = new Map<string, FrameBuffer | null>();

    for (const [appId, session] of this.activeSessions) {
      try {
        const frame = this.captureAddon.getFrame(session);
        frames.set(appId, frame);
      } catch {
        frames.set(appId, null);
      }
    }

    return frames;
  }

  /**
   * Check if placeholder frame is currently being displayed.
   */
  isPlaceholderActive(): boolean {
    return this.placeholderActive;
  }

  /**
   * Get launched processes map (for diagnostics/testing).
   */
  getLaunchedProcesses(): Map<string, LaunchedProcess> {
    return new Map(this.launchedProcesses);
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  /**
   * Launch all allowlisted applications within the timeout window.
   */
  private async launchApplications(): Promise<CaptureSessionResult> {
    const launched: AppLaunchResult[] = [];
    const failed: AppLaunchResult[] = [];

    const launchDeadline = Date.now() + this.launchTimeoutMs;

    for (const app of this.allowlist) {
      // Check if we've exceeded the timeout
      if (Date.now() >= launchDeadline) {
        // All remaining apps are marked as failed due to timeout
        const remainingApps = this.allowlist.slice(launched.length + failed.length);
        for (const remaining of remainingApps) {
          const failResult: AppLaunchResult = {
            appId: remaining.appId,
            displayName: remaining.displayName,
            success: false,
            reason: 'launch_timeout',
          };
          failed.push(failResult);
          this.emitAppUnavailable(remaining, 'launch_timeout');
        }
        break;
      }

      const remainingMs = launchDeadline - Date.now();

      try {
        const process = await this.launchWithTimeout(app, remainingMs);

        // Check if we timed out (process is null AND we're past deadline)
        if (process) {
          this.launchedProcesses.set(app.appId, process);
          launched.push({
            appId: app.appId,
            displayName: app.displayName,
            success: true,
            pid: process.pid,
          });
          this.emit('app_launched', { appId: app.appId, displayName: app.displayName, pid: process.pid });
          this.onAuditEvent?.('app_launched', {
            appId: app.appId,
            displayName: app.displayName,
            pid: process.pid,
          });
        } else {
          // Determine if this was a timeout or a genuine launch failure
          const isTimeout = Date.now() >= launchDeadline;
          const reason = isTimeout ? 'launch_timeout' : 'launch_failed';
          failed.push({
            appId: app.appId,
            displayName: app.displayName,
            success: false,
            reason,
          });
          this.emitAppUnavailable(app, reason);
        }
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'unknown_error';
        failed.push({
          appId: app.appId,
          displayName: app.displayName,
          success: false,
          reason,
        });
        this.emitAppUnavailable(app, reason);
      }
    }

    return { launched, failed };
  }

  /**
   * Launch an app with a per-app timeout (capped by the overall deadline).
   */
  private async launchWithTimeout(
    app: AllowlistApp,
    remainingMs: number,
  ): Promise<LaunchedProcess | null> {
    const timeout = Math.max(0, Math.min(remainingMs, this.launchTimeoutMs));

    return Promise.race([
      this.processLauncher.launch(app.executablePath),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
    ]);
  }

  /**
   * Start polling for windows from launched processes.
   */
  private startWindowPolling(): void {
    this.stopWindowPolling();

    // Do an immediate poll
    this.pollWindows();

    this.windowPollTimer = setInterval(() => {
      this.pollWindows();
    }, this.windowPollIntervalMs);
  }

  /**
   * Stop window polling.
   */
  private stopWindowPolling(): void {
    if (this.windowPollTimer) {
      clearInterval(this.windowPollTimer);
      this.windowPollTimer = null;
    }
  }

  /**
   * Poll for windows and start/stop capture as needed.
   * Filters out system windows (taskbar, desktop, start menu, tray).
   */
  private pollWindows(): void {
    const allWindows = this.captureAddon.enumerateWindows();

    // Filter to only approved application windows (exclude system UI)
    const approvedWindows = this.filterApprovedWindows(allWindows);

    // Start capture for new windows not yet being captured
    for (const window of approvedWindows) {
      const appId = this.findAppIdForWindow(window);
      if (appId && !this.activeSessions.has(appId)) {
        this.startCaptureForWindow(appId, window);
      }
    }

    // Stop capture for windows that no longer exist
    for (const [appId, session] of this.activeSessions) {
      const stillExists = approvedWindows.some(
        (w) => w.hwnd === session.hwnd,
      );
      if (!stillExists) {
        this.stopCaptureForApp(appId);
      }
    }

    // Check if no active windows remain
    if (this.activeSessions.size === 0 && this.state === 'capturing') {
      this.enterPlaceholderState();
    } else if (this.activeSessions.size > 0 && this.placeholderActive) {
      this.exitPlaceholderState();
    }
  }

  /**
   * Filter windows to only those belonging to launched allowlisted processes.
   * Excludes system windows (taskbar, desktop, system tray, Start menu).
   */
  private filterApprovedWindows(windows: WindowInfo[]): WindowInfo[] {
    const launchedPids = new Set(
      Array.from(this.launchedProcesses.values()).map((p) => p.pid),
    );

    return windows.filter((window) => {
      // Exclude hidden windows
      if (!window.isVisible) return false;

      // Exclude system window classes (taskbar, desktop, tray, start menu)
      if (SYSTEM_WINDOW_CLASSES.includes(window.className)) return false;

      // Exclude system processes
      if (SYSTEM_PROCESS_NAMES.includes(window.processName.toLowerCase())) return false;

      // Only include windows from launched processes
      return launchedPids.has(window.processId);
    });
  }

  /**
   * Find the appId for a given window based on its process ID.
   */
  private findAppIdForWindow(window: WindowInfo): string | null {
    for (const [appId, process] of this.launchedProcesses) {
      if (process.pid === window.processId) {
        return appId;
      }
    }
    return null;
  }

  /**
   * Start capture for a specific window.
   */
  private startCaptureForWindow(appId: string, window: WindowInfo): void {
    try {
      const session = this.captureAddon.startCapture(window.hwnd, this.captureOptions);
      const captureSession: CaptureSession = {
        ...session,
        appId,
        processId: window.processId,
        active: true,
      };
      this.activeSessions.set(appId, captureSession);
      this.emit('capture_started', { appId, hwnd: window.hwnd });
    } catch {
      // If capture fails for a window, emit app_unavailable but don't crash
      const app = this.allowlist.find((a) => a.appId === appId);
      if (app) {
        this.emitAppUnavailable(app, 'capture_start_failed');
      }
    }
  }

  /**
   * Stop capture for an app and clean up.
   */
  private stopCaptureForApp(appId: string): void {
    const session = this.activeSessions.get(appId);
    if (session) {
      try {
        this.captureAddon.stopCapture(session);
      } catch {
        // Best-effort cleanup
      }
      this.activeSessions.delete(appId);
      this.emit('app_closed', { appId });
      this.onAuditEvent?.('app_closed', { appId });
    }
  }

  /**
   * Enter placeholder frame state when no active windows exist.
   */
  private enterPlaceholderState(): void {
    this.placeholderActive = true;
    this.setState('no_active_windows');
    this.emit('no_active_windows');
    this.emit('placeholder_frame');
    this.onAuditEvent?.('no_active_windows', {
      reason: 'all_windows_closed_or_unavailable',
    });
  }

  /**
   * Exit placeholder state when windows become available again.
   */
  private exitPlaceholderState(): void {
    this.placeholderActive = false;
    this.setState('capturing');
  }

  /**
   * Emit app_unavailable event and write audit event.
   */
  private emitAppUnavailable(app: AllowlistApp, reason: string): void {
    this.emit('app_unavailable', {
      appId: app.appId,
      displayName: app.displayName,
      reason,
    });
    this.onAuditEvent?.('app_unavailable', {
      appId: app.appId,
      displayName: app.displayName,
      executablePath: app.executablePath,
      reason,
    });
  }

  /**
   * Update internal state and emit state_changed event.
   */
  private setState(newState: CaptureState): void {
    const previousState = this.state;
    this.state = newState;
    if (previousState !== newState) {
      this.emit('state_changed', { from: previousState, to: newState });
    }
  }
}

// ─── Result Types ───────────────────────────────────────────────────────────────

export interface AppLaunchResult {
  appId: string;
  displayName: string;
  success: boolean;
  pid?: number;
  reason?: string;
}

export interface CaptureSessionResult {
  launched: AppLaunchResult[];
  failed: AppLaunchResult[];
}
