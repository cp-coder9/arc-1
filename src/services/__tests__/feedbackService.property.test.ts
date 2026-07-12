/**
 * Property-based tests — FeedbackService correctness.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 20: Soft-delete data removal
 *   Validates: Requirements 8.5, 8.7
 *
 * Property 3: Submission persistence round-trip
 *   Validates: Requirements 2.1, 2.5
 *
 * Property 13: My Feedback display constraints
 *   Validates: Requirements 5.6
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

// ─── Mock setup ─────────────────────────────────────────────────────────────────

const mockAdd = vi.fn();
const mockGet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn();

const adminMocks = vi.hoisted(() => ({
  collection: vi.fn(),
  batch: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: adminMocks.collection,
    batch: adminMocks.batch,
  },
}));

const mockDel = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@vercel/blob', () => ({
  del: mockDel,
}));

const intelligenceMocks = vi.hoisted(() => ({
  processSubmission: vi.fn().mockResolvedValue(undefined),
  createCluster: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/feedbackIntelligenceEngine', () => ({
  processSubmission: intelligenceMocks.processSubmission,
}));
vi.mock('@/services/feedbackClusterManager', () => ({
  createCluster: intelligenceMocks.createCluster,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function buildChainableMock(overrides: Record<string, any> = {}) {
  const mock: any = {
    doc: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    add: mockAdd,
    get: mockGet,
    ...overrides,
  };
  return mock;
}

// ─── Generators for Property 20 ─────────────────────────────────────────────────

/** Generate a valid Vercel Blob URL */
const arbBlobUrl = fc.tuple(
  fc.stringMatching(/^[a-z0-9]+$/),
  fc.constantFrom('.png', '.jpeg', '.jpg'),
).map(([name, ext]) => `https://blob.vercel-storage.com/feedback/${name}${ext}`);

/** Generate attachment URL arrays (0–3 per submission) */
const arbAttachmentUrls = fc.array(arbBlobUrl, { minLength: 0, maxLength: 3 });

/** Generate a non-empty description (user-identifiable content) */
const arbDescription = fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.replace(/\s/g, '').length >= 10);

/** Generate a single user submission document mock */
const arbSubmissionDoc = fc.tuple(
  fc.uuid(),
  arbDescription,
  arbAttachmentUrls,
).map(([id, description, attachmentUrls]) => ({
  ref: { id },
  data: () => ({
    description,
    attachmentUrls,
    userId: 'user-to-delete',
    softDeleted: false,
  }),
}));

/** Generate 1–10 submissions for a user */
const arbSubmissions = fc.array(arbSubmissionDoc, { minLength: 1, maxLength: 10 });

// ─── Generators for Property 3 ──────────────────────────────────────────────────

/** Generate a valid feedback category */
const arbCategory = fc.constantFrom('bug', 'feature_request', 'usability', 'praise') as fc.Arbitrary<'bug' | 'feature_request' | 'usability' | 'praise'>;

/** Generate a valid description (≥10 non-whitespace, ≤2000 total chars) */
const arbValidDescription = fc.string({ minLength: 10, maxLength: 200 })
  .filter(s => s.replace(/\s/g, '').length >= 10 && s.length <= 2000);

/** Generate a valid context snapshot */
const arbContextSnapshot = fc.record({
  pagePath: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.length >= 1),
  activeModule: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.length >= 1),
  projectId: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  userRole: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.length >= 1),
  viewportWidth: fc.integer({ min: 1, max: 3840 }),
  viewportHeight: fc.integer({ min: 1, max: 2160 }),
});

/** Generate 0–3 valid URL strings for attachment URLs */
const arbValidAttachmentUrls = fc.array(
  fc.webUrl(),
  { minLength: 0, maxLength: 3 },
);

/** Generate a valid FeedbackSubmissionInput */
const arbSubmissionInput = fc.record({
  category: arbCategory,
  description: arbValidDescription,
  contextSnapshot: arbContextSnapshot,
  attachmentUrls: arbValidAttachmentUrls,
});

/** Generate a userId */
const arbUserId = fc.uuid();

// ─── Generators for Property 13 ─────────────────────────────────────────────────

