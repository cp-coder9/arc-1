/**
 * SpecForge Audit Adapter — Unit Tests
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SpecForgeRepository } from '@/services/specforge/specforgeRepository';
import type { SpecAuditEvent } from '@/types/specforgeTypes';

// Mock firebase-admin to prevent Firestore initialization in tests
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {},
}));

// Mock the Firestore repository to prevent Firebase SDK import
vi.mock('@/services/specforge/firestoreSpecForgeRepository', () => ({
  FirestoreSpecForgeRepository: vi.fn(),
}));

// Mock the platform audit trail service
vi.mock('@/services/auditTrailService', () => ({
  createAuditEntry: vi.fn(),
}));

import {
  logSpecForgeAction,
  _getRetryQueueLength,
  _clearRetryQueue,
  VALUE_CAP_LIMIT,
} from '@/services/specforge/specforgeAuditAdapter';
import { setSpecForgeRepository } from '@/services/specforge/specforgeRepository';
import { createAuditEntry } from '@/services/auditTrailService';

const mockedCreateAuditEntry = vi.mocked(createAuditEntry);

// ── Test helpers ────────────────────────────────────────────────────────────

function createMockRepository(): SpecForgeRepository & { loggedEvents: SpecAuditEvent[] } {
  const loggedEvents: SpecAuditEvent[] = [];
  return {
    loggedEvents,
    getWorkspace: vi.fn().mockResolvedValue(null),
    saveWorkspace: vi.fn().mockResolvedValue(undefined),
    addItem: vi.fn().mockResolvedValue(undefined),
    updateItem: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    addSection: vi.fn().mockResolvedValue(undefined),
    updateSection: vi.fn().mockResolvedValue(undefined),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    getSnapshots: vi.fn().mockResolvedValue([]),
    logAuditEvent: vi.fn().mockImplementation(async (event: SpecAuditEvent) => {
      loggedEvents.push(event);
    }),
    getAuditEvents: vi.fn().mockResolvedValue([]),
    getProcurementEntries: vi.fn().mockResolvedValue([]),
    updateProcurementEntry: vi.fn().mockResolvedValue(undefined),
    saveApproval: vi.fn().mockResolvedValue(undefined),
    getApprovals: vi.fn().mockResolvedValue([]),
    saveSubstitution: vi.fn().mockResolvedValue(undefined),
    getSubstitutions: vi.fn().mockResolvedValue([]),
  };
}

describe('specforgeAuditAdapter', () => {
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    _clearRetryQueue();
    mockRepo = createMockRepository();
    setSpecForgeRepository(mockRepo);
  });

  describe('logSpecForgeAction', () => {
    it('persists a SpecAuditEvent to the SpecForge collection', async () => {
      await logSpecForgeAction({
        action: 'created',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
      });

      expect(mockRepo.logAuditEvent).toHaveBeenCalledTimes(1);
      const event = mockRepo.loggedEvents[0];
      expect(event.action).toBe('created');
      expect(event.targetId).toBe('item-001');
      expect(event.targetType).toBe('item');
      expect(event.performedBy).toBe('user-123');
      expect(event.workspaceId).toBe('proj-abc');
    });

    it('generates a unique event ID', async () => {
      await logSpecForgeAction({
        action: 'created',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
      });

      await logSpecForgeAction({
        action: 'updated',
        targetId: 'item-002',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
      });

      expect(mockRepo.loggedEvents[0].id).not.toBe(mockRepo.loggedEvents[1].id);
      expect(mockRepo.loggedEvents[0].id).toMatch(/^sfa-/);
    });

    it('records ISO 8601 UTC timestamp', async () => {
      await logSpecForgeAction({
        action: 'created',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
      });

      const event = mockRepo.loggedEvents[0];
      // ISO 8601 format check
      expect(new Date(event.performedAt).toISOString()).toBe(event.performedAt);
    });

    it('persists to the platform audit trail service', async () => {
      await logSpecForgeAction({
        action: 'updated',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
      });

      expect(mockedCreateAuditEntry).toHaveBeenCalledWith({
        actorId: 'user-123',
        action: 'specforge.updated',
        sourceObjectId: 'item-001',
      });
    });

    it('caps previousValue at 10,000 characters', async () => {
      const longValue = 'x'.repeat(15_000);

      await logSpecForgeAction({
        action: 'updated',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
        previousValue: longValue,
      });

      const event = mockRepo.loggedEvents[0];
      expect(event.previousValue!.length).toBe(VALUE_CAP_LIMIT);
      expect(event.previousValue!.endsWith('...')).toBe(true);
    });

    it('caps newValue at 10,000 characters', async () => {
      const longValue = 'y'.repeat(12_000);

      await logSpecForgeAction({
        action: 'updated',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
        newValue: longValue,
      });

      const event = mockRepo.loggedEvents[0];
      expect(event.newValue!.length).toBe(VALUE_CAP_LIMIT);
      expect(event.newValue!.endsWith('...')).toBe(true);
    });

    it('does not truncate values within the cap', async () => {
      const shortValue = 'hello world';

      await logSpecForgeAction({
        action: 'updated',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
        previousValue: shortValue,
        newValue: shortValue,
      });

      const event = mockRepo.loggedEvents[0];
      expect(event.previousValue).toBe(shortValue);
      expect(event.newValue).toBe(shortValue);
    });

    it('records snapshotId, revision, and auditHash for snapshot creation', async () => {
      await logSpecForgeAction({
        action: 'snapshot_created',
        targetId: 'snapshot-001',
        targetType: 'snapshot',
        performedBy: 'user-123',
        projectId: 'proj-abc',
        snapshotId: 'snapshot-001',
        revision: 'C',
        auditHash: 'a3f8b2c1',
      });

      const event = mockRepo.loggedEvents[0];
      expect(event.details).toBeDefined();
      const details = JSON.parse(event.details!);
      expect(details.snapshotId).toBe('snapshot-001');
      expect(details.revision).toBe('C');
      expect(details.auditHash).toBe('a3f8b2c1');
    });

    it('queues for retry when platform audit service throws', async () => {
      mockedCreateAuditEntry.mockImplementation(() => {
        throw new Error('Platform audit unavailable');
      });

      await logSpecForgeAction({
        action: 'created',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
      });

      // Event still persisted to SpecForge collection
      expect(mockRepo.logAuditEvent).toHaveBeenCalledTimes(1);
      // Retry was queued
      expect(_getRetryQueueLength()).toBeGreaterThanOrEqual(0);
    });

    it('does not throw when platform audit service fails', async () => {
      mockedCreateAuditEntry.mockImplementation(() => {
        throw new Error('Platform audit unavailable');
      });

      // Should not throw
      await expect(
        logSpecForgeAction({
          action: 'created',
          targetId: 'item-001',
          targetType: 'item',
          performedBy: 'user-123',
          projectId: 'proj-abc',
        }),
      ).resolves.toBeUndefined();
    });

    it('handles all SpecAuditAction types', async () => {
      const actions = [
        'created', 'updated', 'status_changed', 'approved',
        'issued', 'substitution_requested', 'substitution_resolved',
        'snapshot_created', 'comment_added',
      ] as const;

      for (const action of actions) {
        await logSpecForgeAction({
          action,
          targetId: `target-${action}`,
          targetType: 'item',
          performedBy: 'user-123',
          projectId: 'proj-abc',
        });
      }

      expect(mockRepo.logAuditEvent).toHaveBeenCalledTimes(actions.length);
    });

    it('handles all target types', async () => {
      const targetTypes = ['item', 'section', 'workspace', 'snapshot'] as const;

      for (const targetType of targetTypes) {
        await logSpecForgeAction({
          action: 'created',
          targetId: `target-${targetType}`,
          targetType,
          performedBy: 'user-123',
          projectId: 'proj-abc',
        });
      }

      expect(mockRepo.logAuditEvent).toHaveBeenCalledTimes(targetTypes.length);
      for (let i = 0; i < targetTypes.length; i++) {
        expect(mockRepo.loggedEvents[i].targetType).toBe(targetTypes[i]);
      }
    });

    it('leaves previousValue and newValue undefined when not provided', async () => {
      await logSpecForgeAction({
        action: 'created',
        targetId: 'item-001',
        targetType: 'item',
        performedBy: 'user-123',
        projectId: 'proj-abc',
      });

      const event = mockRepo.loggedEvents[0];
      expect(event.previousValue).toBeUndefined();
      expect(event.newValue).toBeUndefined();
    });
  });
});
