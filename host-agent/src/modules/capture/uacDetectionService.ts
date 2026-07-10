/**
 * Host Agent — UAC Detection Service
 *
 * Detects UAC prompts, system dialogs, and admin elevation requests during
 * active remote desktop sessions. When detected:
 * - Pauses input forwarding
 * - Hides the dialog from the stream
 * - Notifies the Browser Viewer with "system_dialog_detected" reason
 * - Terminates the session if pause exceeds 60 seconds
 *
 * Detection approach (Windows):
 * - Monitor for the secure desktop switch (UAC consent prompt)
 * - Monitor for known system dialog window classes
 * - Track duration of detected dialogs
 *
 * Requirements: 5.6
 */

import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type UACDialogType =
  | 'uac_consent'
  | 'uac_credential'
  | 'windows_security'
  | 'system_dialog'
  | 'admin_elevation';

export interface DialogDetection {
  dialogType: UACDialogType;
  detectedAt: number;       // Unix ms
  windowClass?: string;     // Win32 window class if available
  processName?: string;     // Process that triggered the dialog
}

export interface UACDetectionState {
  dialogActive: boolean;
  currentDetection: DialogDetection | null;
  inputPaused: boolean;
  streamHidden: boolean;
  sessionTerminated: boolean;
  totalDetections: number;
}

export type UACDetectionEvent =
  | 'dialog_detected'
  | 'dialog_dismissed'
  | 'input_paused'
  | 'input_resumed'
  | 'stream_hidden'
  | 'stream_restored'
  | 'session_terminate_requested'
  | 'viewer_notified'
  | 'timeout_exceeded';

export interface UACDetectionConfig {
  /** Maximum pause duration before session termination (ms). Default: 60000 (60s) */
  maxPauseDurationMs?: number;
  /** Polling interval for dialog detection (ms). Default: 500 */
  pollIntervalMs?: number;
  /** Callback invoked when viewer should be notified */
  onViewerNotify?: (reason: string, details: Record<string, unknown>) => void;
  /** Callback invoked when session should be terminated */
  onSessionTerminate?: (reason: string, auditMetadata: Record<string, unknown>) => void;
  /** Callback invoked to pause input forwarding */
  onInputPause?: () => void;
  /** Callback invoked to resume input forwarding */
  onInputResume?: () => void;
  /** Callback invoked to hide stream (show blank frame) */
  onStreamHide?: () => void;
  /** Callback invoked to restore stream */
  onStreamRestore?: () => void;
}

/**
 * Abstraction for Windows-specific dialog detection to enable testing
 * without native Windows APIs.
 */
export interface WindowsDialogDetector {
  /**
   * Check if a UAC or system dialog is currently active.
   * Returns a DialogDetection if one is found, null otherwise.
   */
  detect(): DialogDetection | null;
}

// ─── Known System Dialog Window Classes ─────────────────────────────────────────

/**
 * Windows class names associated with UAC and system dialogs.
 * Used by the default detector to identify when the secure desktop is active.
 */
export const KNOWN_SYSTEM_DIALOG_CLASSES: ReadonlyArray<string> = [
  'Credential Dialog Xaml Host',   // UAC credential prompt
  '#32770',                        // Common dialog (system dialogs, UAC consent)
  'NativeHWNDHost',                // UAC consent prompt host
  'Windows.UI.Core.CoreWindow',    // UWP system dialogs (Settings, Security)
  'Secure Desktop',                // Secure desktop indicator
] as const;

/**
 * Process names known to trigger UAC/system dialogs.
 */
export const KNOWN_UAC_PROCESSES: ReadonlyArray<string> = [
  'consent.exe',                   // UAC consent UI
  'credui.exe',                    // Credential UI
  'LogonUI.exe',                   // Logon UI
  'UserAccountBroker.exe',         // User Account Control broker
] as const;

// ─── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_PAUSE_DURATION_MS = 60_000;   // 60 seconds
const DEFAULT_POLL_INTERVAL_MS = 500;            // 500ms polling

// ─── UACDetectionService Class ──────────────────────────────────────────────────

export class UACDetectionService extends EventEmitter {
  private readonly maxPauseDurationMs: number;
  private readonly pollIntervalMs: number;
  private readonly onViewerNotify?: (reason: string, details: Record<string, unknown>) => void;
  private readonly onSessionTerminate?: (reason: string, auditMetadata: Record<string, unknown>) => void;
  private readonly onInputPause?: () => void;
  private readonly onInputResume?: () => void;
  private readonly onStreamHide?: () => void;
  private readonly onStreamRestore?: () => void;
  private readonly detector: WindowsDialogDetector;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  private state: UACDetectionState = {
    dialogActive: false,
    currentDetection: null,
    inputPaused: false,
    streamHidden: false,
    sessionTerminated: false,
    totalDetections: 0,
  };

  constructor(config: UACDetectionConfig, detector: WindowsDialogDetector) {
    super();
    this.maxPauseDurationMs = config.maxPauseDurationMs ?? DEFAULT_MAX_PAUSE_DURATION_MS;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.onViewerNotify = config.onViewerNotify;
    this.onSessionTerminate = config.onSessionTerminate;
    this.onInputPause = config.onInputPause;
    this.onInputResume = config.onInputResume;
    this.onStreamHide = config.onStreamHide;
    this.onStreamRestore = config.onStreamRestore;
    this.detector = detector;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start monitoring for UAC/system dialogs.
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    // If a dialog was active when we stop, restore state
    if (this.state.dialogActive) {
      this.restoreFromDialog();
    }
  }

