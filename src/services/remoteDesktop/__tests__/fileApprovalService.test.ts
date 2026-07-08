/**
 * File Approval Service — Unit Tests
 *
 * Tests file approval, upload with retries, size validation,
 * status transitions, and FileManager association.
 *
 * Requirements: 8.4, 8.5, 8.6, 8.8, 13.4
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  approveFiles,
  uploadFiles,
  registerManifest,
  getManifestState,
  getFileManagerAssociation,
  getManifestsForOwner,
  getManifestsForConsumer,
  _clearAllApprovalState,
  _getManifestStateCount,
  _getAssociationCount,
  MAX_FILE_SIZE_BYTES,
  MAX_UPLOAD_RETRIES,
  UPLOAD_TIMEOUT_MS,
  type UploadFn,
  type FileReaderFn,
} from '../fileApprovalService';
import type { FileManifestEntry } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createTestFiles(count = 3): FileManifestEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `file-${i + 1}.dwg`,
    sizeBytes: (i + 1) * 1024 * 1024, // 1MB, 2MB, 3MB
    extension: 'dwg',
    sha256Hash: `${'a'.repeat(62)}${String(i).padStart(2, '0')}`,
    transferStatus: 'pending' as const,
  }));
}

function createOversizedFile(name: string, sizeMb: number): FileManifestEntry {
  return {
    name,
    sizeBytes: sizeMb * 1024 * 1024,
    extension: name.split('.').pop() || '',
    sha256Hash: 'b'.repeat(64),
    transferStatus: 'pending',
  };
}

function registerTestManifest(overrides?: Partial<{
  manifestId: string;
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  files: FileManifestEntry[];
  projectReference: string;
}>) {
  const defaults = {
    manifestId: 'manifest-001',
    sessionId: 'session-001',
    bookingId: 'booking-001',
    consumerUid: 'consumer-001',
    ownerUid: 'owner-001',
    files: createTestFiles(),
    projectReference: 'project-ref-001',
  };
  const opts = { ...defaults, ...overrides };
  return registerManifest(
    opts.manifestId,
    opts.sessionId,
    opts.bookingId,
    opts.consumerUid,
    opts.ownerUid,
    opts.files,
    opts.projectReference,
  );
}

/** Mock upload function that succeeds */
const successUploadFn: UploadFn = vi.fn(async (fileName) => ({
  url: `https://blob.vercel-storage.com/uploads/${fileName}`,
}));

/** Mock upload function that always fails */
const failUploadFn: UploadFn = vi.fn(async () => {
  throw new Error('Network error: connection refused');
});

/** Mock file reader that returns a buffer */
const mockFileReader: FileReaderFn = vi.fn((_filePath) =>
  Buffer.from('mock file content'),
);

// ─── Setup / Teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  _clearAllApprovalState();
  vi.clearAllMocks();
});

// ─── registerManifest ───────────────────────────────────────────────────────────

describe('registerManifest', () => {
  it('should register a manifest with correct initial state', () => {
    const state = registerTestManifest();

    expect(state.manifestId).toBe('manifest-001');
    expect(state.sessionId).toBe('session-001');
    expect(state.bookingId).toBe('booking-001');
    expect(state.consumerUid).toBe('consumer-001');
    expect(state.ownerUid).toBe('owner-001');
    expect(state.status).toBe('pending');
    expect(state.files).toHaveLength(3);
    expect(state.projectReference).toBe('project-ref-001');
  });

  it('should store manifest in state map', () => {
    registerTestManifest({ manifestId: 'manifest-stored' });

    expect(_getManifestStateCount()).toBe(1);
    expect(getManifestState('manifest-stored')).toBeDefined();
  });

  it('should create defensive copy of files', () => {
    const files = createTestFiles(1);
    registerTestManifest({ manifestId: 'manifest-copy', files });

    // Mutate original
    files[0].name = 'mutated.txt';

    const state = getManifestState('manifest-copy');
    expect(state!.files[0].name).toBe('file-1.dwg');
  });

  it('should throw when manifestId is empty', () => {
    expect(() => registerManifest('', 'sid', 'bid', 'cid', 'oid', [])).toThrow();
  });

  it('should throw when sessionId is empty', () => {
    expect(() => registerManifest('mid', '', 'bid', 'cid', 'oid', [])).toThrow();
  });

  it('should throw when bookingId is empty', () => {
    expect(() => registerManifest('mid', 'sid', '', 'cid', 'oid', [])).toThrow();
  });

  it('should throw when consumerUid is empty', () => {
    expect(() => registerManifest('mid', 'sid', 'bid', '', 'oid', [])).toThrow();
  });

  it('should throw when ownerUid is empty', () => {
    expect(() => registerManifest('mid', 'sid', 'bid', 'cid', '', [])).toThrow();
  });

  it('should allow registration without project reference', () => {
    const state = registerManifest('mid', 'sid', 'bid', 'cid', 'oid', createTestFiles());
    expect(state.projectReference).toBeUndefined();
  });
});

