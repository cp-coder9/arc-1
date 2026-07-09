/**
 * Tests for FileDialogService
 *
 * Validates file dialog path restriction behaviour: path boundary enforcement,
 * traversal attack prevention, sanitization, and lifecycle management.
 *
 * Requirements: 7.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import {
  FileDialogService,
  type FileDialogAddon,
} from '../fileDialogService';

// ─── Mock Native Addon ──────────────────────────────────────────────────────────

function createMockAddon(): FileDialogAddon {
  return {
    hookFileDialogs: vi.fn(),
    unhookFileDialogs: vi.fn(),
    onNavigationAttempt: vi.fn(),
  };
}

// ─── Test Constants ─────────────────────────────────────────────────────────────

const WORKSPACE = path.resolve('C:\\ArchitexSessions\\session-abc-123');

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('FileDialogService', () => {
  let mockAddon: FileDialogAddon;
  let service: FileDialogService;

  beforeEach(() => {
    mockAddon = createMockAddon();
    service = new FileDialogService(WORKSPACE, mockAddon);
  });

  // ─── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should store the session workspace path', () => {
      expect(service.getSessionWorkspace()).toBe(WORKSPACE);
    });

    it('should throw if workspace path is empty', () => {
      expect(() => new FileDialogService('')).toThrow('Session workspace path must not be empty');
    });

    it('should throw if workspace path is whitespace only', () => {
      expect(() => new FileDialogService('   ')).toThrow('Session workspace path must not be empty');
    });

    it('should work without a native addon (validation-only mode)', () => {
      const svc = new FileDialogService(WORKSPACE);
      expect(svc.getSessionWorkspace()).toBe(WORKSPACE);
    });
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should not be active before start() is called', () => {
      expect(service.isActive()).toBe(false);
    });

    it('should hook file dialogs on start()', () => {
      const pids = [1001, 2002, 3003];
      service.start(pids);

      expect(service.isActive()).toBe(true);
      expect(mockAddon.hookFileDialogs).toHaveBeenCalledWith(pids);
      expect(mockAddon.onNavigationAttempt).toHaveBeenCalledTimes(1);
    });

    it('should unhook file dialogs on stop()', () => {
      service.start([1001]);
      service.stop();

      expect(service.isActive()).toBe(false);
      expect(mockAddon.unhookFileDialogs).toHaveBeenCalledTimes(1);
    });

    it('should not call hookFileDialogs again if already active', () => {
      service.start([1001]);
      service.start([1001]);

      expect(mockAddon.hookFileDialogs).toHaveBeenCalledTimes(1);
    });

    it('should not call unhookFileDialogs if not active', () => {
      service.stop();

      expect(mockAddon.unhookFileDialogs).not.toHaveBeenCalled();
    });

    it('should allow restart after stop', () => {
      service.start([1001]);
      service.stop();
      service.start([2002]);

      expect(service.isActive()).toBe(true);
      expect(mockAddon.hookFileDialogs).toHaveBeenCalledTimes(2);
    });

    it('should register a navigation callback that invokes isPathAllowed', () => {
      service.start([1001]);

      const callback = (mockAddon.onNavigationAttempt as ReturnType<typeof vi.fn>).mock.calls[0][0] as (p: string) => boolean;

      // Path inside workspace should be allowed
      expect(callback(path.join(WORKSPACE, 'output.dwg'))).toBe(true);
      // Path outside workspace should be blocked
      expect(callback('C:\\Windows\\System32')).toBe(false);
    });

    it('should work in validation-only mode without addon', () => {
      const svc = new FileDialogService(WORKSPACE);
      svc.start([1001]);
      expect(svc.isActive()).toBe(true);
      svc.stop();
      expect(svc.isActive()).toBe(false);
    });
  });

  // ─── isPathAllowed — Paths Within Workspace ─────────────────────────────────

  describe('isPathAllowed — allowed paths', () => {
    it('should allow the workspace root itself', () => {
      expect(service.isPathAllowed(WORKSPACE)).toBe(true);
    });

    it('should allow a file directly in the workspace', () => {
      const filePath = path.join(WORKSPACE, 'drawing.dwg');
      expect(service.isPathAllowed(filePath)).toBe(true);
    });

    it('should allow a nested subdirectory', () => {
      const subDir = path.join(WORKSPACE, 'exports', 'pdf');
      expect(service.isPathAllowed(subDir)).toBe(true);
    });

    it('should allow a deeply nested file', () => {
      const deepFile = path.join(WORKSPACE, 'project', 'rev2', 'final', 'output.pdf');
      expect(service.isPathAllowed(deepFile)).toBe(true);
    });

    it('should allow paths with trailing separator', () => {
      const trailingPath = WORKSPACE + path.sep;
      expect(service.isPathAllowed(trailingPath)).toBe(true);
    });
  });

  // ─── isPathAllowed — Paths Outside Workspace ────────────────────────────────

  describe('isPathAllowed — blocked paths', () => {
    it('should block an absolute path outside the workspace', () => {
      expect(service.isPathAllowed('C:\\Windows\\System32')).toBe(false);
    });

    it('should block the parent directory of the workspace', () => {
      const parent = path.dirname(WORKSPACE);
      expect(service.isPathAllowed(parent)).toBe(false);
    });

    it('should block a sibling directory of the workspace', () => {
      const sibling = path.join(path.dirname(WORKSPACE), 'other-session');
      expect(service.isPathAllowed(sibling)).toBe(false);
    });

    it('should block the root drive', () => {
      expect(service.isPathAllowed('C:\\')).toBe(false);
    });

    it('should block user profile paths', () => {
      expect(service.isPathAllowed('C:\\Users\\Owner\\Documents')).toBe(false);
    });

    it('should block a path that is a prefix but not a child', () => {
      // e.g., workspace is "session-abc-123", attacker tries "session-abc-123-extra"
      const prefixAttack = WORKSPACE + '-extra\\file.txt';
      expect(service.isPathAllowed(prefixAttack)).toBe(false);
    });
  });

  // ─── isPathAllowed — Traversal Attacks ──────────────────────────────────────

  describe('isPathAllowed — traversal attacks', () => {
    it('should block ../ traversal to parent', () => {
      const traversal = path.join(WORKSPACE, '..', 'other-session');
      expect(service.isPathAllowed(traversal)).toBe(false);
    });

    it('should block ../../ multi-level traversal', () => {
      const traversal = path.join(WORKSPACE, '..', '..', 'Windows', 'System32');
      expect(service.isPathAllowed(traversal)).toBe(false);
    });

    it('should block traversal from subdirectory', () => {
      const traversal = path.join(WORKSPACE, 'subdir', '..', '..', 'secret');
      expect(service.isPathAllowed(traversal)).toBe(false);
    });

    it('should allow traversal that stays within workspace', () => {
      // subdir/../file.txt resolves to workspace/file.txt — still in workspace
      const traversal = path.join(WORKSPACE, 'subdir', '..', 'file.txt');
      expect(service.isPathAllowed(traversal)).toBe(true);
    });

    it('should block relative paths that escape workspace', () => {
      expect(service.isPathAllowed('..\\..\\Windows\\System32')).toBe(false);
    });

    it('should block UNC paths', () => {
      expect(service.isPathAllowed('\\\\server\\share\\file.txt')).toBe(false);
    });

    it('should block forward-slash UNC paths', () => {
      expect(service.isPathAllowed('//server/share/file.txt')).toBe(false);
    });

    it('should block paths with null bytes', () => {
      expect(service.isPathAllowed(WORKSPACE + '\\file.txt\0.exe')).toBe(false);
    });
  });

  // ─── isPathAllowed — Edge Cases ─────────────────────────────────────────────

  describe('isPathAllowed — edge cases', () => {
    it('should reject empty string', () => {
      expect(service.isPathAllowed('')).toBe(false);
    });

    it('should reject whitespace-only string', () => {
      expect(service.isPathAllowed('   ')).toBe(false);
    });

    it('should handle case-insensitive comparison (Windows)', () => {
      const upperPath = WORKSPACE.toUpperCase() + '\\FILE.DWG';
      expect(service.isPathAllowed(upperPath)).toBe(true);
    });

    it('should handle mixed forward/backward slashes', () => {
      const mixedSlashes = WORKSPACE.replace(/\\/g, '/') + '/output.pdf';
      expect(service.isPathAllowed(mixedSlashes)).toBe(true);
    });

    it('should handle relative path within workspace', () => {
      // A relative path is resolved against workspace root
      expect(service.isPathAllowed('output.pdf')).toBe(true);
    });

    it('should handle dot path (current directory)', () => {
      expect(service.isPathAllowed('.')).toBe(true);
    });
  });

  // ─── sanitizePath ──────────────────────────────────────────────────────────

  describe('sanitizePath', () => {
    it('should resolve absolute paths unchanged', () => {
      const input = 'C:\\ArchitexSessions\\session-abc-123\\file.txt';
      const result = service.sanitizePath(input);
      expect(result).toBe(path.resolve(input));
    });

    it('should resolve relative paths against workspace', () => {
      const result = service.sanitizePath('output.pdf');
      expect(result).toBe(path.resolve(WORKSPACE, 'output.pdf'));
    });

    it('should collapse ../ sequences', () => {
      const result = service.sanitizePath(path.join(WORKSPACE, 'sub', '..', 'file.txt'));
      expect(result).toBe(path.resolve(WORKSPACE, 'file.txt'));
    });

    it('should strip null bytes', () => {
      const result = service.sanitizePath(WORKSPACE + '\\file\0.txt');
      expect(result).toBe(path.resolve(WORKSPACE, 'file.txt'));
    });

    it('should normalize redundant separators', () => {
      const result = service.sanitizePath(WORKSPACE + '\\\\sub\\\\file.txt');
      expect(result).toBe(path.resolve(WORKSPACE, 'sub', 'file.txt'));
    });
  });

  // ─── getSessionWorkspace ────────────────────────────────────────────────────

  describe('getSessionWorkspace', () => {
    it('should return the path passed to the constructor', () => {
      expect(service.getSessionWorkspace()).toBe(WORKSPACE);
    });

    it('should remain constant regardless of service state', () => {
      service.start([1001]);
      expect(service.getSessionWorkspace()).toBe(WORKSPACE);
      service.stop();
      expect(service.getSessionWorkspace()).toBe(WORKSPACE);
    });
  });
});