  /**
   * Returns whether a system dialog is currently detected.
   */
  isDialogActive(): boolean {
    return this.state.dialogActive;
  }

  /**
   * Returns milliseconds since dialog was first detected (0 if no dialog).
   */
  getDialogDuration(): number {
    if (!this.state.dialogActive || !this.state.currentDetection) {
      return 0;
    }
    return Date.now() - this.state.currentDetection.detectedAt;
  }

  /**
   * Returns true if pause has exceeded the maximum allowed duration.
   */
  checkTimeout(maxPauseDurationMs?: number): boolean {
    const limit = maxPauseDurationMs ?? this.maxPauseDurationMs;
    if (!this.state.dialogActive || !this.state.currentDetection) {
      return false;
    }
    return this.getDialogDuration() > limit;
  }

  /**
   * Get the current detection state (for diagnostics/testing).
   */
  getState(): Readonly<UACDetectionState> {
    return { ...this.state };
  }

  /**
   * Check if the service is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the total number of detections since the service started.
   */
  getTotalDetections(): number {
    return this.state.totalDetections;
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  /**
   * Poll for dialog presence using the injected detector.
   */
  private poll(): void {
    if (this.state.sessionTerminated) return;

    const detection = this.detector.detect();

    if (detection && !this.state.dialogActive) {
      // New dialog detected
      this.handleDialogDetected(detection);
    } else if (!detection && this.state.dialogActive) {
      // Dialog was dismissed
      this.handleDialogDismissed();
    }
  }

  /**
   * Handle detection of a UAC/system dialog.
   * Pauses input forwarding, hides dialog from stream, notifies viewer.
   */
  private handleDialogDetected(detection: DialogDetection): void {
    this.state.dialogActive = true;
    this.state.currentDetection = detection;
    this.state.totalDetections += 1;

    // Pause input forwarding
    this.state.inputPaused = true;
    this.onInputPause?.();
    this.emit('input_paused');

    // Hide dialog from stream (show blank/placeholder frame)
    this.state.streamHidden = true;
    this.onStreamHide?.();
    this.emit('stream_hidden');

    // Notify Browser Viewer
    const notificationDetails: Record<string, unknown> = {
      dialogType: detection.dialogType,
      detectedAt: detection.detectedAt,
      windowClass: detection.windowClass,
      processName: detection.processName,
    };

    this.onViewerNotify?.('system_dialog_detected', notificationDetails);
    this.emit('viewer_notified', notificationDetails);

    // Emit detection event
    this.emit('dialog_detected', detection);

    // Start the timeout timer
    this.startTimeoutTimer();
  }

  /**
   * Handle dismissal of a UAC/system dialog.
   * Restores input forwarding and stream.
   */
  private handleDialogDismissed(): void {
    this.restoreFromDialog();
    this.emit('dialog_dismissed');
  }

  /**
   * Restore normal state after dialog is dismissed or service stopped.
   */
  private restoreFromDialog(): void {
    // Clear the timeout timer
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    // Resume input forwarding
    if (this.state.inputPaused) {
      this.state.inputPaused = false;
      this.onInputResume?.();
      this.emit('input_resumed');
    }

    // Restore stream
    if (this.state.streamHidden) {
      this.state.streamHidden = false;
      this.onStreamRestore?.();
      this.emit('stream_restored');
    }

    this.state.dialogActive = false;
    this.state.currentDetection = null;
  }

  /**
   * Start the 60-second timeout timer. If the dialog persists beyond
   * the timeout, signal session termination.
   */
  private startTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }

    this.timeoutTimer = setTimeout(() => {
      if (!this.state.dialogActive || this.state.sessionTerminated) return;

      this.state.sessionTerminated = true;
      this.emit('timeout_exceeded');

      const auditMetadata: Record<string, unknown> = {
        dialogType: this.state.currentDetection?.dialogType,
        detectedAt: this.state.currentDetection?.detectedAt,
        terminatedAt: Date.now(),
        durationMs: this.getDialogDuration(),
        windowClass: this.state.currentDetection?.windowClass,
        processName: this.state.currentDetection?.processName,
      };

      this.onSessionTerminate?.('system_dialog_timeout', auditMetadata);
      this.emit('session_terminate_requested', auditMetadata);
    }, this.maxPauseDurationMs);
  }
}

// ─── Default Windows Dialog Detector (Stub for non-native environments) ─────────

/**
 * Creates a no-op detector for testing or non-Windows environments.
 * In production, this would be replaced with a native addon that checks
 * the Windows secure desktop state and enumerates system dialog windows.
 */
export function createNoOpDetector(): WindowsDialogDetector {
  return {
    detect: () => null,
  };
}

/**
 * Creates a detector backed by a mutable detection state.
 * Useful for tests where detection needs to be triggered programmatically.
 */
export function createMockDetector(): {
  detector: WindowsDialogDetector;
  setDetection: (detection: DialogDetection | null) => void;
} {
  let currentDetection: DialogDetection | null = null;

  return {
    detector: {
      detect: () => currentDetection,
    },
    setDetection: (detection: DialogDetection | null) => {
      currentDetection = detection;
    },
  };
}
