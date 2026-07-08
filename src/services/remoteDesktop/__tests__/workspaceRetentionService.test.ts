/**
 * Workspace Retention Service — Unit Tests
 *
 * Tests workspace retention logic, expiry detection, deadline calculation,
 * file deletion, and audit event writing.
 *
 * Requirements: 8.7
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import {
  isWorkspaceExpired,
  getRetentionDeadline,
  handleExpiry,
  deleteWorkspaceContents,
  getRetentionInfo,
  registerSessionForRetention,
  isSessionExpired,
  RETENTION_PERIOD_MS,
  RETENTION_PERIOD_HOURS,
  _clearAllState,
  _getAuditEvent,
  _getRegisteredCount,
  _getExpiredCount,
} from '../workspaceRetentionService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

/** Create a unique temp directory for test workspaces */
function createTestDir(): string {
  const dir = join(tmpdir(), `architex-retention-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a test file with known content */
function createTestFile(dir: string, name: string, content: string): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────────

let testBaseDir: string;

beforeEach(() => {
  _clearAllState();
  testBaseDir = createTestDir();
});

afterEach(() => {
  _clearAllState();
  try {
    if (existsSync(testBaseDir)) {
      rmSync(testBaseDir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup
  }
});

// ─── Constants ──────────────────────────────────────────────────────────────────

describe('Constants', () => {
  it('should define retention period as 72 hours in milliseconds', () => {
    expect(RETENTION_PERIOD_MS).toBe(72 * 60 * 60 * 1000);
    expect(RETENTION_PERIOD_MS).toBe(259_200_000);
  });

  it('should define retention period as 72 hours', () => {
    expect(RETENTION_PERIOD_HOURS).toBe(72);
  });
});

// ─── isWorkspaceExpired ─────────────────────────────────────────────────────────

describe('isWorkspaceExpired', () => {
  it('should return false when session ended less than 72 hours ago', () => {
    const sessionEnd = Date.now() - (71 * 60 * 60 * 1000); // 71 hours ago
    expect(isWorkspaceExpired(sessionEnd)).toBe(false);
  });

  it('should return true when session ended exactly 72 hours ago', () => {
    const now = Date.now();
    const sessionEnd = now - RETENTION_PERIOD_MS;
    expect(isWorkspaceExpired(sessionEnd, now)).toBe(true);
  });

  it('should return true when session ended more than 72 hours ago', () => {
    const now = Date.now();
    const sessionEnd = now - (73 * 60 * 60 * 1000); // 73 hours ago
    expect(isWorkspaceExpired(sessionEnd, now)).toBe(true);
  });

  it('should return false when session just ended', () => {
    const now = Date.now();
    expect(isWorkspaceExpired(now, now)).toBe(false);
  });

  it('should return false when session end is in the future', () => {
    const now = Date.now();
    const sessionEnd = now + 10000; // 10 seconds in the future
    expect(isWorkspaceExpired(sessionEnd, now)).toBe(false);
  });

  it('should use Date.now() when currentTime is not provided', () => {
    const sessionEnd = Date.now() - (73 * 60 * 60 * 1000);
    expect(isWorkspaceExpired(sessionEnd)).toBe(true);
  });

  it('should return false for invalid sessionEndTimestamp (0)', () => {
    expect(isWorkspaceExpired(0)).toBe(false);
  });

  it('should return false for negative sessionEndTimestamp', () => {
    expect(isWorkspaceExpired(-1000)).toBe(false);
  });

  it('should return false for NaN sessionEndTimestamp', () => {
    expect(isWorkspaceExpired(NaN)).toBe(false);
  });

  it('should return false for Infinity sessionEndTimestamp', () => {
    expect(isWorkspaceExpired(Infinity)).toBe(false);
  });

  it('should return false for invalid currentTime', () => {
    const sessionEnd = Date.now() - (100 * 60 * 60 * 1000);
    expect(isWorkspaceExpired(sessionEnd, NaN)).toBe(false);
    expect(isWorkspaceExpired(sessionEnd, 0)).toBe(false);
    expect(isWorkspaceExpired(sessionEnd, -1)).toBe(false);
  });

  it('should handle boundary case: 1ms before 72 hours', () => {
    const now = 1_000_000_000_000;
    const sessionEnd = now - RETENTION_PERIOD_MS + 1;
    expect(isWorkspaceExpired(sessionEnd, now)).toBe(false);
  });

  it('should handle boundary case: exactly at 72 hours', () => {
    const now = 1_000_000_000_000;
    const sessionEnd = now - RETENTION_PERIOD_MS;
    expect(isWorkspaceExpired(sessionEnd, now)).toBe(true);
  });
});

// ─── getRetentionDeadline ───────────────────────────────────────────────────────

describe('getRetentionDeadline', () => {
  it('should return session end + 72 hours', () => {
    const sessionEnd = 1_700_000_000_000;
    const deadline = getRetentionDeadline(sessionEnd);
    expect(deadline).toBe(sessionEnd + RETENTION_PERIOD_MS);
  });

  it('should return 0 for invalid sessionEndTimestamp (0)', () => {
    expect(getRetentionDeadline(0)).toBe(0);
  });

  it('should return 0 for negative sessionEndTimestamp', () => {
    expect(getRetentionDeadline(-100)).toBe(0);
  });

  it('should return 0 for NaN', () => {
    expect(getRetentionDeadline(NaN)).toBe(0);
  });

  it('should return 0 for Infinity', () => {
    expect(getRetentionDeadline(Infinity)).toBe(0);
  });

  it('should produce a timestamp exactly 72 hours later', () => {
    const sessionEnd = Date.now();
    const deadline = getRetentionDeadline(sessionEnd);
    const differenceHours = (deadline - sessionEnd) / (60 * 60 * 1000);
    expect(differenceHours).toBe(72);
  });
});

// ─── deleteWorkspaceContents ────────────────────────────────────────────────────

describe('deleteWorkspaceContents', () => {
  it('should delete all files in the workspace directory', () => {
    createTestFile(testBaseDir, 'file1.txt', 'content1');
    createTestFile(testBaseDir, 'file2.dwg', 'content2');
    createTestFile(testBaseDir, 'file3.pdf', 'content3');

    const deleted = deleteWorkspaceContents(testBaseDir);

    expect(deleted).toBe(3);
    expect(readdirSync(testBaseDir)).toHaveLength(0);
  });

  it('should delete subdirectories recursively', () => {
    createTestFile(testBaseDir, 'root-file.txt', 'root');
    const subDir = join(testBaseDir, 'subdir');
    mkdirSync(subDir);
    createTestFile(subDir, 'nested.txt', 'nested');

    const deleted = deleteWorkspaceContents(testBaseDir);

    expect(deleted).toBe(2); // root-file.txt + subdir
    expect(readdirSync(testBaseDir)).toHaveLength(0);
  });

  it('should preserve the workspace directory itself', () => {
    createTestFile(testBaseDir, 'file.txt', 'content');

    deleteWorkspaceContents(testBaseDir);

    expect(existsSync(testBaseDir)).toBe(true);
    expect(readdirSync(testBaseDir)).toHaveLength(0);
  });

  it('should return 0 for empty directory', () => {
    const deleted = deleteWorkspaceContents(testBaseDir);
    expect(deleted).toBe(0);
  });

  it('should return 0 for non-existent directory', () => {
    const deleted = deleteWorkspaceContents('/nonexistent/path/xyz123');
    expect(deleted).toBe(0);
  });

  it('should return 0 for empty path', () => {
    const deleted = deleteWorkspaceContents('');
    expect(deleted).toBe(0);
  });

  it('should handle a single file', () => {
    createTestFile(testBaseDir, 'only-file.txt', 'only');

    const deleted = deleteWorkspaceContents(testBaseDir);

    expect(deleted).toBe(1);
    expect(readdirSync(testBaseDir)).toHaveLength(0);
  });
});

// ─── handleExpiry ───────────────────────────────────────────────────────────────

describe('handleExpiry', () => {
  it('should delete workspace files and write audit event when expired', () => {
    const sessionEnd = Date.now() - (73 * 60 * 60 * 1000); // 73 hours ago
    const workspacePath = join(testBaseDir, 'session-expired');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'output.dwg', 'AutoCAD output');
    createTestFile(workspacePath, 'notes.txt', 'Session notes');

    registerSessionForRetention('session-001', sessionEnd, workspacePath, 'host-001', 'owner-001');

    const result = handleExpiry('session-001');

    expect(result.expired).toBe(true);
    expect(result.sessionId).toBe('session-001');
    expect(result.filesDeleted).toBe(2);
    expect(result.workspacePath).toBe(workspacePath);
    expect(result.expiryTimestamp).toBeGreaterThan(0);
    expect(result.auditEventWritten).toBe(true);
    // Workspace directory preserved but empty
    expect(existsSync(workspacePath)).toBe(true);
    expect(readdirSync(workspacePath)).toHaveLength(0);
  });

  it('should write workspace_expired audit event with correct metadata', () => {
    const sessionEnd = Date.now() - (73 * 60 * 60 * 1000);
    const workspacePath = join(testBaseDir, 'session-audit');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'file.txt', 'data');

    registerSessionForRetention('session-audit-001', sessionEnd, workspacePath, 'host-A', 'owner-A');

    handleExpiry('session-audit-001');

    const auditEvent = _getAuditEvent('session-audit-001');
    expect(auditEvent).toBeDefined();
    expect(auditEvent!.sessionId).toBe('session-audit-001');
    expect(auditEvent!.metadata.workspacePath).toBe(workspacePath);
    expect(auditEvent!.metadata.filesDeleted).toBe(1);
    expect(auditEvent!.metadata.sessionEndTimestamp).toBe(sessionEnd);
    expect(auditEvent!.metadata.retentionPeriodHours).toBe(72);
  });

  it('should not expire workspace that is within retention period', () => {
    const sessionEnd = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    const workspacePath = join(testBaseDir, 'session-active');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'work.dwg', 'in-progress work');

    registerSessionForRetention('session-active-001', sessionEnd, workspacePath, 'host-B', 'owner-B');

    const result = handleExpiry('session-active-001');

    expect(result.expired).toBe(false);
    expect(result.filesDeleted).toBe(0);
    expect(existsSync(join(workspacePath, 'work.dwg'))).toBe(true);
  });

  it('should return non-expired result for empty session ID', () => {
    const result = handleExpiry('');
    expect(result.expired).toBe(false);
    expect(result.filesDeleted).toBe(0);
  });

  it('should return non-expired result for unregistered session', () => {
    const result = handleExpiry('nonexistent-session');
    expect(result.expired).toBe(false);
    expect(result.filesDeleted).toBe(0);
  });

  it('should not re-delete files for already expired session', () => {
    const sessionEnd = Date.now() - (80 * 60 * 60 * 1000);
    const workspacePath = join(testBaseDir, 'session-double');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'file.txt', 'once');

    registerSessionForRetention('session-double-001', sessionEnd, workspacePath, 'host-C', 'owner-C');

    // First call should expire
    const first = handleExpiry('session-double-001');
    expect(first.expired).toBe(true);
    expect(first.filesDeleted).toBe(1);

    // Second call should indicate already expired but 0 files deleted
    const second = handleExpiry('session-double-001');
    expect(second.expired).toBe(true);
    expect(second.filesDeleted).toBe(0);
  });

  it('should use custom currentTime for expiry check', () => {
    const sessionEnd = 1_000_000_000_000;
    const workspacePath = join(testBaseDir, 'session-custom-time');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'file.txt', 'data');

    registerSessionForRetention('session-time-001', sessionEnd, workspacePath, 'host-D', 'owner-D');

    // Before expiry
    const beforeResult = handleExpiry('session-time-001', {
      currentTime: sessionEnd + RETENTION_PERIOD_MS - 1,
    });
    expect(beforeResult.expired).toBe(false);

    // After expiry
    const afterResult = handleExpiry('session-time-001', {
      currentTime: sessionEnd + RETENTION_PERIOD_MS,
    });
    expect(afterResult.expired).toBe(true);
    expect(afterResult.filesDeleted).toBe(1);
  });

  it('should use custom audit writer', () => {
    const sessionEnd = Date.now() - (73 * 60 * 60 * 1000);
    const workspacePath = join(testBaseDir, 'session-custom-audit');
    mkdirSync(workspacePath, { recursive: true });

    registerSessionForRetention('session-ca-001', sessionEnd, workspacePath, 'host-E', 'owner-E');

    let writerCalled = false;
    const customWriter = {
      writeWorkspaceExpiredEvent: () => {
        writerCalled = true;
        return true;
      },
    };

    handleExpiry('session-ca-001', { auditWriter: customWriter });

    expect(writerCalled).toBe(true);
  });

  it('should handle audit writer failure gracefully', () => {
    const sessionEnd = Date.now() - (73 * 60 * 60 * 1000);
    const workspacePath = join(testBaseDir, 'session-audit-fail');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'file.txt', 'data');

    registerSessionForRetention('session-af-001', sessionEnd, workspacePath, 'host-F', 'owner-F');

    const failingWriter = {
      writeWorkspaceExpiredEvent: () => {
        throw new Error('Firestore write failed');
      },
    };

    const result = handleExpiry('session-af-001', { auditWriter: failingWriter });

    // Files should still be deleted even if audit fails
    expect(result.expired).toBe(true);
    expect(result.filesDeleted).toBe(1);
    expect(result.auditEventWritten).toBe(false);
  });
});

// ─── registerSessionForRetention ────────────────────────────────────────────────

describe('registerSessionForRetention', () => {
  it('should register a session for retention tracking', () => {
    registerSessionForRetention('session-reg-001', Date.now(), '/path/to/workspace', 'host-1', 'owner-1');
    expect(_getRegisteredCount()).toBe(1);
  });

  it('should allow retrieval via getRetentionInfo', () => {
    const sessionEnd = 1_700_000_000_000;
    registerSessionForRetention('session-reg-002', sessionEnd, '/path', 'host-2', 'owner-2');

    const info = getRetentionInfo('session-reg-002');
    expect(info).toBeDefined();
    expect(info!.sessionId).toBe('session-reg-002');
    expect(info!.sessionEndTimestamp).toBe(sessionEnd);
  });

  it('should not register with invalid session ID', () => {
    registerSessionForRetention('', Date.now(), '/path', 'host-3', 'owner-3');
    expect(_getRegisteredCount()).toBe(0);
  });

  it('should not register with invalid timestamp', () => {
    registerSessionForRetention('session-reg-003', 0, '/path', 'host-4', 'owner-4');
    expect(_getRegisteredCount()).toBe(0);
  });

  it('should not register with empty workspace path', () => {
    registerSessionForRetention('session-reg-004', Date.now(), '', 'host-5', 'owner-5');
    expect(_getRegisteredCount()).toBe(0);
  });
});

// ─── getRetentionInfo ───────────────────────────────────────────────────────────

describe('getRetentionInfo', () => {
  it('should return null for unregistered session', () => {
    expect(getRetentionInfo('unknown-session')).toBeNull();
  });

  it('should return correct retention info for non-expired session', () => {
    const now = Date.now();
    const sessionEnd = now - (24 * 60 * 60 * 1000); // 24 hours ago
    registerSessionForRetention('session-info-001', sessionEnd, '/path', 'host-1', 'owner-1');

    const info = getRetentionInfo('session-info-001', now);
    expect(info).toBeDefined();
    expect(info!.isExpired).toBe(false);
    expect(info!.retentionDeadline).toBe(sessionEnd + RETENTION_PERIOD_MS);
    expect(info!.remainingMs).toBeGreaterThan(0);
    // Remaining should be approximately 48 hours
    const remainingHours = info!.remainingMs / (60 * 60 * 1000);
    expect(remainingHours).toBeCloseTo(48, 0);
  });

  it('should return correct retention info for expired session', () => {
    const now = Date.now();
    const sessionEnd = now - (80 * 60 * 60 * 1000); // 80 hours ago
    registerSessionForRetention('session-info-002', sessionEnd, '/path', 'host-2', 'owner-2');

    const info = getRetentionInfo('session-info-002', now);
    expect(info).toBeDefined();
    expect(info!.isExpired).toBe(true);
    expect(info!.remainingMs).toBe(0);
  });

  it('should return deadline exactly 72 hours after session end', () => {
    const sessionEnd = 1_700_000_000_000;
    registerSessionForRetention('session-info-003', sessionEnd, '/path', 'host-3', 'owner-3');

    const info = getRetentionInfo('session-info-003');
    expect(info!.retentionDeadline).toBe(sessionEnd + RETENTION_PERIOD_MS);
  });
});

// ─── isSessionExpired ───────────────────────────────────────────────────────────

describe('isSessionExpired', () => {
  it('should return false for session not yet expired', () => {
    expect(isSessionExpired('session-not-expired')).toBe(false);
  });

  it('should return true after handleExpiry processes the session', () => {
    const sessionEnd = Date.now() - (73 * 60 * 60 * 1000);
    const workspacePath = join(testBaseDir, 'session-check-expired');
    mkdirSync(workspacePath, { recursive: true });

    registerSessionForRetention('session-check-001', sessionEnd, workspacePath, 'host-1', 'owner-1');

    expect(isSessionExpired('session-check-001')).toBe(false);
    handleExpiry('session-check-001');
    expect(isSessionExpired('session-check-001')).toBe(true);
  });
});

// ─── Integration: Full Retention Lifecycle ──────────────────────────────────────

describe('Full Retention Lifecycle', () => {
  it('should support register → check → expire flow', () => {
    const now = 1_700_000_000_000;
    const sessionEnd = now - (74 * 60 * 60 * 1000); // 74 hours before "now"
    const workspacePath = join(testBaseDir, 'lifecycle-session');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'final-output.rvt', 'Revit model data');
    createTestFile(workspacePath, 'schedule.xlsx', 'Project schedule');

    // 1. Register session
    registerSessionForRetention('lifecycle-001', sessionEnd, workspacePath, 'host-lifecycle', 'owner-lifecycle');
    expect(_getRegisteredCount()).toBe(1);

    // 2. Check retention info
    const info = getRetentionInfo('lifecycle-001', now);
    expect(info!.isExpired).toBe(true);
    expect(info!.remainingMs).toBe(0);

    // 3. Verify files exist before expiry
    expect(readdirSync(workspacePath)).toHaveLength(2);

    // 4. Handle expiry
    const result = handleExpiry('lifecycle-001', { currentTime: now });
    expect(result.expired).toBe(true);
    expect(result.filesDeleted).toBe(2);
    expect(result.auditEventWritten).toBe(true);

    // 5. Verify files deleted
    expect(readdirSync(workspacePath)).toHaveLength(0);
    expect(existsSync(workspacePath)).toBe(true); // Directory preserved

    // 6. Verify audit event
    const audit = _getAuditEvent('lifecycle-001');
    expect(audit).toBeDefined();
    expect(audit!.metadata.filesDeleted).toBe(2);
    expect(audit!.metadata.retentionPeriodHours).toBe(72);

    // 7. Session is now marked as expired
    expect(isSessionExpired('lifecycle-001')).toBe(true);
  });

  it('should not expire workspace within retention period', () => {
    const now = Date.now();
    const sessionEnd = now - (48 * 60 * 60 * 1000); // 48 hours ago (within 72h)
    const workspacePath = join(testBaseDir, 'retained-session');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'work-in-progress.dwg', 'ongoing work');

    registerSessionForRetention('retained-001', sessionEnd, workspacePath, 'host-R', 'owner-R');

    const info = getRetentionInfo('retained-001', now);
    expect(info!.isExpired).toBe(false);
    expect(info!.remainingMs).toBeGreaterThan(0);

    const result = handleExpiry('retained-001', { currentTime: now });
    expect(result.expired).toBe(false);
    expect(result.filesDeleted).toBe(0);

    // File should still exist
    expect(existsSync(join(workspacePath, 'work-in-progress.dwg'))).toBe(true);
  });
});

// ─── _clearAllState ─────────────────────────────────────────────────────────────

describe('_clearAllState', () => {
  it('should clear all registrations, expirations, and audit events', () => {
    registerSessionForRetention('s1', Date.now(), '/path1', 'h1', 'o1');
    registerSessionForRetention('s2', Date.now(), '/path2', 'h2', 'o2');

    expect(_getRegisteredCount()).toBe(2);

    _clearAllState();

    expect(_getRegisteredCount()).toBe(0);
    expect(_getExpiredCount()).toBe(0);
    expect(getRetentionInfo('s1')).toBeNull();
    expect(getRetentionInfo('s2')).toBeNull();
  });
});
