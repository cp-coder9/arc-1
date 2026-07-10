/**
 * Project Command Centre — Procurement Workflow Service
 *
 * Manages procurement orders, RFQs, delivery tracking, bid comparison,
 * B-BBEE scoring, and SpecForge specification item linking.
 * Persisted at `projects/{projectId}/procurement_orders/`.
 *
 * @module commandCentre/procurementWorkflowService
 */

import {
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { createProcurementOrderSchema } from '@/services/commandCentre/schemas';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import type { ProcurementOrder, BBBEEProcurementSummary } from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const PROCUREMENT_ORDERS_COL = 'procurement_orders';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function procurementOrdersCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, PROCUREMENT_ORDERS_COL);
}

function procurementOrderDocument(projectId: string, orderId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!orderId) throw new Error('orderId is required');
  return getDemoDoc(PROJECTS_COL, projectId, PROCUREMENT_ORDERS_COL, orderId);
}

// ── Input Interfaces ─────────────────────────────────────────────────────────

export interface CreateOrderData {
  description: string;
  supplierId: string;
  supplierName: string;
  value: number;
  expectedDeliveryDate: string;
  bbbeeLevel?: number;
  linkedSpecForgeItemId?: string;
  createdBy: string;
}

export interface UpdateOrderData {
  description?: string;
  supplierId?: string;
  supplierName?: string;
  value?: number;
  expectedDeliveryDate?: string;
  status?: ProcurementOrder['status'];
  bbbeeLevel?: number;
  linkedSpecForgeItemId?: string;
}

// ── Bid Comparison Types ─────────────────────────────────────────────────────

export interface BidEntry {
  supplierId: string;
  supplierName: string;
  value: number;
  deliveryDays: number;
  bbbeeLevel: number;
}

export interface BidComparisonResult {
  bids: BidEntry[];
  bestValue: BidEntry | null;
  fastestDelivery: BidEntry | null;
  bestBBBEE: BidEntry | null;
}

// ── Overdue Order Result ─────────────────────────────────────────────────────

export interface OverdueOrder {
  order: ProcurementOrder;
  daysOverdue: number;
}

// ── Pure Computation Functions (exported for testability) ────────────────────

/**
 * Calculates B-BBEE procurement percentage from a list of orders.
 *
 * B-BBEE % = sum(values of orders with bbbeeLevel >= 1) / sum(all order values) * 100
 *
 * Per-supplier breakdown sums to total procurement value.
 */
export function calculateBBBEEPercentage(orders: ProcurementOrder[]): BBBEEProcurementSummary {
  if (orders.length === 0) {
    return {
      totalProcurementValue: 0,
      bbbeeProcurementValue: 0,
      bbbeePercent: 0,
      supplierBreakdown: [],
    };
  }

  const totalProcurementValue = orders.reduce((sum, order) => sum + order.value, 0);

  const bbbeeProcurementValue = orders
    .filter((order) => (order.bbbeeLevel ?? 0) >= 1)
    .reduce((sum, order) => sum + order.value, 0);

  const bbbeePercent = totalProcurementValue > 0
    ? (bbbeeProcurementValue / totalProcurementValue) * 100
    : 0;

  // Build per-supplier breakdown (aggregate by supplierId)
  const supplierMap = new Map<string, { supplierId: string; supplierName: string; bbbeeLevel: number; orderValue: number }>();

  for (const order of orders) {
    const existing = supplierMap.get(order.supplierId);
    if (existing) {
      existing.orderValue += order.value;
      // Use the highest B-BBEE level recorded for this supplier
      if ((order.bbbeeLevel ?? 0) > existing.bbbeeLevel) {
        existing.bbbeeLevel = order.bbbeeLevel ?? 0;
      }
    } else {
      supplierMap.set(order.supplierId, {
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        bbbeeLevel: order.bbbeeLevel ?? 0,
        orderValue: order.value,
      });
    }
  }

  const supplierBreakdown = Array.from(supplierMap.values());

  return {
    totalProcurementValue,
    bbbeeProcurementValue,
    bbbeePercent,
    supplierBreakdown,
  };
}

/**
 * Checks which orders are overdue based on the provided current date.
 * An order is overdue when expectedDeliveryDate < currentDate and status !== 'delivered'.
 */
export function findOverdueOrders(
  orders: ProcurementOrder[],
  currentDate?: Date,
): OverdueOrder[] {
  const now = currentDate ?? new Date();
  const nowStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  return orders
    .filter((order) => order.status !== 'delivered' && order.expectedDeliveryDate < nowStr)
    .map((order) => {
      const expectedMs = new Date(order.expectedDeliveryDate).getTime();
      const nowMs = new Date(nowStr).getTime();
      const daysOverdue = Math.floor((nowMs - expectedMs) / (1000 * 60 * 60 * 24));
      return { order, daysOverdue };
    });
}

/**
 * Compares bids across value, delivery time, and B-BBEE score.
 * Returns the best option in each category.
 */
