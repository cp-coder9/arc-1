import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockAdd = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn();
const mockCountGet = vi.fn();

const adminMocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  offset: vi.fn(),
  add: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  batch: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: adminMocks.collection,
    batch: adminMocks.batch,
  },
}));

vi.mock('@vercel/blob', () => ({
  del: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function buildChainableMock(overrides: Record<string, any> = {}) {
  const mock: any = {
    collection: adminMocks.collection,
    doc: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    add: mockAdd,
    get: mockGet,
    update: mockUpdate,
    count: vi.fn().mockReturnValue({ get: mockCountGet }),
    ...overrides,
  };
  return mock;
}

const validInput = {
  category: 'bug' as const,
  description: 'This is a valid bug report with enough characters',
  contextSnapshot: {
    pagePath: '/projects/abc',
    activeModule: 'SpecForge',
    projectId: 'project-123',
    userRole: 'architect',
    viewportWidth: 1920,
    viewportHeight: 1080,
  },
  attachmentUrls: ['https://blob.vercel-storage.com/file1.png'],
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('feedbackService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('submitFeedback', () => {
    it('persists a submission with correct fields and returns it with Firestore-generated ID', async () => {
      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockAdd.mockResolvedValue({ id: 'generated-id-123' });

      const { submitFeedback } = await import('../feedbackService');

      const result = await submitFeedback(validInput, 'user-abc');

      expect(adminMocks.collection).toHaveBeenCalledWith('feedback_submissions');
      expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-abc',
        category: 'bug',
        description: 'This is a valid bug report with enough characters',
        contextSnapshot: validInput.contextSnapshot,
        attachmentUrls: ['https://blob.vercel-storage.com/file1.png'],
        status: 'received',
        implicit: false,
        clusterId: null,
        aiCategory: null,
        sentiment: null,
        categoryMismatch: false,
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-01T12:00:00.000Z',
        softDeleted: false,
      }));

      expect(result.id).toBe('generated-id-123');
      expect(result.status).toBe('received');
      expect(result.userId).toBe('user-abc');
    });

    it('marks implicit submissions with implicit=true and includes implicitMetadata', async () => {
      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockAdd.mockResolvedValue({ id: 'implicit-id' });

      const { submitFeedback } = await import('../feedbackService');

      const metadata = { frictionType: 'rage_clicks', targetIdentifier: '#save-btn', signalCount: 7 };
      const result = await submitFeedback(validInput, 'user-xyz', true, metadata);

      expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
        implicit: true,
        implicitMetadata: metadata,
      }));
      expect(result.implicit).toBe(true);
    });
  });

  describe('getUserSubmissions', () => {
    it('returns max 20 non-soft-deleted submissions sorted by createdAt desc', async () => {
      const docs = Array.from({ length: 20 }, (_, i) => ({
        id: `sub-${i}`,
        data: () => ({
          userId: 'user-1',
          category: 'bug',
          description: `Submission ${i}`,
          createdAt: new Date(2026, 6, 1, 12, 0, i).toISOString(),
          softDeleted: false,
        }),
      }));

      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockGet.mockResolvedValue({ docs });

      const { getUserSubmissions } = await import('../feedbackService');
      const result = await getUserSubmissions('user-1');

      expect(result).toHaveLength(20);
      expect(chainable.where).toHaveBeenCalledWith('userId', '==', 'user-1');
      expect(chainable.where).toHaveBeenCalledWith('softDeleted', '==', false);
      expect(chainable.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(chainable.limit).toHaveBeenCalledWith(20);
    });

    it('respects custom limit capped at 20', async () => {
      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockGet.mockResolvedValue({ docs: [] });

      const { getUserSubmissions } = await import('../feedbackService');
      await getUserSubmissions('user-1', 50);

      // Should cap at 20
      expect(chainable.limit).toHaveBeenCalledWith(20);
    });
  });

  describe('checkRateLimit', () => {
    it('returns allowed=true with remaining count when under limit', async () => {
      const docs = Array.from({ length: 3 }, (_, i) => ({
        data: () => ({
          createdAt: new Date(2026, 6, 1, 10, i).toISOString(),
        }),
      }));

      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockGet.mockResolvedValue({ size: 3, docs });

      const { checkRateLimit } = await import('../feedbackService');
      const result = await checkRateLimit('user-1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
      expect(result.resetsAt).toBeDefined();
      expect(chainable.where).toHaveBeenCalledWith('userId', '==', 'user-1');
      expect(chainable.where).toHaveBeenCalledWith('implicit', '==', false);
    });

    it('returns allowed=false with remaining=0 when at limit', async () => {
      const docs = Array.from({ length: 10 }, (_, i) => ({
        data: () => ({
          createdAt: new Date(2026, 6, 1, 10, i).toISOString(),
        }),
      }));

      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockGet.mockResolvedValue({ size: 10, docs });

      const { checkRateLimit } = await import('../feedbackService');
      const result = await checkRateLimit('user-1');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('returns allowed=true with remaining=10 when no submissions exist', async () => {
      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockGet.mockResolvedValue({ size: 0, docs: [] });

      const { checkRateLimit } = await import('../feedbackService');
      const result = await checkRateLimit('user-1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });
  });

  describe('transitionClusterStatus', () => {
    it('validates and persists a valid transition from received to reviewing', async () => {
      const clusterData = {
        status: 'received',
        statusHistory: [],
        category: 'bug',
        title: 'Login fails',
        occurrenceCount: 5,
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          id: 'cluster-1',
          data: () => clusterData,
        }),
        update: mockUpdate,
      };

      const chainable = buildChainableMock({ doc: vi.fn().mockReturnValue(mockDocRef) });
      adminMocks.collection.mockReturnValue(chainable);
      mockUpdate.mockResolvedValue(undefined);

      const { transitionClusterStatus } = await import('../feedbackService');
      const result = await transitionClusterStatus(
        'cluster-1',
        'reviewing',
        'admin-user',
        'Starting review of login issue cluster'
      );

      expect(result.status).toBe('reviewing');
      expect(result.statusHistory).toHaveLength(1);
      expect(result.statusHistory[0]).toMatchObject({
        from: 'received',
        to: 'reviewing',
        operatorId: 'admin-user',
        actionDescription: 'Starting review of login issue cluster',
      });
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('rejects invalid status transition from received to shipped', async () => {
      const clusterData = {
        status: 'received',
        statusHistory: [],
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          id: 'cluster-1',
          data: () => clusterData,
        }),
        update: mockUpdate,
      };

      const chainable = buildChainableMock({ doc: vi.fn().mockReturnValue(mockDocRef) });
      adminMocks.collection.mockReturnValue(chainable);

      const { transitionClusterStatus } = await import('../feedbackService');

      await expect(
        transitionClusterStatus('cluster-1', 'shipped', 'admin-user', 'Shipping this cluster')
      ).rejects.toThrow(/Cannot transition from 'received' to 'shipped'/);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('rejects transition to declined without a decline reason', async () => {
      const clusterData = {
        status: 'received',
        statusHistory: [],
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          id: 'cluster-1',
          data: () => clusterData,
        }),
        update: mockUpdate,
      };

      const chainable = buildChainableMock({ doc: vi.fn().mockReturnValue(mockDocRef) });
      adminMocks.collection.mockReturnValue(chainable);

      const { transitionClusterStatus } = await import('../feedbackService');

      await expect(
        transitionClusterStatus('cluster-1', 'declined', 'admin-user', 'Declining this cluster')
      ).rejects.toThrow('Decline reason is required when transitioning to declined status');
    });

    it('rejects transition with too-short action description', async () => {
      const clusterData = {
        status: 'received',
        statusHistory: [],
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          id: 'cluster-1',
          data: () => clusterData,
        }),
        update: mockUpdate,
      };

      const chainable = buildChainableMock({ doc: vi.fn().mockReturnValue(mockDocRef) });
      adminMocks.collection.mockReturnValue(chainable);

      const { transitionClusterStatus } = await import('../feedbackService');

      await expect(
        transitionClusterStatus('cluster-1', 'reviewing', 'admin-user', 'Short')
      ).rejects.toThrow(/Action description must be at least 10 characters/);
    });

    it('throws when cluster is not found', async () => {
      const mockDocRef = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        update: mockUpdate,
      };

      const chainable = buildChainableMock({ doc: vi.fn().mockReturnValue(mockDocRef) });
      adminMocks.collection.mockReturnValue(chainable);

      const { transitionClusterStatus } = await import('../feedbackService');

      await expect(
        transitionClusterStatus('nonexistent', 'reviewing', 'admin', 'Starting review process')
      ).rejects.toThrow('Cluster not found: nonexistent');
    });
  });

  describe('softDeleteUserData', () => {
    it('sets softDeleted=true, clears descriptions, and deletes blob attachments', async () => {
      const docs = [
        {
          ref: { id: 'sub-1' },
          data: () => ({
            description: 'My bug report',
            attachmentUrls: ['https://blob.vercel-storage.com/file1.png', 'https://blob.vercel-storage.com/file2.png'],
          }),
        },
        {
          ref: { id: 'sub-2' },
          data: () => ({
            description: 'Another report',
            attachmentUrls: [],
          }),
        },
      ];

      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockGet.mockResolvedValue({ docs });

      adminMocks.batch.mockReturnValue({
        update: mockBatchUpdate,
        commit: mockBatchCommit.mockResolvedValue(undefined),
      });

      const { softDeleteUserData } = await import('../feedbackService');
      const { del: mockDel } = await import('@vercel/blob');

      await softDeleteUserData('user-to-delete');

      expect(chainable.where).toHaveBeenCalledWith('userId', '==', 'user-to-delete');
      expect(mockBatchUpdate).toHaveBeenCalledTimes(2);

      // Verify batch update fields
      expect(mockBatchUpdate).toHaveBeenCalledWith(
        { id: 'sub-1' },
        expect.objectContaining({
          softDeleted: true,
          description: '',
          attachmentUrls: [],
        })
      );
      expect(mockBatchUpdate).toHaveBeenCalledWith(
        { id: 'sub-2' },
        expect.objectContaining({
          softDeleted: true,
          description: '',
          attachmentUrls: [],
        })
      );

      expect(mockBatchCommit).toHaveBeenCalled();
      expect(mockDel).toHaveBeenCalledWith([
        'https://blob.vercel-storage.com/file1.png',
        'https://blob.vercel-storage.com/file2.png',
      ]);
    });

    it('does not call blob del when no attachments exist', async () => {
      const docs = [
        {
          ref: { id: 'sub-1' },
          data: () => ({
            description: 'A report',
            attachmentUrls: [],
          }),
        },
      ];

      const chainable = buildChainableMock();
      adminMocks.collection.mockReturnValue(chainable);
      mockGet.mockResolvedValue({ docs });

      adminMocks.batch.mockReturnValue({
        update: mockBatchUpdate,
        commit: mockBatchCommit.mockResolvedValue(undefined),
      });

      const { softDeleteUserData } = await import('../feedbackService');
      const { del: mockDel } = await import('@vercel/blob');

      await softDeleteUserData('user-no-blobs');

      expect(mockDel).not.toHaveBeenCalled();
    });
  });
});
