/**
 * Tests for InputFilterService
 *
 * Validates input sandbox behaviour: system shortcut blocking, process blocking,
 * and lifecycle management of native keyboard/mouse hooks.
 *
 * Requirements: 7.1, 7.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InputFilterService,
  type InputFilterAddon,
  type KeyCombo,
} from '../inputFilterService';

// ─── Mock Native Addon ──────────────────────────────────────────────────────────

function createMockAddon(): InputFilterAddon {
  return {
    installHooks: vi.fn(),
    removeHooks: vi.fn(),
    blockSystemShortcuts: vi.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('InputFilterService', () => {
  let mockAddon: InputFilterAddon;
  let service: InputFilterService;
  const allowedPids = [1234, 5678, 9012];

  beforeEach(() => {
    mockAddon = createMockAddon();
    service = new InputFilterService(allowedPids, mockAddon);
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should not be active before start() is called', () => {
      expect(service.isActive()).toBe(false);
    });

    it('should install hooks and block shortcuts on start()', () => {
      service.start();

      expect(service.isActive()).toBe(true);
      expect(mockAddon.installHooks).toHaveBeenCalledWith(allowedPids);
      expect(mockAddon.blockSystemShortcuts).toHaveBeenCalledTimes(1);
    });

    it('should pass the full blocked shortcuts list to the addon on start()', () => {
      service.start();

      const passedShortcuts = (mockAddon.blockSystemShortcuts as ReturnType<typeof vi.fn>).mock.calls[0][0] as KeyCombo[];
      expect(passedShortcuts.length).toBe(6);
    });

    it('should remove hooks on stop()', () => {
      service.start();
      service.stop();

      expect(service.isActive()).toBe(false);
      expect(mockAddon.removeHooks).toHaveBeenCalledTimes(1);
    });

    it('should not call installHooks again if already active', () => {
      service.start();
      service.start();

      expect(mockAddon.installHooks).toHaveBeenCalledTimes(1);
    });

    it('should not call removeHooks if not active', () => {
      service.stop();

      expect(mockAddon.removeHooks).not.toHaveBeenCalled();
    });

    it('should allow restart after stop', () => {
      service.start();
      service.stop();
      service.start();

      expect(service.isActive()).toBe(true);
      expect(mockAddon.installHooks).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Shortcut Blocking ──────────────────────────────────────────────────────

  describe('isShortcutBlocked', () => {
    it('should block Alt+Tab', () => {
      expect(service.isShortcutBlocked({ key: 'Tab', modifiers: ['alt'] })).toBe(true);
    });

    it('should block Win key (alone)', () => {
      expect(service.isShortcutBlocked({ key: 'Meta', modifiers: ['win'] })).toBe(true);
    });

    it('should block Ctrl+Esc', () => {
      expect(service.isShortcutBlocked({ key: 'Escape', modifiers: ['ctrl'] })).toBe(true);
    });

    it('should block Alt+F4', () => {
      expect(service.isShortcutBlocked({ key: 'F4', modifiers: ['alt'] })).toBe(true);
    });

    it('should block Ctrl+Alt+Del', () => {
      expect(service.isShortcutBlocked({ key: 'Delete', modifiers: ['ctrl', 'alt'] })).toBe(true);
    });

    it('should block Ctrl+Shift+Esc (Task Manager)', () => {
      expect(service.isShortcutBlocked({ key: 'Escape', modifiers: ['ctrl', 'shift'] })).toBe(true);
    });

    it('should NOT block unrelated shortcuts', () => {
      expect(service.isShortcutBlocked({ key: 'S', modifiers: ['ctrl'] })).toBe(false);
      expect(service.isShortcutBlocked({ key: 'C', modifiers: ['ctrl'] })).toBe(false);
      expect(service.isShortcutBlocked({ key: 'Z', modifiers: ['ctrl'] })).toBe(false);
    });

    it('should be case-insensitive for key names', () => {
      expect(service.isShortcutBlocked({ key: 'tab', modifiers: ['alt'] })).toBe(true);
      expect(service.isShortcutBlocked({ key: 'TAB', modifiers: ['alt'] })).toBe(true);
      expect(service.isShortcutBlocked({ key: 'escape', modifiers: ['ctrl'] })).toBe(true);
    });

    it('should require exact modifier match', () => {
      // Alt+Tab is blocked, but Ctrl+Alt+Tab is not
      expect(service.isShortcutBlocked({ key: 'Tab', modifiers: ['ctrl', 'alt'] })).toBe(false);
      // Ctrl+Esc is blocked, but Ctrl+Shift+Esc is a separate entry
      expect(service.isShortcutBlocked({ key: 'Escape', modifiers: ['ctrl'] })).toBe(true);
    });

    it('should match modifiers regardless of order', () => {
      expect(service.isShortcutBlocked({ key: 'Delete', modifiers: ['alt', 'ctrl'] })).toBe(true);
      expect(service.isShortcutBlocked({ key: 'Escape', modifiers: ['shift', 'ctrl'] })).toBe(true);
    });
  });

  // ─── Process Blocking ───────────────────────────────────────────────────────

  describe('isProcessBlocked', () => {
    it('should block cmd.exe', () => {
      expect(service.isProcessBlocked('cmd.exe')).toBe(true);
    });

    it('should block powershell.exe', () => {
      expect(service.isProcessBlocked('powershell.exe')).toBe(true);
    });

    it('should block wt.exe (Windows Terminal)', () => {
      expect(service.isProcessBlocked('wt.exe')).toBe(true);
    });

    it('should block bash.exe', () => {
      expect(service.isProcessBlocked('bash.exe')).toBe(true);
    });

    it('should block wsl.exe', () => {
      expect(service.isProcessBlocked('wsl.exe')).toBe(true);
    });

    it('should block explorer.exe', () => {
      expect(service.isProcessBlocked('explorer.exe')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(service.isProcessBlocked('CMD.EXE')).toBe(true);
      expect(service.isProcessBlocked('PowerShell.exe')).toBe(true);
      expect(service.isProcessBlocked('Explorer.EXE')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(service.isProcessBlocked('  cmd.exe  ')).toBe(true);
    });

    it('should NOT block legitimate applications', () => {
      expect(service.isProcessBlocked('revit.exe')).toBe(false);
      expect(service.isProcessBlocked('archicad.exe')).toBe(false);
      expect(service.isProcessBlocked('notepad.exe')).toBe(false);
      expect(service.isProcessBlocked('chrome.exe')).toBe(false);
    });

    it('should NOT block similar but different names', () => {
      expect(service.isProcessBlocked('cmd2.exe')).toBe(false);
      expect(service.isProcessBlocked('mycmd.exe')).toBe(false);
      expect(service.isProcessBlocked('powershell_ise.exe')).toBe(false);
    });
  });

  // ─── Blocked Lists ─────────────────────────────────────────────────────────

  describe('getBlockedShortcuts', () => {
    it('should return all 6 blocked shortcut combinations', () => {
      const shortcuts = service.getBlockedShortcuts();
      expect(shortcuts).toHaveLength(6);
    });

    it('should return a copy (not the internal reference)', () => {
      const shortcuts = service.getBlockedShortcuts();
      shortcuts.push({ key: 'X', modifiers: ['ctrl'] });
      expect(service.getBlockedShortcuts()).toHaveLength(6);
    });

    it('should include all required blocked shortcuts', () => {
      const shortcuts = service.getBlockedShortcuts();
      const keys = shortcuts.map((s) => `${s.modifiers.sort().join('+')}+${s.key}`);

      expect(keys).toContain('alt+Tab');
      expect(keys).toContain('win+Meta');
      expect(keys).toContain('ctrl+Escape');
      expect(keys).toContain('alt+ctrl+Delete');
      expect(keys).toContain('ctrl+shift+Escape');
      expect(keys).toContain('alt+F4');
    });
  });

  describe('getBlockedProcesses', () => {
    it('should return all 6 blocked process names', () => {
      const processes = service.getBlockedProcesses();
      expect(processes).toHaveLength(6);
    });

    it('should return a copy (not the internal reference)', () => {
      const processes = service.getBlockedProcesses();
      processes.push('malware.exe');
      expect(service.getBlockedProcesses()).toHaveLength(6);
    });

    it('should include all required blocked executables', () => {
      const processes = service.getBlockedProcesses();
      expect(processes).toContain('cmd.exe');
      expect(processes).toContain('powershell.exe');
      expect(processes).toContain('wt.exe');
      expect(processes).toContain('bash.exe');
      expect(processes).toContain('wsl.exe');
      expect(processes).toContain('explorer.exe');
    });
  });

  // ─── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should store allowed process IDs as a defensive copy', () => {
      const pids = [100, 200];
      const svc = new InputFilterService(pids, mockAddon);
      pids.push(300);

      // Start the service — installHooks should receive original pids
      svc.start();
      expect(mockAddon.installHooks).toHaveBeenCalledWith([100, 200]);
    });
  });
});
