/**
 * Remote Desktop Core — Application Allowlist Management Service
 *
 * Provides CRUD operations for the App_Allowlist (remote_desktop_apps collection).
 * Validates entries against platform constraints and Host Agent local .exe validation.
 * Changes apply to future sessions only — active sessions retain their snapshot.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { randomUUID } from 'node:crypto';
import type { RemoteDesktopApp, RemoteDesktopError } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum entries per host allowlist */
export const MAX_ALLOWLIST_ENTRIES = 20;

/** Maximum display name length (characters) */
export const MAX_DISPLAY_NAME_LENGTH = 100;

/** Maximum executable path length (characters) */
export const MAX_EXECUTABLE_PATH_LENGTH = 260;

/** Platform-defined software category list */
export const SOFTWARE_CATEGORIES = [
  'cad',
  'bim',
  'rendering',
  'office',
  'design',
  'engineering',
  'project_management',
  'communication',
  'analysis',
  'other',
] as const;

export type SoftwareCategory = (typeof SOFTWARE_CATEGORIES)[number];

// ─── In-Memory Store ────────────────────────────────────────────────────────────

/**
 * In-memory store for allowlist entries (keyed by hostId).
 * In production, this would read/write from Firestore `remote_desktop_apps` collection.
 */
const allowlistStore: Map<string, RemoteDesktopApp[]> = new Map();

/**
 * Session allowlist snapshots — frozen at session start.
 * Key: sessionId, Value: array of app entries at session start time.
 */
const sessionSnapshots: Map<string, RemoteDesktopApp[]> = new Map();

// ─── Error Factory ──────────────────────────────────────────────────────────────

function createError(
  code: RemoteDesktopError['code'],
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
): RemoteDesktopError {
  return { code, message, details, retryable };
}

// ─── Input Types ────────────────────────────────────────────────────────────────

export interface AllowlistEntryInput {
  displayName: string;
  executablePath: string;
  softwareCategory: string;
}