// ─── approveFiles ───────────────────────────────────────────────────────────────

describe('approveFiles', () => {
  it('should approve all valid files', () => {
    registerTestManifest();

    const result = approveFiles('manifest-001', ['file-1.dwg', 'file-2.dwg', 'file-3.dwg'], 'owner-001');

    expect(result.manifestId).toBe('manifest-001');
    expect(result.approvedFiles).toHaveLength(3);
    expect(result.rejectedFiles).toHaveLength(0);
    expect(result.ownerUid).toBe('owner-001');
    expect(result.approvalTimestamp).toBeGreaterThan(0);
  });

  it('should update manifest status to approved', () => {
    registerTestManifest();

    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    const state = getManifestState('manifest-001');
    expect(state!.status).toBe('approved');
    expect(state!.approvedFileNames).toEqual(['file-1.dwg']);
    expect(state!.approvalTimestamp).toBeGreaterThan(0);
  });

  it('should reject files exceeding 500 MB individually', () => {
    const files = [
      ...createTestFiles(2),
      createOversizedFile('huge-model.rvt', 600), // 600 MB — exceeds limit
    ];
    registerTestManifest({ files });

    const result = approveFiles(
      'manifest-001',
      ['file-1.dwg', 'file-2.dwg', 'huge-model.rvt'],
      'owner-001',
    );

    expect(result.approvedFiles).toHaveLength(2);
    expect(result.approvedFiles).toContain('file-1.dwg');
    expect(result.approvedFiles).toContain('file-2.dwg');
    expect(result.rejectedFiles).toHaveLength(1);
    expect(result.rejectedFiles[0].name).toBe('huge-model.rvt');
    expect(result.rejectedFiles[0].reason).toContain('500 MB');
  });

  it('should reject files at exactly 500 MB boundary (exclusive)', () => {
    const files = [
      createOversizedFile('exactly-500.dwg', 500), // exactly 500 MB
    ];
    // Set size to exactly MAX_FILE_SIZE_BYTES (not over)
    files[0].sizeBytes = MAX_FILE_SIZE_BYTES;
    registerTestManifest({ files });

    const result = approveFiles('manifest-001', ['exactly-500.dwg'], 'owner-001');

    // Exactly 500 MB is the limit — file at limit should NOT be rejected
    expect(result.approvedFiles).toHaveLength(1);
    expect(result.rejectedFiles).toHaveLength(0);
  });

  it('should reject files over 500 MB', () => {
    const files = [
      createOversizedFile('over-limit.dwg', 501),
    ];
    files[0].sizeBytes = MAX_FILE_SIZE_BYTES + 1; // One byte over
    registerTestManifest({ files });

    const result = approveFiles('manifest-001', ['over-limit.dwg'], 'owner-001');

    expect(result.approvedFiles).toHaveLength(0);
    expect(result.rejectedFiles).toHaveLength(1);
    expect(result.rejectedFiles[0].name).toBe('over-limit.dwg');
  });

  it('should proceed with remaining files when some are rejected', () => {
    const files = [
      createTestFiles(1)[0],
      createOversizedFile('big-file.rvt', 800),
      createOversizedFile('another-big.rvt', 900),
    ];
    registerTestManifest({ files });

    const result = approveFiles(
      'manifest-001',
      ['file-1.dwg', 'big-file.rvt', 'another-big.rvt'],
      'owner-001',
    );

    expect(result.approvedFiles).toEqual(['file-1.dwg']);
    expect(result.rejectedFiles).toHaveLength(2);
  });

  it('should reject files not found in manifest', () => {
    registerTestManifest();

    const result = approveFiles('manifest-001', ['nonexistent.txt'], 'owner-001');

    expect(result.approvedFiles).toHaveLength(0);
    expect(result.rejectedFiles).toHaveLength(1);
    expect(result.rejectedFiles[0].reason).toBe('File not found in manifest');
  });

  it('should throw when manifest ID is empty', () => {
    expect(() => approveFiles('', ['file.dwg'], 'owner-001')).toThrow();
  });

  it('should throw when owner UID is empty', () => {
    registerTestManifest();
    expect(() => approveFiles('manifest-001', ['file.dwg'], '')).toThrow();
  });

  it('should throw when manifest is not found', () => {
    expect(() => approveFiles('nonexistent', ['file.dwg'], 'owner-001')).toThrow();
  });

  it('should throw when owner UID does not match manifest owner', () => {
    registerTestManifest();
    expect(() => approveFiles('manifest-001', ['file-1.dwg'], 'wrong-owner')).toThrow();
  });

  it('should throw when manifest is not in pending status', () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001'); // now in 'approved'

    expect(() => approveFiles('manifest-001', ['file-1.dwg'], 'owner-001')).toThrow();
  });

  it('should handle empty approval list', () => {
    registerTestManifest();

    const result = approveFiles('manifest-001', [], 'owner-001');

    expect(result.approvedFiles).toHaveLength(0);
    expect(result.rejectedFiles).toHaveLength(0);
    expect(getManifestState('manifest-001')!.status).toBe('approved');
  });
});

