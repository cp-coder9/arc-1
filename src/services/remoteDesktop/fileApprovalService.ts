/**
 * Remote Desktop Core — File Approval Service
 *
 * Manages file approval and upload to Architex FileManager (Vercel Blob):
 * - approveFiles(): Approve selected files for handoff
 * - uploadFiles(): Upload approved files to FileManager
 * - Reject files >500 MB individually, proceed with remaining
 * - Set status: pending → uploading → completed/failed
 * - Retry failed uploads 3 times (60s timeout per attempt), mark as "failed" if exhausted
 * - Associate uploaded files with project reference in FileManager
 *
 * Requirements: 8.4, 8.5, 8.6, 8.8, 13.4
 */

import type { FileManifestEntry } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface FileApprovalResult {
  manifestId: string;
  approvedFiles: string[];
  rejectedFiles: RejectedFile[];
  approvalTimestamp: number; // Unix ms
  ownerUid: string;
}

export interface RejectedFile {
  name: string;
  reason: string;
  sizeBytes?: number;
}

export interface FileUploadResult {
  manifestId: string;
  results: FileTransferResult[];
  completedCount: number;
  failedCount: number;
  uploadTimestamp: number; // Unix ms
}

export interface FileTransferResult {
  name: string;
  status: 'completed' | 'failed';
  url?: string; // Blob URL on success
  error?: string;
  attempts: number;
}

export interface FileManagerAssociation {
  manifestId: string;
  sessionId: string;
  projectReference: string;
  files: Array<{
    name: string;
    url: string;
    sizeBytes: number;
    extension: string;
    uploadTimestamp: number;
  }>;
}

export interface ManifestState {
  manifestId: string;
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  projectReference?: string;
  files: FileManifestEntry[];
  status: 'pending' | 'approved' | 'rejected' | 'uploading' | 'completed' | 'failed';
  approvedFileNames?: string[];
  approvalTimestamp?: number;
  uploadResults?: FileTransferResult[];
}

/** Upload function signature — injectable for testing */
export type UploadFn = (
  fileName: string,
  fileContent: Buffer | Uint8Array,
  options?: { timeout?: number },
) => Promise<{ url: string }>;

/** File reader function signature — injectable for testing */
export type FileReaderFn = (filePath: string) => Buffer | Uint8Array;

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum file size for handoff (500 MB) */
export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 524,288,000 bytes

/** Maximum upload retry attempts */
export const MAX_UPLOAD_RETRIES = 3;

/** Upload timeout per attempt in milliseconds (60 seconds) */
export const UPLOAD_TIMEOUT_MS = 60_000;

// ─── In-Memory State ────────────────────────────────────────────────────────────

/** Manifest states indexed by manifestId */
const manifestStates: Map<string, ManifestState> = new Map();

/** FileManager associations indexed by manifestId */
const fileManagerAssociations: Map<string, FileManagerAssociation> = new Map();

// ─── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Approve selected files from a manifest for handoff.
 *
 * The owner selects which files to approve (all selected by default).
 * Files exceeding 500 MB are automatically rejected while remaining files proceed.
 *
 * Requirements: 8.4, 8.5, 8.8
 */
