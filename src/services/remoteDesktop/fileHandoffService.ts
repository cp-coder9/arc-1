/**
 * Remote Desktop Core — File Handoff Service
 *
 * Manages the Session_Workspace lifecycle, file manifest generation, approval
 * gate, transfer status transitions, and expiry enforcement:
 *
 * Workspace & Monitoring:
 * - createSessionWorkspace(): Creates workspace directory for a session
 * - monitorWorkspace(): Starts file watcher, reports manifest every ≤10 seconds
 * - getFileManifest(): Returns current file manifest (name, size, extension, SHA-256 hash, status)
 * - compileAndWriteFinalManifest(): On session end, write to remote_desktop_file_manifests
 * - stopMonitoring(): Stops the file watcher for a session
 *
 * Approval Gate (Req 9):
 * - createManifest(): Creates file manifest with deny-list filtering & size validation
 * - approveManifest(): Owner approves all pending files
 * - rejectFiles(): Reject specific files from the manifest
 * - checkExpiry(): Detects 72-hour expiry and marks manifest as expired
 * - updateTransferStatus(): Transitions individual file status
 * - associateProjectReference(): Links uploaded files to project on completion
 *
 * Uses Node.js fs/path modules and crypto for SHA-256 hashing.
 *
 * Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { FileManifestEntry, FileManifest, ManifestApprovalStatus, FileTransferStatus } from './types';
import { DEFAULT_DENY_LIST_EXTENSIONS, REMOTE_DESKTOP_DEFAULTS } from './types';

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

// ─── Manifest Approval Gate Types ───────────────────────────────────────────────

export interface CreateManifestInput {
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  files: CreateManifestFileInput[];
  denyList?: string[];
  projectReference?: string;
}

export interface CreateManifestFileInput {
  name: string;
  sizeBytes: number;
  content?: Buffer | Uint8Array;
  sha256Hash?: string;
}

export interface CreateManifestResult {
  manifest: FileManifest;
  blockedFiles: BlockedFileEntry[];
  oversizedFiles: OversizedFileEntry[];
}

export interface BlockedFileEntry {
  name: string;
  extension: string;
  reason: string;
}

export interface OversizedFileEntry {
  name: string;
  sizeBytes: number;
  reason: string;
}

export interface ApproveManifestResult {
  manifestId: string;
  approvedFiles: string[];
  approvalTimestamp: string;
  ownerApprovalStatus: ManifestApprovalStatus;
}

export interface RejectFilesResult {
  manifestId: string;
  rejectedFiles: string[];
  remainingFiles: string[];
  ownerApprovalStatus: ManifestApprovalStatus;
}

export interface ExpiryCheckResult {
  manifestId: string;
  isExpired: boolean;
  ownerApprovalStatus: ManifestApprovalStatus;
  expiryTimestamp: string;
}

export interface ProjectReferenceAssociation {
  manifestId: string;
  sessionId: string;
  projectReference: string;
  files: Array<{
    name: string;
    sha256Hash: string;
    uploadTimestamp: string;
  }>;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Default base path for session workspaces on Windows */
export const DEFAULT_BASE_PATH = 'C:\\ArchitexSessions';

/** Maximum manifest reporting interval in milliseconds */
export const MAX_REPORT_INTERVAL_MS = 10_000;

/** Maximum number of files in a manifest */
export const MAX_MANIFEST_FILES = REMOTE_DESKTOP_DEFAULTS.MAX_MANIFEST_FILES; // 200

/** Maximum file size for handoff (500 MB) — used for manifest creation validation */
export const HANDOFF_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 524,288,000 bytes

/** File handoff expiry in milliseconds (72 hours) */
export const FILE_HANDOFF_EXPIRY_MS = REMOTE_DESKTOP_DEFAULTS.FILE_HANDOFF_EXPIRY_HOURS * 60 * 60 * 1000;

// ─── In-Memory State ────────────────────────────────────────────────────────────

/** Active workspace info per session */
const workspaces: Map<string, SessionWorkspaceInfo> = new Map();

/** Current file manifests per session */
const manifests: Map<string, FileManifestEntry[]> = new Map();

