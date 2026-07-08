/**
 * Host Agent — Input Filter Service
 *
 * Implements input sandboxing and system shortcut blocking during active sessions.
 * Uses native low-level keyboard/mouse hooks (via injected native addon) to intercept
 * and block system escape shortcuts, preventing the Resource_Consumer from escaping
 * the approved application context.
 *
 * Responsibilities:
 * - Install/remove low-level keyboard and mouse hooks via native addon
 * - Block system shortcuts: Alt+Tab, Win key, Ctrl+Esc, Alt+F4 (non-allowlist), Ctrl+Alt+Del, Ctrl+Shift+Esc
 * - Block process launches: cmd.exe, powershell.exe, wt.exe, bash.exe, wsl.exe, explorer.exe
 * - Block all escape methods: keyboard shortcuts, application menus, file dialogs, drag-and-drop
 *
 * Requirements: 7.1, 7.2
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export type KeyModifier = 'alt' | 'ctrl' | 'shift' | 'win';

export interface KeyCombo {
  key: string;
  modifiers: KeyModifier[];
}

/**
 * Native addon interface for low-level input hooks.
 * Injected at construction — the actual C++ addon is built separately via node-gyp.
 */
export interface InputFilterAddon {
  /** Install low-level keyboard/mouse hooks, scoped to allowed window handles */
  installHooks(allowedHwnds: number[]): void;
  /** Remove all installed hooks */
  removeHooks(): void;
  /** Block specific key combinations system-wide during session */
  blockSystemShortcuts(shortcuts: KeyCombo[]): void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/**
 * System shortcuts that must be blocked during active sessions.
 * Alt+F4 is only blocked on windows NOT in the allowlist — handled by the native layer.
 */
const BLOCKED_SHORTCUTS: KeyCombo[] = [
  { key: 'Tab', modifiers: ['alt'] },
  { key: 'Meta', modifiers: ['win'] },
  { key: 'Escape', modifiers: ['ctrl'] },
  { key: 'Delete', modifiers: ['ctrl', 'alt'] },
  { key: 'Escape', modifiers: ['ctrl', 'shift'] },
  { key: 'F4', modifiers: ['alt'] },
];

/**
 * Executable names that are unconditionally blocked from launching during sessions.
 * Blocks command-line shells, terminal emulators, and Windows Explorer.
 */
const BLOCKED_PROCESSES: string[] = [
  'cmd.exe',
  'powershell.exe',
  'wt.exe',
  'bash.exe',
  'wsl.exe',
  'explorer.exe',
];

// ─── InputFilterService Class ───────────────────────────────────────────────────

export class InputFilterService {
  private readonly allowedProcessIds: number[];
  private readonly addon: InputFilterAddon;
  private active = false;

  /**
   * @param allowedProcessIds - PIDs of processes in the App_Allowlist for this session.
   *   Alt+F4 is permitted on windows belonging to these processes.
   * @param addon - The native InputFilterAddon (injected for testability).
   */
  constructor(allowedProcessIds: number[], addon: InputFilterAddon) {
    this.allowedProcessIds = [...allowedProcessIds];
    this.addon = addon;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Install low-level keyboard/mouse hooks via the native addon.
   * Configures the blocked shortcut list and allowed window handles.
   */
  start(): void {
    if (this.active) return;

    // Convert allowed PIDs to HWNDs — the native addon resolves windows from PIDs internally.
    // Here we pass PIDs as the HWND identifiers since the native layer handles the mapping.
    this.addon.installHooks(this.allowedProcessIds);
    this.addon.blockSystemShortcuts(BLOCKED_SHORTCUTS);
    this.active = true;
  }

  /**
   * Remove all installed hooks and restore normal input processing.
   */
  stop(): void {
    if (!this.active) return;

    this.addon.removeHooks();
    this.active = false;
  }

  /**
   * Check if the service is currently active (hooks installed).
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Pure function: determine if a given key combination should be blocked.
   *
   * Alt+F4 is a special case — it is only blocked on windows NOT in the allowlist.
   * Since this is a pure check without window context, Alt+F4 is reported as blocked
   * (the native layer handles the allowlist exception at runtime).
   *
   * @param keyCombo - The key combination to evaluate
   * @returns true if the shortcut should be blocked
   */
  isShortcutBlocked(keyCombo: KeyCombo): boolean {
    return BLOCKED_SHORTCUTS.some(
      (blocked) =>
        blocked.key.toLowerCase() === keyCombo.key.toLowerCase() &&
        blocked.modifiers.length === keyCombo.modifiers.length &&
        blocked.modifiers.every((mod) => keyCombo.modifiers.includes(mod))
    );
  }

  /**
   * Check if a process executable name is on the blocked list.
   * Comparison is case-insensitive.
   *
   * @param executableName - The executable name to check (e.g., "cmd.exe")
   * @returns true if the process should be blocked from launching
   */
  isProcessBlocked(executableName: string): boolean {
    const normalised = executableName.toLowerCase().trim();
    return BLOCKED_PROCESSES.some((blocked) => blocked.toLowerCase() === normalised);
  }

  /**
   * Get the complete list of blocked shortcut combinations.
   */
  getBlockedShortcuts(): KeyCombo[] {
    return [...BLOCKED_SHORTCUTS];
  }

  /**
   * Get the complete list of blocked executable names.
   */
  getBlockedProcesses(): string[] {
    return [...BLOCKED_PROCESSES];
  }
}
