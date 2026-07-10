/**
 * Session Recording Service — Unit Tests
 *
 * Tests for the session recording lifecycle service covering:
 * - Start/stop recording with host configuration check
 * - Maximum 8-hour duration enforcement
 * - Access control (owner, consumer, Platform_Admin only)
 * - Retention policy (90 days, dispute extension, permanent delete)
 * - No deletion before retention expiry
 * - Metadata persistence to remote_desktop_recordings collection
 *
 * Requirements: 16.1, 16.4, 16.5, 16.6, 16.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockSet, mockGet, mockUpdate, mockDocGet, mockQueryGet } = vi.hoisted(() => {
  const mockSet = vi.fn();
  const mockGet = vi.fn();
  const mockUpdate = vi.fn();
  const mockDocGet = vi.fn();
  const mockQueryGet = vi.fn();

  return { mockSet, mockGet, mockUpdate, mockDocGet, mockQueryGet };
});

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn((collectionName: string) => ({
      doc: vi.fn((docId: string) => ({
        set: mockSet,
        get: mockDocGet,
        update: mockUpdate,
      })),
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: mockQueryGet,
        })),
      })),
    })),
  },
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [{ name: 'test' }]),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({})),
}));

// ─── Import after mock ──────────────────────────────────────────────────────────

import {
  startRecording,
  stopRecording,
  getRecordingMetadata,
  getRecordingBySessionId,
  checkAccess,
  isRetentionExpired,
  extendRetention,
  resolveDisputeRetention,
  markExpired,
  deleteRecording,
  isRecordingEnabledForHost,
  MAX_RECORDING_DURATION_SECONDS,
  RETENTION_PERIOD_MS,
  DISPUTE_EXTENSION_MS,
} from '../sessionRecordingService';
import type { RemoteDesktopRecording } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockRecording(
  overrides: Partial<RemoteDesktopRecording> = {},
): RemoteDesktopRecording {
  const now = Math.floor(Date.now() / 1000);
  return {
    recordingId: 'rec-001',
    sessionId: 'session-001',
    hostId: 'host-001',
    consumerUid: 'consumer-abc',
    ownerUid: 'owner-xyz',
    storagePath: 'architex-recordings/host-001/session-001/rec-001',
    durationSeconds: 3600,
    sizeBytes: 1024 * 1024 * 500,
    status: 'completed',
    retentionExpiryTimestamp: { seconds: now + 90 * 24 * 60 * 60, nanoseconds: 0 },
    createdAt: { seconds: now, nanoseconds: 0 },
    ...overrides,
  };
}

function mockHostWithRecording(enabled: boolean) {
  mockDocGet.mockResolvedValueOnce({
    exists: true,
    data: () => ({
      hostId: 'host-001',
      ownerUid: 'owner-xyz',
      configuration: {
        recordingEnabled: enabled,
        gracePeriodSeconds: 300,
        clipboardPolicy: 'disabled',
        sessionWorkspacePath: 'C:\\ArchitexSessions',
      },
    }),
  });
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue(undefined);
  mockDocGet.mockResolvedValue({ exists: false, data: () => null });
  mockQueryGet.mockResolvedValue({ empty: true, docs: [] });
});

// ─── Recording Enable/Disable Per Host ──────────────────────────────────────────

describe('isRecordingEnabledForHost', () => {
  it('should return true when recording is enabled in host configuration', async () => {
    mockHostWithRecording(true);

    const result = await isRecordingEnabledForHost('host-001');

    expect(result).toBe(true);
  });

  it('should return false when recording is disabled in host configuration', async () => {
    mockHostWithRecording(false);

    const result = await isRecordingEnabledForHost('host-001');

    expect(result).toBe(false);
  });

  it('should default to false (disabled) when host not found', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const result = await isRecordingEnabledForHost('nonexistent-host');

    expect(result).toBe(false);
  });

  it('should default to false when configuration is missing', async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ hostId: 'host-001', ownerUid: 'owner-xyz' }),
    });

    const result = await isRecordingEnabledForHost('host-001');

    expect(result).toBe(false);
  });

  it('should return false on Firestore errors', async () => {
    mockDocGet.mockRejectedValueOnce(new Error('Network error'));

    const result = await isRecordingEnabledForHost('host-001');

    expect(result).toBe(false);
  });
});

// ─── Start Recording ────────────────────────────────────────────────────────────

describe('startRecording', () => {
  it('should create a recording record when host has recording enabled', async () => {
    mockHostWithRecording(true);

    const result = await startRecording({
      sessionId: 'session-001',
      hostId: 'host-001',
      consumerUid: 'consumer-abc',
      ownerUid: 'owner-xyz',
    });

    expect(result.recordingId).toBeDefined();
    expect(result.sessionId).toBe('session-001');
    expect(result.hostId).toBe('host-001');
    expect(result.consumerUid).toBe('consumer-abc');
    expect(result.ownerUid).toBe('owner-xyz');
    expect(result.status).toBe('recording');
    expect(result.durationSeconds).toBe(0);
    expect(result.sizeBytes).toBe(0);
    expect(result.storagePath).toContain('architex-recordings');
    expect(result.storagePath).toContain('host-001');
    expect(result.storagePath).toContain('session-001');
    expect(result.retentionExpiryTimestamp).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('should store recordings on Architex-controlled infrastructure path', async () => {
    mockHostWithRecording(true);

    const result = await startRecording({
      sessionId: 'session-001',
      hostId: 'host-001',
      consumerUid: 'consumer-abc',
      ownerUid: 'owner-xyz',
    });

    expect(result.storagePath).toMatch(/^architex-recordings\//);
    expect(result.storagePath).not.toContain('C:\\');
    expect(result.storagePath).not.toContain('/home/');
  });

  it('should set retention expiry to 90 days from now', async () => {
    mockHostWithRecording(true);
    const beforeMs = Date.now();

    const result = await startRecording({
      sessionId: 'session-001',
      hostId: 'host-001',
      consumerUid: 'consumer-abc',
      ownerUid: 'owner-xyz',
    });

    const expiryMs = result.retentionExpiryTimestamp.seconds * 1000;
    const expectedExpiryMs = beforeMs + RETENTION_PERIOD_MS;

    // Allow 5 seconds of tolerance for test execution time
    expect(expiryMs).toBeGreaterThanOrEqual(expectedExpiryMs - 5000);
    expect(expiryMs).toBeLessThanOrEqual(expectedExpiryMs + 5000);
  });

  it('should throw if recording is not enabled for the host', async () => {
    mockHostWithRecording(false);

    await expect(
      startRecording({
        sessionId: 'session-001',
        hostId: 'host-001',
        consumerUid: 'consumer-abc',
        ownerUid: 'owner-xyz',
      }),
    ).rejects.toThrow('Recording is not enabled');
  });

  it('should throw if host does not exist', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    await expect(
      startRecording({
        sessionId: 'session-001',
        hostId: 'nonexistent',
        consumerUid: 'consumer-abc',
        ownerUid: 'owner-xyz',
      }),
    ).rejects.toThrow('Recording is not enabled');
  });
});

// ─── Stop Recording ─────────────────────────────────────────────────────────────

describe('stopRecording', () => {
  it('should stop an active recording and update status to completed', async () => {
    const mockRec = createMockRecording({ status: 'recording', durationSeconds: 0, sizeBytes: 0 });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await stopRecording({
      recordingId: 'rec-001',
      durationSeconds: 3600,
      sizeBytes: 500 * 1024 * 1024,
    });

    expect(result.status).toBe('completed');
    expect(result.durationSeconds).toBe(3600);
    expect(result.sizeBytes).toBe(500 * 1024 * 1024);
    expect(mockUpdate).toHaveBeenCalledWith({
      durationSeconds: 3600,
      sizeBytes: 500 * 1024 * 1024,
      status: 'completed',
    });
  });

  it('should cap duration at 8 hours (28800 seconds) maximum', async () => {
    const mockRec = createMockRecording({ status: 'recording', durationSeconds: 0 });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await stopRecording({
      recordingId: 'rec-001',
      durationSeconds: 50000, // exceeds 28800
      sizeBytes: 1024,
    });

    expect(result.durationSeconds).toBe(MAX_RECORDING_DURATION_SECONDS);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 28800 }),
    );
  });

  it('should throw if recording not found', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    await expect(
      stopRecording({ recordingId: 'nonexistent', durationSeconds: 100, sizeBytes: 100 }),
    ).rejects.toThrow('Recording not found');
  });

  it('should throw if recording is not in recording status', async () => {
    const mockRec = createMockRecording({ status: 'completed' });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    await expect(
      stopRecording({ recordingId: 'rec-001', durationSeconds: 100, sizeBytes: 100 }),
    ).rejects.toThrow("Only 'recording' status can be stopped");
  });
});

// ─── Get Recording Metadata ─────────────────────────────────────────────────────

describe('getRecordingMetadata', () => {
  it('should return recording when found', async () => {
    const mockRec = createMockRecording();
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await getRecordingMetadata('rec-001');

    expect(result).toEqual(mockRec);
  });

  it('should return null when recording not found', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const result = await getRecordingMetadata('nonexistent');

    expect(result).toBeNull();
  });
});

// ─── Get Recording By Session ID ────────────────────────────────────────────────

describe('getRecordingBySessionId', () => {
  it('should return recording when found by session ID', async () => {
    const mockRec = createMockRecording();
    mockQueryGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => mockRec }],
    });

    const result = await getRecordingBySessionId('session-001');

    expect(result).toEqual(mockRec);
  });

  it('should return null when no recording for session', async () => {
    mockQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const result = await getRecordingBySessionId('session-no-recording');

    expect(result).toBeNull();
  });
});

// ─── Access Control ─────────────────────────────────────────────────────────────

describe('checkAccess', () => {
  it('should allow Platform_Admin access to any recording', async () => {
    const result = await checkAccess('rec-001', 'admin-uid', 'Platform_Admin');

    expect(result.allowed).toBe(true);
  });

  it('should allow owner access to their recording', async () => {
    const mockRec = createMockRecording({ ownerUid: 'owner-xyz' });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await checkAccess('rec-001', 'owner-xyz', 'Owner');

    expect(result.allowed).toBe(true);
  });

  it('should allow consumer access to their session recording', async () => {
    const mockRec = createMockRecording({ consumerUid: 'consumer-abc' });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await checkAccess('rec-001', 'consumer-abc', 'Consumer');

    expect(result.allowed).toBe(true);
  });

  it('should deny owner access if they are not the recording owner', async () => {
    const mockRec = createMockRecording({ ownerUid: 'owner-xyz' });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await checkAccess('rec-001', 'different-owner', 'Owner');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Access denied');
  });

  it('should deny consumer access if they are not the session consumer', async () => {
    const mockRec = createMockRecording({ consumerUid: 'consumer-abc' });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await checkAccess('rec-001', 'different-consumer', 'Consumer');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Access denied');
  });

  it('should deny access when recording not found', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const result = await checkAccess('nonexistent', 'user-uid', 'Owner');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not found');
  });
});

// ─── Retention Expiry Check ─────────────────────────────────────────────────────

describe('isRetentionExpired', () => {
  it('should return false when retention period has not expired', () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 86400; // 1 day ahead
    const recording = createMockRecording({
      retentionExpiryTimestamp: { seconds: futureExpiry, nanoseconds: 0 },
    });

    expect(isRetentionExpired(recording)).toBe(false);
  });

  it('should return true when retention period has expired', () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
    const recording = createMockRecording({
      retentionExpiryTimestamp: { seconds: pastExpiry, nanoseconds: 0 },
    });

    expect(isRetentionExpired(recording)).toBe(true);
  });

  it('should return false when status is retained_dispute regardless of time', () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 86400; // 1 day past
    const recording = createMockRecording({
      status: 'retained_dispute',
      retentionExpiryTimestamp: { seconds: pastExpiry, nanoseconds: 0 },
      disputeId: 'dispute-001',
    });

    expect(isRetentionExpired(recording)).toBe(false);
  });

  it('should accept a custom nowMs parameter for testing', () => {
    const expirySeconds = 1700000000;
    const recording = createMockRecording({
      retentionExpiryTimestamp: { seconds: expirySeconds, nanoseconds: 0 },
    });

    // Before expiry
    expect(isRetentionExpired(recording, (expirySeconds - 1) * 1000)).toBe(false);
    // At expiry
    expect(isRetentionExpired(recording, expirySeconds * 1000)).toBe(true);
    // After expiry
    expect(isRetentionExpired(recording, (expirySeconds + 1) * 1000)).toBe(true);
  });
});

// ─── Extend Retention (Dispute) ─────────────────────────────────────────────────

describe('extendRetention', () => {
  it('should set status to retained_dispute and store disputeId', async () => {
    const mockRec = createMockRecording({ status: 'completed' });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await extendRetention({
      recordingId: 'rec-001',
      disputeId: 'dispute-001',
    });

    expect(result.status).toBe('retained_dispute');
    expect(result.disputeId).toBe('dispute-001');
    expect(mockUpdate).toHaveBeenCalledWith({
      status: 'retained_dispute',
      disputeId: 'dispute-001',
    });
  });

  it('should throw if recording not found', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    await expect(
      extendRetention({ recordingId: 'nonexistent', disputeId: 'dispute-001' }),
    ).rejects.toThrow('Recording not found');
  });

  it('should throw if recording is already expired', async () => {
    const mockRec = createMockRecording({ status: 'expired' });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    await expect(
      extendRetention({ recordingId: 'rec-001', disputeId: 'dispute-001' }),
    ).rejects.toThrow('Cannot extend retention for expired recording');
  });
});

// ─── Resolve Dispute Retention ──────────────────────────────────────────────────

describe('resolveDisputeRetention', () => {
  it('should transition from retained_dispute back to completed with new 30-day expiry', async () => {
    const mockRec = createMockRecording({
      status: 'retained_dispute',
      disputeId: 'dispute-001',
    });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const beforeMs = Date.now();
    const result = await resolveDisputeRetention('rec-001');

    expect(result.status).toBe('completed');
    expect(result.disputeId).toBeUndefined();

    // Verify new expiry is ~30 days from now
    const newExpiryMs = result.retentionExpiryTimestamp.seconds * 1000;
    const expectedExpiryMs = beforeMs + DISPUTE_EXTENSION_MS;
    expect(newExpiryMs).toBeGreaterThanOrEqual(expectedExpiryMs - 5000);
    expect(newExpiryMs).toBeLessThanOrEqual(expectedExpiryMs + 5000);
  });

  it('should throw if recording not found', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    await expect(resolveDisputeRetention('nonexistent')).rejects.toThrow('Recording not found');
  });

  it('should throw if recording is not in retained_dispute status', async () => {
    const mockRec = createMockRecording({ status: 'completed' });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    await expect(resolveDisputeRetention('rec-001')).rejects.toThrow(
      "Expected 'retained_dispute'",
    );
  });
});

// ─── Mark Expired ───────────────────────────────────────────────────────────────

describe('markExpired', () => {
  it('should mark a recording as expired when retention has passed', async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 86400;
    const mockRec = createMockRecording({
      status: 'completed',
      retentionExpiryTimestamp: { seconds: pastExpiry, nanoseconds: 0 },
    });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    const result = await markExpired('rec-001');

    expect(result.status).toBe('expired');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'expired' });
  });

  it('should throw if retention has not expired', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 86400;
    const mockRec = createMockRecording({
      status: 'completed',
      retentionExpiryTimestamp: { seconds: futureExpiry, nanoseconds: 0 },
    });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    await expect(markExpired('rec-001')).rejects.toThrow('Retention period has not expired');
  });

  it('should throw if recording is in retained_dispute status', async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 86400;
    const mockRec = createMockRecording({
      status: 'retained_dispute',
      retentionExpiryTimestamp: { seconds: pastExpiry, nanoseconds: 0 },
      disputeId: 'dispute-001',
    });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => mockRec });

    await expect(markExpired('rec-001')).rejects.toThrow('retained due to an open dispute');
  });

  it('should throw if recording not found', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    await expect(markExpired('nonexistent')).rejects.toThrow('Recording not found');
  });
});

// ─── No Deletion Before Retention ───────────────────────────────────────────────

describe('deleteRecording', () => {
  it('should always throw — recordings cannot be deleted before retention expires', () => {
    expect(() => deleteRecording()).toThrow('cannot be deleted before retention period expires');
  });
});