// ─── uploadFiles ────────────────────────────────────────────────────────────────

describe('uploadFiles', () => {
  it('should upload all approved files successfully', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg', 'file-2.dwg'], 'owner-001');

    const result = await uploadFiles('manifest-001', successUploadFn, mockFileReader, '/workspace');

    expect(result.manifestId).toBe('manifest-001');
    expect(result.completedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('completed');
    expect(result.results[0].url).toContain('file-1.dwg');
    expect(result.results[1].status).toBe('completed');
    expect(result.uploadTimestamp).toBeGreaterThan(0);
  });

  it('should set manifest status to completed on success', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    await uploadFiles('manifest-001', successUploadFn, mockFileReader, '/workspace');

    const state = getManifestState('manifest-001');
    expect(state!.status).toBe('completed');
  });

  it('should transition status from approved → uploading → completed', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    expect(getManifestState('manifest-001')!.status).toBe('approved');

    await uploadFiles('manifest-001', successUploadFn, mockFileReader, '/workspace');

    expect(getManifestState('manifest-001')!.status).toBe('completed');
  });

  it('should set file transferStatus to completed on success', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    await uploadFiles('manifest-001', successUploadFn, mockFileReader, '/workspace');

    const state = getManifestState('manifest-001');
    const file = state!.files.find(f => f.name === 'file-1.dwg');
    expect(file!.transferStatus).toBe('completed');
  });

  it('should retry failed uploads up to 3 times', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    const result = await uploadFiles('manifest-001', failUploadFn, mockFileReader, '/workspace');

    expect(result.failedCount).toBe(1);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].attempts).toBe(MAX_UPLOAD_RETRIES);
    expect(result.results[0].error).toContain('Network error');
    expect(failUploadFn).toHaveBeenCalledTimes(3);
  });

  it('should mark file as failed after all retries exhausted', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    await uploadFiles('manifest-001', failUploadFn, mockFileReader, '/workspace');

    const state = getManifestState('manifest-001');
    const file = state!.files.find(f => f.name === 'file-1.dwg');
    expect(file!.transferStatus).toBe('failed');
  });

  it('should set manifest status to failed when all uploads fail', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg', 'file-2.dwg'], 'owner-001');

    await uploadFiles('manifest-001', failUploadFn, mockFileReader, '/workspace');

    const state = getManifestState('manifest-001');
    expect(state!.status).toBe('failed');
  });

  it('should handle partial success (some uploads succeed, some fail)', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg', 'file-2.dwg'], 'owner-001');

    let callCount = 0;
    const partialUpload: UploadFn = vi.fn(async (fileName) => {
      callCount++;
      // First file succeeds on first attempt, second file always fails
      if (fileName === 'file-1.dwg') {
        return { url: `https://blob.test/${fileName}` };
      }
      throw new Error('Upload failed for file-2');
    });

    const result = await uploadFiles('manifest-001', partialUpload, mockFileReader, '/workspace');

    expect(result.completedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    // Partial success → status should be 'completed' (with failures in results)
    expect(getManifestState('manifest-001')!.status).toBe('completed');
  });

  it('should succeed on retry after initial failure', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    let attempts = 0;
    const retryUpload: UploadFn = vi.fn(async (fileName) => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return { url: `https://blob.test/${fileName}` };
    });

    const result = await uploadFiles('manifest-001', retryUpload, mockFileReader, '/workspace');

    expect(result.completedCount).toBe(1);
    expect(result.results[0].status).toBe('completed');
    expect(result.results[0].attempts).toBe(3);
  });

  it('should pass correct timeout option to upload function', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    const capturedOptions: Array<{ timeout?: number }> = [];
    const capturingUpload: UploadFn = vi.fn(async (fileName, _content, options) => {
      capturedOptions.push(options ?? {});
      return { url: `https://blob.test/${fileName}` };
    });

    await uploadFiles('manifest-001', capturingUpload, mockFileReader, '/workspace');

    expect(capturedOptions[0].timeout).toBe(UPLOAD_TIMEOUT_MS);
  });

  it('should throw when manifest ID is empty', async () => {
    await expect(uploadFiles('', successUploadFn, mockFileReader, '/workspace')).rejects.toBeDefined();
  });

  it('should throw when manifest is not found', async () => {
    await expect(
      uploadFiles('nonexistent', successUploadFn, mockFileReader, '/workspace'),
    ).rejects.toBeDefined();
  });

  it('should throw when manifest is not in approved status', async () => {
    registerTestManifest(); // status = 'pending'

    await expect(
      uploadFiles('manifest-001', successUploadFn, mockFileReader, '/workspace'),
    ).rejects.toBeDefined();
  });

  it('should associate uploaded files with project reference in FileManager', async () => {
    registerTestManifest({ projectReference: 'project-123' });
    approveFiles('manifest-001', ['file-1.dwg', 'file-2.dwg'], 'owner-001');

    await uploadFiles('manifest-001', successUploadFn, mockFileReader, '/workspace');

    const association = getFileManagerAssociation('manifest-001');
    expect(association).toBeDefined();
    expect(association!.projectReference).toBe('project-123');
    expect(association!.sessionId).toBe('session-001');
    expect(association!.files).toHaveLength(2);
    expect(association!.files[0].name).toBe('file-1.dwg');
    expect(association!.files[0].url).toContain('file-1.dwg');
    expect(association!.files[0].uploadTimestamp).toBeGreaterThan(0);
  });

  it('should not create FileManager association when no project reference', async () => {
    registerTestManifest({ projectReference: undefined });
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    await uploadFiles('manifest-001', successUploadFn, mockFileReader, '/workspace');

    expect(getFileManagerAssociation('manifest-001')).toBeUndefined();
    expect(_getAssociationCount()).toBe(0);
  });

  it('should not create FileManager association when all uploads fail', async () => {
    registerTestManifest({ projectReference: 'project-123' });
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    await uploadFiles('manifest-001', failUploadFn, mockFileReader, '/workspace');

    expect(getFileManagerAssociation('manifest-001')).toBeUndefined();
  });

  it('should store upload results in manifest state', async () => {
    registerTestManifest();
    approveFiles('manifest-001', ['file-1.dwg'], 'owner-001');

    await uploadFiles('manifest-001', successUploadFn, mockFileReader, '/workspace');

    const state = getManifestState('manifest-001');
    expect(state!.uploadResults).toBeDefined();
    expect(state!.uploadResults).toHaveLength(1);
    expect(state!.uploadResults![0].status).toBe('completed');
  });
});

