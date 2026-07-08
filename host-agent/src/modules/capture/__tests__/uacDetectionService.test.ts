/**
 * Host Agent — UAC Detection Service Tests
 *
 * Tests for the UACDetectionService class covering:
 * - Detection of UAC prompts and system dialogs
 * - Input forwarding pause/resume on dialog detection/dismissal
 * - Stream hiding during dialog presence
 * - Browser Viewer notification with "system_dialog_detected" reason
 * - Session termination if pause exceeds 60 seconds
 * - Dialog duration tracking
 * - Event emission lifecycle
 *
 * Requirements: 5.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UACDetectionService,
  createMockDetector,
  createNoOpDetector,
  KNOWN_SYSTEM_DIALOG_CLASSES,
  KNOWN_UAC_PROCESSES,
  type UACDetectionConfig,
  type DialogDetection,
} from '../uacDetectionService';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createUACDetection(overrides?: Partial<DialogDetection>): DialogDetection {
  return {
    dialogType: 'uac_consent',
    detectedAt: Date.now(),
    windowClass: '#32770',
    processName: 'consent.exe',
    ...overrides,
  };
}

function createService(
  configOverrides?: Partial<UACDetectionConfig>,
  detectorOverride?: ReturnType<typeof createMockDetector>,
) {
  const mock = detectorOverride ?? createMockDetector();
  const config: UACDetectionConfig = {
    pollIntervalMs: 50,           // Short interval for tests
    maxPauseDurationMs: 60_000,   // 60 seconds
    ...configOverrides,
  };

  const service = new UACDetectionService(config, mock.detector);
  return { service, mock };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('UACDetectionService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Lifecycle (start/stop)', () => {
    it('should not be running initially', () => {
      const { service } = createService();
      expect(service.isRunning()).toBe(false);
    });

    it('should start monitoring', () => {
      const { service } = createService();
      service.start();
      expect(service.isRunning()).toBe(true);
      service.stop();
    });

    it('should not start twice', () => {
      const { service } = createService();
      service.start();
      service.start(); // Duplicate call should be ignored
      expect(service.isRunning()).toBe(true);
      service.stop();
    });

    it('should stop monitoring', () => {
      const { service } = createService();
      service.start();
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('should restore state when stopped during active dialog', () => {
      const { service, mock } = createService();
      service.start();

      // Trigger a dialog detection
      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      expect(service.isDialogActive()).toBe(true);

      // Stop should restore state
      service.stop();
      expect(service.isDialogActive()).toBe(false);
      expect(service.getState().inputPaused).toBe(false);
      expect(service.getState().streamHidden).toBe(false);
    });
  });

  describe('Dialog Detection', () => {
    it('should detect a UAC dialog when detector reports one', () => {
      const { service, mock } = createService();
      service.start();

      expect(service.isDialogActive()).toBe(false);

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      expect(service.isDialogActive()).toBe(true);
      service.stop();
    });

    it('should detect dialog dismissal', () => {
      const { service, mock } = createService();
      service.start();

      // Trigger detection
      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);
      expect(service.isDialogActive()).toBe(true);

      // Dismiss dialog
      mock.setDetection(null);
      vi.advanceTimersByTime(50);
      expect(service.isDialogActive()).toBe(false);

      service.stop();
    });

    it('should track total detections', () => {
      const { service, mock } = createService();
      service.start();

      // First detection
      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);
      mock.setDetection(null);
      vi.advanceTimersByTime(50);

      // Second detection
      mock.setDetection(createUACDetection({ dialogType: 'windows_security' }));
      vi.advanceTimersByTime(50);
      mock.setDetection(null);
      vi.advanceTimersByTime(50);

      expect(service.getTotalDetections()).toBe(2);
      service.stop();
    });

    it('should not re-detect the same dialog on consecutive polls', () => {
      const { service, mock } = createService();
      const detectedHandler = vi.fn();
      service.on('dialog_detected', detectedHandler);

      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50); // First poll detects
      vi.advanceTimersByTime(50); // Second poll — same dialog still active
      vi.advanceTimersByTime(50); // Third poll — same dialog still active

      expect(detectedHandler).toHaveBeenCalledTimes(1);
      service.stop();
    });

    it('should report no active dialog when nothing detected', () => {
      const { service } = createService();
      service.start();
      vi.advanceTimersByTime(200);

      expect(service.isDialogActive()).toBe(false);
      expect(service.getDialogDuration()).toBe(0);
      service.stop();
    });
  });

  describe('Input Forwarding Pause (Requirement 5.6)', () => {
    it('should pause input when dialog detected', () => {
      const onInputPause = vi.fn();
      const { service, mock } = createService({ onInputPause });
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      expect(onInputPause).toHaveBeenCalledTimes(1);
      expect(service.getState().inputPaused).toBe(true);
      service.stop();
    });

    it('should resume input when dialog dismissed', () => {
      const onInputResume = vi.fn();
      const { service, mock } = createService({ onInputResume });
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      mock.setDetection(null);
      vi.advanceTimersByTime(50);

      expect(onInputResume).toHaveBeenCalledTimes(1);
      expect(service.getState().inputPaused).toBe(false);
      service.stop();
    });

    it('should emit input_paused event', () => {
      const { service, mock } = createService();
      const handler = vi.fn();
      service.on('input_paused', handler);
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      expect(handler).toHaveBeenCalledTimes(1);
      service.stop();
    });

    it('should emit input_resumed event on dismissal', () => {
      const { service, mock } = createService();
      const handler = vi.fn();
      service.on('input_resumed', handler);
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      mock.setDetection(null);
      vi.advanceTimersByTime(50);

      expect(handler).toHaveBeenCalledTimes(1);
      service.stop();
    });
  });

  describe('Stream Hiding (Requirement 5.6)', () => {
    it('should hide stream when dialog detected', () => {
      const onStreamHide = vi.fn();
      const { service, mock } = createService({ onStreamHide });
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      expect(onStreamHide).toHaveBeenCalledTimes(1);
      expect(service.getState().streamHidden).toBe(true);
      service.stop();
    });

    it('should restore stream when dialog dismissed', () => {
      const onStreamRestore = vi.fn();
      const { service, mock } = createService({ onStreamRestore });
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      mock.setDetection(null);
      vi.advanceTimersByTime(50);

      expect(onStreamRestore).toHaveBeenCalledTimes(1);
      expect(service.getState().streamHidden).toBe(false);
      service.stop();
    });
  });

  describe('Browser Viewer Notification (Requirement 5.6)', () => {
    it('should notify viewer with "system_dialog_detected" reason', () => {
      const onViewerNotify = vi.fn();
      const { service, mock } = createService({ onViewerNotify });
      service.start();

      const detection = createUACDetection();
      mock.setDetection(detection);
      vi.advanceTimersByTime(50);

      expect(onViewerNotify).toHaveBeenCalledTimes(1);
      expect(onViewerNotify).toHaveBeenCalledWith(
        'system_dialog_detected',
        expect.objectContaining({
          dialogType: 'uac_consent',
          windowClass: '#32770',
          processName: 'consent.exe',
        }),
      );
      service.stop();
    });

    it('should emit viewer_notified event', () => {
      const { service, mock } = createService();
      const handler = vi.fn();
      service.on('viewer_notified', handler);
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          dialogType: 'uac_consent',
        }),
      );
      service.stop();
    });
  });

  describe('Session Termination on Timeout (Requirement 5.6)', () => {
    it('should terminate session if dialog persists for >60 seconds', () => {
      const onSessionTerminate = vi.fn();
      const { service, mock } = createService({
        maxPauseDurationMs: 60_000,
        onSessionTerminate,
      });
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50); // Detection

      // Advance time past the 60-second timeout
      vi.advanceTimersByTime(60_000);

      expect(onSessionTerminate).toHaveBeenCalledTimes(1);
      expect(onSessionTerminate).toHaveBeenCalledWith(
        'system_dialog_timeout',
        expect.objectContaining({
          dialogType: 'uac_consent',
          durationMs: expect.any(Number),
        }),
      );
      expect(service.getState().sessionTerminated).toBe(true);
      service.stop();
    });

    it('should emit timeout_exceeded event', () => {
      const { service, mock } = createService({ maxPauseDurationMs: 60_000 });
      const handler = vi.fn();
      service.on('timeout_exceeded', handler);
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(60_000);

      expect(handler).toHaveBeenCalledTimes(1);
      service.stop();
    });

    it('should emit session_terminate_requested event with audit metadata', () => {
      const { service, mock } = createService({ maxPauseDurationMs: 60_000 });
      const handler = vi.fn();
      service.on('session_terminate_requested', handler);
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(60_000);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          dialogType: 'uac_consent',
          terminatedAt: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );
      service.stop();
    });

    it('should NOT terminate if dialog is dismissed before timeout', () => {
      const onSessionTerminate = vi.fn();
      const { service, mock } = createService({
        maxPauseDurationMs: 60_000,
        onSessionTerminate,
      });
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50); // Detection

      // Dismiss after 30 seconds (before timeout)
      vi.advanceTimersByTime(30_000);
      mock.setDetection(null);
      vi.advanceTimersByTime(50); // Dismissal detected

      // Continue past original timeout
      vi.advanceTimersByTime(35_000);

      expect(onSessionTerminate).not.toHaveBeenCalled();
      expect(service.getState().sessionTerminated).toBe(false);
      service.stop();
    });

    it('should respect custom timeout duration', () => {
      const onSessionTerminate = vi.fn();
      const { service, mock } = createService({
        maxPauseDurationMs: 5_000, // 5 seconds
        onSessionTerminate,
      });
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      vi.advanceTimersByTime(5_000);

      expect(onSessionTerminate).toHaveBeenCalledTimes(1);
      service.stop();
    });

    it('should not terminate more than once for the same dialog', () => {
      const onSessionTerminate = vi.fn();
      const { service, mock } = createService({
        maxPauseDurationMs: 1_000,
        onSessionTerminate,
      });
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(1_000); // Timeout triggered
      vi.advanceTimersByTime(5_000); // More time passes

      expect(onSessionTerminate).toHaveBeenCalledTimes(1);
      service.stop();
    });
  });

  describe('Dialog Duration Tracking', () => {
    it('should return 0 when no dialog is active', () => {
      const { service } = createService();
      expect(service.getDialogDuration()).toBe(0);
    });

    it('should track duration of active dialog', () => {
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      const { service, mock } = createService();
      service.start();

      mock.setDetection(createUACDetection({ detectedAt: Date.now() }));
      vi.advanceTimersByTime(50); // Detection poll

      // Advance 10 seconds
      vi.advanceTimersByTime(10_000);
      expect(service.getDialogDuration()).toBeGreaterThanOrEqual(10_000);

      service.stop();
    });

    it('should reset duration when dialog dismissed', () => {
      const { service, mock } = createService();
      service.start();

      mock.setDetection(createUACDetection({ detectedAt: Date.now() }));
      vi.advanceTimersByTime(50);

      mock.setDetection(null);
      vi.advanceTimersByTime(50);

      expect(service.getDialogDuration()).toBe(0);
      service.stop();
    });
  });

  describe('checkTimeout', () => {
    it('should return false when no dialog is active', () => {
      const { service } = createService();
      expect(service.checkTimeout(60_000)).toBe(false);
    });

    it('should return false when dialog duration is within limit', () => {
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      const { service, mock } = createService();
      service.start();

      mock.setDetection(createUACDetection({ detectedAt: Date.now() }));
      vi.advanceTimersByTime(50);

      // Only 5 seconds have passed
      vi.advanceTimersByTime(5_000);
      expect(service.checkTimeout(60_000)).toBe(false);

      service.stop();
    });

    it('should return true when dialog duration exceeds limit', () => {
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      const { service, mock } = createService();
      service.start();

      mock.setDetection(createUACDetection({ detectedAt: Date.now() }));
      vi.advanceTimersByTime(50);

      // 61 seconds have passed
      vi.advanceTimersByTime(61_000);
      expect(service.checkTimeout(60_000)).toBe(true);

      service.stop();
    });

    it('should accept custom timeout parameter', () => {
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      const { service, mock } = createService();
      service.start();

      mock.setDetection(createUACDetection({ detectedAt: Date.now() }));
      vi.advanceTimersByTime(50);

      vi.advanceTimersByTime(3_000);
      expect(service.checkTimeout(2_000)).toBe(true);
      expect(service.checkTimeout(5_000)).toBe(false);

      service.stop();
    });
  });

  describe('Event Lifecycle', () => {
    it('should emit dialog_detected on first detection', () => {
      const { service, mock } = createService();
      const handler = vi.fn();
      service.on('dialog_detected', handler);
      service.start();

      const detection = createUACDetection();
      mock.setDetection(detection);
      vi.advanceTimersByTime(50);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(detection);
      service.stop();
    });

    it('should emit dialog_dismissed when dialog goes away', () => {
      const { service, mock } = createService();
      const handler = vi.fn();
      service.on('dialog_dismissed', handler);
      service.start();

      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      mock.setDetection(null);
      vi.advanceTimersByTime(50);

      expect(handler).toHaveBeenCalledTimes(1);
      service.stop();
    });

    it('should emit events in correct order: detected → paused → hidden → notified', () => {
      const { service, mock } = createService();
      const events: string[] = [];

      service.on('dialog_detected', () => events.push('dialog_detected'));
      service.on('input_paused', () => events.push('input_paused'));
      service.on('stream_hidden', () => events.push('stream_hidden'));
      service.on('viewer_notified', () => events.push('viewer_notified'));

      service.start();
      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      expect(events).toEqual([
        'input_paused',
        'stream_hidden',
        'viewer_notified',
        'dialog_detected',
      ]);
      service.stop();
    });

    it('should emit events in correct order on dismissal: resumed → restored → dismissed', () => {
      const { service, mock } = createService();
      const events: string[] = [];

      service.on('input_resumed', () => events.push('input_resumed'));
      service.on('stream_restored', () => events.push('stream_restored'));
      service.on('dialog_dismissed', () => events.push('dialog_dismissed'));

      service.start();
      mock.setDetection(createUACDetection());
      vi.advanceTimersByTime(50);

      // Reset events array for dismissal
      events.length = 0;

      mock.setDetection(null);
      vi.advanceTimersByTime(50);

      expect(events).toEqual([
        'input_resumed',
        'stream_restored',
        'dialog_dismissed',
      ]);
      service.stop();
    });
  });

  describe('Different Dialog Types', () => {
    it('should handle UAC credential dialog', () => {
      const { service, mock } = createService();
      const handler = vi.fn();
      service.on('dialog_detected', handler);
      service.start();

      mock.setDetection(createUACDetection({
        dialogType: 'uac_credential',
        windowClass: 'Credential Dialog Xaml Host',
        processName: 'credui.exe',
      }));
      vi.advanceTimersByTime(50);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ dialogType: 'uac_credential' }),
      );
      service.stop();
    });

    it('should handle Windows Security dialog', () => {
      const { service, mock } = createService();
      const handler = vi.fn();
      service.on('dialog_detected', handler);
      service.start();

      mock.setDetection(createUACDetection({
        dialogType: 'windows_security',
        windowClass: 'Windows.UI.Core.CoreWindow',
        processName: 'LogonUI.exe',
      }));
      vi.advanceTimersByTime(50);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ dialogType: 'windows_security' }),
      );
      service.stop();
    });

    it('should handle admin elevation request', () => {
      const { service, mock } = createService();
      const handler = vi.fn();
      service.on('dialog_detected', handler);
      service.start();

      mock.setDetection(createUACDetection({
        dialogType: 'admin_elevation',
        windowClass: 'NativeHWNDHost',
        processName: 'UserAccountBroker.exe',
      }));
      vi.advanceTimersByTime(50);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ dialogType: 'admin_elevation' }),
      );
      service.stop();
    });
  });

  describe('No-op Detector', () => {
    it('should never detect dialogs', () => {
      const detector = createNoOpDetector();
      expect(detector.detect()).toBeNull();
    });
  });

  describe('Constants', () => {
    it('should export known system dialog window classes', () => {
      expect(KNOWN_SYSTEM_DIALOG_CLASSES).toContain('#32770');
      expect(KNOWN_SYSTEM_DIALOG_CLASSES).toContain('Credential Dialog Xaml Host');
      expect(KNOWN_SYSTEM_DIALOG_CLASSES).toContain('NativeHWNDHost');
      expect(KNOWN_SYSTEM_DIALOG_CLASSES.length).toBeGreaterThan(0);
    });

    it('should export known UAC process names', () => {
      expect(KNOWN_UAC_PROCESSES).toContain('consent.exe');
      expect(KNOWN_UAC_PROCESSES).toContain('LogonUI.exe');
      expect(KNOWN_UAC_PROCESSES.length).toBeGreaterThan(0);
    });
  });
});
