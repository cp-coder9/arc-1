/**
 * Unit tests — Feedback Audit Service
 *
 * Tests audit trail persistence, Project Passport linkage,
 * Action Centre inbox item creation, and retry logic.
 *
 * Mocks Firestore and inboxEventAdapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeedbackCluster } from '@/services/feedbackTypes';

// ─── Mock Firestore ─────────────────────────────────────────────────────────────

const mockAdd = vi.fn().mockResolvedValue({ id: 'doc-1' });
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn().mockReturnValue({ set: mockSet });
const mockCollection = vi.fn().mockReturnValue({ add: mockAdd, doc: mockDoc });

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => {
      mockCollection(name);
      return { add: mockAdd, doc: (id: string) => { mockDoc(id); return { set: mockSet }; } };
    },
  },
}));

// ─── Mock FieldValue ────────────────────────────────────────────────────────────

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
  },
}));

// ─── Mock InboxEventAdapter ─────────────────────────────────────────────────────

const mockCreateInboxEvent = vi.fn();
vi.mock('@/services/inboxEventAdapter', () => ({
  createInboxEvent: (...args: unknown[]) => mockCreateInboxEvent(...args),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────────

import {
  writeFeedbackAuditEvent,
  linkFeedbackToProjectPassport,
  createHighSeverityInboxItem,
  createPendingReviewInboxItem,
  surfaceOperatorAction,
  withRetryNonBlocking,
} from '@/services/feedbackAuditService';
import type { FeedbackAuditEvent } from '@/services/feedbackAuditService';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeCluster(overrides: Partial<FeedbackCluster> = {}): FeedbackCluster {
  return {
    id: 'cluster-1',
    title: 'Login failure reports',
    category: 'bug',
    status: 'received',
    occurrenceCount: 12,
    distinctUserCount: 8,
    distinctUserIds: ['user-1', 'user-2'],
    severityScore: 9,
    sentimentBreakdown: { positive: 0, neutral: 2, negative: 6, frustrated: 4 },
    averageSentiment: 'negative',
    submissionIds: ['sub-1', 'sub-2'],
    aiCategoryMismatchCount: 1,
    open: true,
    lastSubmissionAt: new Date().toISOString(),
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('feedbackAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── writeFeedbackAuditEvent ─────────────────────────────────────────────────

  describe('writeFeedbackAuditEvent', () => {
    it('persists an audit event to Firestore', async () => {
      const event: FeedbackAuditEvent = {
        actorId: 'user-123',
        actionType: 'submission_created',
        sourceObjectId: 'sub-abc',
        timestamp: '2026-01-15T10:00:00.000Z',
        metadata: { category: 'bug' },
      };

      await writeFeedbackAuditEvent(event);

      expect(mockAdd).toHaveBeenCalledWith({
        actorId: 'user-123',
        actionType: 'submission_created',
        sourceObjectId: 'sub-abc',
        timestamp: '2026-01-15T10:00:00.000Z',
        metadata: { category: 'bug' },
      });
    });

    it('persists event with empty metadata when metadata is undefined', async () => {
      const event: FeedbackAuditEvent = {
        actorId: 'user-456',
        actionType: 'cluster_merged',
        sourceObjectId: 'cluster-xyz',
        timestamp: '2026-01-15T12:00:00.000Z',
      };

      await writeFeedbackAuditEvent(event);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: {} })
      );
    });

    it('handles all valid action types', async () => {
      const actionTypes: FeedbackAuditEvent['actionType'][] = [
        'submission_created',
        'cluster_merged',
        'status_changed',
        'notification_sent',
        'implicit_friction_detected',
      ];

      for (const actionType of actionTypes) {
        mockAdd.mockClear();
        await writeFeedbackAuditEvent({
          actorId: 'user-1',
          actionType,
          sourceObjectId: 'obj-1',
          timestamp: new Date().toISOString(),
        });
        expect(mockAdd).toHaveBeenCalledTimes(1);
        expect(mockAdd).toHaveBeenCalledWith(
          expect.objectContaining({ actionType })
        );
      }
    });
  });

  // ── linkFeedbackToProjectPassport ───────────────────────────────────────────

  describe('linkFeedbackToProjectPassport', () => {
    it('writes a reference into the project passport record', async () => {
      await linkFeedbackToProjectPassport('sub-123', 'project-abc');

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-abc',
          feedbackSubmissionIds: { __arrayUnion: ['sub-123'] },
        }),
        { merge: true }
      );
    });

    it('includes an updatedAt timestamp', async () => {
      const before = new Date().toISOString();
      await linkFeedbackToProjectPassport('sub-456', 'project-def');

      const callArgs = mockSet.mock.calls[0][0];
      expect(callArgs.updatedAt).toBeDefined();
      expect(new Date(callArgs.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime()
      );
    });
  });

  // ── createHighSeverityInboxItem ─────────────────────────────────────────────

  describe('createHighSeverityInboxItem', () => {
    it('creates inbox item for clusters with severity >= 8', async () => {
      const cluster = makeCluster({ severityScore: 8 });
      await createHighSeverityInboxItem(cluster);

      expect(mockCreateInboxEvent).toHaveBeenCalledWith(
        'platform_admin',
        'High Severity Feedback: Login failure reports',
        'cluster-1',
        'high'
      );
    });

    it('creates inbox item for severity exactly 10', async () => {
      const cluster = makeCluster({ severityScore: 10 });
      await createHighSeverityInboxItem(cluster);

      expect(mockCreateInboxEvent).toHaveBeenCalledWith(
        'platform_admin',
        expect.stringContaining('High Severity Feedback:'),
        'cluster-1',
        'high'
      );
    });

    it('does NOT create inbox item for severity < 8', async () => {
      const cluster = makeCluster({ severityScore: 7 });
      await createHighSeverityInboxItem(cluster);

      expect(mockCreateInboxEvent).not.toHaveBeenCalled();
    });

    it('does NOT create inbox item for severity of 1', async () => {
      const cluster = makeCluster({ severityScore: 1 });
      await createHighSeverityInboxItem(cluster);

      expect(mockCreateInboxEvent).not.toHaveBeenCalled();
    });
  });

  // ── createPendingReviewInboxItem ────────────────────────────────────────────

  describe('createPendingReviewInboxItem', () => {
    it('creates inbox item for clusters in received status for 7+ days', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const cluster = makeCluster({
        status: 'received',
        updatedAt: eightDaysAgo,
      });

      await createPendingReviewInboxItem(cluster);

      expect(mockCreateInboxEvent).toHaveBeenCalledWith(
        'platform_admin',
        expect.stringContaining('Pending Review:'),
        'cluster-1',
        'medium'
      );
    });

    it('does NOT create inbox item for clusters in received status for fewer than 7 days', async () => {
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
      const cluster = makeCluster({
        status: 'received',
        updatedAt: sixDaysAgo,
      });

      await createPendingReviewInboxItem(cluster);

      expect(mockCreateInboxEvent).not.toHaveBeenCalled();
    });

    it('does NOT create inbox item for clusters not in received status', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const cluster = makeCluster({
        status: 'reviewing',
        updatedAt: eightDaysAgo,
      });

      await createPendingReviewInboxItem(cluster);

      expect(mockCreateInboxEvent).not.toHaveBeenCalled();
    });

    it('does NOT create inbox item for planned clusters even if stale', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const cluster = makeCluster({
        status: 'planned',
        updatedAt: tenDaysAgo,
      });

      await createPendingReviewInboxItem(cluster);

      expect(mockCreateInboxEvent).not.toHaveBeenCalled();
    });
  });

  // ── surfaceOperatorAction ───────────────────────────────────────────────────

  describe('surfaceOperatorAction', () => {
    it('writes an entry to the action centre activity log', async () => {
      await surfaceOperatorAction('operator-1', 'status_change', 'cluster-42');

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorId: 'operator-1',
          action: 'status_change',
          clusterId: 'cluster-42',
        })
      );
    });

    it('includes a timestamp in the activity log entry', async () => {
      const before = new Date().toISOString();
      await surfaceOperatorAction('operator-2', 'brief_generation', 'cluster-99');

      const callArgs = mockAdd.mock.calls[0][0];
      expect(callArgs.timestamp).toBeDefined();
      expect(new Date(callArgs.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime()
      );
    });
  });

  // ── withRetryNonBlocking ────────────────────────────────────────────────────

  describe('withRetryNonBlocking', () => {
    it('executes the function on first attempt when it succeeds', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      await withRetryNonBlocking(fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries up to 3 times on failure', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('network error'));
      await withRetryNonBlocking(fn);
      // Initial attempt + 3 retries = 4 total calls
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('does not throw on final failure (just logs)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

      // Should not throw
      await expect(withRetryNonBlocking(fn)).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[FeedbackAudit] Failed after retries:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('succeeds on second attempt after initial failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('transient error'))
        .mockResolvedValue(undefined);

      await withRetryNonBlocking(fn);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('succeeds on final retry attempt', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockRejectedValueOnce(new Error('fail-3'))
        .mockResolvedValue(undefined);

      await withRetryNonBlocking(fn);
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('uses custom retry count', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('error'));
      await withRetryNonBlocking(fn, 1);
      // Initial attempt + 1 retry = 2 total calls
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
