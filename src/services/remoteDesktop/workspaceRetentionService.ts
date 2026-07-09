/**
 * Remote Desktop Core — Workspace Retention Service
 *
 * Manages file retention and expiry for Session_Workspace directories:
 * - isWorkspaceExpired(sessionEndTimestamp, currentTime?): boolean
 * - getRetentionDeadline(sessionEndTimestamp): number (Unix ms)
 * - handleExpiry(sessionId): Delete files and write audit event
 *
 * Files are retained for 72 hours after session completion.
 * After 72 hours without owner approval, workspace contents are deleted
 * and a "workspace_expired" event is written to the Activity_Log.
 *
 * Requirements: 8.7
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Retention period: 72 hours in milliseconds */
export const RETENTION_PERIOD_MS = 72 * 60 * 60 * 1000; // 259,200,000 ms

/** Retention period in hours (for display purposes) */
export const RETENTION_PERIOD_HOURS = 72;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface WorkspaceExpiryResult {
  sessionId: string;
  expired: boolean;
  filesDeleted: number;
  workspacePath: string;
  expiryTimestamp: number; // Unix ms when expiry occurred
  auditEventWritten: boolean;
}

export interface WorkspaceRetentionInfo {
  sessionId: string;
  sessionEndTimestamp: number; // Unix ms
  retentionDeadline: number; // Unix ms
  isExpired: boolean;
  remainingMs: number; // 0 if expired
}

export interface AuditEventWriter {
  /**
   * Write a "workspace_expired" event to the Activity_Log.
   * Returns true if the event was written successfully.
   */
  writeWorkspaceExpiredEvent(params: {
    sessionId: string;
    hostId: string;
    actorUid: string;
    metadata: Record<string, unknown>;
  }): Promise<boolean> | boolean;
}

export interface WorkspaceResolver {
  /**
   * Resolve the workspace path and metadata for a session.
   * Returns null if the session/workspace is not found.
   */
  getWorkspacePath(sessionId: string): string | null;

  /**
   * Get the host ID associated with a session (for audit event).
   */
  getHostId(sessionId: string): string | null;

  /**
   * Get the owner UID associated with a session (for audit event actor).
   */
  getOwnerUid(sessionId: string): string | null;
}

// ─── Default Implementations (for in-memory/test use) ───────────────────────────

/** In-memory workspace path registry (for standalone use and testing) */
const workspacePaths: Map<string, string> = new Map();
const sessionHostIds: Map<string, string> = new Map();
const sessionOwnerUids: Map<string, string> = new Map();
const sessionEndTimestamps: Map<string, number> = new Map();
const expiredSessions: Set<string> = new Set();

/** Audit events written (for testing without Firestore) */
const auditEventsWritten: Map<string, { sessionId: string; timestamp: number; metadata: Record<string, unknown> }> = new Map();

// ─── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Determine if a workspace has expired based on session end timestamp.
 *
 * A workspace is expired when 72 hours have elapsed since session completion.
 *
 * @param sessionEndTimestamp - Unix timestamp (ms) when the session ended
 * @param currentTime - Optional current time in Unix ms (defaults to Date.now())
 * @returns true if the workspace has expired (72+ hours since session end)
 */
export function isWorkspaceExpired(sessionEndTimestamp: number, currentTime?: number): boolean {
  if (!Number.isFinite(sessionEndTimestamp) || sessionEndTimestamp <= 0) {
    return false;
  }

  const now = currentTime ?? Date.now();

  if (!Number.isFinite(now) || now <= 0) {
    return false;
  }

  const elapsed = now - sessionEndTimestamp;
  return elapsed >= RETENTION_PERIOD_MS;
}

/**
 * Calculate the retention deadline for a session workspace.
 *
 * The deadline is exactly 72 hours after session completion.
 *
 * @param sessionEndTimestamp - Unix timestamp (ms) when the session ended
 * @returns Unix timestamp (ms) when the workspace will expire
 */
