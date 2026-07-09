/**
 * Remote Desktop Core — File Handoff Service
 *
 * Manages the Session_Workspace lifecycle and file manifest generation:
 * - createSessionWorkspace(): Creates workspace directory for a session
 * - monitorWorkspace(): Starts file watcher, reports manifest every ≤10 seconds
 * - getFileManifest(): Returns current file manifest (name, size, extension, SHA-256 hash, status)
 * - compileAndWriteFinalManifest(): On session end, write to remote_desktop_file_manifests
 * - stopMonitoring(): Stops the file watcher for a session
 *
 * Uses Node.js fs/path modules and crypto for SHA-256 hashing.
 *
 * Requirements: 8.1, 8.2, 8.3
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { FileManifestEntry, RemoteDesktopFileManifest } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface SessionWorkspaceInfo {
  sessionId: string;
  workspacePath: string;
  createdAt: number; // Unix ms
}

export interface WorkspaceMonitorOptions {
  /** Polling interval in milliseconds (default: 10000 = 10s) */
  intervalMs?: number;
  /** Callback invoked on each manifest update */
  onManifestUpdate?: (sessionId: string, manifest: FileManifestEntry[]) => void;
}

export interface FinalManifestInput {
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
}

export interface FinalManifestResult {
  manifestId: string;
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  files: FileManifestEntry[];
  manifestTimestamp: number; // Unix ms
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Default base path for session workspaces on Windows */
export const DEFAULT_BASE_PATH = 'C:\\ArchitexSessions';

/** Maximum manifest reporting interval in milliseconds */
export const MAX_REPORT_INTERVAL_MS = 10_000;

/** Maximum number of files in a manifest */
export const MAX_MANIFEST_FILES = 200;

// ─── In-Memory State ────────────────────────────────────────────────────────────

/** Active workspace info per session */
const workspaces: Map<string, SessionWorkspaceInfo> = new Map();

/** Current file manifests per session */
const manifests: Map<string, FileManifestEntry[]> = new Map();

/** Active monitor intervals per session */
const monitors: Map<string, ReturnType<typeof setInterval>> = new Map();

/** Final manifests written (simulating Firestore write) */
const finalManifests: Map<string, FinalManifestResult> = new Map();

// ─── Workspace Creation ─────────────────────────────────────────────────────────

/**
 * Create a Session_Workspace directory at the configured path.
 *
 * Default: C:\ArchitexSessions\{sessionId}\
 * The path can be overridden via the basePath parameter (from host configuration).
 *
 * Requirements: 8.1
 */
export function createSessionWorkspace(
  sessionId: string,
  basePath?: string,
): SessionWorkspaceInfo {
  if (!sessionId || sessionId.trim().length === 0) {
    throw createError('workspace_inaccessible', 'Session ID is required to create a workspace');
  }

  const base = basePath?.trim() || DEFAULT_BASE_PATH;
  const workspacePath = join(base, sessionId);

  // Create directory (recursive in case base path doesn't exist)
  try {
    if (!existsSync(workspacePath)) {
      mkdirSync(workspacePath, { recursive: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw createError(
      'workspace_inaccessible',
      `Failed to create workspace directory at ${workspacePath}: ${message}`,
    );
  }

  // Verify the directory is accessible
  if (!existsSync(workspacePath)) {
    throw createError(
      'workspace_inaccessible',
      `Workspace directory was not created at ${workspacePath}`,
    );
  }

  const info: SessionWorkspaceInfo = {
    sessionId,
    workspacePath,
    createdAt: Date.now(),
  };

  workspaces.set(sessionId, info);
  manifests.set(sessionId, []);

  return info;
}

// ─── File Monitoring ────────────────────────────────────────────────────────────

/**
 * Start monitoring a workspace for new/modified files.
 * Reports manifest every ≤10 seconds.
 *
 * Requirements: 8.2
 */
export function monitorWorkspace(
  sessionId: string,
  workspacePath: string,
  options?: WorkspaceMonitorOptions,
): void {
  if (!sessionId || sessionId.trim().length === 0) {
    throw createError('workspace_inaccessible', 'Session ID is required to monitor a workspace');
  }

  if (!workspacePath || workspacePath.trim().length === 0) {
    throw createError('workspace_inaccessible', 'Workspace path is required to monitor');
  }

  // Stop existing monitor if present
  if (monitors.has(sessionId)) {
    stopMonitoring(sessionId);
  }

  const intervalMs = Math.min(
    options?.intervalMs ?? MAX_REPORT_INTERVAL_MS,
    MAX_REPORT_INTERVAL_MS,
  );

  // Perform initial scan
  const initialManifest = scanWorkspace(workspacePath);
  manifests.set(sessionId, initialManifest);

  if (options?.onManifestUpdate) {
    options.onManifestUpdate(sessionId, initialManifest);
  }

  // Set up periodic polling
  const interval = setInterval(() => {
    try {
      const updated = scanWorkspace(workspacePath);
      manifests.set(sessionId, updated);

      if (options?.onManifestUpdate) {
        options.onManifestUpdate(sessionId, updated);
      }
    } catch {
      // Silently continue — workspace may become inaccessible temporarily
    }
  }, intervalMs);

  monitors.set(sessionId, interval);
}

/**
 * Stop monitoring a workspace.
 */
export function stopMonitoring(sessionId: string): void {
  const interval = monitors.get(sessionId);
  if (interval) {
    clearInterval(interval);
    monitors.delete(sessionId);
  }
}

// ─── File Manifest ──────────────────────────────────────────────────────────────

/**
 * Get the current file manifest for a session.
 *
 * Returns an array of FileManifestEntry objects containing:
 * - name: filename
 * - sizeBytes: file size in bytes
 * - extension: file extension (including dot)
 * - sha256Hash: SHA-256 hash of file contents (64-char hex string)
 * - transferStatus: always 'pending' during active monitoring
 *
 * Requirements: 8.2, 8.3
 */
export function getFileManifest(sessionId: string): FileManifestEntry[] {
  if (!sessionId || sessionId.trim().length === 0) {
    return [];
  }

  const manifest = manifests.get(sessionId);
  if (!manifest) {
    return [];
  }

  // Return a defensive copy
  return manifest.map(entry => ({ ...entry }));
}

// ─── Final Manifest Compilation ─────────────────────────────────────────────────

/**
 * Compile the final file manifest and write to remote_desktop_file_manifests.
 *
 * Called when a session ends (voluntarily or via auto-disconnect).
 * Performs a final workspace scan, computes SHA-256 hashes, and persists the manifest.
 *
 * Requirements: 8.3
 */
export function compileAndWriteFinalManifest(input: FinalManifestInput): FinalManifestResult {
  const { sessionId, bookingId, consumerUid, ownerUid } = input;

  if (!sessionId || !bookingId || !consumerUid || !ownerUid) {
    throw createError(
      'workspace_inaccessible',
      'All fields (sessionId, bookingId, consumerUid, ownerUid) are required for final manifest',
    );
  }

  // Stop monitoring if active
  stopMonitoring(sessionId);

  // Get the workspace info for a final scan
  const workspace = workspaces.get(sessionId);
  let files: FileManifestEntry[];

  if (workspace && existsSync(workspace.workspacePath)) {
    // Perform a final scan to ensure the latest state
    files = scanWorkspace(workspace.workspacePath);
  } else {
    // Fall back to last known manifest
    files = manifests.get(sessionId) ?? [];
  }

  // Cap at MAX_MANIFEST_FILES
  if (files.length > MAX_MANIFEST_FILES) {
    files = files.slice(0, MAX_MANIFEST_FILES);
  }

  const manifestId = generateManifestId();
  const result: FinalManifestResult = {
    manifestId,
    sessionId,
    bookingId,
    consumerUid,
    ownerUid,
    files,
    manifestTimestamp: Date.now(),
  };

  // Persist (simulating Firestore write to remote_desktop_file_manifests)
  finalManifests.set(manifestId, result);

  // Update in-memory manifest
  manifests.set(sessionId, files);

  return result;
}

// ─── Workspace Scanning ─────────────────────────────────────────────────────────

/**
 * Scan a workspace directory and build a manifest of all files.
 *
 * For each file, computes:
 * - name: filename
 * - sizeBytes: file size in bytes
 * - extension: file extension (lowercase, without dot)
 * - sha256Hash: SHA-256 hash (64-char hex)
 * - transferStatus: 'pending'
 */
export function scanWorkspace(workspacePath: string): FileManifestEntry[] {
  if (!workspacePath || !existsSync(workspacePath)) {
    return [];
  }

  const entries: FileManifestEntry[] = [];

  try {
    const files = readdirSync(workspacePath);

    for (const fileName of files) {
      const filePath = join(workspacePath, fileName);

      try {
        const stats = statSync(filePath);

        // Only include regular files, not directories
        if (!stats.isFile()) {
          continue;
        }

        // Cap manifest at MAX_MANIFEST_FILES
        if (entries.length >= MAX_MANIFEST_FILES) {
          break;
        }

        const fileExtension = extname(fileName).toLowerCase().replace('.', '');
        const hash = computeSha256(filePath);

        entries.push({
          name: fileName,
          sizeBytes: stats.size,
          extension: fileExtension,
          sha256Hash: hash,
          transferStatus: 'pending',
        });
      } catch {
        // Skip files we can't stat (locked, permissions, etc.)
        continue;
      }
    }
  } catch {
    // Directory became inaccessible — return empty manifest
    return [];
  }

  return entries;
}

// ─── SHA-256 Hashing ────────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a file.
 * Returns a 64-character hexadecimal string.
 */
export function computeSha256(filePath: string): string {
  try {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    // Return a zero-hash for files we can't read
    return '0'.repeat(64);
  }
}

// ─── Query Functions ────────────────────────────────────────────────────────────

/**
 * Get workspace info for a session.
 */
export function getWorkspaceInfo(sessionId: string): SessionWorkspaceInfo | undefined {
  return workspaces.get(sessionId);
}

/**
 * Get a final manifest by manifest ID.
 */
export function getFinalManifest(manifestId: string): FinalManifestResult | undefined {
  return finalManifests.get(manifestId);
}

/**
 * Get a final manifest by session ID.
 */
export function getFinalManifestBySession(sessionId: string): FinalManifestResult | undefined {
  for (const manifest of finalManifests.values()) {
    if (manifest.sessionId === sessionId) {
      return manifest;
    }
  }
  return undefined;
}

/**
 * Check if a session has an active workspace monitor.
 */
export function isMonitoring(sessionId: string): boolean {
  return monitors.has(sessionId);
}

// ─── Error Factory ──────────────────────────────────────────────────────────────

interface FileHandoffError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

function createError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
): FileHandoffError {
  return { code, message, details, retryable };
}

// ─── ID Generation ──────────────────────────────────────────────────────────────

function generateManifestId(): string {
  // Simple UUID-like ID for manifest documents
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'manifest-';
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Clear all in-memory state (for testing only).
 * @internal
 */
export function _clearAllState(): void {
  // Stop all monitors
  for (const interval of monitors.values()) {
    clearInterval(interval);
  }
  monitors.clear();
  workspaces.clear();
  manifests.clear();
  finalManifests.clear();
}

/**
 * Get active workspace count (for testing only).
 * @internal
 */
export function _getWorkspaceCount(): number {
  return workspaces.size;
}

/**
 * Get final manifest count (for testing only).
 * @internal
 */
export function _getFinalManifestCount(): number {
  return finalManifests.size;
}

/**
 * Inject a manifest directly (for testing only).
 * @internal
 */
export function _injectManifest(sessionId: string, entries: FileManifestEntry[]): void {
  manifests.set(sessionId, entries);
}

/**
 * Inject workspace info directly (for testing only).
 * @internal
 */
export function _injectWorkspaceInfo(info: SessionWorkspaceInfo): void {
  workspaces.set(info.sessionId, info);
}