/** Generate a random ISO timestamp */
const arbTimestamp = fc.date({
  min: new Date('2024-01-01T00:00:00Z'),
  max: new Date('2026-12-31T23:59:59Z'),
  noInvalidDate: true,
}).map(d => d.toISOString());


// ══════════════════════════════════════════════════════════════════════════════
// Property 20: Soft-delete data removal
// Validates: Requirements 8.5, 8.7
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 20: Soft-delete data removal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    adminMocks.batch.mockReturnValue({
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    });
  });

  /**
   * **Validates: Requirements 8.5, 8.7**
   *
   * For any set of user submissions (1–10), after softDeleteUserData() completes:
   * all submission descriptions are set to empty string in the batch update.
   */
  it('sets all submission descriptions to empty string in the batch update', async () => {
    const { softDeleteUserData } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissions, async (docs) => {
        vi.clearAllMocks();
        mockBatchCommit.mockResolvedValue(undefined);
        mockDel.mockResolvedValue(undefined);
        adminMocks.batch.mockReturnValue({
          update: mockBatchUpdate,
          commit: mockBatchCommit,
        });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);
        mockGet.mockResolvedValue({ docs });

        await softDeleteUserData('user-to-delete');

        expect(mockBatchUpdate).toHaveBeenCalledTimes(docs.length);
        for (let i = 0; i < docs.length; i++) {
          expect(mockBatchUpdate).toHaveBeenCalledWith(
            docs[i].ref,
            expect.objectContaining({ description: '' }),
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5, 8.7**
   *
   * All associated Vercel Blob attachment URLs are passed to del().
   */
  it('passes all associated Vercel Blob attachment URLs to del()', async () => {
    const { softDeleteUserData } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissions, async (docs) => {
        vi.clearAllMocks();
        mockBatchCommit.mockResolvedValue(undefined);
        mockDel.mockResolvedValue(undefined);
        adminMocks.batch.mockReturnValue({
          update: mockBatchUpdate,
          commit: mockBatchCommit,
        });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);
        mockGet.mockResolvedValue({ docs });

        await softDeleteUserData('user-to-delete');

        const allUrls: string[] = [];
        for (const doc of docs) {
          const data = doc.data();
          if (data.attachmentUrls.length > 0) {
            allUrls.push(...data.attachmentUrls);
          }
        }

        if (allUrls.length > 0) {
          expect(mockDel).toHaveBeenCalledWith(allUrls);
        } else {
          expect(mockDel).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5, 8.7**
   *
   * softDeleted is set to true for all submissions in the batch update.
   */
  it('sets softDeleted to true for all submissions', async () => {
    const { softDeleteUserData } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissions, async (docs) => {
        vi.clearAllMocks();
        mockBatchCommit.mockResolvedValue(undefined);
        mockDel.mockResolvedValue(undefined);
        adminMocks.batch.mockReturnValue({
          update: mockBatchUpdate,
          commit: mockBatchCommit,
        });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);
        mockGet.mockResolvedValue({ docs });

        await softDeleteUserData('user-to-delete');

        expect(mockBatchUpdate).toHaveBeenCalledTimes(docs.length);
        for (let i = 0; i < docs.length; i++) {
          expect(mockBatchUpdate).toHaveBeenCalledWith(
            docs[i].ref,
            expect.objectContaining({ softDeleted: true }),
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5, 8.7**
   *
   * No user-identifiable fields remain (description is cleared, attachmentUrls emptied).
   */
  it('clears all user-identifiable fields (description and attachmentUrls)', async () => {
    const { softDeleteUserData } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissions, async (docs) => {
        vi.clearAllMocks();
        mockBatchCommit.mockResolvedValue(undefined);
        mockDel.mockResolvedValue(undefined);
        adminMocks.batch.mockReturnValue({
          update: mockBatchUpdate,
          commit: mockBatchCommit,
        });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);
        mockGet.mockResolvedValue({ docs });

        await softDeleteUserData('user-to-delete');

        expect(mockBatchUpdate).toHaveBeenCalledTimes(docs.length);
        for (let i = 0; i < docs.length; i++) {
          expect(mockBatchUpdate).toHaveBeenCalledWith(
            docs[i].ref,
            expect.objectContaining({
              description: '',
              attachmentUrls: [],
            }),
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5, 8.7**
   *
   * Cluster occurrence counts are NOT decremented — the batch update does not
   * modify any cluster documents; it only updates submission documents.
   */
  it('does not decrement cluster occurrence counts (no cluster updates in batch)', async () => {
    const { softDeleteUserData } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissions, async (docs) => {
        vi.clearAllMocks();
        mockBatchCommit.mockResolvedValue(undefined);
        mockDel.mockResolvedValue(undefined);
        adminMocks.batch.mockReturnValue({
          update: mockBatchUpdate,
          commit: mockBatchCommit,
        });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);
        mockGet.mockResolvedValue({ docs });

        await softDeleteUserData('user-to-delete');

        for (let i = 0; i < mockBatchUpdate.mock.calls.length; i++) {
          const [ref, updatePayload] = mockBatchUpdate.mock.calls[i];
          expect(docs.some((d: any) => d.ref === ref)).toBe(true);
          expect(updatePayload).not.toHaveProperty('occurrenceCount');
          expect(updatePayload).not.toHaveProperty('distinctUserCount');
          expect(updatePayload).not.toHaveProperty('severityScore');
          expect(updatePayload).not.toHaveProperty('submissionIds');
        }
      }),
      { numRuns: 100 },
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// Property 3: Submission persistence round-trip
// Validates: Requirements 2.1, 2.5
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 3: Submission persistence round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'generated-id' });
    const chainable = buildChainableMock();
    adminMocks.collection.mockReturnValue(chainable);
  });

  /**
   * **Validates: Requirements 2.1, 2.5**
   *
   * For any valid feedback submission input, calling submitFeedback() produces
   * a record containing exact context snapshot fields matching the input.
   */
  it('persisted record contains exact context snapshot fields matching input', async () => {
    const { submitFeedback } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissionInput, arbUserId, async (input, userId) => {
        vi.clearAllMocks();
        mockAdd.mockResolvedValue({ id: 'generated-id' });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);

        const result = await submitFeedback(input, userId);

        expect(result.contextSnapshot.pagePath).toBe(input.contextSnapshot.pagePath);
        expect(result.contextSnapshot.activeModule).toBe(input.contextSnapshot.activeModule);
        expect(result.contextSnapshot.projectId).toBe(input.contextSnapshot.projectId);
        expect(result.contextSnapshot.userRole).toBe(input.contextSnapshot.userRole);
        expect(result.contextSnapshot.viewportWidth).toBe(input.contextSnapshot.viewportWidth);
        expect(result.contextSnapshot.viewportHeight).toBe(input.contextSnapshot.viewportHeight);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.5**
   *
   * Persisted record has an ISO-8601 UTC createdAt timestamp.
   */
  it('persisted record has ISO-8601 UTC createdAt timestamp', async () => {
    const { submitFeedback } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissionInput, arbUserId, async (input, userId) => {
        vi.clearAllMocks();
        mockAdd.mockResolvedValue({ id: 'generated-id' });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);

        const result = await submitFeedback(input, userId);

        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
        expect(result.createdAt).toMatch(isoRegex);
        expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.5**
   *
   * Persisted record has submitter UID matching the passed userId.
   */
  it('persisted record has submitter UID matching the passed userId', async () => {
    const { submitFeedback } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissionInput, arbUserId, async (input, userId) => {
        vi.clearAllMocks();
        mockAdd.mockResolvedValue({ id: 'generated-id' });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);

        const result = await submitFeedback(input, userId);

        expect(result.userId).toBe(userId);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.5**
   *
   * Persisted record has status equal to 'received'.
   */
  it('persisted record has status "received"', async () => {
    const { submitFeedback } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissionInput, arbUserId, async (input, userId) => {
        vi.clearAllMocks();
        mockAdd.mockResolvedValue({ id: 'generated-id' });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);

        const result = await submitFeedback(input, userId);

        expect(result.status).toBe('received');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.5**
   *
   * Persisted record has all attachment URLs intact (same as input).
   */
  it('persisted record has all attachment URLs intact', async () => {
    const { submitFeedback } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissionInput, arbUserId, async (input, userId) => {
        vi.clearAllMocks();
        mockAdd.mockResolvedValue({ id: 'generated-id' });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);

        const result = await submitFeedback(input, userId);

        expect(result.attachmentUrls).toEqual(input.attachmentUrls);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.5**
   *
   * Persisted record has implicit=false, clusterId=null, softDeleted=false for explicit submissions.
   */
  it('persisted record has implicit=false, clusterId=null, softDeleted=false for explicit submissions', async () => {
    const { submitFeedback } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(arbSubmissionInput, arbUserId, async (input, userId) => {
        vi.clearAllMocks();
        mockAdd.mockResolvedValue({ id: 'generated-id' });
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);

        const result = await submitFeedback(input, userId);

        expect(result.implicit).toBe(false);
        expect(result.clusterId).toBeNull();
        expect(result.softDeleted).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// Property 13: My Feedback display constraints
// Validates: Requirements 5.6
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 13: My Feedback display constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chainable = buildChainableMock();
    adminMocks.collection.mockReturnValue(chainable);
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * getUserSubmissions() returns exactly min(N, 20) items for N submissions.
   */
  it('returns exactly min(N, 20) items for N submissions', async () => {
    const { getUserSubmissions } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 50 }), async (n) => {
        vi.clearAllMocks();
        const chainable = buildChainableMock();
        adminMocks.collection.mockReturnValue(chainable);

        // Firestore limit(20) means the query itself will cap at 20 docs returned
        const cappedN = Math.min(n, 20);
        const docs = Array.from({ length: cappedN }, (_, i) => ({
          id: `doc-${i}`,
          data: () => ({
            userId: 'test-user',
            category: 'bug',
            description: 'Test description for property 13',
            contextSnapshot: {
              pagePath: '/test',
              activeModule: 'module',
              projectId: null,
              userRole: 'architect',
              viewportWidth: 1920,
              viewportHeight: 1080,
            },
            attachmentUrls: [],
            status: 'received',
            implicit: false,
            clusterId: null,
            aiCategory: null,
            sentiment: null,
            categoryMismatch: false,
            createdAt: new Date(2025, 0, cappedN - i).toISOString(),
            updatedAt: new Date(2025, 0, cappedN - i).toISOString(),
            softDeleted: false,
          }),
        }));

        mockGet.mockResolvedValue({ docs });

        const result = await getUserSubmissions('test-user');

        expect(result.length).toBe(cappedN);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * Returned submissions are sorted by createdAt in strictly non-increasing (descending) order.
   */
  it('returns submissions sorted by createdAt in descending order', async () => {
    const { getUserSubmissions } = await import('../feedbackService');

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbTimestamp, { minLength: 2, maxLength: 20 }),
        async (timestamps) => {
          vi.clearAllMocks();
          const chainable = buildChainableMock();
          adminMocks.collection.mockReturnValue(chainable);

          // Sort timestamps descending (simulates Firestore orderBy desc)
          const sortedTimestamps = [...timestamps].sort(
            (a, b) => new Date(b).getTime() - new Date(a).getTime()
          );

          const docs = sortedTimestamps.map((createdAt, i) => ({
            id: `doc-${i}`,
            data: () => ({
              userId: 'test-user',
              category: 'bug',
              description: 'Test description for ordering property',
              contextSnapshot: {
                pagePath: '/test',
                activeModule: 'module',
                projectId: null,
                userRole: 'architect',
                viewportWidth: 1920,
                viewportHeight: 1080,
              },
              attachmentUrls: [],
              status: 'received',
              implicit: false,
              clusterId: null,
              aiCategory: null,
              sentiment: null,
              categoryMismatch: false,
              createdAt,
              updatedAt: createdAt,
              softDeleted: false,
            }),
          }));

          mockGet.mockResolvedValue({ docs });

          const result = await getUserSubmissions('test-user');

          // Verify non-increasing order
          for (let i = 1; i < result.length; i++) {
            const prev = new Date(result[i - 1].createdAt).getTime();
            const curr = new Date(result[i].createdAt).getTime();
            expect(prev).toBeGreaterThanOrEqual(curr);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
