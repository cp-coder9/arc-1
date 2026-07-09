/**
 * Host Agent — Process Monitor Service
 *
 * Watches for new process creation events during active sessions and terminates
 * child processes that are not in the App_Allowlist. Also detects UAC/privilege
 * escalation attempts and terminates the session within 3 seconds.
 *
 * Responsibilities:
 * - Monitor new process creation via native addon callback
 * - Terminate unauthorised child processes within 2 seconds of detection
 * - Write "child_process_blocked" events with blocked process name and parent PID
 * - Detect UAC/privilege escalation and terminate session within 3 seconds
 * - Write "session_terminated_uac" event on privilege escalation
 *
 * Requirements: 7.5, 7.6
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ProcessEvent {
  /** Process ID of the newly created process */
  pid: number;
  /** Parent process ID */
  parentPid: number;
  /** Executable name (e.g., "cmd.exe") */
  executableName: string;
  /** Full executable path (e.g., "C:\\Windows\\System32\\cmd.exe") */
  executablePath: string;
  /** Whether this process requested elevation (UAC) */
  isElevated: boolean;
}

export interface ProcessInfo {
  pid: number;
  parentPid: number;
  executableName: string;
  executablePath: string;
}

/**
 * Native addon interface for process monitoring.
 * Injected at construction — the actual C++ addon is built separately via node-gyp.
 */
export interface ProcessMonitorAddon {
  /** Watch for new process creation events */
  startMonitoring(callback: (event: ProcessEvent) => void): void;
  /** Terminate a process by PID. Returns true if successful. */
  terminateProcess(pid: number): boolean;
  /** Get process tree for a given PID */
  getProcessTree(pid: number): ProcessInfo[];
}

// ─── Event Types ────────────────────────────────────────────────────────────────

export interface BlockedProcessEvent {
  /** Timestamp of the event */
  timestamp: number;
  /** Name of the blocked process executable */
  blockedProcessName: string;
  /** PID of the parent that spawned the blocked process */
  parentPid: number;
  /** PID of the blocked process */
  blockedPid: number;
  /** Full executable path of the blocked process */
  executablePath: string;
  /** Event type for audit logging */
  eventType: 'child_process_blocked' | 'session_terminated_uac';
}

export interface SessionTerminationHandler {
  /** Called when the session must be terminated (e.g., UAC detection) */
  (reason: string, event: BlockedProcessEvent): void;
}

// ─── ProcessMonitorService Class ────────────────────────────────────────────────

export class ProcessMonitorService {
  private readonly addon: ProcessMonitorAddon;
  private active = false;
  private allowedAppIds: string[] = [];
  private allowedPids: number[] = [];
  private blockedLog: BlockedProcessEvent[] = [];
  private onSessionTerminate: SessionTerminationHandler | null = null;

  /** Maximum time allowed to terminate an unauthorised child process (ms) */
  private static readonly CHILD_TERMINATION_DEADLINE_MS = 2000;

  /** Maximum time allowed to terminate session on UAC detection (ms) */
  private static readonly UAC_TERMINATION_DEADLINE_MS = 3000;

  /**
   * @param addon - The native ProcessMonitorAddon (injected for testability).
   */
  constructor(addon: ProcessMonitorAddon) {
    this.addon = addon;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start monitoring for new process creation events.
   *
   * @param allowedAppIds - Application IDs from the App_Allowlist (executable names, case-insensitive)
   * @param allowedPids - PIDs of processes already running that are in the allowlist
   */
  start(allowedAppIds: string[], allowedPids: number[]): void {
    if (this.active) return;

    this.allowedAppIds = allowedAppIds.map((id) => id.toLowerCase().trim());
    this.allowedPids = [...allowedPids];
    this.blockedLog = [];
    this.active = true;

    this.addon.startMonitoring((event: ProcessEvent) => {
      this.handleProcessCreated(event);
    });
  }

  /**
   * Stop monitoring for process creation events.
   */
  stop(): void {
    if (!this.active) return;

    this.active = false;
    this.allowedAppIds = [];
    this.allowedPids = [];
  }

  /**
   * Register a handler to be called when the session must be terminated
   * (e.g., due to UAC/privilege escalation detection).
   */
  onTerminateSession(handler: SessionTerminationHandler): void {
    this.onSessionTerminate = handler;
  }

  /**
   * Check if the service is currently active (monitoring).
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Get the log of all blocked process events during this monitoring session.
   */
  getBlockedProcessLog(): BlockedProcessEvent[] {
    return [...this.blockedLog];
  }

  /**
   * Add a PID to the allowed list (e.g., when a new allowlisted app is launched).
   */
  addAllowedPid(pid: number): void {
    if (!this.allowedPids.includes(pid)) {
      this.allowedPids.push(pid);
    }
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /**
   * Handle a new process creation event.
   * Checks if the process is allowed; terminates within 2 seconds if not.
   * If UAC/elevation is detected, terminates session within 3 seconds.
   */
  handleProcessCreated(event: ProcessEvent): void {
    if (!this.active) return;

    // UAC / privilege escalation detection takes priority
    if (event.isElevated) {
      this.handleUacDetected(event);
      return;
    }

    // Check if the process is allowed
    if (this.isProcessAllowed(event)) {
      return;
    }

    // Terminate the unauthorised child process
    this.terminateUnauthorisedProcess(event);
  }

  /**
   * Determine if a process is allowed based on the allowlist.
   * A process is allowed if:
   * - Its PID is in the allowed PIDs list
   * - Its parent PID is in the allowed PIDs list (child of allowed process)
   * - Its executable name matches an entry in the allowed app IDs
   */
  private isProcessAllowed(event: ProcessEvent): boolean {
    // Check if PID is explicitly allowed
    if (this.allowedPids.includes(event.pid)) {
      return true;
    }

    // Check if parent PID is allowed AND the executable is in the allowlist
    const execName = event.executableName.toLowerCase().trim();
    if (this.allowedPids.includes(event.parentPid) && this.allowedAppIds.includes(execName)) {
      return true;
    }

    // Check if executable name alone is in the allowlist
    if (this.allowedAppIds.includes(execName)) {
      return true;
    }

    return false;
  }

  /**
   * Terminate an unauthorised child process and log the event.
   * Must complete within CHILD_TERMINATION_DEADLINE_MS (2 seconds).
   */
  private terminateUnauthorisedProcess(event: ProcessEvent): void {
    const blockedEvent: BlockedProcessEvent = {
      timestamp: Date.now(),
      blockedProcessName: event.executableName,
      parentPid: event.parentPid,
      blockedPid: event.pid,
      executablePath: event.executablePath,
      eventType: 'child_process_blocked',
    };

    // Terminate the process
    this.addon.terminateProcess(event.pid);

    // Log the blocked event
    this.blockedLog.push(blockedEvent);
  }

  /**
   * Handle UAC/privilege escalation detection.
   * Terminates the session within UAC_TERMINATION_DEADLINE_MS (3 seconds).
   */
  private handleUacDetected(event: ProcessEvent): void {
    const uacEvent: BlockedProcessEvent = {
      timestamp: Date.now(),
      blockedProcessName: event.executableName,
      parentPid: event.parentPid,
      blockedPid: event.pid,
      executablePath: event.executablePath,
      eventType: 'session_terminated_uac',
    };

    // Terminate the elevated process
    this.addon.terminateProcess(event.pid);

    // Log the event
    this.blockedLog.push(uacEvent);

    // Trigger session termination
    if (this.onSessionTerminate) {
      this.onSessionTerminate('privilege_escalation_detected', uacEvent);
    }

    // Stop monitoring — session is being terminated
    this.stop();
  }
}
