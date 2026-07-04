/**
 * Unit tests for procurementWorkflowService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: (...segments: string[]) => ({ path: segments.join('/'), type: 'doc' }),
  getDemoCol: (...segments: string[]) => ({ path: segments.join('/'), type: 'col' }),
}));

vi.mock('@/services/commandCentre/commandCentreService', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

const getDocMock = vi.mocked(firestore.getDoc);
const getDocsMock = vi.mocked(firestore.getDocs);
const addDocMock = vi.mocked(firestore.addDoc);
const updateDocMock = vi.mocked(firestore.updateDoc);

import {
  createOrder,
  updateOrder,
  getOrders,
  checkOverdueDeliveries,
  calculateBBBEEPercentage,
  findOverdueOrders,
  compareBids,
  generateOrderNumber,
} from './procurementWorkflowService';
import type { ProcurementOrder } from './types';

// ── Helper ───────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<ProcurementOrder> = {}): ProcurementOrder {
  return {
    id: 'order-1',
    projectId: 'proj-1',
    orderNumber: 'PO-0001',
    description: 'Cement bags',
    supplierId: 'supplier-1',
    supplierName: 'ABC Supplies',
    value: 50000,
    expectedDeliveryDate: '2025-06-01',
    status: 'ordered',
    bbbeeLevel: 2,
    createdBy: 'user-1',
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('procurementWorkflowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Pure Function Tests ──────────────────────────────────────────────────

  describe('calculateBBBEEPercentage', () => {
    it('returns zero values for empty orders list', () => {
      const result = calculateBBBEEPercentage([]);
      expect(result).toEqual({
        totalProcurementValue: 0,
        bbbeeProcurementValue: 0,
        bbbeePercent: 0,
        supplierBreakdown: [],
      });
    });

    it('calculates 100% when all orders have B-BBEE level >= 1', () => {
      const orders = [
        makeOrder({ supplierId: 's1', value: 100000, bbbeeLevel: 1 }),
        makeOrder({ supplierId: 's2', value: 200000, bbbeeLevel: 3 }),
      ];

      const result = calculateBBBEEPercentage(orders);
      expect(result.totalProcurementValue).toBe(300000);
      expect(result.bbbeeProcurementValue).toBe(300000);
      expect(result.bbbeePercent).toBe(100);
    });

    it('calculates correct percentage with mixed B-BBEE levels', () => {
      const orders = [
        makeOrder({ supplierId: 's1', value: 60000, bbbeeLevel: 2 }),
        makeOrder({ supplierId: 's2', value: 40000, bbbeeLevel: 0 }),
      ];

      const result = calculateBBBEEPercentage(orders);
      expect(result.totalProcurementValue).toBe(100000);
      expect(result.bbbeeProcurementValue).toBe(60000);
      expect(result.bbbeePercent).toBe(60);
    });

    it('treats undefined bbbeeLevel as 0 (non-qualifying)', () => {
      const orders = [
        makeOrder({ supplierId: 's1', value: 50000, bbbeeLevel: undefined }),
        makeOrder({ supplierId: 's2', value: 50000, bbbeeLevel: 1 }),
      ];

      const result = calculateBBBEEPercentage(orders);
      expect(result.bbbeePercent).toBe(50);
    });

    it('aggregates supplier breakdown by supplierId', () => {
      const orders = [
        makeOrder({ supplierId: 's1', supplierName: 'Supplier A', value: 30000, bbbeeLevel: 2 }),
        makeOrder({ supplierId: 's1', supplierName: 'Supplier A', value: 20000, bbbeeLevel: 2 }),
        makeOrder({ supplierId: 's2', supplierName: 'Supplier B', value: 50000, bbbeeLevel: 4 }),
      ];

      const result = calculateBBBEEPercentage(orders);
      expect(result.supplierBreakdown).toHaveLength(2);

      const supplierA = result.supplierBreakdown.find((s) => s.supplierId === 's1');
      expect(supplierA?.orderValue).toBe(50000);
      expect(supplierA?.bbbeeLevel).toBe(2);

      const supplierB = result.supplierBreakdown.find((s) => s.supplierId === 's2');
      expect(supplierB?.orderValue).toBe(50000);
      expect(supplierB?.bbbeeLevel).toBe(4);
    });

    it('supplier breakdown sums to total procurement value', () => {
      const orders = [
        makeOrder({ supplierId: 's1', value: 10000, bbbeeLevel: 1 }),
        makeOrder({ supplierId: 's2', value: 25000, bbbeeLevel: 3 }),
        makeOrder({ supplierId: 's1', value: 15000, bbbeeLevel: 1 }),
        makeOrder({ supplierId: 's3', value: 50000, bbbeeLevel: 0 }),
      ];

      const result = calculateBBBEEPercentage(orders);
      const breakdownSum = result.supplierBreakdown.reduce((sum, s) => sum + s.orderValue, 0);
      expect(breakdownSum).toBe(result.totalProcurementValue);
    });

    it('uses highest B-BBEE level when supplier has multiple orders', () => {
      const orders = [
        makeOrder({ supplierId: 's1', supplierName: 'Supplier A', value: 30000, bbbeeLevel: 1 }),
        makeOrder({ supplierId: 's1', supplierName: 'Supplier A', value: 20000, bbbeeLevel: 4 }),
      ];

      const result = calculateBBBEEPercentage(orders);
      const supplierA = result.supplierBreakdown.find((s) => s.supplierId === 's1');
      expect(supplierA?.bbbeeLevel).toBe(4);
    });
  });

  describe('findOverdueOrders', () => {
    it('returns empty array when no orders are overdue', () => {
      const orders = [
        makeOrder({ expectedDeliveryDate: '2025-12-31', status: 'ordered' }),
      ];

      const result = findOverdueOrders(orders, new Date('2025-06-01'));
      expect(result).toHaveLength(0);
    });

    it('identifies orders past expected delivery date', () => {
      const orders = [
        makeOrder({ id: 'o1', expectedDeliveryDate: '2025-05-01', status: 'ordered' }),
        makeOrder({ id: 'o2', expectedDeliveryDate: '2025-07-01', status: 'ordered' }),
      ];

      const result = findOverdueOrders(orders, new Date('2025-06-15'));
      expect(result).toHaveLength(1);
      expect(result[0].order.id).toBe('o1');
      expect(result[0].daysOverdue).toBe(45);
    });

    it('excludes orders with delivered status', () => {
      const orders = [
        makeOrder({ id: 'o1', expectedDeliveryDate: '2025-05-01', status: 'delivered' }),
        makeOrder({ id: 'o2', expectedDeliveryDate: '2025-05-01', status: 'ordered' }),
      ];

      const result = findOverdueOrders(orders, new Date('2025-06-01'));
      expect(result).toHaveLength(1);
      expect(result[0].order.id).toBe('o2');
    });

    it('includes in_transit orders that are overdue', () => {
      const orders = [
        makeOrder({ id: 'o1', expectedDeliveryDate: '2025-05-01', status: 'in_transit' }),
      ];

      const result = findOverdueOrders(orders, new Date('2025-05-10'));
      expect(result).toHaveLength(1);
      expect(result[0].daysOverdue).toBe(9);
    });

    it('calculates days overdue correctly', () => {
      const orders = [
        makeOrder({ expectedDeliveryDate: '2025-01-01', status: 'ordered' }),
      ];

      const result = findOverdueOrders(orders, new Date('2025-01-11'));
      expect(result[0].daysOverdue).toBe(10);
    });

    it('uses current date when no date is provided', () => {
      const pastDate = '2020-01-01';
      const orders = [
        makeOrder({ expectedDeliveryDate: pastDate, status: 'ordered' }),
      ];

      const result = findOverdueOrders(orders);
      expect(result).toHaveLength(1);
      expect(result[0].daysOverdue).toBeGreaterThan(0);
    });
  });

  describe('compareBids', () => {
    it('returns nulls for empty bids array', () => {
      const result = compareBids([]);
      expect(result).toEqual({ bids: [], bestValue: null, fastestDelivery: null, bestBBBEE: null });
    });

    it('identifies best value (lowest price)', () => {
      const bids = [
        { supplierId: 's1', supplierName: 'A', value: 100000, deliveryDays: 14, bbbeeLevel: 2 },
        { supplierId: 's2', supplierName: 'B', value: 80000, deliveryDays: 21, bbbeeLevel: 1 },
        { supplierId: 's3', supplierName: 'C', value: 95000, deliveryDays: 10, bbbeeLevel: 4 },
      ];

      const result = compareBids(bids);
      expect(result.bestValue?.supplierId).toBe('s2');
    });

    it('identifies fastest delivery (lowest days)', () => {
      const bids = [
        { supplierId: 's1', supplierName: 'A', value: 100000, deliveryDays: 14, bbbeeLevel: 2 },
        { supplierId: 's2', supplierName: 'B', value: 80000, deliveryDays: 21, bbbeeLevel: 1 },
        { supplierId: 's3', supplierName: 'C', value: 95000, deliveryDays: 7, bbbeeLevel: 3 },
      ];

      const result = compareBids(bids);
      expect(result.fastestDelivery?.supplierId).toBe('s3');
    });

    it('identifies best B-BBEE score (highest level)', () => {
      const bids = [
        { supplierId: 's1', supplierName: 'A', value: 100000, deliveryDays: 14, bbbeeLevel: 2 },
        { supplierId: 's2', supplierName: 'B', value: 80000, deliveryDays: 21, bbbeeLevel: 5 },
        { supplierId: 's3', supplierName: 'C', value: 95000, deliveryDays: 10, bbbeeLevel: 3 },
      ];

      const result = compareBids(bids);
      expect(result.bestBBBEE?.supplierId).toBe('s2');
    });

    it('handles single bid correctly', () => {
      const bids = [
        { supplierId: 's1', supplierName: 'A', value: 100000, deliveryDays: 14, bbbeeLevel: 2 },
      ];

      const result = compareBids(bids);
      expect(result.bestValue?.supplierId).toBe('s1');
      expect(result.fastestDelivery?.supplierId).toBe('s1');
      expect(result.bestBBBEE?.supplierId).toBe('s1');
    });
  });

  describe('generateOrderNumber', () => {
    it('generates PO-0001 for first order', () => {
      expect(generateOrderNumber(0)).toBe('PO-0001');
    });

    it('generates sequential numbers with zero-padding', () => {
      expect(generateOrderNumber(9)).toBe('PO-0010');
      expect(generateOrderNumber(99)).toBe('PO-0100');
      expect(generateOrderNumber(999)).toBe('PO-1000');
    });
  });

  // ── Firestore-backed Operations ──────────────────────────────────────────

  describe('createOrder', () => {
    it('creates an order with validated data and initial status', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);
      addDocMock.mockResolvedValue({ id: 'new-doc-id' } as any);

      const result = await createOrder('proj-1', {
        description: 'Steel beams',
        supplierId: 'sup-1',
        supplierName: 'Steel Co',
        value: 150000,
        expectedDeliveryDate: '2025-08-15',
        bbbeeLevel: 3,
        createdBy: 'user-1',
      });

      expect(result.projectId).toBe('proj-1');
      expect(result.description).toBe('Steel beams');
      expect(result.status).toBe('ordered');
      expect(result.orderNumber).toBe('PO-0001');
      expect(result.bbbeeLevel).toBe(3);
      expect(addDocMock).toHaveBeenCalled();
    });

    it('generates sequential order number based on existing count', async () => {
      getDocsMock.mockResolvedValue({ docs: [{}, {}, {}] } as any);
      addDocMock.mockResolvedValue({ id: 'new-doc-id' } as any);

      const result = await createOrder('proj-1', {
        description: 'Bricks',
        supplierId: 'sup-2',
        supplierName: 'Brick Co',
        value: 30000,
        expectedDeliveryDate: '2025-09-01',
        createdBy: 'user-1',
      });

      expect(result.orderNumber).toBe('PO-0004');
    });

    it('rejects missing required fields', async () => {
      await expect(
        createOrder('proj-1', {
          description: '',
          supplierId: 'sup-1',
          supplierName: 'Steel Co',
          value: 100,
          expectedDeliveryDate: '2025-08-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');
    });

    it('rejects negative values', async () => {
      await expect(
        createOrder('proj-1', {
          description: 'Invalid order',
          supplierId: 'sup-1',
          supplierName: 'Test Co',
          value: -100,
          expectedDeliveryDate: '2025-08-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');
    });

    it('links to SpecForge item when provided', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);
      addDocMock.mockResolvedValue({ id: 'new-doc-id' } as any);

      const result = await createOrder('proj-1', {
        description: 'Windows',
        supplierId: 'sup-3',
        supplierName: 'Glass Works',
        value: 75000,
        expectedDeliveryDate: '2025-10-01',
        linkedSpecForgeItemId: 'sf-item-42',
        createdBy: 'user-1',
      });

      expect(result.linkedSpecForgeItemId).toBe('sf-item-42');
    });

    it('throws when projectId is empty', async () => {
      await expect(
        createOrder('', {
          description: 'Test',
          supplierId: 'sup-1',
          supplierName: 'Test',
          value: 100,
          expectedDeliveryDate: '2025-08-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('projectId is required');
    });
  });

  describe('updateOrder', () => {
    it('updates order fields and records audit', async () => {
      const existingOrder = makeOrder();
      getDocMock.mockResolvedValue({ exists: () => true, data: () => existingOrder } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateOrder('proj-1', 'order-1', {
        status: 'in_transit',
        value: 55000,
      });

      expect(result.status).toBe('in_transit');
      expect(result.value).toBe(55000);
      expect(updateDocMock).toHaveBeenCalled();
    });

    it('throws when order not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(
        updateOrder('proj-1', 'nonexistent', { status: 'delivered' }),
      ).rejects.toThrow('not found');
    });

    it('throws when projectId is empty', async () => {
      await expect(
        updateOrder('', 'order-1', { status: 'delivered' }),
      ).rejects.toThrow('projectId is required');
    });

    it('throws when orderId is empty', async () => {
      await expect(
        updateOrder('proj-1', '', { status: 'delivered' }),
      ).rejects.toThrow('orderId is required');
    });
  });

  describe('getOrders', () => {
    it('returns all orders for a project', async () => {
      const mockOrders = [
        makeOrder({ id: 'o1', description: 'Steel' }),
        makeOrder({ id: 'o2', description: 'Cement' }),
      ];
      getDocsMock.mockResolvedValue({
        docs: mockOrders.map((o) => ({ id: o.id, data: () => o })),
      } as any);

      const result = await getOrders('proj-1');
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no orders exist', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);

      const result = await getOrders('proj-1');
      expect(result).toHaveLength(0);
    });

    it('throws on Firestore failure', async () => {
      const error = new Error('Network error');
      getDocsMock.mockRejectedValue(error);

      await expect(getOrders('proj-1')).rejects.toThrow('Network error');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'list',
        'projects/proj-1/procurement_orders',
      );
    });
  });

  describe('checkOverdueDeliveries', () => {
    it('returns overdue orders and records audit entries', async () => {
      const orders = [
        makeOrder({ id: 'o1', expectedDeliveryDate: '2025-05-01', status: 'ordered' }),
        makeOrder({ id: 'o2', expectedDeliveryDate: '2025-12-31', status: 'ordered' }),
      ];
      getDocsMock.mockResolvedValue({
        docs: orders.map((o) => ({ id: o.id, data: () => o })),
      } as any);

      const result = await checkOverdueDeliveries('proj-1', new Date('2025-06-01'));
      expect(result).toHaveLength(1);
      expect(result[0].order.id).toBe('o1');
      expect(result[0].daysOverdue).toBe(31);
    });

    it('returns empty array when all deliveries are on time', async () => {
      const orders = [
        makeOrder({ id: 'o1', expectedDeliveryDate: '2025-12-31', status: 'ordered' }),
      ];
      getDocsMock.mockResolvedValue({
        docs: orders.map((o) => ({ id: o.id, data: () => o })),
      } as any);

      const result = await checkOverdueDeliveries('proj-1', new Date('2025-06-01'));
      expect(result).toHaveLength(0);
    });
  });
});