// ─── Query Functions ────────────────────────────────────────────────────────────

describe('getManifestsForOwner', () => {
  it('should return all manifests for a given owner', () => {
    registerTestManifest({ manifestId: 'm1', ownerUid: 'owner-A' });
    registerTestManifest({ manifestId: 'm2', ownerUid: 'owner-A', sessionId: 'sid2', bookingId: 'bid2' });
    registerTestManifest({ manifestId: 'm3', ownerUid: 'owner-B', sessionId: 'sid3', bookingId: 'bid3' });

    const results = getManifestsForOwner('owner-A');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.manifestId).sort()).toEqual(['m1', 'm2']);
  });

  it('should return empty array for unknown owner', () => {
    expect(getManifestsForOwner('unknown')).toEqual([]);
  });
});

describe('getManifestsForConsumer', () => {
  it('should return all manifests for a given consumer', () => {
    registerTestManifest({ manifestId: 'm1', consumerUid: 'consumer-X' });
    registerTestManifest({ manifestId: 'm2', consumerUid: 'consumer-Y', sessionId: 'sid2', bookingId: 'bid2' });

    const results = getManifestsForConsumer('consumer-X');
    expect(results).toHaveLength(1);
    expect(results[0].manifestId).toBe('m1');
  });

  it('should return empty array for unknown consumer', () => {
    expect(getManifestsForConsumer('unknown')).toEqual([]);
  });
});