export interface AllowlistEntryUpdate {
  displayName?: string;
  executablePath?: string;
  softwareCategory?: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────────

/**
 * Validate that a path references a valid .exe file.
 *
 * This simulates Host Agent local validation — in production, the Host Agent
 * would perform actual filesystem checks. The broker-side service validates
 * the path format; the Host Agent confirms the file exists on disk.
 *
 * Rules:
 * - Must end with `.exe` (case-insensitive)
 * - Must not be empty
 * - Must not exceed MAX_EXECUTABLE_PATH_LENGTH characters
 * - Must look like a valid Windows path (starts with drive letter or UNC)
 */
export function validateExecutablePath(path: string): boolean {
  if (!path || path.length === 0) {
    return false;
  }

  if (path.length > MAX_EXECUTABLE_PATH_LENGTH) {
    return false;
  }

  // Must end with .exe (case-insensitive)
  if (!path.toLowerCase().endsWith('.exe')) {
    return false;
  }

  // Must look like a valid Windows path:
  // Drive letter path: C:\...\app.exe
  // UNC path: \\server\share\app.exe
  const driveLetterPattern = /^[A-Za-z]:\\/;
  const uncPattern = /^\\\\/;

  if (!driveLetterPattern.test(path) && !uncPattern.test(path)) {
    return false;
  }

  return true;
}

/**
 * Validate a software category against the platform-defined list.
 */
export function validateSoftwareCategory(category: string): category is SoftwareCategory {
  return SOFTWARE_CATEGORIES.includes(category as SoftwareCategory);
}

/**
 * Validate an allowlist entry input.
 * Returns null if valid, or an error describing the validation failure.
 */
export function validateEntry(entry: AllowlistEntryInput): RemoteDesktopError | null {
  // Display name validation
  if (!entry.displayName || entry.displayName.trim().length === 0) {
    return createError(
      'allowlist_empty',
      'Display name is required',
      { field: 'displayName' },
    );
  }

  if (entry.displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return createError(
      'allowlist_empty',
      `Display name must not exceed ${MAX_DISPLAY_NAME_LENGTH} characters`,
      { field: 'displayName', length: entry.displayName.length, max: MAX_DISPLAY_NAME_LENGTH },
    );
  }

  // Executable path validation
  if (!entry.executablePath || entry.executablePath.trim().length === 0) {
    return createError(
      'allowlist_empty',
      'Executable path is required',
      { field: 'executablePath' },
    );
  }

  if (entry.executablePath.length > MAX_EXECUTABLE_PATH_LENGTH) {
    return createError(
      'allowlist_empty',
      `Executable path must not exceed ${MAX_EXECUTABLE_PATH_LENGTH} characters`,
      { field: 'executablePath', length: entry.executablePath.length, max: MAX_EXECUTABLE_PATH_LENGTH },
    );
  }

  if (!validateExecutablePath(entry.executablePath)) {
    return createError(
      'allowlist_empty',
      'Executable path must reference a valid .exe file with a valid Windows path format',
      { field: 'executablePath', path: entry.executablePath },
    );
  }

  // Software category validation
  if (!entry.softwareCategory || entry.softwareCategory.trim().length === 0) {
    return createError(
      'allowlist_empty',
      'Software category is required',
      { field: 'softwareCategory' },
    );
  }

  if (!validateSoftwareCategory(entry.softwareCategory)) {
    return createError(
      'allowlist_empty',
      `Software category must be one of: ${SOFTWARE_CATEGORIES.join(', ')}`,
      { field: 'softwareCategory', provided: entry.softwareCategory, allowed: SOFTWARE_CATEGORIES },
    );
  }

  return null;
}

// ─── CRUD Operations ────────────────────────────────────────────────────────────

/**
 * Add a new entry to the App_Allowlist for a host.
 *
 * Validates the entry and enforces the 20-entry maximum.
 * Changes apply to future sessions only — active sessions keep their snapshot.
 *
 * @throws RemoteDesktopError if validation fails or max entries exceeded
 */
export function addAllowlistEntry(hostId: string, entry: AllowlistEntryInput): RemoteDesktopApp {
  if (!hostId || hostId.trim().length === 0) {
    throw createError('allowlist_empty', 'Host ID is required');
  }

  // Validate the entry
  const validationError = validateEntry(entry);
  if (validationError) {
    throw validationError;
  }

  // Check entry count limit
  const existingEntries = allowlistStore.get(hostId) || [];
  if (existingEntries.length >= MAX_ALLOWLIST_ENTRIES) {
    throw createError(
      'allowlist_empty',
      `Maximum allowlist size of ${MAX_ALLOWLIST_ENTRIES} entries has been reached`,
      { hostId, currentCount: existingEntries.length, max: MAX_ALLOWLIST_ENTRIES },
    );
  }

  // Create the new app entry
  const now = Date.now();
  const newApp: RemoteDesktopApp = {
    appId: randomUUID(),
    hostId,
    displayName: entry.displayName.trim(),
    executablePath: entry.executablePath.trim(),
    softwareCategory: entry.softwareCategory,
    validationStatus: 'valid',
    lastValidatedTimestamp: { seconds: Math.floor(now / 1000), nanoseconds: (now % 1000) * 1_000_000 } as any,
  };

  // Add to store
  existingEntries.push(newApp);
  allowlistStore.set(hostId, existingEntries);

  return newApp;
}

/**
 * Remove an entry from the App_Allowlist for a host.
 *
 * @throws RemoteDesktopError if entry not found
 */
export function removeAllowlistEntry(hostId: string, appId: string): void {
  if (!hostId || hostId.trim().length === 0) {
    throw createError('allowlist_empty', 'Host ID is required');
  }

  if (!appId || appId.trim().length === 0) {
    throw createError('allowlist_empty', 'App ID is required');
  }

  const existingEntries = allowlistStore.get(hostId) || [];
  const index = existingEntries.findIndex((e) => e.appId === appId);

  if (index === -1) {
    throw createError(
      'allowlist_empty',
      'Allowlist entry not found',
      { hostId, appId },
    );
  }

  existingEntries.splice(index, 1);
  allowlistStore.set(hostId, existingEntries);
}

/**
 * Update an existing allowlist entry.
 * Only updates provided fields; unset fields remain unchanged.
 * Re-validates the full entry after merging updates.
 *
 * @throws RemoteDesktopError if entry not found or updated values are invalid
 */
export function updateAllowlistEntry(
  hostId: string,
  appId: string,
  updates: AllowlistEntryUpdate,
): RemoteDesktopApp {
  if (!hostId || hostId.trim().length === 0) {
    throw createError('allowlist_empty', 'Host ID is required');
  }

  if (!appId || appId.trim().length === 0) {
    throw createError('allowlist_empty', 'App ID is required');
  }

  const existingEntries = allowlistStore.get(hostId) || [];
  const index = existingEntries.findIndex((e) => e.appId === appId);

  if (index === -1) {
    throw createError(
      'allowlist_empty',
      'Allowlist entry not found',
      { hostId, appId },
    );
  }

  const existing = existingEntries[index];

  // Merge updates with existing values
  const merged: AllowlistEntryInput = {
    displayName: updates.displayName ?? existing.displayName,
    executablePath: updates.executablePath ?? existing.executablePath,
    softwareCategory: updates.softwareCategory ?? existing.softwareCategory,
  };

  // Validate the merged entry
  const validationError = validateEntry(merged);
  if (validationError) {
    throw validationError;
  }

  // Apply updates
  const now = Date.now();
  const updatedApp: RemoteDesktopApp = {
    ...existing,
    displayName: merged.displayName.trim(),
    executablePath: merged.executablePath.trim(),
    softwareCategory: merged.softwareCategory,
    // Re-validate timestamp if path changed
    lastValidatedTimestamp: updates.executablePath
      ? ({ seconds: Math.floor(now / 1000), nanoseconds: (now % 1000) * 1_000_000 } as any)
      : existing.lastValidatedTimestamp,
  };

  existingEntries[index] = updatedApp;
  allowlistStore.set(hostId, existingEntries);

  return updatedApp;
}

/**
 * Get all allowlist entries for a host.
 * Returns an empty array if no entries exist.
 */
export function getAllowlist(hostId: string): RemoteDesktopApp[] {
  if (!hostId || hostId.trim().length === 0) {
    return [];
  }

  return [...(allowlistStore.get(hostId) || [])];
}

/**
 * Mark an allowlist entry as 'unavailable' when heartbeat reports missing exe.
 *
 * Called when the Host Agent reports that a previously validated executable path
 * no longer exists on the host machine (Requirement 2.6).
 *
 * @throws RemoteDesktopError if entry not found
 */
export function markEntryUnavailable(hostId: string, appId: string): RemoteDesktopApp {
  if (!hostId || hostId.trim().length === 0) {
    throw createError('allowlist_empty', 'Host ID is required');
  }

  if (!appId || appId.trim().length === 0) {
    throw createError('allowlist_empty', 'App ID is required');
  }

  const existingEntries = allowlistStore.get(hostId) || [];
  const index = existingEntries.findIndex((e) => e.appId === appId);

  if (index === -1) {
    throw createError(
      'allowlist_empty',
      'Allowlist entry not found',
      { hostId, appId },
    );
  }

  const now = Date.now();
  const updatedApp: RemoteDesktopApp = {
    ...existingEntries[index],
    validationStatus: 'unavailable',
    lastValidatedTimestamp: { seconds: Math.floor(now / 1000), nanoseconds: (now % 1000) * 1_000_000 } as any,
  };

  existingEntries[index] = updatedApp;
  allowlistStore.set(hostId, existingEntries);

  return updatedApp;
}

// ─── Session Snapshot Management ────────────────────────────────────────────────

/**
 * Snapshot the current allowlist for a session.
 *
 * Called at session start to freeze the allowlist — changes to the host's
 * allowlist after this point do not affect the active session (Requirement 2.5).
 */
export function snapshotAllowlistForSession(hostId: string, sessionId: string): RemoteDesktopApp[] {
  const entries = getAllowlist(hostId).filter((e) => e.validationStatus === 'valid');
  sessionSnapshots.set(sessionId, [...entries]);
  return entries;
}

/**
 * Get the frozen allowlist for an active session.
 * Returns the snapshot taken at session start.
 *
 * @returns The frozen allowlist or null if no snapshot exists for the session
 */
export function getActiveSessionAllowlist(sessionId: string): RemoteDesktopApp[] | null {
  if (!sessionId || sessionId.trim().length === 0) {
    return null;
  }

  const snapshot = sessionSnapshots.get(sessionId);
  return snapshot ? [...snapshot] : null;
}

/**
 * Remove a session snapshot (called when session ends).
 */
export function clearSessionSnapshot(sessionId: string): void {
  sessionSnapshots.delete(sessionId);
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Clear all stored data (for testing only).
 * @internal
 */
export function _clearAllData(): void {
  allowlistStore.clear();
  sessionSnapshots.clear();
}

/**
 * Get the raw entry count for a host (for testing).
 * @internal
 */
export function _getEntryCount(hostId: string): number {
  return (allowlistStore.get(hostId) || []).length;
}
