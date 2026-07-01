/**
 * Property 12: Calendar Event Aggregation
 *
 * - Total event count = sum of source events; no duplicates; each references source
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { aggregateCalendarEvents } from './calendarService';
import type { CommandCentreMilestone, ProcurementOrder, TaskBoardItem } from './types';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);
const isoDateArb = fc.integer({ min: 0, max: 2190 }).map(offset => { const d = new Date('2024-01-01'); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0]; });
const timestampArb = fc.integer({ min: 0, max: 2190 }).map(offset => { const d = new Date('2024-01-01'); d.setDate(d.getDate() + offset); return d.toISOString(); });
const statusArb = fc.constantFrom<CommandCentreMilestone['status']>('complete', 'on_track', 'at_risk', 'overdue', 'pending');
const categoryArb = fc.constantFrom<'general' | 'nhbrc_inspection' | 'municipal_submission'>('general', 'nhbrc_inspection', 'municipal_submission');

const milestoneArb: fc.Arbitrary<CommandCentreMilestone> = fc.record({
  id: fc.uuid(),
  projectId: fc.constant('proj-1'),
  name: nonEmptyStringArb,
  plannedDate: isoDateArb,
  actualDate: fc.option(isoDateArb, { nil: undefined }),
  status: statusArb,
  linkedCertificateId: fc.option(fc.uuid(), { nil: undefined }),
  linkedActivityId: fc.option(fc.uuid(), { nil: undefined }),
  category: fc.option(categoryArb, { nil: undefined }),
  nhbrcStage: fc.option(fc.integer({ min: 1, max: 7 }), { nil: undefined }),
  documentationChecklist: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  updatedAt: timestampArb,
});

const procurementOrderArb: fc.Arbitrary<ProcurementOrder> = fc.record({
  id: fc.uuid(),
  projectId: fc.constant('proj-1'),
  orderNumber: nonEmptyStringArb,
  description: nonEmptyStringArb,
  supplierId: nonEmptyStringArb,
  supplierName: nonEmptyStringArb,
  value: fc.double({ min: 1, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  expectedDeliveryDate: isoDateArb,
  status: fc.constantFrom<ProcurementOrder['status']>('ordered', 'in_transit', 'delivered', 'evaluating'),
  bbbeeLevel: fc.option(fc.integer({ min: 0, max: 8 }), { nil: undefined }),
  linkedSpecForgeItemId: fc.option(fc.uuid(), { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  updatedAt: timestampArb,
});

const taskArb: fc.Arbitrary<TaskBoardItem> = fc.record({
  id: fc.uuid(),
  projectId: fc.constant('proj-1'),
  title: nonEmptyStringArb,
  description: fc.option(nonEmptyStringArb, { nil: undefined }),
  status: fc.constantFrom<TaskBoardItem['status']>('todo', 'in_progress', 'in_review', 'done'),
  assigneeId: nonEmptyStringArb,
  assigneeName: nonEmptyStringArb,
  priority: fc.constantFrom<TaskBoardItem['priority']>('low', 'medium', 'high', 'critical'),
  dueDate: isoDateArb,
  linkedSpecForgeItemId: fc.option(fc.uuid(), { nil: undefined }),
  linkedActivityId: fc.option(fc.uuid(), { nil: undefined }),
  linkedProcurementOrderId: fc.option(fc.uuid(), { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  updatedAt: timestampArb,
});

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 12: Calendar Event Aggregation', () => {
  it('total event count = sum of source events (general milestones + inspections + deliveries + tasks)', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 0, maxLength: 10 }),
        fc.array(procurementOrderArb, { minLength: 0, maxLength: 10 }),
        fc.array(taskArb, { minLength: 0, maxLength: 10 }),
        (milestones, orders, tasks) => {
          const events = aggregateCalendarEvents('proj-1', milestones, orders, tasks, []);

          // General milestones (non-inspection) produce 'milestone' events
          const generalMilestones = milestones.filter((m) => m.category !== 'nhbrc_inspection');
          // NHBRC milestones produce 'inspection' events
          const inspectionMilestones = milestones.filter((m) => m.category === 'nhbrc_inspection');

          const expectedCount = generalMilestones.length + inspectionMilestones.length + orders.length + tasks.length;
          expect(events.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no duplicate source entity references in aggregated events', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 0, maxLength: 10 }),
        fc.array(procurementOrderArb, { minLength: 0, maxLength: 10 }),
        fc.array(taskArb, { minLength: 0, maxLength: 10 }),
        (milestones, orders, tasks) => {
          const events = aggregateCalendarEvents('proj-1', milestones, orders, tasks, []);

          // Check that each event has a unique combination of sourceEntityType + sourceEntityId
          // (Note: a single milestone can appear as both milestone and inspection if it's nhbrc)
          // But within the same type, there should be no duplicates
          const milestoneRefs = events.filter((e) => e.type === 'milestone').map((e) => e.sourceEntityId);
          const inspectionRefs = events.filter((e) => e.type === 'inspection').map((e) => e.sourceEntityId);
          const deliveryRefs = events.filter((e) => e.type === 'delivery').map((e) => e.sourceEntityId);
          const taskRefs = events.filter((e) => e.type === 'task_due').map((e) => e.sourceEntityId);

          expect(new Set(milestoneRefs).size).toBe(milestoneRefs.length);
          expect(new Set(inspectionRefs).size).toBe(inspectionRefs.length);
          expect(new Set(deliveryRefs).size).toBe(deliveryRefs.length);
          expect(new Set(taskRefs).size).toBe(taskRefs.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every event references a valid source entity type and ID', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 1, maxLength: 10 }),
        fc.array(procurementOrderArb, { minLength: 1, maxLength: 10 }),
        fc.array(taskArb, { minLength: 1, maxLength: 10 }),
        (milestones, orders, tasks) => {
          const events = aggregateCalendarEvents('proj-1', milestones, orders, tasks, []);

          for (const event of events) {
            expect(event.sourceEntityType).toBeTruthy();
            expect(event.sourceEntityId).toBeTruthy();
            expect(['milestone', 'inspection', 'delivery', 'meeting', 'task_due']).toContain(event.type);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every event has the correct projectId', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 0, maxLength: 10 }),
        fc.array(procurementOrderArb, { minLength: 0, maxLength: 10 }),
        fc.array(taskArb, { minLength: 0, maxLength: 10 }),
        (milestones, orders, tasks) => {
          const events = aggregateCalendarEvents('proj-1', milestones, orders, tasks, []);
          for (const event of events) {
            expect(event.projectId).toBe('proj-1');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
