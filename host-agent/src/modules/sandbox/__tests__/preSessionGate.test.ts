/**
 * Tests for Pre-Session Verification Gate
 *
 * Validates that the pre-session gate correctly verifies prerequisites before
 * granting input control to a Resource_Consumer:
 * 1. App_Allowlist must have ≥1 entry
 * 2. Session_Workspace path must exist and be writable
 *
 * Only when both pass is input control granted.
 *
 * Requirements: 7.7
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import {
  verifySessionPrerequisites,
  ERRORS,
  type AllowlistEntry,
  type FileSystemAccessor,
} from '../preSessionGate';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createValidAllowlist(count = 1): AllowlistEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    appId: `app-${i}`,
    displayName: `Application ${i}`,
    executablePath: `C:\\Program Files\\App${i}\\app${i}.exe`,
  }));
}

function createMockFs(overrides: Partial<FileSystemAccessor> = {}): FileSystemAccessor {
  return {
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    accessSync: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('verifySessionPrerequisites', () => {
  const validWorkspace = 'C:\\ArchitexSessions\\session-abc';

  // ─── Both Checks Pass ─────────────────────────────────────────────────────

  describe('when all prerequisites are met', () => {
    it('should return ready: true with no errors', () => {
      const mockFs = createMockFs();
      const result = verifySessionPrerequisites(
        createValidAllowlist(1),
        validWorkspace,
        mockFs
      );

      expect(result.ready).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return ready: true with multiple allowlist entries', () => {
      const mockFs = createMockFs();
      const result = verifySessionPrerequisites(
        createValidAllowlist(5),
        validWorkspace,
        mockFs
      );

      expect(result.ready).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should check workspace existence, directory status, and write access', () => {
      const mockFs = createMockFs();
      verifySessionPrerequisites(createValidAllowlist(), validWorkspace, mockFs);

      expect(mockFs.existsSync).toHaveBeenCalledWith(validWorkspace);
      expect(mockFs.statSync).toHaveBeenCalledWith(validWorkspace);
      expect(mockFs.accessSync).toHaveBeenCalledWith(validWorkspace, fs.constants.W_OK);
    });
  });

  // ─── Allowlist Failures ───────────────────────────────────────────────────

  describe('when allowlist is empty or missing', () => {
    it('should return ready: false when allowlist is empty', () => {
      const mockFs = createMockFs();
      const result = verifySessionPrerequisites([], validWorkspace, mockFs);

      expect(result.ready).toBe(false);
      expect(result.errors).toContain(ERRORS.ALLOWLIST_EMPTY);
    });

    it('should return ready: false when allowlist is null/undefined', () => {
      const mockFs = createMockFs();
      const result = verifySessionPrerequisites(
        null as unknown as AllowlistEntry[],
        validWorkspace,
        mockFs
      );

      expect(result.ready).toBe(false);
      expect(result.errors).toContain(ERRORS.ALLOWLIST_EMPTY);
    });
  });

  // ─── Workspace Failures ───────────────────────────────────────────────────

  describe('when workspace path is invalid', () => {
    it('should return error when workspace path does not exist', () => {
      const mockFs = createMockFs({
        existsSync: vi.fn().mockReturnValue(false),
      });
      const result = verifySessionPrerequisites(
        createValidAllowlist(),
        validWorkspace,
        mockFs
      );

      expect(result.ready).toBe(false);
      expect(result.errors).toContain(ERRORS.WORKSPACE_NOT_FOUND(validWorkspace));
    });

    it('should return error when workspace path is not a directory', () => {
      const mockFs = createMockFs({
        statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
      });
      const result = verifySessionPrerequisites(
        createValidAllowlist(),
        validWorkspace,
        mockFs
      );

      expect(result.ready).toBe(false);
      expect(result.errors).toContain(ERRORS.WORKSPACE_NOT_DIRECTORY(validWorkspace));
    });

    it('should return error when workspace path is not writable', () => {
      const mockFs = createMockFs({
        accessSync: vi.fn().mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        }),
      });
      const result = verifySessionPrerequisites(
        createValidAllowlist(),
        validWorkspace,
        mockFs
      );

      expect(result.ready).toBe(false);
      expect(result.errors).toContain(ERRORS.WORKSPACE_NOT_WRITABLE(validWorkspace));
    });

    it('should return error when workspace path is empty string', () => {
      const mockFs = createMockFs();
      const result = verifySessionPrerequisites(
        createValidAllowlist(),
        '',
        mockFs
      );

      expect(result.ready).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error when workspace path is whitespace only', () => {
      const mockFs = createMockFs();
      const result = verifySessionPrerequisites(
        createValidAllowlist(),
        '   ',
        mockFs
      );

      expect(result.ready).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ─── Both Checks Fail ─────────────────────────────────────────────────────

  describe('when both checks fail', () => {
    it('should return multiple errors when allowlist is empty AND workspace missing', () => {
      const mockFs = createMockFs({
        existsSync: vi.fn().mockReturnValue(false),
      });
      const result = verifySessionPrerequisites([], validWorkspace, mockFs);

      expect(result.ready).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain(ERRORS.ALLOWLIST_EMPTY);
      expect(result.errors).toContain(ERRORS.WORKSPACE_NOT_FOUND(validWorkspace));
    });

    it('should return multiple errors when allowlist is empty AND workspace not writable', () => {
      const mockFs = createMockFs({
        accessSync: vi.fn().mockImplementation(() => {
          throw new Error('EACCES');
        }),
      });
      const result = verifySessionPrerequisites([], validWorkspace, mockFs);

      expect(result.ready).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain(ERRORS.ALLOWLIST_EMPTY);
      expect(result.errors).toContain(ERRORS.WORKSPACE_NOT_WRITABLE(validWorkspace));
    });
  });

  // ─── Input Control Gate ───────────────────────────────────────────────────

  describe('input control gating', () => {
    it('should only be ready (grant input control) when BOTH checks pass', () => {
      const mockFs = createMockFs();

      // Both pass → ready
      const pass = verifySessionPrerequisites(createValidAllowlist(), validWorkspace, mockFs);
      expect(pass.ready).toBe(true);

      // Allowlist fails → not ready
      const failAllow = verifySessionPrerequisites([], validWorkspace, mockFs);
      expect(failAllow.ready).toBe(false);

      // Workspace fails → not ready
      const mockFsFail = createMockFs({ existsSync: vi.fn().mockReturnValue(false) });
      const failWs = verifySessionPrerequisites(createValidAllowlist(), validWorkspace, mockFsFail);
      expect(failWs.ready).toBe(false);
    });
  });

  // ─── Error Messages ───────────────────────────────────────────────────────

  describe('error messages', () => {
    it('should include workspace path in error messages', () => {
      const customPath = 'D:\\Custom\\Workspace\\path';
      const mockFs = createMockFs({ existsSync: vi.fn().mockReturnValue(false) });

      const result = verifySessionPrerequisites(createValidAllowlist(), customPath, mockFs);

      expect(result.errors[0]).toContain(customPath);
    });

    it('should provide a detailed error for each failed check', () => {
      const mockFs = createMockFs({ existsSync: vi.fn().mockReturnValue(false) });
      const result = verifySessionPrerequisites([], 'C:\\Missing', mockFs);

      // Each error should be a meaningful, non-empty string
      result.errors.forEach((err) => {
        expect(err.length).toBeGreaterThan(10);
      });
    });
  });
});
