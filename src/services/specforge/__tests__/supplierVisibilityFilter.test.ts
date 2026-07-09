/**
 * SupplierVisibilityFilter — Unit Tests
 *
 * Tests the server-side supplier/subcontractor access control layer.
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupplierVisibilityFilter } from '../supplierVisibilityFilter';
import type { SpecItem, SpecPackageAssignment, SpecProcurementEntry } from '@/types/specforgeTypes';

// ── Mock Firebase Admin ─────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockWhere = vi.fn();
const mockCollection = vi.fn();
const mockDoc = vi.fn();

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

// Helper to build a fluent Firestore-like chain
function setupFirestoreMock() {
  mockCollection.mockImplementation(() => ({
    doc: (...args: unknown[]) => mockDoc(...args),
  }));
  mockDoc.mockImplementation(() => ({
    collection: (...args: unknown[]) => {
      // Return an object with where() and get() depending on context
      return {
        where: (...whereArgs: unknown[]) => mockWhere(...whereArgs),
        get: mockGet,
      };
    },
  }));
  // Default: mockWhere returns chainable with where + get
  mockWhere.mockImplementation(() => ({
    where: (...whereArgs: unknown[]) => mockWhere(...whereArgs),
    get: mockGet,
  }));
}

// ── Test Data ───────────────────────────────────────────────────────────────

const PROJECT_ID = 'project-123';
const SUPPLIER_UID = 'supplier-uid-1';
const FIRM_NAME = 'Acme Supplies';

const ACTIVE_ASSIGNMENT: SpecPackageAssignment = {
  id: 'assign-1',
  packageId: 'pkg-kitchen',
  supplierUid: SUPPLIER_UID,
  firmName: FIRM_NAME,
  sectionIds: ['section-1'],
  itemIds: ['item-1', 'item-2', 'item-3'],
  assignedAt: '2026-01-01T00:00:00Z',
  assignedBy: 'admin-uid',
  status: 'active',
};

const REVOKED_ASSIGNMENT: SpecPackageAssignment = {
  id: 'assign-2',
  packageId: 'pkg-bathroom',
  supplierUid: SUPPLIER_UID,
  firmName: FIRM_NAME,
  sectionIds: ['section-2'],
  itemIds: ['item-4', 'item-5'],
  assignedAt: '2026-01-01T00:00:00Z',
  assignedBy: 'admin-uid',
  status: 'revoked',
  revokedAt: '2026-02-01T00:00:00Z',
};

function makeItem(overrides: Partial<SpecItem>): SpecItem {
  return {
    id: 'item-default',
    sectionId: 'section-1',
    code: 'KIT-001',
    title: 'Default Item',
    room: 'Kitchen',
    package: 'Kitchen Package',
    drawingRefs: [],
    clauseRefs: [],
    budgetAllowance: 50000,
    estimatedCost: 45000,
    leadTimeDays: 14,
    clientDecision: false,
    ownerRole: 'architect',
    status: 'issued',
    sourceRevision: 'A',
    ...overrides,
  };
}

const SPEC_ITEMS: SpecItem[] = [
  makeItem({ id: 'item-1', status: 'issued', title: 'Kitchen Tap' }),
  makeItem({ id: 'item-2', status: 'rfq', title: 'Kitchen Sink' }),
  makeItem({ id: 'item-3', status: 'draft', title: 'Kitchen Counter' }), // draft = not visible
  makeItem({ id: 'item-4', status: 'ordered', title: 'Bathroom Basin' }), // revoked package
  makeItem({ id: 'item-5', status: 'delivered', title: 'Bathroom Tiles' }), // revoked package
  makeItem({ id: 'item-6', status: 'issued', title: 'Bedroom Light' }), // not assigned
  makeItem({ id: 'item-7', status: 'approved', title: 'Living Room Fan' }), // not in visible statuses
];

const PROCUREMENT_ENTRIES: SpecProcurementEntry[] = [
  { id: 'proc-1', itemId: 'item-1', itemCode: 'KIT-001', itemTitle: 'Kitchen Tap', supplier: 'Acme Supplies', status: 'rfq_sent' },
  { id: 'proc-2', itemId: 'item-2', itemCode: 'KIT-002', itemTitle: 'Kitchen Sink', supplier: 'Other Co', status: 'quoted' },
  { id: 'proc-3', itemId: 'item-6', itemCode: 'BED-001', itemTitle: 'Bedroom Light', supplier: 'acme supplies', status: 'ordered' }, // case-insensitive match
  { id: 'proc-4', itemId: 'item-6', itemCode: 'BED-002', itemTitle: 'Bedroom Light 2', supplier: 'Different Firm', status: 'delivered' }, // no match
];

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SupplierVisibilityFilter', () => {
  let filter: ReturnType<typeof createSupplierVisibilityFilter>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupFirestoreMock();
    filter = createSupplierVisibilityFilter();
  });

  describe('getVisibleItems', () => {
    it('returns only items with visible statuses AND in assigned packages', async () => {
      // Mock: assignments query returns one active assignment
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ACTIVE_ASSIGNMENT }],
      });
      // Mock: specItems query returns all items
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: SPEC_ITEMS.map((item) => ({ data: () => item })),
      });

      const result = await filter.getVisibleItems(PROJECT_ID, SUPPLIER_UID, 'supplier');

      // item-1: issued + assigned ✓
      // item-2: rfq + assigned ✓
      // item-3: draft + assigned ✗ (status not visible)
      // item-4: ordered + revoked ✗ (not in active assignments)
      // item-5: delivered + revoked ✗ (not in active assignments)
      // item-6: issued + not assigned ✗
      // item-7: approved + not assigned ✗
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['item-1', 'item-2']);
    });

    it('returns empty array when user has no assignments (fail-closed)', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await filter.getVisibleItems(PROJECT_ID, SUPPLIER_UID, 'supplier');

      expect(result).toEqual([]);
    });

    it('strips sensitive fields (budgetAllowance, estimatedCost, notes)', async () => {
      const itemWithNotes = makeItem({
        id: 'item-1',
        status: 'issued',
        budgetAllowance: 100000,
        estimatedCost: 95000,
        notes: 'QS review: cost seems high',
      });

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ACTIVE_ASSIGNMENT }],
      });
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => itemWithNotes }],
      });

      const result = await filter.getVisibleItems(PROJECT_ID, SUPPLIER_UID, 'supplier');

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('budgetAllowance');
      expect(result[0]).not.toHaveProperty('estimatedCost');
      expect(result[0]).not.toHaveProperty('notes');
    });

    it('returns empty array when no spec items exist', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ACTIVE_ASSIGNMENT }],
      });
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await filter.getVisibleItems(PROJECT_ID, SUPPLIER_UID, 'supplier');

      expect(result).toEqual([]);
    });

    it('returns empty array when assignments have no itemIds', async () => {
      const emptyAssignment: SpecPackageAssignment = {
        ...ACTIVE_ASSIGNMENT,
        itemIds: [],
      };

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => emptyAssignment }],
      });

      const result = await filter.getVisibleItems(PROJECT_ID, SUPPLIER_UID, 'supplier');

      expect(result).toEqual([]);
    });

    it('returns union of items across multiple active assignments', async () => {
      const secondAssignment: SpecPackageAssignment = {
        ...ACTIVE_ASSIGNMENT,
        id: 'assign-3',
        packageId: 'pkg-bathroom-2',
        itemIds: ['item-6'], // item-6 is issued
      };

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          { data: () => ACTIVE_ASSIGNMENT },
          { data: () => secondAssignment },
        ],
      });
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: SPEC_ITEMS.map((item) => ({ data: () => item })),
      });

      const result = await filter.getVisibleItems(PROJECT_ID, SUPPLIER_UID, 'supplier');

      // item-1: issued + assigned ✓
      // item-2: rfq + assigned ✓
      // item-6: issued + assigned (via secondAssignment) ✓
      expect(result).toHaveLength(3);
      expect(result.map((i) => i.id)).toContain('item-1');
      expect(result.map((i) => i.id)).toContain('item-2');
      expect(result.map((i) => i.id)).toContain('item-6');
    });
  });

  describe('getVisibleProcurement', () => {
    it('returns entries where supplier matches firm name (case-insensitive) or itemId is assigned', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ACTIVE_ASSIGNMENT }],
      });
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: PROCUREMENT_ENTRIES.map((e) => ({ data: () => e })),
      });

      const result = await filter.getVisibleProcurement(PROJECT_ID, SUPPLIER_UID, FIRM_NAME);

      // proc-1: supplier='Acme Supplies' matches AND itemId='item-1' assigned ✓
      // proc-2: supplier='Other Co' no match, but itemId='item-2' assigned ✓
      // proc-3: supplier='acme supplies' matches case-insensitive ✓
      // proc-4: supplier='Different Firm' no match, itemId='item-6' NOT assigned ✗
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.id)).toEqual(['proc-1', 'proc-2', 'proc-3']);
    });

    it('returns empty array when no assignments (fail-closed)', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await filter.getVisibleProcurement(PROJECT_ID, SUPPLIER_UID, FIRM_NAME);

      expect(result).toEqual([]);
    });

    it('returns empty array when no procurement entries exist', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ACTIVE_ASSIGNMENT }],
      });
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await filter.getVisibleProcurement(PROJECT_ID, SUPPLIER_UID, FIRM_NAME);

      expect(result).toEqual([]);
    });
  });

  describe('getVisibleRfqs', () => {
    it('returns only RFQs where user UID is in invitationList', async () => {
      const rfqs = [
        {
          id: 'rfq-1',
          projectId: PROJECT_ID,
          title: 'Kitchen Package RFQ',
          invitationList: [
            { supplierId: SUPPLIER_UID, supplierName: 'Acme', tradeCategories: [], verificationStatus: 'verified', invitedAt: '2026-01-01T00:00:00Z' },
            { supplierId: 'other-uid', supplierName: 'Other', tradeCategories: [], verificationStatus: 'verified', invitedAt: '2026-01-01T00:00:00Z' },
          ],
        },
        {
          id: 'rfq-2',
          projectId: PROJECT_ID,
          title: 'Bathroom Package RFQ',
          invitationList: [
            { supplierId: 'other-uid', supplierName: 'Other', tradeCategories: [], verificationStatus: 'verified', invitedAt: '2026-01-01T00:00:00Z' },
          ],
        },
        {
          id: 'rfq-3',
          projectId: PROJECT_ID,
          title: 'Electrical Package RFQ',
          invitationList: [
            { supplierId: SUPPLIER_UID, supplierName: 'Acme', tradeCategories: [], verificationStatus: 'verified', invitedAt: '2026-01-01T00:00:00Z' },
          ],
        },
      ];

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: rfqs.map((rfq) => ({ data: () => rfq })),
      });

      const result = await filter.getVisibleRfqs(PROJECT_ID, SUPPLIER_UID);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['rfq-1', 'rfq-3']);
    });

    it('returns empty array when no RFQs exist', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await filter.getVisibleRfqs(PROJECT_ID, SUPPLIER_UID);

      expect(result).toEqual([]);
    });

    it('returns empty array when user is not invited to any RFQ', async () => {
      const rfqs = [
        {
          id: 'rfq-1',
          projectId: PROJECT_ID,
          title: 'Kitchen RFQ',
          invitationList: [
            { supplierId: 'other-uid', supplierName: 'Other', tradeCategories: [], verificationStatus: 'verified', invitedAt: '2026-01-01T00:00:00Z' },
          ],
        },
      ];

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: rfqs.map((rfq) => ({ data: () => rfq })),
      });

      const result = await filter.getVisibleRfqs(PROJECT_ID, SUPPLIER_UID);

      expect(result).toEqual([]);
    });

    it('handles RFQs with empty invitationList', async () => {
      const rfqs = [
        {
          id: 'rfq-1',
          projectId: PROJECT_ID,
          title: 'Empty RFQ',
          invitationList: [],
        },
      ];

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: rfqs.map((rfq) => ({ data: () => rfq })),
      });

      const result = await filter.getVisibleRfqs(PROJECT_ID, SUPPLIER_UID);

      expect(result).toEqual([]);
    });
  });
});