// ─── Constants Validation ───────────────────────────────────────────────────────

describe('Constants', () => {
  it('should have MAX_FILE_SIZE_BYTES at 500 MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(500 * 1024 * 1024);
  });

  it('should have MAX_UPLOAD_RETRIES at 3', () => {
    expect(MAX_UPLOAD_RETRIES).toBe(3);
  });

  it('should have UPLOAD_TIMEOUT_MS at 60 seconds', () => {
    expect(UPLOAD_TIMEOUT_MS).toBe(60_000);
  });
});

// ─── _clearAllApprovalState ─────────────────────────────────────────────────────

describe('_clearAllApprovalState', () => {
  it('should clear all manifest states and associations', () => {
    registerTestManifest({ manifestId: 'm1' });
    registerTestManifest({ manifestId: 'm2', sessionId: 's2', bookingId: 'b2' });

    _clearAllApprovalState();

    expect(_getManifestStateCount()).toBe(0);
    expect(_getAssociationCount()).toBe(0);
    expect(getManifestState('m1')).toBeUndefined();
    expect(getManifestState('m2')).toBeUndefined();
  });
});

// ─── Integration: Full Approval + Upload Flow ───────────────────────────────────

describe('Full Approval + Upload Flow', () => {
  it('should complete end-to-end: register → approve → upload → associate', async () => {
    // 1. Register manifest
    const state = registerManifest(
      'manifest-flow',
      'session-flow',
      'booking-flow',
      'consumer-flow',
      'owner-flow',
      createTestFiles(2),
      'project-flow',
    );
    expect(state.status).toBe('pending');

    // 2. Approve files (owner approves all)
    const approval = approveFiles(
      'manifest-flow',
      ['file-1.dwg', 'file-2.dwg'],
      'owner-flow',
    );
    expect(approval.approvedFiles).toHaveLength(2);
    expect(approval.rejectedFiles).toHaveLength(0);
    expect(getManifestState('manifest-flow')!.status).toBe('approved');

    // 3. Upload files
    const upload = await uploadFiles(
      'manifest-flow',
      successUploadFn,
      mockFileReader,
      '/workspace/session-flow',
    );
    expect(upload.completedCount).toBe(2);
    expect(upload.failedCount).toBe(0);
    expect(getManifestState('manifest-flow')!.status).toBe('completed');

    // 4. Verify FileManager association
    const assoc = getFileManagerAssociation('manifest-flow');
    expect(assoc).toBeDefined();
    expect(assoc!.projectReference).toBe('project-flow');
    expect(assoc!.sessionId).toBe('session-flow');
    expect(assoc!.files).toHaveLength(2);
  });

  it('should handle mixed scenario: approve with oversized rejection then upload', async () => {
    // Register with mix of valid and oversized files
    registerManifest(
      'manifest-mixed',
      'session-mixed',
      'booking-mixed',
      'consumer-mixed',
      'owner-mixed',
      [
        { name: 'valid.dwg', sizeBytes: 10_000_000, extension: 'dwg', sha256Hash: 'a'.repeat(64), transferStatus: 'pending' },
        { name: 'huge.rvt', sizeBytes: 600_000_000, extension: 'rvt', sha256Hash: 'b'.repeat(64), transferStatus: 'pending' },
        { name: 'small.pdf', sizeBytes: 500_000, extension: 'pdf', sha256Hash: 'c'.repeat(64), transferStatus: 'pending' },
      ],
      'project-mixed',
    );

    // Approve all — oversized should be rejected
    const approval = approveFiles(
      'manifest-mixed',
      ['valid.dwg', 'huge.rvt', 'small.pdf'],
      'owner-mixed',
    );
    expect(approval.approvedFiles).toEqual(['valid.dwg', 'small.pdf']);
    expect(approval.rejectedFiles).toHaveLength(1);
    expect(approval.rejectedFiles[0].name).toBe('huge.rvt');

    // Upload approved files
    const upload = await uploadFiles(
      'manifest-mixed',
      successUploadFn,
      mockFileReader,
      '/workspace',
    );
    expect(upload.completedCount).toBe(2);
    expect(upload.failedCount).toBe(0);

    // Check association only has the approved+uploaded files
    const assoc = getFileManagerAssociation('manifest-mixed');
    expect(assoc!.files).toHaveLength(2);
    expect(assoc!.files.map(f => f.name).sort()).toEqual(['small.pdf', 'valid.dwg']);
  });
});
