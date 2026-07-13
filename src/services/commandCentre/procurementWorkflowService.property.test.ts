/**
 * Property 7: B-BBEE Procurement Percentage
 *
 * - B-BBEE % = sum(values with level >= 1) / sum(all values) * 100
 * - Per-supplier breakdown sums to total
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateBBBEEPercentage } from './procurementWorkflowService';
import type { ProcurementOrder } from './types';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);
const positiveValueArb = fc.double({ min: 1, max: 10_000_000, noNaN: true, noDefaultInfinity: true });
const bbbeeLevel = fc.integer({ min: 0, max: 8 });
const timestampArb = fc.integer({ min: new Date('2024-01-01T00:00:00.000Z').getTime(), max: new Date('2026-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts).toISOString());
const isoDateArb = fc.integer({ min: new Date('2024-01-01T00:00:00.000Z').getTime(), max: new Date('2026-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts).toISOString().split('T')[0]);
const statusArb = fc.constantFrom<ProcurementOrder['status']>('ordered', 'in_transit', 'delivered', 'evaluating');

const procurementOrderArb: fc.Arbitrary<ProcurementOrder> = fc.record({
  id: fc.uuid(),
  projectId: nonEmptyStringArb,
  orderNumber: nonEmptyStringArb,
  description: nonEmptyStringArb,
  supplierId: fc.constantFrom('sup-1', 'sup-2', 'sup-3', 'sup-4', 'sup-5'),
  supplierName: nonEmptyStringArb,
  value: positiveValueArb,
  expectedDeliveryDate: isoDateArb,
  status: statusArb,
  bbbeeLevel: fc.option(bbbeeLevel, { nil: undefined }),
  linkedSpecForgeItemId: fc.option(fc.uuid(), { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  updatedAt: timestampArb,
});

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 7: B-BBEE Procurement Percentage', () => {
  it('B-BBEE % = sum(values with level >= 1) / sum(all values) * 100', () => {
    fc.assert(
      fc.property(fc.array(procurementOrderArb, { minLength: 1, maxLength: 30 }), (orders) => {
        const result = calculateBBBEEPercentage(orders);

        const totalValue = orders.reduce((sum, o) => sum + o.value, 0);
        const bbbeeValue = orders
          .filter((o) => (o.bbbeeLevel ?? 0) >= 1)
          .reduce((sum, o) => sum + o.value, 0);

        const expectedPercent = totalValue > 0 ? (bbbeeValue / totalValue) * 100 : 0;

        expect(result.totalProcurementValue).toBeCloseTo(totalValue, 5);
        expect(result.bbbeeProcurementValue).toBeCloseTo(bbbeeValue, 5);
        expect(result.bbbeePercent).toBeCloseTo(expectedPercent, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('per-supplier breakdown sums to total procurement value', () => {
    fc.assert(
      fc.property(fc.array(procurementOrderArb, { minLength: 1, maxLength: 30 }), (orders) => {
        const result = calculateBBBEEPercentage(orders);

        const breakdownTotal = result.supplierBreakdown.reduce((sum, s) => sum + s.orderValue, 0);
        expect(breakdownTotal).toBeCloseTo(result.totalProcurementValue, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('B-BBEE percentage is between 0 and 100 inclusive', () => {
    fc.assert(
      fc.property(fc.array(procurementOrderArb, { minLength: 1, maxLength: 30 }), (orders) => {
        const result = calculateBBBEEPercentage(orders);
        expect(result.bbbeePercent).toBeGreaterThanOrEqual(0);
        expect(result.bbbeePercent).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it('empty orders produce zero values', () => {
    const result = calculateBBBEEPercentage([]);
    expect(result.totalProcurementValue).toBe(0);
    expect(result.bbbeeProcurementValue).toBe(0);
    expect(result.bbbeePercent).toBe(0);
    expect(result.supplierBreakdown).toEqual([]);
  });

  it('all orders with bbbeeLevel >= 1 gives 100% B-BBEE', () => {
    fc.assert(
      fc.property(
        fc.array(procurementOrderArb, { minLength: 1, maxLength: 20 }).map((orders) =>
          orders.map((o) => ({ ...o, bbbeeLevel: fc.sample(fc.integer({ min: 1, max: 8 }), 1)[0] })),
        ),
        (orders) => {
          const result = calculateBBBEEPercentage(orders);
          expect(result.bbbeePercent).toBeCloseTo(100, 5);
        },
      ),
      { numRuns: 50 },
    );
  });
});
