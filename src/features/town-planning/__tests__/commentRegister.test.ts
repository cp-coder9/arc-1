/**
 * Unit Tests for Comment & Objection Register Service
 *
 * Tests registration, status transitions, response capture,
 * summary counts, late submission detection, and unreviewed objection alerts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerComment,
  updateCommentStatus,
  addResponse,
  getCommentsSummary,
  checkUnreviewedObjections,
  COMMENT_STATUS_TRANSITIONS,
  type CommentActor,
  type CommentDeps,
  type CommentAuditFn,
  type ActionCentreFn,
} from '../services/commentRegister';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { CommentStatus } from '../types';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(existingComment: Record<string, unknown> | null = null): FirestoreDB {
  let addCounter = 0;

  const mockDocRef = {
    get: vi.fn().mockResolvedValue({
      exists: existingComment !== null,
      id: 'comment-001',
      data: () => existingComment,
    }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
      add: vi.fn().mockImplementation(() => {
        addCounter++;
        return Promise.resolve({ id: `comment-${addCounter}` });
      }),
      get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    }),
  };
}

function createMockDbWithComments(comments: Array<{ id: string; data: Record<string, unknown> }>): FirestoreDB {
  const docs = comments.map((c) => ({
    exists: true,
    id: c.id,
    data: () => c.data,
  }));

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockImplementation((id: string) => {
        const found = comments.find((c) => c.id === id);
        return {
          get: vi.fn().mockResolvedValue({
            exists: !!found,
            id: found?.id ?? id,
            data: () => found?.data ?? null,
          }),
          set: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
        };
      }),
      add: vi.fn().mockResolvedValue({ id: 'new-comment' }),
      get: vi.fn().mockResolvedValue({ docs, empty: docs.length === 0 }),
    }),
  };
}

const actor: CommentActor = { id: 'user-001', role: 'town_planner' };

function createDeps(db: FirestoreDB): CommentDeps {
  return {
    db,
    auditFn: vi.fn().mockResolvedValue(undefined) as unknown as CommentAuditFn,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Comment Register — registerComment', () => {
  it('registers a valid comment successfully', async () => {
    const db = createMockDb();
    const deps = createDeps(db);

    const result = await registerComment(
      'app-001', 'proj-001',
      {
        type: 'objection',
        submitterName: 'John Doe',
        submitterContact: 'john@example.com',
        content: 'I object to the proposed rezoning.',
        dateReceived: '2025-06-10',
      },
      '2025-06-30',
      actor,
      deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('received');
      expect(result.data.type).toBe('objection');
      expect(result.data.isLateSubmission).toBe(false);
      expect(result.data.submitterName).toBe('John Doe');
    }
  });

  it('detects late submission when dateReceived > advertisingEndDate', async () => {
    const db = createMockDb();
    const deps = createDeps(db);

    const result = await registerComment(
      'app-001', 'proj-001',
      {
        type: 'objection',
        submitterName: 'Jane Smith',
        submitterContact: 'jane@example.com',
        content: 'Late objection.',
        dateReceived: '2025-07-05',
      },
      '2025-06-30',
      actor,
      deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isLateSubmission).toBe(true);
    }
  });

  it('does not flag as late when dateReceived equals advertisingEndDate', async () => {
    const db = createMockDb();
    const deps = createDeps(db);

    const result = await registerComment(
      'app-001', 'proj-001',
      {
        type: 'support',
        submitterName: 'Bob',
        submitterContact: 'bob@example.com',
        content: 'I support this.',
        dateReceived: '2025-06-30',
      },
      '2025-06-30',
      actor,
      deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isLateSubmission).toBe(false);
    }
  });

  it('rejects invalid input (missing required fields)', async () => {
    const db = createMockDb();
    const deps = createDeps(db);

    const result = await registerComment(
      'app-001', 'proj-001',
      { type: 'objection' }, // missing required fields
      '2025-06-30',
      actor,
      deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('creates an audit record on successful registration', async () => {
    const db = createMockDb();
    const deps = createDeps(db);

    await registerComment(
      'app-001', 'proj-001',
      {
        type: 'neutral',
        submitterName: 'Alice',
        submitterContact: 'alice@example.com',
        content: 'No strong opinion.',
        dateReceived: '2025-06-15',
      },
      '2025-06-30',
      actor,
      deps
    );

    expect(deps.auditFn).toHaveBeenCalledTimes(1);
    expect(deps.auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'comment_registered',
        actorId: 'user-001',
        applicationId: 'app-001',
        projectId: 'proj-001',
      })
    );
  });
});

describe('Comment Register — updateCommentStatus', () => {
  it('transitions received → reviewed', async () => {
    const db = createMockDb({ status: 'received', type: 'objection', applicationId: 'app-001' });
    const deps = createDeps(db);

    const result = await updateCommentStatus(
      'comment-001', 'app-001', 'proj-001', 'reviewed', actor, deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('reviewed');
    }
  });

  it('transitions response_prepared → addressed', async () => {
    const db = createMockDb({ status: 'response_prepared', type: 'objection', applicationId: 'app-001' });
    const deps = createDeps(db);

    const result = await updateCommentStatus(
      'comment-001', 'app-001', 'proj-001', 'addressed', actor, deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('addressed');
    }
  });

  it('rejects invalid transition received → addressed (skip reviewed)', async () => {
    const db = createMockDb({ status: 'received', type: 'objection', applicationId: 'app-001' });
    const deps = createDeps(db);

    const result = await updateCommentStatus(
      'comment-001', 'app-001', 'proj-001', 'addressed', actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid status transition');
    }
  });

  it('rejects transition from terminal state (addressed)', async () => {
    const db = createMockDb({ status: 'addressed', type: 'support', applicationId: 'app-001' });
    const deps = createDeps(db);

    const result = await updateCommentStatus(
      'comment-001', 'app-001', 'proj-001', 'received', actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid status transition');
    }
  });

  it('returns error when comment not found', async () => {
    const db = createMockDb(null);
    const deps = createDeps(db);

    const result = await updateCommentStatus(
      'nonexistent', 'app-001', 'proj-001', 'reviewed', actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not found');
    }
  });
});

describe('Comment Register — addResponse', () => {
  it('adds response to a reviewed comment and sets status to response_prepared', async () => {
    const db = createMockDb({
      status: 'reviewed',
      type: 'objection',
      applicationId: 'app-001',
      submitterName: 'John',
      submitterContact: 'john@test.com',
      content: 'Objection text',
      dateReceived: '2025-06-10',
      isLateSubmission: false,
      createdAt: '2025-06-10T00:00:00.000Z',
      updatedAt: '2025-06-10T00:00:00.000Z',
    });
    const deps = createDeps(db);

    const result = await addResponse(
      'comment-001', 'app-001', 'proj-001',
      { response: 'Thank you for your input. We have considered your objection.' },
      actor,
      deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('response_prepared');
      expect(result.data.response).toBe('Thank you for your input. We have considered your objection.');
      expect(result.data.respondedBy).toBe('user-001');
      expect(result.data.responseDate).toBeTruthy();
    }
  });

  it('rejects response when comment is not in reviewed status', async () => {
    const db = createMockDb({ status: 'received', type: 'objection', applicationId: 'app-001' });
    const deps = createDeps(db);

    const result = await addResponse(
      'comment-001', 'app-001', 'proj-001',
      { response: 'Some response' },
      actor,
      deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('reviewed');
    }
  });

  it('rejects empty response content', async () => {
    const db = createMockDb({ status: 'reviewed', type: 'objection', applicationId: 'app-001' });
    const deps = createDeps(db);

    const result = await addResponse(
      'comment-001', 'app-001', 'proj-001',
      { response: '' },
      actor,
      deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });
});

describe('Comment Register — getCommentsSummary', () => {
  it('returns zero counts when no comments exist', async () => {
    const db = createMockDbWithComments([]);

    const summary = await getCommentsSummary('app-001', 'proj-001', db);

    expect(summary).toEqual({
      totalSupports: 0,
      totalNeutral: 0,
      totalObjections: 0,
      totalAddressed: 0,
    });
  });

  it('correctly counts each type and addressed comments', async () => {
    const db = createMockDbWithComments([
      { id: 'c1', data: { type: 'support', status: 'addressed' } },
      { id: 'c2', data: { type: 'support', status: 'reviewed' } },
      { id: 'c3', data: { type: 'objection', status: 'received' } },
      { id: 'c4', data: { type: 'objection', status: 'addressed' } },
      { id: 'c5', data: { type: 'neutral', status: 'reviewed' } },
    ]);

    const summary = await getCommentsSummary('app-001', 'proj-001', db);

    expect(summary.totalSupports).toBe(2);
    expect(summary.totalNeutral).toBe(1);
    expect(summary.totalObjections).toBe(2);
    expect(summary.totalAddressed).toBe(2);
  });
});

describe('Comment Register — checkUnreviewedObjections', () => {
  it('returns no unreviewd when comment period has not expired', async () => {
    const db = createMockDbWithComments([
      { id: 'c1', data: { type: 'objection', status: 'received' } },
    ]);
    const actionCentreFn = vi.fn().mockResolvedValue(undefined) as unknown as ActionCentreFn;

    const result = await checkUnreviewedObjections(
      'app-001', 'proj-001', '2025-07-01', db, actionCentreFn, '2025-06-15'
    );

    expect(result.hasUnreviewed).toBe(false);
    expect(actionCentreFn).not.toHaveBeenCalled();
  });

  it('surfaces alert when comment period expired and unreviewed objections exist', async () => {
    const db = createMockDbWithComments([
      { id: 'c1', data: { type: 'objection', status: 'received' } },
      { id: 'c2', data: { type: 'objection', status: 'received' } },
      { id: 'c3', data: { type: 'support', status: 'received' } },
      { id: 'c4', data: { type: 'objection', status: 'reviewed' } },
    ]);
    const actionCentreFn = vi.fn().mockResolvedValue(undefined) as unknown as ActionCentreFn;

    const result = await checkUnreviewedObjections(
      'app-001', 'proj-001', '2025-06-01', db, actionCentreFn, '2025-06-15'
    );

    expect(result.hasUnreviewed).toBe(true);
    expect(result.count).toBe(2); // only unreviewed objections
    expect(actionCentreFn).toHaveBeenCalledTimes(1);
    expect(actionCentreFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'unreviewed_objections',
        severity: 'high',
      })
    );
  });

  it('does not alert when all objections are reviewed', async () => {
    const db = createMockDbWithComments([
      { id: 'c1', data: { type: 'objection', status: 'reviewed' } },
      { id: 'c2', data: { type: 'objection', status: 'addressed' } },
    ]);
    const actionCentreFn = vi.fn().mockResolvedValue(undefined) as unknown as ActionCentreFn;

    const result = await checkUnreviewedObjections(
      'app-001', 'proj-001', '2025-06-01', db, actionCentreFn, '2025-06-15'
    );

    expect(result.hasUnreviewed).toBe(false);
    expect(result.count).toBe(0);
    expect(actionCentreFn).not.toHaveBeenCalled();
  });
});