/** Active monitor intervals per session */
const monitors: Map<string, ReturnType<typeof setInterval>> = new Map();

/** Final manifests written (simulating Firestore write) */
const finalManifests: Map<string, FinalManifestResult> = new Map();

/** Approval-gate file manifests (design-doc shape with ISO strings) */
const approvalManifests: Map<string, FileManifest> = new Map();

/** Project reference associations */
const projectAssociations: Map<string, ProjectReferenceAssociation> = new Map();

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

// ─── Manifest Approval Gate ─────────────────────────────────────────────────────

/**
 * Create a file manifest with deny-list filtering and size validation.
 *
 * Filters out:
 * - Files matching the extension deny-list (default: .exe, .dll, .sys, .bat, .cmd, .ps1, .vbs, .reg)
 * - Files exceeding HANDOFF_MAX_FILE_SIZE_BYTES (500 MB)
 * - Caps total file count at MAX_MANIFEST_FILES (200)
 *
 * Returns the created manifest, blocked files, and oversized files.
 *
 * Requirements: 9.1, 9.5, Property 6
 */
export function createManifest(input: CreateManifestInput): CreateManifestResult {
  const { sessionId, bookingId, consumerUid, ownerUid, files, denyList, projectReference } = input;

  if (!sessionId || !bookingId || !consumerUid || !ownerUid) {
    throw createError(
      'invalid_input',
      'All fields (sessionId, bookingId, consumerUid, ownerUid) are required',
    );
  }

  if (!Array.isArray(files)) {
    throw createError('invalid_input', 'Files must be an array');
  }

  // Resolve deny-list: use provided or fall back to defaults
  const resolvedDenyList = (denyList ?? DEFAULT_DENY_LIST_EXTENSIONS as unknown as string[])
    .map(ext => ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`);

  const blockedFiles: BlockedFileEntry[] = [];
  const oversizedFiles: OversizedFileEntry[] = [];
  const acceptedEntries: FileManifestEntry[] = [];

  for (const file of files) {
    const ext = extname(file.name).toLowerCase();

    // Check deny-list
    if (resolvedDenyList.includes(ext)) {
      blockedFiles.push({
        name: file.name,
        extension: ext,
        reason: `Extension "${ext}" is in the deny-list`,
      });
      continue;
    }

    // Check file size
    if (file.sizeBytes > HANDOFF_MAX_FILE_SIZE_BYTES) {
      oversizedFiles.push({
        name: file.name,
        sizeBytes: file.sizeBytes,
        reason: `File exceeds 500 MB limit (${(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB)`,
      });
      continue;
    }

    // Cap at MAX_MANIFEST_FILES
    if (acceptedEntries.length >= MAX_MANIFEST_FILES) {
      break;
    }

    // Compute SHA-256 hash
    let sha256Hash: string;
    if (file.sha256Hash) {
      sha256Hash = file.sha256Hash;
    } else if (file.content) {
      sha256Hash = createHash('sha256').update(file.content).digest('hex');
    } else {
      sha256Hash = '0'.repeat(64);
    }

    acceptedEntries.push({
      name: file.name,
      sizeBytes: file.sizeBytes,
      extension: ext.replace('.', ''),
      sha256Hash,
      transferStatus: 'pending',
    });
  }

  const manifestId = generateManifestId();
  const now = new Date();
  const expiryDate = new Date(now.getTime() + FILE_HANDOFF_EXPIRY_MS);

  const manifest: FileManifest = {
    manifestId,
    sessionId,
    bookingId,
    consumerUid,
    ownerUid,
    files: acceptedEntries,
    manifestTimestamp: now.toISOString(),
    ownerApprovalStatus: 'pending',
    approvalTimestamp: null,
    expiryTimestamp: expiryDate.toISOString(),
  };

  approvalManifests.set(manifestId, manifest);

  return { manifest, blockedFiles, oversizedFiles };
}

/**
 * Owner approves all pending files in the manifest.
 *
 * Transitions ownerApprovalStatus from 'pending' → 'approved'.
 * Sets approval timestamp.
 *
 * Requirements: 9.3
 */
export function approveManifest(manifestId: string): ApproveManifestResult {
  if (!manifestId || manifestId.trim().length === 0) {
    throw createError('invalid_input', 'Manifest ID is required');
  }

  const manifest = approvalManifests.get(manifestId);
  if (!manifest) {
    throw createError('manifest_not_found', `Manifest "${manifestId}" not found`);
  }

  if (manifest.ownerApprovalStatus !== 'pending') {
    throw createError(
      'invalid_status',
      `Cannot approve manifest in "${manifest.ownerApprovalStatus}" status`,
    );
  }

  // Check expiry before approving
  if (isManifestExpired(manifest)) {
    manifest.ownerApprovalStatus = 'expired';
    throw createError('manifest_expired', 'Manifest has expired (72-hour window elapsed)');
  }

  const approvalTimestamp = new Date().toISOString();
  manifest.ownerApprovalStatus = 'approved';
  manifest.approvalTimestamp = approvalTimestamp;

  const approvedFiles = manifest.files.map(f => f.name);

  return {
    manifestId,
    approvedFiles,
    approvalTimestamp,
    ownerApprovalStatus: 'approved',
  };
}

/**
 * Reject specific files from the manifest.
 *
 * If all files are rejected, the manifest status transitions to 'rejected'.
 * Rejected files have their transferStatus set to 'rejected'.
 *
 * Requirements: 9.4
 */
export function rejectFiles(manifestId: string, fileNames: string[]): RejectFilesResult {
  if (!manifestId || manifestId.trim().length === 0) {
    throw createError('invalid_input', 'Manifest ID is required');
  }

  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    throw createError('invalid_input', 'File names array is required and must not be empty');
  }

  const manifest = approvalManifests.get(manifestId);
  if (!manifest) {
    throw createError('manifest_not_found', `Manifest "${manifestId}" not found`);
  }

  if (manifest.ownerApprovalStatus !== 'pending' && manifest.ownerApprovalStatus !== 'approved') {
    throw createError(
      'invalid_status',
      `Cannot reject files in "${manifest.ownerApprovalStatus}" status`,
    );
  }

  const rejectedFiles: string[] = [];
  const remainingFiles: string[] = [];

  for (const file of manifest.files) {
    if (fileNames.includes(file.name)) {
      file.transferStatus = 'rejected';
      rejectedFiles.push(file.name);
    } else {
      remainingFiles.push(file.name);
    }
  }

  // If all files are rejected, mark manifest as rejected
  const nonRejectedFiles = manifest.files.filter(f => f.transferStatus !== 'rejected');
  if (nonRejectedFiles.length === 0) {
    manifest.ownerApprovalStatus = 'rejected';
  }

  return {
    manifestId,
    rejectedFiles,
    remainingFiles,
    ownerApprovalStatus: manifest.ownerApprovalStatus,
  };
}

/**
 * Check if a manifest has expired (72-hour window).
 *
 * If expired, transitions ownerApprovalStatus to 'expired'.
 *
 * Requirements: 9.6
 */
export function checkExpiry(manifestId: string): ExpiryCheckResult {
  if (!manifestId || manifestId.trim().length === 0) {
    throw createError('invalid_input', 'Manifest ID is required');
  }

  const manifest = approvalManifests.get(manifestId);
  if (!manifest) {
    throw createError('manifest_not_found', `Manifest "${manifestId}" not found`);
  }

  const isExpired = isManifestExpired(manifest);

  if (isExpired && manifest.ownerApprovalStatus === 'pending') {
    manifest.ownerApprovalStatus = 'expired';
  }

  return {
    manifestId,
    isExpired,
    ownerApprovalStatus: manifest.ownerApprovalStatus,
    expiryTimestamp: manifest.expiryTimestamp,
  };
}

/**
 * Update the transfer status of a specific file in the manifest.
 *
 * Valid transitions:
 * - pending → uploading (on upload start, requires manifest approved)
 * - uploading → completed (on upload success)
 * - uploading → failed (on upload failure)
 * - pending → rejected (on owner rejection)
 *
 * Requirements: 9.3
 */
export function updateTransferStatus(
  manifestId: string,
  fileName: string,
  status: FileTransferStatus,
): FileManifestEntry {
  if (!manifestId || manifestId.trim().length === 0) {
    throw createError('invalid_input', 'Manifest ID is required');
  }

  if (!fileName || fileName.trim().length === 0) {
    throw createError('invalid_input', 'File name is required');
  }

  const manifest = approvalManifests.get(manifestId);
  if (!manifest) {
    throw createError('manifest_not_found', `Manifest "${manifestId}" not found`);
  }

  const file = manifest.files.find(f => f.name === fileName);
  if (!file) {
    throw createError('file_not_found', `File "${fileName}" not found in manifest "${manifestId}"`);
  }

  // Validate transitions
  const validTransitions: Record<string, FileTransferStatus[]> = {
    pending: ['transferring', 'rejected'],
    transferring: ['completed', 'failed'],
    completed: [],
    failed: ['transferring'], // allow retry
    rejected: [],
  };

  const allowed = validTransitions[file.transferStatus] ?? [];
  if (!allowed.includes(status)) {
    throw createError(
      'invalid_transition',
      `Cannot transition file "${fileName}" from "${file.transferStatus}" to "${status}"`,
    );
  }

  // For uploading transition, ensure manifest is approved
  if (status === 'transferring' && manifest.ownerApprovalStatus !== 'approved') {
    throw createError(
      'manifest_not_approved',
      'Cannot start upload until manifest is approved',
    );
  }

  file.transferStatus = status;
  return { ...file };
}

/**
 * Associate uploaded files with project reference on upload completion.
 *
 * Requirements: 9.8
 */
export function associateProjectReference(
  manifestId: string,
  projectReference: string,
): ProjectReferenceAssociation {
  if (!manifestId || manifestId.trim().length === 0) {
    throw createError('invalid_input', 'Manifest ID is required');
  }

  if (!projectReference || projectReference.trim().length === 0) {
    throw createError('invalid_input', 'Project reference is required');
  }

  const manifest = approvalManifests.get(manifestId);
  if (!manifest) {
    throw createError('manifest_not_found', `Manifest "${manifestId}" not found`);
  }

  const completedFiles = manifest.files.filter(f => f.transferStatus === 'completed');
  if (completedFiles.length === 0) {
    throw createError('no_completed_files', 'No completed files to associate');
  }

  const now = new Date().toISOString();
  const association: ProjectReferenceAssociation = {
    manifestId,
    sessionId: manifest.sessionId,
    projectReference,
    files: completedFiles.map(f => ({
      name: f.name,
      sha256Hash: f.sha256Hash,
      uploadTimestamp: now,
    })),
  };

  projectAssociations.set(manifestId, association);
  return association;
}

// ─── Approval Gate Queries ──────────────────────────────────────────────────────

/**
 * Get an approval-gate manifest by ID.
 */
export function getApprovalManifest(manifestId: string): FileManifest | undefined {
  return approvalManifests.get(manifestId);
}

/**
 * Get project reference association for a manifest.
 */
export function getProjectAssociation(manifestId: string): ProjectReferenceAssociation | undefined {
  return projectAssociations.get(manifestId);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────────

/**
 * Check if a manifest has expired based on its expiryTimestamp.
 */
function isManifestExpired(manifest: FileManifest): boolean {
  const expiryTime = new Date(manifest.expiryTimestamp).getTime();
  return Date.now() >= expiryTime;
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
  approvalManifests.clear();
  projectAssociations.clear();
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

/**
 * Inject an approval manifest directly (for testing only).
 * @internal
 */
export function _injectApprovalManifest(manifest: FileManifest): void {
  approvalManifests.set(manifest.manifestId, manifest);
}

/**
 * Get approval manifest count (for testing only).
 * @internal
 */
export function _getApprovalManifestCount(): number {
  return approvalManifests.size;
}

/**
 * Get project association count (for testing only).
 * @internal
 */
export function _getProjectAssociationCount(): number {
  return projectAssociations.size;
}