export function approveFiles(
  manifestId: string,
  approvedFileNames: string[],
  ownerUid: string,
): FileApprovalResult {
  if (!manifestId || manifestId.trim().length === 0) {
    throw createError('invalid_manifest', 'Manifest ID is required');
  }
  if (!ownerUid || ownerUid.trim().length === 0) {
    throw createError('invalid_owner', 'Owner UID is required');
  }
  if (!Array.isArray(approvedFileNames)) {
    throw createError('invalid_files', 'Approved file names must be an array');
  }

  const state = manifestStates.get(manifestId);
  if (!state) {
    throw createError('manifest_not_found', `Manifest ${manifestId} not found`);
  }

  if (state.ownerUid !== ownerUid) {
    throw createError('unauthorized', 'Only the manifest owner can approve files');
  }

  if (state.status !== 'pending') {
    throw createError('invalid_status', `Cannot approve manifest in "${state.status}" status`);
  }

  const approved: string[] = [];
  const rejected: RejectedFile[] = [];

  for (const fileName of approvedFileNames) {
    const fileEntry = state.files.find(f => f.name === fileName);

    if (!fileEntry) {
      rejected.push({ name: fileName, reason: 'File not found in manifest' });
      continue;
    }

    if (fileEntry.sizeBytes > MAX_FILE_SIZE_BYTES) {
      rejected.push({
        name: fileName,
        reason: `File exceeds 500 MB transfer limit (${formatSize(fileEntry.sizeBytes)})`,
        sizeBytes: fileEntry.sizeBytes,
      });
      continue;
    }

    approved.push(fileName);
  }

  const approvalTimestamp = Date.now();

  // Update manifest state
  state.status = 'approved';
  state.approvedFileNames = approved;
  state.approvalTimestamp = approvalTimestamp;

  // Update file transfer statuses
  for (const file of state.files) {
    if (approved.includes(file.name)) {
      file.transferStatus = 'pending';
    }
  }

  return {
    manifestId,
    approvedFiles: approved,
    rejectedFiles: rejected,
    approvalTimestamp,
    ownerUid,
  };
}

/**
 * Upload approved files to FileManager (Vercel Blob).
 *
 * Sets status: pending → uploading → completed/failed.
 * Retries failed uploads 3 times with 60s timeout per attempt.
 * Associates uploaded files with project reference in FileManager.
 *
 * Requirements: 8.4, 8.5, 8.6, 13.4
 */
export async function uploadFiles(
  manifestId: string,
  uploadFn: UploadFn,
  fileReaderFn: FileReaderFn,
  workspacePath: string,
): Promise<FileUploadResult> {
  if (!manifestId || manifestId.trim().length === 0) {
    throw createError('invalid_manifest', 'Manifest ID is required');
  }

  const state = manifestStates.get(manifestId);
  if (!state) {
    throw createError('manifest_not_found', `Manifest ${manifestId} not found`);
  }

  if (state.status !== 'approved') {
    throw createError(
      'invalid_status',
      `Cannot upload files for manifest in "${state.status}" status. Must be "approved".`,
    );
  }

  if (!state.approvedFileNames || state.approvedFileNames.length === 0) {
    throw createError('no_approved_files', 'No files have been approved for upload');
  }

  // Transition to uploading
  state.status = 'uploading';

  const results: FileTransferResult[] = [];
  let completedCount = 0;
  let failedCount = 0;

  for (const fileName of state.approvedFileNames) {
    const fileEntry = state.files.find(f => f.name === fileName);
    if (!fileEntry) {
      results.push({ name: fileName, status: 'failed', error: 'File entry not found', attempts: 0 });
      failedCount++;
      continue;
    }

    // Set file status to transferring
    fileEntry.transferStatus = 'transferring';

    const result = await uploadFileWithRetry(
      fileName,
      workspacePath,
      uploadFn,
      fileReaderFn,
    );

    // Update file entry status
    fileEntry.transferStatus = result.status;
    results.push(result);

    if (result.status === 'completed') {
      completedCount++;
    } else {
      failedCount++;
    }
  }

  // Update manifest status
  if (failedCount === 0) {
    state.status = 'completed';
  } else if (completedCount === 0) {
    state.status = 'failed';
  } else {
    // Partial success — mark as completed with some failures noted in results
    state.status = 'completed';
  }

  state.uploadResults = results;

  const uploadTimestamp = Date.now();

  // Associate uploaded files with project reference in FileManager
  if (state.projectReference && completedCount > 0) {
    const successfulFiles = results
      .filter(r => r.status === 'completed' && r.url)
      .map(r => {
        const entry = state.files.find(f => f.name === r.name);
        return {
          name: r.name,
          url: r.url!,
          sizeBytes: entry?.sizeBytes ?? 0,
          extension: entry?.extension ?? '',
          uploadTimestamp,
        };
      });

    if (successfulFiles.length > 0) {
      const association: FileManagerAssociation = {
        manifestId,
        sessionId: state.sessionId,
        projectReference: state.projectReference,
        files: successfulFiles,
      };
      fileManagerAssociations.set(manifestId, association);
    }
  }

  return {
    manifestId,
    results,
    completedCount,
    failedCount,
    uploadTimestamp,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────────

/**
 * Upload a single file with retry logic.
 * Retries up to MAX_UPLOAD_RETRIES (3) times with UPLOAD_TIMEOUT_MS (60s) per attempt.
 */
async function uploadFileWithRetry(
  fileName: string,
  workspacePath: string,
  uploadFn: UploadFn,
  fileReaderFn: FileReaderFn,
): Promise<FileTransferResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      // Read file content
      const filePath = `${workspacePath}/${fileName}`;
      const content = fileReaderFn(filePath);

      // Upload with timeout
      const result = await uploadFn(fileName, content, { timeout: UPLOAD_TIMEOUT_MS });

      return {
        name: fileName,
        status: 'completed',
        url: result.url,
        attempts: attempt,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : 'Unknown upload error';
      // Continue to next retry attempt
    }
  }

  // All retries exhausted
  return {
    name: fileName,
    status: 'failed',
    error: lastError ?? 'Upload failed after maximum retries',
    attempts: MAX_UPLOAD_RETRIES,
  };
}

