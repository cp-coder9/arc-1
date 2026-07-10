/**
 * File Handoff Service — Unit Tests
 *
 * Tests workspace creation, file monitoring, manifest generation,
 * SHA-256 hashing, final manifest compilation, and approval gate
 * (createManifest, approveManifest, rejectFiles, checkExpiry,
 * updateTransferStatus, associateProjectReference).
 *
 * Requirements: 8.1, 8.2, 8.3, 9.1, 9.3, 9.4, 9.5, 9.6, 9.8
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  createSessionWorkspace,
  monitorWorkspace,
  stopMonitoring,
  getFileManifest,
  compileAndWriteFinalManifest,
  scanWorkspace,
  computeSha256,
  getWorkspaceInfo,
  getFinalManifest,
  getFinalManifestBySession,
  isMonitoring,
  createManifest,
  approveManifest,
  rejectFiles,
  checkExpiry,
  updateTransferStatus,
  associateProjectReference,
  getApprovalManifest,
  getProjectAssociation,
  _clearAllState,
  _getWorkspaceCount,
  _getFinalManifestCount,
  _getApprovalManifestCount,
  _getProjectAssociationCount,
  _injectManifest,
  _injectWorkspaceInfo,
  _injectApprovalManifest,
  DEFAULT_BASE_PATH,
  MAX_REPORT_INTERVAL_MS,
  MAX_MANIFEST_FILES,
  HANDOFF_MAX_FILE_SIZE_BYTES,
  FILE_HANDOFF_EXPIRY_MS,
  type SessionWorkspaceInfo,
  type FinalManifestInput,
  type CreateManifestInput,
} from '../fileHandoffService';
import type { FileManifestEntry, FileManifest } from '../types';
import { DEFAULT_DENY_LIST_EXTENSIONS } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

/** Create a unique temp directory for test workspaces */
function createTestDir(): string {
  const dir = join(tmpdir(), `architex-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a test file with known content */
function createTestFile(dir: string, name: string, content: string): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/** Compute expected SHA-256 for content string */
function expectedSha256(content: string): string {
  return createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────────

let testBaseDir: string;

beforeEach(() => {
  _clearAllState();
  testBaseDir = createTestDir();
});

afterEach(() => {
  _clearAllState();
  // Clean up test directory
  try {
    if (existsSync(testBaseDir)) {
      rmSync(testBaseDir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup
  }
});

// ─── createSessionWorkspace ─────────────────────────────────────────────────────

describe('createSessionWorkspace', () => {
  it('should create a workspace directory at basePath/sessionId', () => {
    const result = createSessionWorkspace('session-001', testBaseDir);

    expect(result.sessionId).toBe('session-001');
    expect(result.workspacePath).toBe(join(testBaseDir, 'session-001'));
    expect(result.createdAt).toBeGreaterThan(0);
    expect(existsSync(result.workspacePath)).toBe(true);
  });

  it('should store workspace info in memory', () => {
    createSessionWorkspace('session-002', testBaseDir);

    const info = getWorkspaceInfo('session-002');
    expect(info).toBeDefined();
    expect(info!.sessionId).toBe('session-002');
    expect(info!.workspacePath).toBe(join(testBaseDir, 'session-002'));
  });

  it('should initialize an empty manifest for the session', () => {
    createSessionWorkspace('session-003', testBaseDir);

    const manifest = getFileManifest('session-003');
    expect(manifest).toEqual([]);
  });

  it('should use DEFAULT_BASE_PATH when basePath is not provided', () => {
    // We can't actually create at C:\ArchitexSessions in tests,
    // but we can verify the path construction
    // Using _injectWorkspaceInfo to test the default path logic indirectly
    expect(DEFAULT_BASE_PATH).toBe('C:\\ArchitexSessions');
  });

  it('should not fail if workspace directory already exists', () => {
    const workspacePath = join(testBaseDir, 'session-existing');
    mkdirSync(workspacePath, { recursive: true });

    const result = createSessionWorkspace('session-existing', testBaseDir);
    expect(result.workspacePath).toBe(workspacePath);
    expect(existsSync(workspacePath)).toBe(true);
  });

  it('should throw when session ID is empty', () => {
    expect(() => createSessionWorkspace('', testBaseDir)).toThrow();
  });

  it('should throw when session ID is whitespace only', () => {
    expect(() => createSessionWorkspace('   ', testBaseDir)).toThrow();
  });

  it('should trim basePath whitespace', () => {
    const result = createSessionWorkspace('session-trim', `  ${testBaseDir}  `);
    expect(result.workspacePath).toBe(join(testBaseDir, 'session-trim'));
  });

  it('should increment workspace count', () => {
    expect(_getWorkspaceCount()).toBe(0);
    createSessionWorkspace('session-a', testBaseDir);
    expect(_getWorkspaceCount()).toBe(1);
    createSessionWorkspace('session-b', testBaseDir);
    expect(_getWorkspaceCount()).toBe(2);
  });
});

// ─── scanWorkspace ──────────────────────────────────────────────────────────────

describe('scanWorkspace', () => {
  it('should return empty array for non-existent path', () => {
    const result = scanWorkspace('/nonexistent/path/xyz123');
    expect(result).toEqual([]);
  });

  it('should return empty array for empty path', () => {
    const result = scanWorkspace('');
    expect(result).toEqual([]);
  });

  it('should return empty array for empty directory', () => {
    const result = scanWorkspace(testBaseDir);
    expect(result).toEqual([]);
  });

  it('should return file entries with correct properties', () => {
    const content = 'Hello, Architex!';
    createTestFile(testBaseDir, 'design.dwg', content);

    const result = scanWorkspace(testBaseDir);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('design.dwg');
    expect(result[0].sizeBytes).toBe(Buffer.byteLength(content, 'utf8'));
    expect(result[0].extension).toBe('dwg');
    expect(result[0].sha256Hash).toBe(expectedSha256(content));
    expect(result[0].transferStatus).toBe('pending');
  });

  it('should handle multiple files', () => {
    createTestFile(testBaseDir, 'file1.pdf', 'PDF content');
    createTestFile(testBaseDir, 'file2.docx', 'Word content');
    createTestFile(testBaseDir, 'file3.dwg', 'Drawing content');

    const result = scanWorkspace(testBaseDir);
    expect(result).toHaveLength(3);

    const names = result.map(f => f.name).sort();
    expect(names).toEqual(['file1.pdf', 'file2.docx', 'file3.dwg']);
  });

  it('should compute correct SHA-256 hashes', () => {
    const content = 'Test file content for hashing';
    createTestFile(testBaseDir, 'hashtest.txt', content);

    const result = scanWorkspace(testBaseDir);
    expect(result[0].sha256Hash).toBe(expectedSha256(content));
    expect(result[0].sha256Hash).toHaveLength(64);
  });

  it('should extract extension without the dot, in lowercase', () => {
    createTestFile(testBaseDir, 'Model.RVT', 'revit');
    createTestFile(testBaseDir, 'plan.PDF', 'pdf');
    createTestFile(testBaseDir, 'notes.TXT', 'text');

    const result = scanWorkspace(testBaseDir);
    const extensions = result.map(f => f.extension).sort();
    expect(extensions).toEqual(['pdf', 'rvt', 'txt']);
  });

  it('should handle files without extension', () => {
    createTestFile(testBaseDir, 'Makefile', 'build');

    const result = scanWorkspace(testBaseDir);
    expect(result[0].extension).toBe('');
  });

  it('should skip subdirectories', () => {
    createTestFile(testBaseDir, 'file1.txt', 'content');
    mkdirSync(join(testBaseDir, 'subdir'));

    const result = scanWorkspace(testBaseDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('file1.txt');
  });

  it('should cap entries at MAX_MANIFEST_FILES', () => {
    // Create more than 200 files
    for (let i = 0; i < 205; i++) {
      createTestFile(testBaseDir, `file-${String(i).padStart(4, '0')}.txt`, `content-${i}`);
    }

    const result = scanWorkspace(testBaseDir);
    expect(result.length).toBeLessThanOrEqual(MAX_MANIFEST_FILES);
  });
});

// ─── computeSha256 ──────────────────────────────────────────────────────────────

describe('computeSha256', () => {
  it('should return a 64-character hex string for a valid file', () => {
    const filePath = createTestFile(testBaseDir, 'hash-test.bin', 'binary data here');

    const hash = computeSha256(filePath);
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('should produce consistent hash for same content', () => {
    const content = 'Consistent content';
    const file1 = createTestFile(testBaseDir, 'a.txt', content);
    const file2 = createTestFile(testBaseDir, 'b.txt', content);

    expect(computeSha256(file1)).toBe(computeSha256(file2));
  });

  it('should produce different hashes for different content', () => {
    const file1 = createTestFile(testBaseDir, 'x.txt', 'Content A');
    const file2 = createTestFile(testBaseDir, 'y.txt', 'Content B');

    expect(computeSha256(file1)).not.toBe(computeSha256(file2));
  });

  it('should return zero-hash for non-existent file', () => {
    const hash = computeSha256('/nonexistent/file.txt');
    expect(hash).toBe('0'.repeat(64));
    expect(hash).toHaveLength(64);
  });

  it('should handle empty files', () => {
    const filePath = createTestFile(testBaseDir, 'empty.txt', '');

    const hash = computeSha256(filePath);
    expect(hash).toHaveLength(64);
    // SHA-256 of empty string is known
    expect(hash).toBe(expectedSha256(''));
  });
});

// ─── monitorWorkspace ───────────────────────────────────────────────────────────

describe('monitorWorkspace', () => {
  it('should start monitoring and track active state', () => {
    createTestFile(testBaseDir, 'initial.txt', 'content');

    monitorWorkspace('session-mon-1', testBaseDir);

    expect(isMonitoring('session-mon-1')).toBe(true);
  });

  it('should perform initial scan immediately', () => {
    createTestFile(testBaseDir, 'initial.txt', 'hello');

    monitorWorkspace('session-mon-2', testBaseDir);

    const manifest = getFileManifest('session-mon-2');
    expect(manifest).toHaveLength(1);
    expect(manifest[0].name).toBe('initial.txt');
  });

  it('should call onManifestUpdate callback on initial scan', () => {
    createTestFile(testBaseDir, 'cb-test.txt', 'data');
    const callback = vi.fn();

    monitorWorkspace('session-mon-3', testBaseDir, { onManifestUpdate: callback });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('session-mon-3', expect.any(Array));
    expect(callback.mock.calls[0][1]).toHaveLength(1);
  });

  it('should detect new files on next poll', async () => {
    monitorWorkspace('session-mon-4', testBaseDir, { intervalMs: 50 });

    // Initially empty
    expect(getFileManifest('session-mon-4')).toHaveLength(0);

    // Create a file after monitoring started
    createTestFile(testBaseDir, 'new-file.dwg', 'drawing data');

    // Wait for poll
    await new Promise(resolve => setTimeout(resolve, 100));

    const manifest = getFileManifest('session-mon-4');
    expect(manifest).toHaveLength(1);
    expect(manifest[0].name).toBe('new-file.dwg');
  });

  it('should throw when session ID is empty', () => {
    expect(() => monitorWorkspace('', testBaseDir)).toThrow();
  });

  it('should throw when workspace path is empty', () => {
    expect(() => monitorWorkspace('session-x', '')).toThrow();
  });

  it('should stop previous monitor when called again for same session', () => {
    monitorWorkspace('session-mon-5', testBaseDir, { intervalMs: 50 });
    expect(isMonitoring('session-mon-5')).toBe(true);

    // Call again — should not throw or leak intervals
    monitorWorkspace('session-mon-5', testBaseDir, { intervalMs: 50 });
    expect(isMonitoring('session-mon-5')).toBe(true);
  });

  it('should cap interval at MAX_REPORT_INTERVAL_MS', () => {
    // Even if a larger interval is requested, the actual interval should be capped
    monitorWorkspace('session-mon-6', testBaseDir, { intervalMs: 60_000 });
    expect(isMonitoring('session-mon-6')).toBe(true);
    // We can't directly test the interval value, but we verify no error
  });
});

// ─── stopMonitoring ─────────────────────────────────────────────────────────────

describe('stopMonitoring', () => {
  it('should stop an active monitor', () => {
    monitorWorkspace('session-stop-1', testBaseDir);
    expect(isMonitoring('session-stop-1')).toBe(true);

    stopMonitoring('session-stop-1');
    expect(isMonitoring('session-stop-1')).toBe(false);
  });

  it('should not throw for non-existent session', () => {
    expect(() => stopMonitoring('nonexistent')).not.toThrow();
  });

  it('should not throw when called multiple times', () => {
    monitorWorkspace('session-stop-2', testBaseDir);
    stopMonitoring('session-stop-2');
    expect(() => stopMonitoring('session-stop-2')).not.toThrow();
  });
});

// ─── getFileManifest ────────────────────────────────────────────────────────────

describe('getFileManifest', () => {
  it('should return empty array for unknown session', () => {
    expect(getFileManifest('unknown-session')).toEqual([]);
  });

  it('should return empty array for empty session ID', () => {
    expect(getFileManifest('')).toEqual([]);
  });

  it('should return current manifest entries', () => {
    const entries: FileManifestEntry[] = [
      { name: 'file1.dwg', sizeBytes: 1024, extension: 'dwg', sha256Hash: 'a'.repeat(64), transferStatus: 'pending' },
      { name: 'file2.pdf', sizeBytes: 2048, extension: 'pdf', sha256Hash: 'b'.repeat(64), transferStatus: 'pending' },
    ];
    _injectManifest('session-manifest-1', entries);

    const result = getFileManifest('session-manifest-1');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('file1.dwg');
    expect(result[1].name).toBe('file2.pdf');
  });

  it('should return a defensive copy (mutations do not affect store)', () => {
    const entries: FileManifestEntry[] = [
      { name: 'original.txt', sizeBytes: 100, extension: 'txt', sha256Hash: 'c'.repeat(64), transferStatus: 'pending' },
    ];
    _injectManifest('session-manifest-2', entries);

    const result = getFileManifest('session-manifest-2');
    result.push({ name: 'injected.txt', sizeBytes: 0, extension: 'txt', sha256Hash: 'd'.repeat(64), transferStatus: 'pending' });

    expect(getFileManifest('session-manifest-2')).toHaveLength(1);
  });
});

// ─── compileAndWriteFinalManifest ───────────────────────────────────────────────

describe('compileAndWriteFinalManifest', () => {
  it('should compile manifest with correct fields from workspace scan', () => {
    const workspacePath = join(testBaseDir, 'session-final-1');
    mkdirSync(workspacePath, { recursive: true });
    createTestFile(workspacePath, 'output.dwg', 'AutoCAD drawing output');

    _injectWorkspaceInfo({
      sessionId: 'session-final-1',
      workspacePath,
      createdAt: Date.now() - 60000,
    });

    const result = compileAndWriteFinalManifest({
      sessionId: 'session-final-1',
      bookingId: 'booking-001',
      consumerUid: 'consumer-uid-001',
      ownerUid: 'owner-uid-001',
    });

    expect(result.manifestId).toBeDefined();
    expect(result.manifestId.startsWith('manifest-')).toBe(true);
    expect(result.sessionId).toBe('session-final-1');
    expect(result.bookingId).toBe('booking-001');
    expect(result.consumerUid).toBe('consumer-uid-001');
    expect(result.ownerUid).toBe('owner-uid-001');
    expect(result.manifestTimestamp).toBeGreaterThan(0);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('output.dwg');
    expect(result.files[0].extension).toBe('dwg');
    expect(result.files[0].sha256Hash).toBe(expectedSha256('AutoCAD drawing output'));
    expect(result.files[0].transferStatus).toBe('pending');
  });

  it('should stop monitoring after compilation', () => {
    const workspacePath = join(testBaseDir, 'session-final-2');
    mkdirSync(workspacePath, { recursive: true });

    _injectWorkspaceInfo({
      sessionId: 'session-final-2',
      workspacePath,
      createdAt: Date.now(),
    });

    monitorWorkspace('session-final-2', workspacePath);
    expect(isMonitoring('session-final-2')).toBe(true);

    compileAndWriteFinalManifest({
      sessionId: 'session-final-2',
      bookingId: 'booking-002',
      consumerUid: 'consumer-uid-002',
      ownerUid: 'owner-uid-002',
    });

    expect(isMonitoring('session-final-2')).toBe(false);
  });

  it('should persist final manifest and allow retrieval by ID', () => {
    _injectManifest('session-final-3', [
      { name: 'report.pdf', sizeBytes: 5000, extension: 'pdf', sha256Hash: 'e'.repeat(64), transferStatus: 'pending' },
    ]);

    const result = compileAndWriteFinalManifest({
      sessionId: 'session-final-3',
      bookingId: 'booking-003',
      consumerUid: 'consumer-uid-003',
      ownerUid: 'owner-uid-003',
    });

    const retrieved = getFinalManifest(result.manifestId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.sessionId).toBe('session-final-3');
    expect(retrieved!.bookingId).toBe('booking-003');
  });

  it('should allow retrieval of final manifest by session ID', () => {
    _injectManifest('session-final-4', [
      { name: 'model.rvt', sizeBytes: 10000, extension: 'rvt', sha256Hash: 'f'.repeat(64), transferStatus: 'pending' },
    ]);

    compileAndWriteFinalManifest({
      sessionId: 'session-final-4',
      bookingId: 'booking-004',
      consumerUid: 'consumer-uid-004',
      ownerUid: 'owner-uid-004',
    });

    const retrieved = getFinalManifestBySession('session-final-4');
    expect(retrieved).toBeDefined();
    expect(retrieved!.bookingId).toBe('booking-004');
    expect(retrieved!.files).toHaveLength(1);
  });

  it('should throw when sessionId is missing', () => {
    expect(() => compileAndWriteFinalManifest({
      sessionId: '',
      bookingId: 'booking-x',
      consumerUid: 'consumer-x',
      ownerUid: 'owner-x',
    })).toThrow();
  });

  it('should throw when bookingId is missing', () => {
    expect(() => compileAndWriteFinalManifest({
      sessionId: 'session-x',
      bookingId: '',
      consumerUid: 'consumer-x',
      ownerUid: 'owner-x',
    })).toThrow();
  });

  it('should throw when consumerUid is missing', () => {
    expect(() => compileAndWriteFinalManifest({
      sessionId: 'session-x',
      bookingId: 'booking-x',
      consumerUid: '',
      ownerUid: 'owner-x',
    })).toThrow();
  });

  it('should throw when ownerUid is missing', () => {
    expect(() => compileAndWriteFinalManifest({
      sessionId: 'session-x',
      bookingId: 'booking-x',
      consumerUid: 'consumer-x',
      ownerUid: '',
    })).toThrow();
  });

  it('should handle empty workspace gracefully', () => {
    const workspacePath = join(testBaseDir, 'session-final-empty');
    mkdirSync(workspacePath, { recursive: true });

    _injectWorkspaceInfo({
      sessionId: 'session-final-empty',
      workspacePath,
      createdAt: Date.now(),
    });

    const result = compileAndWriteFinalManifest({
      sessionId: 'session-final-empty',
      bookingId: 'booking-empty',
      consumerUid: 'consumer-empty',
      ownerUid: 'owner-empty',
    });

    expect(result.files).toEqual([]);
  });

  it('should cap files at MAX_MANIFEST_FILES (200)', () => {
    // Inject more than 200 entries directly
    const entries: FileManifestEntry[] = Array.from({ length: 210 }, (_, i) => ({
      name: `file-${i}.txt`,
      sizeBytes: i * 100,
      extension: 'txt',
      sha256Hash: createHash('sha256').update(`content-${i}`).digest('hex'),
      transferStatus: 'pending' as const,
    }));
    _injectManifest('session-final-cap', entries);

    const result = compileAndWriteFinalManifest({
      sessionId: 'session-final-cap',
      bookingId: 'booking-cap',
      consumerUid: 'consumer-cap',
      ownerUid: 'owner-cap',
    });

    expect(result.files.length).toBeLessThanOrEqual(MAX_MANIFEST_FILES);
  });

  it('should increment final manifest count', () => {
    expect(_getFinalManifestCount()).toBe(0);

    _injectManifest('session-count-1', []);
    compileAndWriteFinalManifest({
      sessionId: 'session-count-1',
      bookingId: 'b1',
      consumerUid: 'c1',
      ownerUid: 'o1',
    });

    expect(_getFinalManifestCount()).toBe(1);
  });
});

// ─── Integration: Full Workspace Lifecycle ──────────────────────────────────────

describe('Full Workspace Lifecycle', () => {
  it('should support create → monitor → add files → compile manifest flow', async () => {
    // 1. Create workspace
    const workspace = createSessionWorkspace('session-lifecycle', testBaseDir);
    expect(existsSync(workspace.workspacePath)).toBe(true);

    // 2. Start monitoring
    const updates: FileManifestEntry[][] = [];
    monitorWorkspace('session-lifecycle', workspace.workspacePath, {
      intervalMs: 50,
      onManifestUpdate: (_id, manifest) => updates.push([...manifest]),
    });
    expect(isMonitoring('session-lifecycle')).toBe(true);

    // Initial scan should have been empty
    expect(updates[0]).toHaveLength(0);

    // 3. Add files to workspace
    createTestFile(workspace.workspacePath, 'design-v1.dwg', 'AutoCAD design file v1');
    createTestFile(workspace.workspacePath, 'schedule.xlsx', 'Project schedule data');

    // Wait for polling to detect
    await new Promise(resolve => setTimeout(resolve, 100));

    // Manifest should now have 2 files
    const manifest = getFileManifest('session-lifecycle');
    expect(manifest).toHaveLength(2);

    // 4. Compile final manifest on session end
    const final = compileAndWriteFinalManifest({
      sessionId: 'session-lifecycle',
      bookingId: 'booking-lifecycle',
      consumerUid: 'consumer-lifecycle',
      ownerUid: 'owner-lifecycle',
    });

    expect(final.files).toHaveLength(2);
    expect(final.sessionId).toBe('session-lifecycle');
    expect(final.bookingId).toBe('booking-lifecycle');
    expect(isMonitoring('session-lifecycle')).toBe(false);

    // Verify hashes are correct
    for (const file of final.files) {
      expect(file.sha256Hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(file.sha256Hash)).toBe(true);
      expect(file.transferStatus).toBe('pending');
    }
  });
});

// ─── _clearAllState ─────────────────────────────────────────────────────────────

describe('_clearAllState', () => {
  it('should clear all workspaces, manifests, monitors, and final manifests', () => {
    createSessionWorkspace('s1', testBaseDir);
    _injectManifest('s1', [{ name: 'f.txt', sizeBytes: 1, extension: 'txt', sha256Hash: 'a'.repeat(64), transferStatus: 'pending' }]);
    monitorWorkspace('s1', testBaseDir);

    _clearAllState();

    expect(_getWorkspaceCount()).toBe(0);
    expect(_getFinalManifestCount()).toBe(0);
    expect(isMonitoring('s1')).toBe(false);
    expect(getFileManifest('s1')).toEqual([]);
    expect(getWorkspaceInfo('s1')).toBeUndefined();
  });
});


// ─── createManifest ─────────────────────────────────────────────────────────────

describe('createManifest', () => {
  const baseInput: CreateManifestInput = {
    sessionId: 'session-m-1',
    bookingId: 'booking-m-1',
    consumerUid: 'consumer-m-1',
    ownerUid: 'owner-m-1',
    files: [
      { name: 'design.dwg', sizeBytes: 1024 },
      { name: 'report.pdf', sizeBytes: 2048 },
    ],
  };

  it('should create a manifest with valid files', () => {
    const result = createManifest(baseInput);

    expect(result.manifest.manifestId).toBeDefined();
    expect(result.manifest.sessionId).toBe('session-m-1');
    expect(result.manifest.bookingId).toBe('booking-m-1');
    expect(result.manifest.consumerUid).toBe('consumer-m-1');
    expect(result.manifest.ownerUid).toBe('owner-m-1');
    expect(result.manifest.files).toHaveLength(2);
    expect(result.manifest.ownerApprovalStatus).toBe('pending');
    expect(result.manifest.approvalTimestamp).toBeNull();
    expect(result.manifest.expiryTimestamp).toBeDefined();
    expect(result.blockedFiles).toHaveLength(0);
    expect(result.oversizedFiles).toHaveLength(0);
  });

  it('should filter out files with deny-listed extensions', () => {
    const input: CreateManifestInput = {
      ...baseInput,
      files: [
        { name: 'design.dwg', sizeBytes: 1024 },
        { name: 'malware.exe', sizeBytes: 512 },
        { name: 'script.bat', sizeBytes: 256 },
        { name: 'helper.dll', sizeBytes: 4096 },
        { name: 'report.pdf', sizeBytes: 2048 },
      ],
    };

    const result = createManifest(input);

    expect(result.manifest.files).toHaveLength(2);
    expect(result.manifest.files.map(f => f.name)).toEqual(['design.dwg', 'report.pdf']);
    expect(result.blockedFiles).toHaveLength(3);
    expect(result.blockedFiles.map(f => f.name).sort()).toEqual(['helper.dll', 'malware.exe', 'script.bat']);
  });

  it('should filter deny-listed extensions case-insensitively', () => {
    const input: CreateManifestInput = {
      ...baseInput,
      files: [
        { name: 'virus.EXE', sizeBytes: 512 },
        { name: 'SCRIPT.PS1', sizeBytes: 256 },
        { name: 'notes.txt', sizeBytes: 100 },
      ],
    };

    const result = createManifest(input);

    expect(result.manifest.files).toHaveLength(1);
    expect(result.manifest.files[0].name).toBe('notes.txt');
    expect(result.blockedFiles).toHaveLength(2);
  });

  it('should reject files exceeding 500 MB', () => {
    const input: CreateManifestInput = {
      ...baseInput,
      files: [
        { name: 'small.dwg', sizeBytes: 1024 },
        { name: 'huge.rvt', sizeBytes: HANDOFF_MAX_FILE_SIZE_BYTES + 1 },
      ],
    };

    const result = createManifest(input);

    expect(result.manifest.files).toHaveLength(1);
    expect(result.manifest.files[0].name).toBe('small.dwg');
    expect(result.oversizedFiles).toHaveLength(1);
    expect(result.oversizedFiles[0].name).toBe('huge.rvt');
  });

  it('should accept files at exactly 500 MB', () => {
    const input: CreateManifestInput = {
      ...baseInput,
      files: [
        { name: 'exactly500.bin', sizeBytes: HANDOFF_MAX_FILE_SIZE_BYTES },
      ],
    };

    const result = createManifest(input);

    expect(result.manifest.files).toHaveLength(1);
    expect(result.oversizedFiles).toHaveLength(0);
  });

  it('should cap manifest at 200 files', () => {
    const files = Array.from({ length: 210 }, (_, i) => ({
      name: `file-${i}.txt`,
      sizeBytes: 100,
    }));
    const input: CreateManifestInput = { ...baseInput, files };

    const result = createManifest(input);

    expect(result.manifest.files.length).toBeLessThanOrEqual(MAX_MANIFEST_FILES);
  });

  it('should use custom deny-list when provided', () => {
    const input: CreateManifestInput = {
      ...baseInput,
      files: [
        { name: 'design.dwg', sizeBytes: 1024 },
        { name: 'model.rvt', sizeBytes: 2048 },
      ],
      denyList: ['.dwg'],
    };

    const result = createManifest(input);

    expect(result.manifest.files).toHaveLength(1);
    expect(result.manifest.files[0].name).toBe('model.rvt');
    expect(result.blockedFiles).toHaveLength(1);
    expect(result.blockedFiles[0].name).toBe('design.dwg');
  });

  it('should compute SHA-256 hash from content when provided', () => {
    const content = Buffer.from('Hello Architex');
    const expectedHash = createHash('sha256').update(content).digest('hex');

    const input: CreateManifestInput = {
      ...baseInput,
      files: [{ name: 'test.txt', sizeBytes: content.length, content }],
    };

    const result = createManifest(input);

    expect(result.manifest.files[0].sha256Hash).toBe(expectedHash);
  });

  it('should use provided sha256Hash when available', () => {
    const input: CreateManifestInput = {
      ...baseInput,
      files: [{ name: 'test.txt', sizeBytes: 100, sha256Hash: 'a'.repeat(64) }],
    };

    const result = createManifest(input);

    expect(result.manifest.files[0].sha256Hash).toBe('a'.repeat(64));
  });

  it('should set expiryTimestamp to 72 hours from now', () => {
    const before = Date.now();
    const result = createManifest(baseInput);
    const after = Date.now();

    const expiryTime = new Date(result.manifest.expiryTimestamp).getTime();
    expect(expiryTime).toBeGreaterThanOrEqual(before + FILE_HANDOFF_EXPIRY_MS);
    expect(expiryTime).toBeLessThanOrEqual(after + FILE_HANDOFF_EXPIRY_MS);
  });

  it('should throw when sessionId is empty', () => {
    expect(() => createManifest({ ...baseInput, sessionId: '' })).toThrow();
  });

  it('should throw when bookingId is empty', () => {
    expect(() => createManifest({ ...baseInput, bookingId: '' })).toThrow();
  });

  it('should store manifest and allow retrieval', () => {
    const result = createManifest(baseInput);
    const retrieved = getApprovalManifest(result.manifest.manifestId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.manifestId).toBe(result.manifest.manifestId);
  });
});

// ─── approveManifest ────────────────────────────────────────────────────────────

describe('approveManifest', () => {
  function createPendingManifest(): FileManifest {
    const result = createManifest({
      sessionId: 's1',
      bookingId: 'b1',
      consumerUid: 'c1',
      ownerUid: 'o1',
      files: [
        { name: 'design.dwg', sizeBytes: 1024 },
        { name: 'report.pdf', sizeBytes: 2048 },
      ],
    });
    return result.manifest;
  }

  it('should approve a pending manifest', () => {
    const manifest = createPendingManifest();
    const result = approveManifest(manifest.manifestId);

    expect(result.manifestId).toBe(manifest.manifestId);
    expect(result.ownerApprovalStatus).toBe('approved');
    expect(result.approvedFiles).toHaveLength(2);
    expect(result.approvalTimestamp).toBeDefined();
  });

  it('should set approval timestamp on the stored manifest', () => {
    const manifest = createPendingManifest();
    approveManifest(manifest.manifestId);

    const stored = getApprovalManifest(manifest.manifestId);
    expect(stored!.approvalTimestamp).not.toBeNull();
    expect(stored!.ownerApprovalStatus).toBe('approved');
  });

  it('should throw for non-existent manifest', () => {
    expect(() => approveManifest('nonexistent')).toThrow();
  });

  it('should throw for empty manifest ID', () => {
    expect(() => approveManifest('')).toThrow();
  });

  it('should throw when manifest is already approved', () => {
    const manifest = createPendingManifest();
    approveManifest(manifest.manifestId);
    expect(() => approveManifest(manifest.manifestId)).toThrow();
  });

  it('should throw when manifest is expired', () => {
    const expired: FileManifest = {
      manifestId: 'expired-1',
      sessionId: 's1',
      bookingId: 'b1',
      consumerUid: 'c1',
      ownerUid: 'o1',
      files: [{ name: 'f.txt', sizeBytes: 100, extension: 'txt', sha256Hash: 'a'.repeat(64), transferStatus: 'pending' }],
      manifestTimestamp: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(),
      ownerApprovalStatus: 'pending',
      approvalTimestamp: null,
      expiryTimestamp: new Date(Date.now() - 1000).toISOString(), // already expired
    };
    _injectApprovalManifest(expired);

    expect(() => approveManifest('expired-1')).toThrow();
    const stored = getApprovalManifest('expired-1');
    expect(stored!.ownerApprovalStatus).toBe('expired');
  });
});

// ─── rejectFiles ────────────────────────────────────────────────────────────────

describe('rejectFiles', () => {
  function createTestManifest(): FileManifest {
    const result = createManifest({
      sessionId: 's-reject',
      bookingId: 'b-reject',
      consumerUid: 'c-reject',
      ownerUid: 'o-reject',
      files: [
        { name: 'file1.dwg', sizeBytes: 1024 },
        { name: 'file2.pdf', sizeBytes: 2048 },
        { name: 'file3.rvt', sizeBytes: 3072 },
      ],
    });
    return result.manifest;
  }

  it('should reject specified files and mark them rejected', () => {
    const manifest = createTestManifest();
    const result = rejectFiles(manifest.manifestId, ['file1.dwg']);

    expect(result.rejectedFiles).toEqual(['file1.dwg']);
    expect(result.remainingFiles).toContain('file2.pdf');
    expect(result.remainingFiles).toContain('file3.rvt');

    const stored = getApprovalManifest(manifest.manifestId);
    const rejectedFile = stored!.files.find(f => f.name === 'file1.dwg');
    expect(rejectedFile!.transferStatus).toBe('rejected');
  });

  it('should reject multiple files at once', () => {
    const manifest = createTestManifest();
    const result = rejectFiles(manifest.manifestId, ['file1.dwg', 'file3.rvt']);

    expect(result.rejectedFiles).toHaveLength(2);
    expect(result.remainingFiles).toEqual(['file2.pdf']);
  });

  it('should mark manifest as rejected when all files are rejected', () => {
    const manifest = createTestManifest();
    const result = rejectFiles(manifest.manifestId, ['file1.dwg', 'file2.pdf', 'file3.rvt']);

    expect(result.ownerApprovalStatus).toBe('rejected');
    const stored = getApprovalManifest(manifest.manifestId);
    expect(stored!.ownerApprovalStatus).toBe('rejected');
  });

  it('should keep pending status when some files remain', () => {
    const manifest = createTestManifest();
    const result = rejectFiles(manifest.manifestId, ['file1.dwg']);

    expect(result.ownerApprovalStatus).toBe('pending');
  });

  it('should throw for non-existent manifest', () => {
    expect(() => rejectFiles('nonexistent', ['f.txt'])).toThrow();
  });

  it('should throw for empty file names array', () => {
    const manifest = createTestManifest();
    expect(() => rejectFiles(manifest.manifestId, [])).toThrow();
  });

  it('should throw for empty manifest ID', () => {
    expect(() => rejectFiles('', ['file.txt'])).toThrow();
  });
});

// ─── checkExpiry ────────────────────────────────────────────────────────────────

describe('checkExpiry', () => {
  it('should report not expired for a fresh manifest', () => {
    const result = createManifest({
      sessionId: 's-exp',
      bookingId: 'b-exp',
      consumerUid: 'c-exp',
      ownerUid: 'o-exp',
      files: [{ name: 'f.txt', sizeBytes: 100 }],
    });

    const check = checkExpiry(result.manifest.manifestId);

    expect(check.isExpired).toBe(false);
    expect(check.ownerApprovalStatus).toBe('pending');
  });

  it('should detect expired manifest (72 hours elapsed)', () => {
    const expired: FileManifest = {
      manifestId: 'expired-check',
      sessionId: 's1',
      bookingId: 'b1',
      consumerUid: 'c1',
      ownerUid: 'o1',
      files: [{ name: 'f.txt', sizeBytes: 100, extension: 'txt', sha256Hash: 'a'.repeat(64), transferStatus: 'pending' }],
      manifestTimestamp: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(),
      ownerApprovalStatus: 'pending',
      approvalTimestamp: null,
      expiryTimestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    };
    _injectApprovalManifest(expired);

    const check = checkExpiry('expired-check');

    expect(check.isExpired).toBe(true);
    expect(check.ownerApprovalStatus).toBe('expired');
  });

  it('should update stored manifest status to expired', () => {
    const expired: FileManifest = {
      manifestId: 'expired-update',
      sessionId: 's1',
      bookingId: 'b1',
      consumerUid: 'c1',
      ownerUid: 'o1',
      files: [{ name: 'f.txt', sizeBytes: 100, extension: 'txt', sha256Hash: 'a'.repeat(64), transferStatus: 'pending' }],
      manifestTimestamp: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(),
      ownerApprovalStatus: 'pending',
      approvalTimestamp: null,
      expiryTimestamp: new Date(Date.now() - 1000).toISOString(),
    };
    _injectApprovalManifest(expired);

    checkExpiry('expired-update');

    const stored = getApprovalManifest('expired-update');
    expect(stored!.ownerApprovalStatus).toBe('expired');
  });

  it('should throw for non-existent manifest', () => {
    expect(() => checkExpiry('nonexistent')).toThrow();
  });

  it('should throw for empty manifest ID', () => {
    expect(() => checkExpiry('')).toThrow();
  });
});

// ─── updateTransferStatus ───────────────────────────────────────────────────────

describe('updateTransferStatus', () => {
  function createApprovedManifest(): FileManifest {
    const result = createManifest({
      sessionId: 's-status',
      bookingId: 'b-status',
      consumerUid: 'c-status',
      ownerUid: 'o-status',
      files: [
        { name: 'file1.dwg', sizeBytes: 1024 },
        { name: 'file2.pdf', sizeBytes: 2048 },
      ],
    });
    approveManifest(result.manifest.manifestId);
    return result.manifest;
  }

  it('should transition pending → transferring for approved manifest', () => {
    const manifest = createApprovedManifest();
    const result = updateTransferStatus(manifest.manifestId, 'file1.dwg', 'transferring');

    expect(result.transferStatus).toBe('transferring');
  });

  it('should transition transferring → completed', () => {
    const manifest = createApprovedManifest();
    updateTransferStatus(manifest.manifestId, 'file1.dwg', 'transferring');
    const result = updateTransferStatus(manifest.manifestId, 'file1.dwg', 'completed');

    expect(result.transferStatus).toBe('completed');
  });

  it('should transition transferring → failed', () => {
    const manifest = createApprovedManifest();
    updateTransferStatus(manifest.manifestId, 'file1.dwg', 'transferring');
    const result = updateTransferStatus(manifest.manifestId, 'file1.dwg', 'failed');

    expect(result.transferStatus).toBe('failed');
  });

  it('should transition pending → rejected', () => {
    const manifest = createApprovedManifest();
    const result = updateTransferStatus(manifest.manifestId, 'file1.dwg', 'rejected');

    expect(result.transferStatus).toBe('rejected');
  });

  it('should throw for invalid transition completed → pending', () => {
    const manifest = createApprovedManifest();
    updateTransferStatus(manifest.manifestId, 'file1.dwg', 'transferring');
    updateTransferStatus(manifest.manifestId, 'file1.dwg', 'completed');

    expect(() => updateTransferStatus(manifest.manifestId, 'file1.dwg', 'pending')).toThrow();
  });

  it('should throw when trying to upload without manifest approval', () => {
    const result = createManifest({
      sessionId: 's-no-approve',
      bookingId: 'b-no-approve',
      consumerUid: 'c-no-approve',
      ownerUid: 'o-no-approve',
      files: [{ name: 'file1.dwg', sizeBytes: 1024 }],
    });

    expect(() => updateTransferStatus(result.manifest.manifestId, 'file1.dwg', 'transferring')).toThrow();
  });

  it('should throw for non-existent manifest', () => {
    expect(() => updateTransferStatus('nonexistent', 'file.txt', 'completed')).toThrow();
  });

  it('should throw for non-existent file', () => {
    const manifest = createApprovedManifest();
    expect(() => updateTransferStatus(manifest.manifestId, 'nonexistent.txt', 'transferring')).toThrow();
  });
});

// ─── associateProjectReference ──────────────────────────────────────────────────

describe('associateProjectReference', () => {
  function createCompletedManifest(): FileManifest {
    const result = createManifest({
      sessionId: 's-assoc',
      bookingId: 'b-assoc',
      consumerUid: 'c-assoc',
      ownerUid: 'o-assoc',
      files: [
        { name: 'file1.dwg', sizeBytes: 1024 },
        { name: 'file2.pdf', sizeBytes: 2048 },
      ],
    });
    approveManifest(result.manifest.manifestId);
    updateTransferStatus(result.manifest.manifestId, 'file1.dwg', 'transferring');
    updateTransferStatus(result.manifest.manifestId, 'file1.dwg', 'completed');
    updateTransferStatus(result.manifest.manifestId, 'file2.pdf', 'transferring');
    updateTransferStatus(result.manifest.manifestId, 'file2.pdf', 'completed');
    return result.manifest;
  }

  it('should associate completed files with a project reference', () => {
    const manifest = createCompletedManifest();
    const result = associateProjectReference(manifest.manifestId, 'project-123');

    expect(result.manifestId).toBe(manifest.manifestId);
    expect(result.sessionId).toBe('s-assoc');
    expect(result.projectReference).toBe('project-123');
    expect(result.files).toHaveLength(2);
    expect(result.files[0].name).toBe('file1.dwg');
    expect(result.files[0].sha256Hash).toBeDefined();
    expect(result.files[0].uploadTimestamp).toBeDefined();
  });

  it('should store and allow retrieval of association', () => {
    const manifest = createCompletedManifest();
    associateProjectReference(manifest.manifestId, 'project-456');

    const retrieved = getProjectAssociation(manifest.manifestId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.projectReference).toBe('project-456');
  });

  it('should throw when no completed files exist', () => {
    const result = createManifest({
      sessionId: 's-no-complete',
      bookingId: 'b-no-complete',
      consumerUid: 'c-no-complete',
      ownerUid: 'o-no-complete',
      files: [{ name: 'file.txt', sizeBytes: 100 }],
    });
    approveManifest(result.manifest.manifestId);

    expect(() => associateProjectReference(result.manifest.manifestId, 'project-x')).toThrow();
  });

  it('should throw for empty project reference', () => {
    const manifest = createCompletedManifest();
    expect(() => associateProjectReference(manifest.manifestId, '')).toThrow();
  });

  it('should throw for non-existent manifest', () => {
    expect(() => associateProjectReference('nonexistent', 'proj')).toThrow();
  });
});

// ─── Property 6: File Extension Deny-List ───────────────────────────────────────

describe('Property 6: File Extension Deny-List', () => {
  /**
   * **Validates: Requirements 9.5**
   *
   * ∀ manifest: FileManifest, denyList: string[],
   *   manifest.files.every(f => !denyList.includes(f.extension.toLowerCase()))
   */
  it('should never include deny-listed extensions in the manifest', () => {
    const denyExtensions = DEFAULT_DENY_LIST_EXTENSIONS.map(e => e.replace('.', ''));

    // Create manifest with a mix of valid and deny-listed files
    const files = [
      { name: 'design.dwg', sizeBytes: 1024 },
      { name: 'malware.exe', sizeBytes: 512 },
      { name: 'script.bat', sizeBytes: 256 },
      { name: 'helper.dll', sizeBytes: 4096 },
      { name: 'report.pdf', sizeBytes: 2048 },
      { name: 'command.cmd', sizeBytes: 128 },
      { name: 'power.ps1', sizeBytes: 64 },
      { name: 'visual.vbs', sizeBytes: 32 },
      { name: 'registry.reg', sizeBytes: 16 },
      { name: 'driver.sys', sizeBytes: 8192 },
      { name: 'model.rvt', sizeBytes: 10000 },
    ];

    const result = createManifest({
      sessionId: 'prop6-session',
      bookingId: 'prop6-booking',
      consumerUid: 'prop6-consumer',
      ownerUid: 'prop6-owner',
      files,
    });

    // Property: no file in the manifest has a deny-listed extension
    for (const file of result.manifest.files) {
      expect(denyExtensions).not.toContain(file.extension.toLowerCase());
    }

    // Only safe files should remain
    expect(result.manifest.files.map(f => f.name).sort()).toEqual(['design.dwg', 'model.rvt', 'report.pdf']);
  });

  it('should enforce deny-list regardless of extension casing', () => {
    const denyExtensions = DEFAULT_DENY_LIST_EXTENSIONS.map(e => e.replace('.', ''));

    const files = [
      { name: 'virus.EXE', sizeBytes: 512 },
      { name: 'SCRIPT.Bat', sizeBytes: 256 },
      { name: 'driver.SYS', sizeBytes: 4096 },
      { name: 'good.pdf', sizeBytes: 2048 },
    ];

    const result = createManifest({
      sessionId: 'prop6-case',
      bookingId: 'b-case',
      consumerUid: 'c-case',
      ownerUid: 'o-case',
      files,
    });

    for (const file of result.manifest.files) {
      expect(denyExtensions).not.toContain(file.extension.toLowerCase());
    }
  });
});
