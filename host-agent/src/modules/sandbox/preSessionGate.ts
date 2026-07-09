/**
 * Host Agent — Pre-Session Verification Gate
 *
 * Verifies that all prerequisites are met before granting a Resource_Consumer
 * input control at session start. The gate checks:
 * 1. App_Allowlist has at least one entry
 * 2. Session_Workspace path exists and is accessible (writable)
 *
 * Only when both checks pass is input control granted to the Resource_Consumer.
 *
 * Requirements: 7.7
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AllowlistEntry {
  appId: string;
  displayName: string;
  executablePath: string;
}

export interface PreSessionVerificationResult {
  ready: boolean;
  errors: string[];
}

// ─── File System Accessor (injectable for testing) ──────────────────────────────

export interface FileSystemAccessor {
  /** Check if a directory exists */
  existsSync(dirPath: string): boolean;
  /** Check if a path is a directory */
  statSync(dirPath: string): { isDirectory(): boolean };
  /** Try writing a temp file to verify write access */
  accessSync(dirPath: string, mode: number): void;
}

const defaultFs: FileSystemAccessor = {
  existsSync: (dirPath: string) => fs.existsSync(dirPath),
  statSync: (dirPath: string) => fs.statSync(dirPath),
  accessSync: (dirPath: string, mode: number) => fs.accessSync(dirPath, mode),
};

// ─── Constants ──────────────────────────────────────────────────────────────────

export const ERRORS = {
  ALLOWLIST_EMPTY: 'App_Allowlist must contain at least one entry before a session can start.',
  WORKSPACE_NOT_FOUND: (wsPath: string) =>
    `Session_Workspace path does not exist: "${wsPath}".`,
  WORKSPACE_NOT_DIRECTORY: (wsPath: string) =>
    `Session_Workspace path is not a directory: "${wsPath}".`,
  WORKSPACE_NOT_WRITABLE: (wsPath: string) =>
    `Session_Workspace path is not writable: "${wsPath}".`,
} as const;

// ─── Pre-Session Verification ───────────────────────────────────────────────────

/**
 * Verify that all session prerequisites are met before granting input control.
 *
 * Checks:
 * 1. The allowlist contains at least one entry.
 * 2. The workspace path exists, is a directory, and is writable.
 *
 * @param allowlist - The App_Allowlist for this session
 * @param workspacePath - The Session_Workspace directory path
 * @param fsAccessor - Optional file system accessor (for testability)
 * @returns A result indicating readiness and any errors encountered
 */
export function verifySessionPrerequisites(
  allowlist: AllowlistEntry[],
  workspacePath: string,
  fsAccessor: FileSystemAccessor = defaultFs
): PreSessionVerificationResult {
  const errors: string[] = [];

  // Check 1: Allowlist must have at least one entry
  if (!allowlist || allowlist.length === 0) {
    errors.push(ERRORS.ALLOWLIST_EMPTY);
  }

  // Check 2: Workspace path must exist, be a directory, and be writable
  if (!workspacePath || workspacePath.trim() === '') {
    errors.push(ERRORS.WORKSPACE_NOT_FOUND(workspacePath ?? ''));
  } else {
    try {
      if (!fsAccessor.existsSync(workspacePath)) {
        errors.push(ERRORS.WORKSPACE_NOT_FOUND(workspacePath));
      } else {
        const stat = fsAccessor.statSync(workspacePath);
        if (!stat.isDirectory()) {
          errors.push(ERRORS.WORKSPACE_NOT_DIRECTORY(workspacePath));
        } else {
          // Verify write access
          fsAccessor.accessSync(workspacePath, fs.constants.W_OK);
        }
      }
    } catch {
      errors.push(ERRORS.WORKSPACE_NOT_WRITABLE(workspacePath));
    }
  }

  return {
    ready: errors.length === 0,
    errors,
  };
}