// ─── State Management ───────────────────────────────────────────────────────────

/**
 * Register a manifest for approval tracking.
 * Called after compileAndWriteFinalManifest to make the manifest available for approval.
 */
export function registerManifest(
  manifestId: string,
  sessionId: string,
  bookingId: string,
  consumerUid: string,
  ownerUid: string,
  files: FileManifestEntry[],
  projectReference?: string,
): ManifestState {
  if (!manifestId || !sessionId || !bookingId || !consumerUid || !ownerUid) {
    throw createError('invalid_input', 'All required fields must be provided');
  }

  const state: ManifestState = {
    manifestId,
    sessionId,
    bookingId,
    consumerUid,
    ownerUid,
    projectReference,
    files: files.map(f => ({ ...f })), // defensive copy
    status: 'pending',
  };

  manifestStates.set(manifestId, state);
  return state;
}

/**
 * Get manifest state by manifest ID.
 */
export function getManifestState(manifestId: string): ManifestState | undefined {
  return manifestStates.get(manifestId);
}

/**
 * Get FileManager association for a manifest.
 */
export function getFileManagerAssociation(manifestId: string): FileManagerAssociation | undefined {
  return fileManagerAssociations.get(manifestId);
}

/**
 * Get all manifests for a given owner (for UI listing).
 */
export function getManifestsForOwner(ownerUid: string): ManifestState[] {
  const results: ManifestState[] = [];
  for (const state of manifestStates.values()) {
    if (state.ownerUid === ownerUid) {
      results.push(state);
    }
  }
  return results;
}

/**
 * Get all manifests for a given consumer (for status viewing).
 */
export function getManifestsForConsumer(consumerUid: string): ManifestState[] {
  const results: ManifestState[] = [];
  for (const state of manifestStates.values()) {
    if (state.consumerUid === consumerUid) {
      results.push(state);
    }
  }
  return results;
}

// ─── Utility Functions ──────────────────────────────────────────────────────────

/**
 * Format file size into human-readable string.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Error Factory ──────────────────────────────────────────────────────────────

interface FileApprovalError {
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
): FileApprovalError {
  return { code, message, details, retryable };
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Clear all in-memory state (for testing only).
 * @internal
 */
export function _clearAllApprovalState(): void {
  manifestStates.clear();
  fileManagerAssociations.clear();
}

/**
 * Get manifest state count (for testing only).
 * @internal
 */
export function _getManifestStateCount(): number {
  return manifestStates.size;
}

/**
 * Get FileManager association count (for testing only).
 * @internal
 */
export function _getAssociationCount(): number {
  return fileManagerAssociations.size;
}