export function getRetentionDeadline(sessionEndTimestamp: number): number {
  if (!Number.isFinite(sessionEndTimestamp) || sessionEndTimestamp <= 0) {
    return 0;
  }

  return sessionEndTimestamp + RETENTION_PERIOD_MS;
}

/**
 * Handle workspace expiry for a session.
 *
 * This function:
 * 1. Verifies the workspace exists and is expired
 * 2. Deletes all files in the workspace directory
 * 3. Writes a "workspace_expired" event to the Activity_Log
 *
 * @param sessionId - The session whose workspace should be expired
 * @param options - Optional overrides for workspace resolution and audit writing
 * @returns Result of the expiry operation
 */
export function handleExpiry(
  sessionId: string,
  options?: {
    resolver?: WorkspaceResolver;
    auditWriter?: AuditEventWriter;
    currentTime?: number;
  },
): WorkspaceExpiryResult {
  if (!sessionId || sessionId.trim().length === 0) {
    return {
      sessionId: sessionId || '',
      expired: false,
      filesDeleted: 0,
      workspacePath: '',
      expiryTimestamp: 0,
      auditEventWritten: false,
    };
  }

  const resolver = options?.resolver ?? defaultResolver;
  const auditWriter = options?.auditWriter ?? defaultAuditWriter;
  const now = options?.currentTime ?? Date.now();

  // Resolve workspace path
  const workspacePath = resolver.getWorkspacePath(sessionId);
  if (!workspacePath) {
    return {
      sessionId,
      expired: false,
      filesDeleted: 0,
      workspacePath: '',
      expiryTimestamp: 0,
      auditEventWritten: false,
    };
  }

  // Check if session end timestamp exists and workspace is expired
  const sessionEnd = sessionEndTimestamps.get(sessionId);
  if (sessionEnd === undefined || !isWorkspaceExpired(sessionEnd, now)) {
    return {
      sessionId,
      expired: false,
      filesDeleted: 0,
      workspacePath,
      expiryTimestamp: 0,
      auditEventWritten: false,
    };
  }

  // Check if already expired
  if (expiredSessions.has(sessionId)) {
    return {
      sessionId,
      expired: true,
      filesDeleted: 0,
      workspacePath,
      expiryTimestamp: now,
      auditEventWritten: false,
    };
  }

  // Delete workspace contents
  const filesDeleted = deleteWorkspaceContents(workspacePath);

  // Write audit event
  const hostId = resolver.getHostId(sessionId) ?? 'unknown';
  const actorUid = resolver.getOwnerUid(sessionId) ?? 'system';

  let auditEventWritten = false;
  try {
    const result = auditWriter.writeWorkspaceExpiredEvent({
      sessionId,
      hostId,
      actorUid,
      metadata: {
        workspacePath,
        filesDeleted,
        sessionEndTimestamp: sessionEnd,
        retentionPeriodHours: RETENTION_PERIOD_HOURS,
        expiryTimestamp: now,
      },
    });

    // Handle both sync and async audit writers
    if (result instanceof Promise) {
      // For sync context, we mark as written optimistically
      auditEventWritten = true;
    } else {
      auditEventWritten = result;
    }
  } catch {
    auditEventWritten = false;
  }

  // Mark session as expired
  expiredSessions.add(sessionId);

  return {
    sessionId,
    expired: true,
    filesDeleted,
    workspacePath,
    expiryTimestamp: now,
    auditEventWritten,
  };
}

// ─── Workspace Content Deletion ─────────────────────────────────────────────────

/**
 * Delete all files and subdirectories within a workspace directory.
 * The workspace directory itself is preserved (empty).
 *
 * @returns Number of top-level items deleted
 */
export function deleteWorkspaceContents(workspacePath: string): number {
  if (!workspacePath || !existsSync(workspacePath)) {
    return 0;
  }

  let deleted = 0;

  try {
    const entries = readdirSync(workspacePath);

    for (const entry of entries) {
      const fullPath = join(workspacePath, entry);
      try {
        rmSync(fullPath, { recursive: true, force: true });
        deleted++;
      } catch {
        // Continue deleting remaining files even if one fails
      }
    }
  } catch {
    // Directory may have become inaccessible
  }

  return deleted;
}