export function compareBids(bids: BidEntry[]): BidComparisonResult {
  if (bids.length === 0) {
    return { bids: [], bestValue: null, fastestDelivery: null, bestBBBEE: null };
  }

  const bestValue = bids.reduce((best, bid) =>
    bid.value < best.value ? bid : best, bids[0]);

  const fastestDelivery = bids.reduce((best, bid) =>
    bid.deliveryDays < best.deliveryDays ? bid : best, bids[0]);

  const bestBBBEE = bids.reduce((best, bid) =>
    bid.bbbeeLevel > best.bbbeeLevel ? bid : best, bids[0]);

  return { bids, bestValue, fastestDelivery, bestBBBEE };
}

/**
 * Generates the next sequential order number in format PO-XXXX.
 */
export function generateOrderNumber(existingCount: number): string {
  return `PO-${String(existingCount + 1).padStart(4, '0')}`;
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Creates a new procurement order. Validates required fields with Zod schema.
 * New orders start in 'ordered' status with auto-generated timestamps and order number.
 */
export async function createOrder(
  projectId: string,
  data: CreateOrderData,
): Promise<ProcurementOrder> {
  // Validate required fields via Zod
  const validation = createProcurementOrderSchema.safeParse({
    description: data.description,
    supplierId: data.supplierId,
    value: data.value,
    expectedDeliveryDate: data.expectedDeliveryDate,
  });

  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`);
  }

  const now = new Date().toISOString();
  const id = generateId();

  // Get existing orders count for sequential numbering
  let existingCount = 0;
  try {
    const snap = await getDocs(procurementOrdersCollection(projectId));
    existingCount = snap.docs.length;
  } catch {
    // If we can't count existing orders, start from 0
  }

  const order: ProcurementOrder = {
    id,
    projectId,
    orderNumber: generateOrderNumber(existingCount),
    description: data.description,
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    value: data.value,
    expectedDeliveryDate: data.expectedDeliveryDate,
    status: 'ordered',
    bbbeeLevel: data.bbbeeLevel,
    linkedSpecForgeItemId: data.linkedSpecForgeItemId,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await addDoc(procurementOrdersCollection(projectId), order);

    // Record audit entry for order creation
    void recordAudit({
      projectId,
      actorId: data.createdBy,
      actorName: data.supplierName,
      actionType: 'create',
      entityType: 'procurement_order',
      entityId: id,
      after: { description: order.description, value: order.value, status: order.status, supplier: order.supplierName },
      timestamp: now,
    });

    return order;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${PROCUREMENT_ORDERS_COL}`);
    throw error;
  }
}

/**
 * Updates an existing procurement order's fields.
 * Records audit entry with before/after changes.
 */
export async function updateOrder(
  projectId: string,
  orderId: string,
  data: UpdateOrderData,
): Promise<ProcurementOrder> {
  const docRef = procurementOrderDocument(projectId, orderId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Procurement order ${orderId} not found in project ${projectId}`);
    }

    const existing = snap.data() as ProcurementOrder;
    const now = new Date().toISOString();

    const updates: Partial<ProcurementOrder> & { updatedAt: string } = {
      ...data,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    const updatedOrder: ProcurementOrder = { ...existing, ...updates };

    // Record audit entry for order update
    void recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.supplierName,
      actionType: 'update',
      entityType: 'procurement_order',
      entityId: orderId,
      before: data as Record<string, unknown>,
      after: updates as Record<string, unknown>,
      timestamp: now,
    });

    return updatedOrder;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PROCUREMENT_ORDERS_COL}/${orderId}`);
    throw error;
  }
}

/**
 * Retrieves all procurement orders for a project.
 */
export async function getOrders(projectId: string): Promise<ProcurementOrder[]> {
  try {
    const snap = await getDocs(procurementOrdersCollection(projectId));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id } as ProcurementOrder));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${PROCUREMENT_ORDERS_COL}`);
    throw error;
  }
}

/**
 * Checks for overdue deliveries, flags them, and generates risk entries.
 * Returns the list of overdue orders with days overdue.
 */
export async function checkOverdueDeliveries(
  projectId: string,
  currentDate?: Date,
): Promise<OverdueOrder[]> {
  const orders = await getOrders(projectId);
  const overdueOrders = findOverdueOrders(orders, currentDate);

  // Record audit entries for each overdue order flagged
  for (const { order, daysOverdue } of overdueOrders) {
    void recordAudit({
      projectId,
      actorId: 'system',
      actorName: 'System',
      actionType: 'status_change',
      entityType: 'procurement_order',
      entityId: order.id,
      after: { overdueDetected: true, daysOverdue },
      timestamp: new Date().toISOString(),
    });
  }

  return overdueOrders;
}

// ── Service Export ───────────────────────────────────────────────────────────

export const procurementWorkflowService = {
  createOrder,
  updateOrder,
  getOrders,
  checkOverdueDeliveries,
  // Pure computation functions exported for testability
  calculateBBBEEPercentage,
  findOverdueOrders,
  compareBids,
  generateOrderNumber,
};

export default procurementWorkflowService;
