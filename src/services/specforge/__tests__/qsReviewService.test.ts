/**
 * QS Review Service — Unit Tests
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SpecForgeRepository } from '@/services/specforge/specforgeRepository';
import type { SpecAuditEvent, SpecForgeWorkspace, SpecItem } from '@/types/specforgeTypes';

// Mock firebase-admin to prevent Firestore initialization in tests
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false }),
      }),
    }),
  },
}));

// Mock the Firestore repository to prevent Firebase SDK import
vi.mock('@/services/specforge/firestoreSpecForgeRepository', () => ({
  FirestoreSpecForgeRepository: vi.fn(),
}));

// Mock the platform audit trail service
vi.mock('@/services/auditTrailService', () => ({
  createAuditEntry: vi.fn(),
}));

// Mock the platform inbox event adapter
vi.mock('@/services/inboxEventAdapter', () => ({
  createInboxEvent: vi.fn(),
  createWorkflowEvent: vi.fn(),
  inboxEventToWorkflowEvent: vi.fn(),
  workflowEventToInboxEvent: vi.fn(),
  workflowEventsFromReadiness: vi.fn().mockReturnValue([]),
  subscribeToInboxEvents: vi.fn().mockReturnValue(() => {}),
}));

import { submitReview } from '../qsReviewService';
import { setSpecForgeRepository } from '@/services/specforge/specforgeRepository';
import { createInboxEvent } from '@/services/inboxEventAdapter';

const mockedCreateInboxEvent = vi.mocked(createInboxEvent);

// ── Test Helpers ────────────────────────────────────────────────────────────

function createMockItem(overrides?: Partial<SpecItem>): SpecItem {
  return {
    id: 'item-1',
    sectionId: 'section-1',
    code: 'INT-001',
    title: 'Designer Kitchen Tap',
    room: 'Kitchen',
    package: 'Plumbing',
    drawingRefs: [],
    clauseRefs: [],
    budgetAllowance: 10000,
    estimatedCost: 9500,
    leadTimeDays: 14,
    clientDecision: false,
    ownerRole: 'architect',
    status: 'draft',
    sourceRevision: 'A',
    ...overrides,
  };
}

function createMockWorkspace(items?: SpecItem[]): SpecForgeWorkspace {
  return {
    id: 'ws-proj-1',
    projectId: 'proj-1',
    projectName: 'Test Project',
    stage: 'design',
    profile: 'residential',
    revision: 'A',
    issueStatus: 'draft',
    sections: [],
    items: items ?? [createMockItem()],
  };
}

function createMockRepository(workspace?: SpecForgeWorkspace | null): SpecForgeRepository & { loggedEvents: SpecAuditEvent[] } {
  const loggedEvents: SpecAuditEvent[] = [];
  return {
    loggedEvents,
    getWorkspace: vi.fn().mockResolvedValue(workspace ?? createMockWorkspace()),
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('qsReviewService', () => {
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    setSpecForgeRepository(mockRepo);
  });

  describe('submitReview', () => {
    it('returns 400 when reviewStatus is missing', async () => {
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { comments: 'Looks good' },
      });

      expect(result.status).toBe(400);
      expect(result.data).toHaveProperty('error', 'Validation failed');
      expect(result.data).toHaveProperty('details');
    });

    it('returns 400 when comments is empty', async () => {
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'approved', comments: '' },
      });

      expect(result.status).toBe(400);
      expect(result.data).toHaveProperty('error', 'Validation failed');
    });

    it('returns 400 when reviewStatus is invalid', async () => {
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'invalid_status', comments: 'Some comment' },
      });

      expect(result.status).toBe(400);
      expect(result.data).toHaveProperty('error', 'Validation failed');
    });

    it('returns 400 when revisedEstimate is below 0.01', async () => {
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'approved', comments: 'Too low', revisedEstimate: 0 },
      });

      expect(result.status).toBe(400);
      expect(result.data).toHaveProperty('error', 'Validation failed');
    });

    it('returns 400 when revisedEstimate exceeds 999999999.99', async () => {
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'approved', comments: 'Too high', revisedEstimate: 1_000_000_000 },
      });

      expect(result.status).toBe(400);
      expect(result.data).toHaveProperty('error', 'Validation failed');
    });

    it('returns 404 when project is not found', async () => {
      mockRepo = createMockRepository(null);
      setSpecForgeRepository(mockRepo);

      const result = await submitReview({
        projectId: 'nonexistent',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'approved', comments: 'All good' },
      });

      expect(result.status).toBe(404);
      expect(result.data).toHaveProperty('error');
      expect((result.data as { error: string }).error).toContain('Project not found');
    });

    it('returns 404 when item is not found', async () => {
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'nonexistent-item',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'approved', comments: 'All good' },
      });

      expect(result.status).toBe(404);
      expect(result.data).toHaveProperty('error');
      expect((result.data as { error: string }).error).toContain('Item not found');
    });

    it('returns 200 with success response for valid review without revisedEstimate', async () => {
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'approved', comments: 'Budget looks correct' },
      });

      expect(result.status).toBe(200);
      expect(result.data).toEqual({
        success: true,
        itemId: 'item-1',
        reviewStatus: 'approved',
      });
    });

    it('updates item estimatedCost when revisedEstimate is provided', async () => {
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'flagged', comments: 'Cost too high', revisedEstimate: 8500 },
      });

      expect(result.status).toBe(200);
      expect(mockRepo.updateItem).toHaveBeenCalledWith('proj-1', 'item-1', { estimatedCost: 8500 });
    });

    it('writes an audit event with previous and new estimated cost', async () => {
      await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'flagged', comments: 'Revised down', revisedEstimate: 8000 },
      });

      expect(mockRepo.logAuditEvent).toHaveBeenCalled();
      const auditEvent = mockRepo.loggedEvents[0];
      expect(auditEvent.action).toBe('updated');
      expect(auditEvent.targetId).toBe('item-1');
      expect(auditEvent.targetType).toBe('item');
      expect(auditEvent.performedBy).toBe('user-qs-1');
      expect(auditEvent.previousValue).toContain('9500');
      expect(auditEvent.newValue).toContain('8000');
    });

    it('emits budget warning inbox event when estimatedCost exceeds budgetAllowance * 1.1', async () => {
      // Item has budgetAllowance: 10000. Setting revisedEstimate to 12000 = 120% > 110%
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'flagged', comments: 'Over budget', revisedEstimate: 12000 },
      });

      expect(result.status).toBe(200);
      expect((result.data as { budgetWarning?: boolean }).budgetWarning).toBe(true);
      expect(mockedCreateInboxEvent).toHaveBeenCalled();
    });

    it('does NOT emit budget warning when estimatedCost is within 10% of budgetAllowance', async () => {
      // Item has budgetAllowance: 10000. Setting revisedEstimate to 10500 = 105% < 110%
      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'approved', comments: 'Acceptable', revisedEstimate: 10500 },
      });

      expect(result.status).toBe(200);
      expect((result.data as { budgetWarning?: boolean }).budgetWarning).toBeUndefined();
      expect(mockedCreateInboxEvent).not.toHaveBeenCalled();
    });

    it('triggers budget warning based on existing estimatedCost when no revisedEstimate provided', async () => {
      // Create item where existing estimatedCost already exceeds threshold
      const overBudgetItem = createMockItem({
        estimatedCost: 15000,
        budgetAllowance: 10000,
      });
      mockRepo = createMockRepository(createMockWorkspace([overBudgetItem]));
      setSpecForgeRepository(mockRepo);

      const result = await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'flagged', comments: 'Already over budget' },
      });

      expect(result.status).toBe(200);
      expect((result.data as { budgetWarning?: boolean }).budgetWarning).toBe(true);
      expect(mockedCreateInboxEvent).toHaveBeenCalled();
    });

    it('does not update estimatedCost when revisedEstimate is not provided', async () => {
      await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'approved', comments: 'No change needed' },
      });

      expect(mockRepo.updateItem).not.toHaveBeenCalled();
    });

    it('writes an audit event even without revisedEstimate', async () => {
      await submitReview({
        projectId: 'proj-1',
        itemId: 'item-1',
        reviewerUid: 'user-qs-1',
        body: { reviewStatus: 'requires_revision', comments: 'Please get new quotes' },
      });

      expect(mockRepo.logAuditEvent).toHaveBeenCalled();
      const auditEvent = mockRepo.loggedEvents[0];
      expect(auditEvent.action).toBe('updated');
      expect(auditEvent.targetId).toBe('item-1');
      expect(auditEvent.newValue).toContain('requires_revision');
    });
  });
});