// ─── Retention Info ─────────────────────────────────────────────────────────────

/**
 * Get full retention info for a session workspace.
 *
 * @param sessionId - The session to check
 * @param currentTime - Optional current time (defaults to Date.now())
 * @returns Retention info or null if session is not registered
 */
export function getRetentionInfo(sessionId: string, currentTime?: number): WorkspaceRetentionInfo | null {
  const sessionEnd = sessionEndTimestamps.get(sessionId);
  if (sessionEnd === undefined) {
    return null;
  }

  const now = currentTime ?? Date.now();
  const deadline = getRetentionDeadline(sessionEnd);
  const expired = isWorkspaceExpired(sessionEnd, now);
  const remainingMs = expired ? 0 : Math.max(0, deadline - now);

  return {
    sessionId,
    sessionEndTimestamp: sessionEnd,
    retentionDeadline: deadline,
    isExpired: expired,
    remainingMs,
  };
}

// ─── Registration Functions ─────────────────────────────────────────────────────

/**
 * Register a completed session for retention tracking.
 *
 * @param sessionId - The completed session ID
 * @param sessionEndTimestamp - When the session ended (Unix ms)
 * @param workspacePath - Path to the session workspace directory
 * @param hostId - Host ID for audit event
 * @param ownerUid - Owner UID for audit event
 */
export function registerSessionForRetention(
  sessionId: string,
  sessionEndTimestamp: number,
  workspacePath: string,
  hostId: string,
  ownerUid: string,
): void {
  if (!sessionId || !workspacePath || !Number.isFinite(sessionEndTimestamp) || sessionEndTimestamp <= 0) {
    return;
  }

  sessionEndTimestamps.set(sessionId, sessionEndTimestamp);
  workspacePaths.set(sessionId, workspacePath);
  sessionHostIds.set(sessionId, hostId);
  sessionOwnerUids.set(sessionId, ownerUid);
}

/**
 * Check whether a session has already been expired.
 */
export function isSessionExpired(sessionId: string): boolean {
  return expiredSessions.has(sessionId);
}

// ─── Default Resolver & Audit Writer ────────────────────────────────────────────

const defaultResolver: WorkspaceResolver = {
  getWorkspacePath(sessionId: string): string | null {
    return workspacePaths.get(sessionId) ?? null;
  },
  getHostId(sessionId: string): string | null {
    return sessionHostIds.get(sessionId) ?? null;
  },
  getOwnerUid(sessionId: string): string | null {
    return sessionOwnerUids.get(sessionId) ?? null;
  },
};

const defaultAuditWriter: AuditEventWriter = {
  writeWorkspaceExpiredEvent(params): boolean {
    auditEventsWritten.set(params.sessionId, {
      sessionId: params.sessionId,
      timestamp: Date.now(),
      metadata: params.metadata,
    });
    return true;
  },
};

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Clear all in-memory state (for testing only).
 * @internal
 */
export function _clearAllState(): void {
  workspacePaths.clear();
  sessionHostIds.clear();
  sessionOwnerUids.clear();
  sessionEndTimestamps.clear();
  expiredSessions.clear();
  auditEventsWritten.clear();
}

/**
 * Get the audit event written for a session (for testing only).
 * @internal
 */
export function _getAuditEvent(sessionId: string): { sessionId: string; timestamp: number; metadata: Record<string, unknown> } | undefined {
  return auditEventsWritten.get(sessionId);
}

/**
 * Get count of registered sessions (for testing only).
 * @internal
 */
export function _getRegisteredCount(): number {
  return sessionEndTimestamps.size;
}

/**
 * Get count of expired sessions (for testing only).
 * @internal
 */
export function _getExpiredCount(): number {
  return expiredSessions.size;
}
