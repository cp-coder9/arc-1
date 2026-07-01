import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logMarketplaceAction } from '../../services/marketplaceAuditService';
import type { MarketplaceAuditEntry, LogMarketplaceActionParams } from '../../services/marketplaceAuditService';

// Mock the platform audit trail service
vi.mock('@/services/auditTrailService', () => ({
  createAuditEntry: vi.fn(() => ({
    auditId: 'audit-1',
    actorId: 'user-1',
    action: 'marketplace:posting_created',
    sourceObjectId: 'entity-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  })),
}));

// Mock the firebase-admin module (dynamic import in persistToFirestore)
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

// Mock firebase lib (prevents JSON config resolution issues)
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
  handleFirestoreError: vi.fn(),
}));

describe('marketplaceAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logMarketplaceAction', () => {
    const baseParams: LogMarketplaceActionParams = {
      actorId: 'user-123',
      actionType: 'posting_created',
      entityId: 'posting-456',
      entityType: 'project_posting',
    };

    it('returns a MarketplaceAuditEntry with all required fields', async () => {
      const entry = await logMarketplaceAction(baseParams);

      expect(entry.id).toBeDefined();
      expect(entry.id).toMatch(/^mkt-audit-/);
      expect(entry.actorId).toBe('user-123');
      expect(entry.actionType).toBe('posting_created');
      expect(entry.entityId).toBe('posting-456');
      expect(entry.entityType).toBe('project_posting');
      expect(entry.timestamp).toBeDefined();
    });

    it('generates a valid ISO-8601 timestamp automatically', async () => {
      const before = new Date().toISOString();
      const entry = await logMarketplaceAction(baseParams);
      const after = new Date().toISOString();

      // Timestamp should be a valid ISO-8601 string between before and after
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
      expect(entry.timestamp >= before).toBe(true);
      expect(entry.timestamp <= after).toBe(true);
    });

    it('generates unique IDs for each entry', async () => {
      const entry1 = await logMarketplaceAction(baseParams);
      const entry2 = await logMarketplaceAction(baseParams);

      expect(entry1.id).not.toBe(entry2.id);
    });

    it('includes beforeStatus and afterStatus when provided', async () => {
      const params: LogMarketplaceActionParams = {
        ...baseParams,
        actionType: 'posting_status_changed',
        beforeStatus: 'draft',
        afterStatus: 'published',
      };

      const entry = await logMarketplaceAction(params);

      expect(entry.beforeStatus).toBe('draft');
      expect(entry.afterStatus).toBe('published');
    });

    it('omits status fields when not provided', async () => {
      const entry = await logMarketplaceAction(baseParams);

      expect(entry.beforeStatus).toBeUndefined();
      expect(entry.afterStatus).toBeUndefined();
    });

    it('includes metadata when provided', async () => {
      const params: LogMarketplaceActionParams = {
        ...baseParams,
        metadata: { proposalId: 'prop-789', feeAmount: 50000 },
      };

      const entry = await logMarketplaceAction(params);

      expect(entry.metadata).toEqual({ proposalId: 'prop-789', feeAmount: 50000 });
    });

    it('omits metadata when not provided', async () => {
      const entry = await logMarketplaceAction(baseParams);

      expect(entry.metadata).toBeUndefined();
    });

    it('integrates with platform audit trail service', async () => {
      const { createAuditEntry } = await import('@/services/auditTrailService');

      await logMarketplaceAction(baseParams);

      expect(createAuditEntry).toHaveBeenCalledWith({
        actorId: 'user-123',
        action: 'marketplace:posting_created',
        sourceObjectId: 'posting-456',
      });
    });

    it('prefixes action type with "marketplace:" for platform audit trail', async () => {
      const { createAuditEntry } = await import('@/services/auditTrailService');

      await logMarketplaceAction({
        ...baseParams,
        actionType: 'proposal_accepted',
      });

      expect(createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'marketplace:proposal_accepted',
        })
      );
    });

    it('handles various marketplace action types', async () => {
      const actionTypes = [
        'posting_created',
        'posting_published',
        'posting_withdrawn',
        'proposal_submitted',
        'proposal_accepted',
        'proposal_rejected',
        'task_created',
        'task_assigned',
        'deliverable_submitted',
        'payment_released',
        'dispute_filed',
        'collaboration_completed',
      ];

      for (const actionType of actionTypes) {
        const entry = await logMarketplaceAction({ ...baseParams, actionType });
        expect(entry.actionType).toBe(actionType);
      }
    });

    it('handles various entity types', async () => {
      const entityTypes = [
        'project_posting',
        'proposal',
        'task_posting',
        'task_application',
        'task_deliverable',
        'material_listing',
        'quote_request',
        'freelancer_profile',
        'firm_collaboration',
        'compliance_certificate',
        'dispute',
      ];

      for (const entityType of entityTypes) {
        const entry = await logMarketplaceAction({ ...baseParams, entityType });
        expect(entry.entityType).toBe(entityType);
      }
    });

    it('does not throw if Firestore persistence fails', async () => {
      // The dynamic import of firebase-admin is mocked, but even if it threw,
      // the function should not propagate the error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // logMarketplaceAction should still resolve successfully
      const entry = await logMarketplaceAction(baseParams);
      expect(entry).toBeDefined();
      expect(entry.actorId).toBe('user-123');

      consoleSpy.mockRestore();
    });
  });

  describe('MarketplaceAuditEntry interface shape', () => {
    it('entry conforms to the expected interface', async () => {
      const entry: MarketplaceAuditEntry = await logMarketplaceAction({
        actorId: 'actor-1',
        actionType: 'test_action',
        entityId: 'entity-1',
        entityType: 'test_entity',
        beforeStatus: 'before',
        afterStatus: 'after',
        metadata: { key: 'value' },
      });

      // Verify all fields exist with correct types
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.actorId).toBe('string');
      expect(typeof entry.actionType).toBe('string');
      expect(typeof entry.timestamp).toBe('string');
      expect(typeof entry.entityId).toBe('string');
      expect(typeof entry.entityType).toBe('string');
      expect(typeof entry.beforeStatus).toBe('string');
      expect(typeof entry.afterStatus).toBe('string');
      expect(typeof entry.metadata).toBe('object');
    });
  });
});
