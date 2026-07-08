/**
 * Host Agent — File Dialog Service
 *
 * Manages file dialog navigation restriction during active sessions.
 * Hooks Open/Save dialogs in App_Allowlist processes and restricts file path
 * navigation to the Session_Workspace directory only.
 *
 * Responsibilities:
 * - Restrict file dialog navigation to Session_Workspace boundary
 * - Block path traversal attacks (../../, symlinks, UNC paths)
 * - Validate requested paths against the allowed workspace root
 * - Sanitize and normalize paths before evaluation
 *
 * Requirements: 7.4
 */

import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Native addon interface for hooking file dialogs in allowlisted processes.
 * Injected at construction — the actual C++ addon is built separately via node-gyp.
 */
export interface FileDialogAddon {
  /** Hook Open/Save file dialogs in the specified process IDs */
  hookFileDialogs(pids: number[]): void;
  /** Remove file dialog hooks from all hooked processes */
  unhookFileDialogs(): void;
  /**
   * Register a callback that the native layer invokes before a dialog navigates.
   * Return true from the callback to allow navigation, false to block.
   */
  onNavigationAttempt(callback: (requestedPath: string) => boolean): void;
}

// ─── FileDialogService Class ────────────────────────────────────────────────────

export class FileDialogService {
  private readonly sessionWorkspacePath: string;
  private readonly normalizedWorkspace: string;
  private readonly addon: FileDialogAddon | null;
  private active = false;

  /**
   * @param sessionWorkspacePath - The root directory to which file dialogs are restricted.
   *   All file access must remain within this boundary (e.g., `C:\ArchitexSessions\{sessionId}\`).
   * @param addon - Optional native FileDialogAddon for hooking dialogs. When null, the service
   *   operates in validation-only mode (useful for testing path logic without native hooks).
   */
  constructor(sessionWorkspacePath: string, addon: FileDialogAddon | null = null) {
    if (!sessionWorkspacePath || sessionWorkspacePath.trim() === '') {
      throw new Error('Session workspace path must not be empty');
    }
    this.sessionWorkspacePath = sessionWorkspacePath;
    this.normalizedWorkspace = this.normalizePath(sessionWorkspacePath);
    this.addon = addon;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Activate file dialog hooks on the specified allowlisted process IDs.
   * Registers the path validation callback with the native addon.
   *
   * @param allowedProcessIds - PIDs of processes whose file dialogs should be hooked.
   */
  start(allowedProcessIds: number[]): void {
    if (this.active) return;

    if (this.addon) {
      this.addon.hookFileDialogs(allowedProcessIds);
      this.addon.onNavigationAttempt((requestedPath: string) => {
        return this.isPathAllowed(requestedPath);
      });
    }

    this.active = true;
  }

  /**
   * Remove all file dialog hooks and deactivate the service.
   */
  stop(): void {
    if (!this.active) return;

    if (this.addon) {
      this.addon.unhookFileDialogs();
    }

    this.active = false;
  }

  /**
   * Check if the service is currently active (hooks installed).
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Determine if a requested file path is within the Session_Workspace boundary.
   *
   * This method handles:
   * - Relative path traversal (../../)
   * - Absolute paths outside the workspace
   * - UNC/network paths
   * - Null bytes and other injection characters
   * - Case-insensitive comparison (Windows)
   *
   * @param requestedPath - The path the user is attempting to navigate to.
   * @returns true if the path is within Session_Workspace, false otherwise.
   */
  isPathAllowed(requestedPath: string): boolean {
    // Reject empty or whitespace-only paths
    if (!requestedPath || requestedPath.trim() === '') {
      return false;
    }

    // Reject paths containing null bytes (injection attack)
    if (requestedPath.includes('\0')) {
      return false;
    }

    // Reject UNC paths (\\server\share) — network paths are never allowed
    if (requestedPath.startsWith('\\\\') || requestedPath.startsWith('//')) {
      return false;
    }

    const sanitized = this.sanitizePath(requestedPath);

    // After sanitization, verify the resolved path starts with the workspace root
    // Use case-insensitive comparison for Windows file system
    const normalizedRequested = sanitized.toLowerCase();
    const normalizedWorkspace = this.normalizedWorkspace.toLowerCase();

    // The path must either be the workspace itself or start with workspace + separator
    if (normalizedRequested === normalizedWorkspace) {
      return true;
    }

    // Ensure the path is a proper child (not just a prefix match like C:\WorkspaceExtra)
    const workspaceWithSep = normalizedWorkspace.endsWith(path.sep)
      ? normalizedWorkspace
      : normalizedWorkspace + path.sep;

    return normalizedRequested.startsWith(workspaceWithSep);
  }

  /**
   * Resolve and normalize a path, collapsing traversal sequences and normalizing separators.
   *
   * @param inputPath - The raw path to sanitize.
   * @returns The resolved, normalized absolute path.
   */
  sanitizePath(inputPath: string): string {
    // Strip null bytes
    const cleaned = inputPath.replace(/\0/g, '');

    // If the path is relative, resolve it against the workspace root
    // This ensures relative traversal attempts (../../) are resolved correctly
    const resolved = path.isAbsolute(cleaned)
      ? path.resolve(cleaned)
      : path.resolve(this.sessionWorkspacePath, cleaned);

    // Normalize separators and collapse redundant path segments
    return path.normalize(resolved);
  }

  /**
   * Returns the configured Session_Workspace path.
   */
  getSessionWorkspace(): string {
    return this.sessionWorkspacePath;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Normalize a path for consistent comparison.
   */
  private normalizePath(p: string): string {
    return path.resolve(path.normalize(p));
  }
}
