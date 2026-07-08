/**
 * Tests for ProcessMonitorService
 *
 * Validates process monitoring, child process prevention, UAC detection,
 * and audit event generation for the Host Agent sandbox.
 *
 * Requirements: 7.5, 7.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProcessMonitorService,
  type ProcessMonitorAddon,
  type ProcessEvent,
  type SessionTerminationHandler,
} from '../processMonitorService';

// ─── Mock Native Addon ──────────────────────────────────────────────────────────

function createMockAddon(): ProcessMonitorAddon {
  return {
    startMonitoring: vi.fn(),
    terminateProcess: vi.fn().mockReturnValue(true),
    getProcessTree: vi.fn().mockReturnValue([]),
  };
}

function createProcessEvent(overrides: Partial<ProcessEvent> = {}): ProcessEvent {
  return {
    pid: 4000,
    parentPid: 1234,
    executableName: 'unknown.exe',
    executablePath: 'C:\\unknown\\unknown.exe',
    isElevated: false,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('ProcessMonitorService', () => {
  let mockAddon: ProcessMonitorAddon;
  let service: ProcessMonitorService;
  const allowedAppIds = ['revit.exe', 'archicad.exe', 'autocad.exe'];
  const allowedPids = [1234, 5678];

  beforeEach(() => {
    mockAddon = createMockAddon();
    service = new ProcessMonitorService(mockAddon);
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should not be active before start() is called', () => {
      expect(service.isActive()).toBe(false);
    });

    it('should be active after start() is called', () => {
      service.start(allowedAppIds, allowedPids);
      expect(service.isActive()).toBe(true);
    });

    it('should call startMonitoring on the addon when started', () => {
      service.start(allowedAppIds, allowedPids);
      expect(mockAddon.startMonitoring).toHaveBeenCalledTimes(1);
      expect(mockAddon.startMonitoring).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should not call startMonitoring again if already active', () => {
      service.start(allowedAppIds, allowedPids);
      service.start(allowedAppIds, allowedPids);
      expect(mockAddon.startMonitoring).toHaveBeenCalledTimes(1);
    });

    it('should be inactive after stop() is called', () => {
      service.start(allowedAppIds, allowedPids);
      service.stop();
      expect(service.isActive()).toBe(false);
    });

    it('should not fail when stop() is called without start()', () => {
      expect(() => service.stop()).not.toThrow();
    });

    it('should clear blocked log on restart', () => {
      service.start(allowedAppIds, allowedPids);

      // Trigger a blocked event
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ executableName: 'cmd.exe' }));
      expect(service.getBlockedProcessLog()).toHaveLength(1);

      // Restart
      service.stop();
      service.start(allowedAppIds, allowedPids);
      expect(service.getBlockedProcessLog()).toHaveLength(0);
    });
  });

  // ─── Process Allowed Logic ──────────────────────────────────────────────────

  describe('handleProcessCreated — allowed processes', () => {
    beforeEach(() => {
      service.start(allowedAppIds, allowedPids);
    });

    it('should NOT terminate a process whose PID is in the allowed list', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ pid: 1234, executableName: 'anything.exe' }));

      expect(mockAddon.terminateProcess).not.toHaveBeenCalled();
      expect(service.getBlockedProcessLog()).toHaveLength(0);
    });

    it('should NOT terminate a process whose executable matches an allowed app ID', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ executableName: 'revit.exe' }));

      expect(mockAddon.terminateProcess).not.toHaveBeenCalled();
      expect(service.getBlockedProcessLog()).toHaveLength(0);
    });

    it('should be case-insensitive when matching executable names to allowlist', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ executableName: 'REVIT.EXE' }));

      expect(mockAddon.terminateProcess).not.toHaveBeenCalled();
    });

    it('should allow a child process spawned by an allowed parent if it is in the allowlist', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ parentPid: 1234, executableName: 'archicad.exe' }));

      expect(mockAddon.terminateProcess).not.toHaveBeenCalled();
      expect(service.getBlockedProcessLog()).toHaveLength(0);
    });

    it('should allow dynamically added PIDs via addAllowedPid', () => {
      service.addAllowedPid(9999);
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ pid: 9999, executableName: 'new-app.exe' }));

      expect(mockAddon.terminateProcess).not.toHaveBeenCalled();
    });
  });

  // ─── Child Process Blocking ─────────────────────────────────────────────────

  describe('handleProcessCreated — blocked child processes', () => {
    beforeEach(() => {
      service.start(allowedAppIds, allowedPids);
    });

    it('should terminate a child process NOT in the allowlist', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 4000,
        parentPid: 1234,
        executableName: 'cmd.exe',
        executablePath: 'C:\\Windows\\System32\\cmd.exe',
      }));

      expect(mockAddon.terminateProcess).toHaveBeenCalledWith(4000);
    });

    it('should write a "child_process_blocked" event with the blocked process name', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 4000,
        parentPid: 1234,
        executableName: 'powershell.exe',
        executablePath: 'C:\\Windows\\System32\\powershell.exe',
      }));

      const log = service.getBlockedProcessLog();
      expect(log).toHaveLength(1);
      expect(log[0].eventType).toBe('child_process_blocked');
      expect(log[0].blockedProcessName).toBe('powershell.exe');
    });

    it('should write the parent PID in the blocked event', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 4000,
        parentPid: 5678,
        executableName: 'wt.exe',
        executablePath: 'C:\\Program Files\\WindowsTerminal\\wt.exe',
      }));

      const log = service.getBlockedProcessLog();
      expect(log[0].parentPid).toBe(5678);
    });

    it('should include the blocked PID in the event', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 7777,
        parentPid: 1234,
        executableName: 'explorer.exe',
      }));

      const log = service.getBlockedProcessLog();
      expect(log[0].blockedPid).toBe(7777);
    });

    it('should include the executable path in the event', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 4000,
        parentPid: 1234,
        executableName: 'bash.exe',
        executablePath: 'C:\\Windows\\System32\\bash.exe',
      }));

      const log = service.getBlockedProcessLog();
      expect(log[0].executablePath).toBe('C:\\Windows\\System32\\bash.exe');
    });

    it('should include a timestamp in the blocked event', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ executableName: 'wsl.exe' }));

      const log = service.getBlockedProcessLog();
      expect(log[0].timestamp).toBe(now);

      vi.restoreAllMocks();
    });

    it('should accumulate multiple blocked events', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];

      callback(createProcessEvent({ pid: 4001, executableName: 'cmd.exe' }));
      callback(createProcessEvent({ pid: 4002, executableName: 'powershell.exe' }));
      callback(createProcessEvent({ pid: 4003, executableName: 'bash.exe' }));

      const log = service.getBlockedProcessLog();
      expect(log).toHaveLength(3);
      expect(log[0].blockedProcessName).toBe('cmd.exe');
      expect(log[1].blockedProcessName).toBe('powershell.exe');
      expect(log[2].blockedProcessName).toBe('bash.exe');
    });

    it('should NOT terminate or log when monitoring is stopped', () => {
      service.stop();

      // Manually call handleProcessCreated (simulating lingering callback)
      service.handleProcessCreated(createProcessEvent({ executableName: 'cmd.exe' }));

      expect(mockAddon.terminateProcess).not.toHaveBeenCalled();
      expect(service.getBlockedProcessLog()).toHaveLength(0);
    });

    it('should block child of allowed parent if the child is NOT in the allowlist', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Parent PID 1234 is allowed, but "malicious.exe" is not in allowedAppIds
      callback(createProcessEvent({
        pid: 8888,
        parentPid: 1234,
        executableName: 'malicious.exe',
        executablePath: 'C:\\temp\\malicious.exe',
      }));

      expect(mockAddon.terminateProcess).toHaveBeenCalledWith(8888);
      const log = service.getBlockedProcessLog();
      expect(log).toHaveLength(1);
      expect(log[0].blockedProcessName).toBe('malicious.exe');
    });
  });

  // ─── UAC / Privilege Escalation ─────────────────────────────────────────────

  describe('handleProcessCreated — UAC/privilege escalation', () => {
    let terminationHandler: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      terminationHandler = vi.fn();
      service.onTerminateSession(terminationHandler as SessionTerminationHandler);
      service.start(allowedAppIds, allowedPids);
    });

    it('should terminate the elevated process', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 5000,
        executableName: 'setup.exe',
        isElevated: true,
      }));

      expect(mockAddon.terminateProcess).toHaveBeenCalledWith(5000);
    });

    it('should write a "session_terminated_uac" event', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 5000,
        executableName: 'setup.exe',
        isElevated: true,
      }));

      const log = service.getBlockedProcessLog();
      expect(log).toHaveLength(1);
      expect(log[0].eventType).toBe('session_terminated_uac');
      expect(log[0].blockedProcessName).toBe('setup.exe');
    });

    it('should call the session termination handler', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 5000,
        parentPid: 1234,
        executableName: 'setup.exe',
        isElevated: true,
      }));

      expect(terminationHandler).toHaveBeenCalledWith(
        'privilege_escalation_detected',
        expect.objectContaining({
          eventType: 'session_terminated_uac',
          blockedProcessName: 'setup.exe',
          blockedPid: 5000,
          parentPid: 1234,
        })
      );
    });

    it('should stop monitoring after UAC detection (session terminated)', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({
        pid: 5000,
        executableName: 'elevated.exe',
        isElevated: true,
      }));

      expect(service.isActive()).toBe(false);
    });

    it('should prioritise UAC detection over allowlist checks', () => {
      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Even if the executable is in the allowlist, UAC takes priority
      callback(createProcessEvent({
        pid: 1234, // Allowed PID
        executableName: 'revit.exe', // Allowed app
        isElevated: true,
      }));

      expect(mockAddon.terminateProcess).toHaveBeenCalledWith(1234);
      expect(terminationHandler).toHaveBeenCalled();
    });

    it('should not fail if no termination handler is registered', () => {
      // Create a service without handler
      const svc = new ProcessMonitorService(mockAddon);
      svc.start(allowedAppIds, allowedPids);

      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[1][0];

      expect(() => {
        callback(createProcessEvent({ isElevated: true }));
      }).not.toThrow();
    });
  });

  // ─── getBlockedProcessLog ───────────────────────────────────────────────────

  describe('getBlockedProcessLog', () => {
    it('should return an empty array before any events', () => {
      service.start(allowedAppIds, allowedPids);
      expect(service.getBlockedProcessLog()).toEqual([]);
    });

    it('should return a defensive copy', () => {
      service.start(allowedAppIds, allowedPids);

      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ executableName: 'cmd.exe' }));

      const log = service.getBlockedProcessLog();
      log.push({
        timestamp: 0,
        blockedProcessName: 'fake.exe',
        parentPid: 0,
        blockedPid: 0,
        executablePath: '',
        eventType: 'child_process_blocked',
      });

      expect(service.getBlockedProcessLog()).toHaveLength(1);
    });
  });

  // ─── addAllowedPid ─────────────────────────────────────────────────────────

  describe('addAllowedPid', () => {
    it('should not add duplicate PIDs', () => {
      service.start(allowedAppIds, allowedPids);
      service.addAllowedPid(1234); // already in the list

      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Process with PID 1234 should still be allowed (only one entry)
      callback(createProcessEvent({ pid: 1234, executableName: 'anything.exe' }));
      expect(mockAddon.terminateProcess).not.toHaveBeenCalled();
    });

    it('should allow newly added PIDs to pass the check', () => {
      service.start(allowedAppIds, allowedPids);
      service.addAllowedPid(9999);

      const callback = (mockAddon.startMonitoring as ReturnType<typeof vi.fn>).mock.calls[0][0];
      callback(createProcessEvent({ pid: 9999, executableName: 'custom.exe' }));

      expect(mockAddon.terminateProcess).not.toHaveBeenCalled();
      expect(service.getBlockedProcessLog()).toHaveLength(0);
    });
  });
});
