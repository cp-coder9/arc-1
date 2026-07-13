/**
 * Property 2: Deadline Detection
 *
 * - Overdue when current date exceeds deadline; not triggered otherwise
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isTaskOverdue,
  isMilestoneOverdue,
  isRFIEscalated,
  isDeliveryOverdue,
  isContractExpiringSoon,
  isInspectionDueSoon,
  daysDifference,
  CONTRACT_EXPIRY_THRESHOLD_DAYS,
  INSPECTION_DUE_THRESHOLD_DAYS,
} from './deadlineDetectionService';
import type { TaskBoardItem, CommandCentreMilestone, ProcurementOrder, ContractItem } from './types';
import type { RFIEntity } from './deadlineDetectionService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDaysToDate(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const currentDateArb = fc.integer({ min: new Date('2024-06-01T00:00:00.000Z').getTime(), max: new Date('2025-06-01T00:00:00.000Z').getTime() }).map((ts) => new Date(ts));
const daysOffsetArb = fc.integer({ min: -60, max: 60 });

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 2: Deadline Detection', () => {
  describe('isTaskOverdue', () => {
    it('returns true when current date exceeds due date and task is not done', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 1, max: 60 }), (currentDate, daysOverdue) => {
          const dueDate = toIsoDate(addDaysToDate(currentDate, -daysOverdue));
          const task: TaskBoardItem = {
            id: 'task-1', projectId: 'proj-1', title: 'T', status: 'in_progress',
            assigneeId: 'u1', assigneeName: 'U', priority: 'medium', dueDate,
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isTaskOverdue(task, currentDate)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('returns false when current date is before or equal to due date', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 0, max: 60 }), (currentDate, daysUntil) => {
          const dueDate = toIsoDate(addDaysToDate(currentDate, daysUntil));
          const task: TaskBoardItem = {
            id: 'task-1', projectId: 'proj-1', title: 'T', status: 'in_progress',
            assigneeId: 'u1', assigneeName: 'U', priority: 'medium', dueDate,
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isTaskOverdue(task, currentDate)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('returns false when task is done regardless of date', () => {
      fc.assert(
        fc.property(currentDateArb, daysOffsetArb, (currentDate, offset) => {
          const dueDate = toIsoDate(addDaysToDate(currentDate, offset));
          const task: TaskBoardItem = {
            id: 'task-1', projectId: 'proj-1', title: 'T', status: 'done',
            assigneeId: 'u1', assigneeName: 'U', priority: 'medium', dueDate,
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isTaskOverdue(task, currentDate)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('isMilestoneOverdue', () => {
    it('returns true when current date exceeds planned date and milestone is not complete', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 1, max: 60 }), (currentDate, daysOverdue) => {
          const plannedDate = toIsoDate(addDaysToDate(currentDate, -daysOverdue));
          const milestone: CommandCentreMilestone = {
            id: 'm-1', projectId: 'proj-1', name: 'M', plannedDate,
            status: 'pending', createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isMilestoneOverdue(milestone, currentDate)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('returns false when milestone is complete', () => {
      fc.assert(
        fc.property(currentDateArb, daysOffsetArb, (currentDate, offset) => {
          const plannedDate = toIsoDate(addDaysToDate(currentDate, offset));
          const milestone: CommandCentreMilestone = {
            id: 'm-1', projectId: 'proj-1', name: 'M', plannedDate,
            status: 'complete', createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isMilestoneOverdue(milestone, currentDate)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('isRFIEscalated', () => {
    it('returns true when current date exceeds response due date and RFI is not closed', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 1, max: 60 }), (currentDate, daysOverdue) => {
          const responseDueDate = toIsoDate(addDaysToDate(currentDate, -daysOverdue));
          const rfi: RFIEntity = {
            id: 'rfi-1', projectId: 'proj-1', rfiNumber: 1, subject: 'RFI',
            addresseeId: 'u1', dateRaised: '2024-01-01', responseDueDate, status: 'pending',
          };
          expect(isRFIEscalated(rfi, currentDate)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('returns false when RFI is closed', () => {
      fc.assert(
        fc.property(currentDateArb, daysOffsetArb, (currentDate, offset) => {
          const responseDueDate = toIsoDate(addDaysToDate(currentDate, offset));
          const rfi: RFIEntity = {
            id: 'rfi-1', projectId: 'proj-1', rfiNumber: 1, subject: 'RFI',
            addresseeId: 'u1', dateRaised: '2024-01-01', responseDueDate, status: 'closed',
          };
          expect(isRFIEscalated(rfi, currentDate)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('isDeliveryOverdue', () => {
    it('returns true when current date exceeds expected delivery date and not delivered', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 1, max: 60 }), (currentDate, daysOverdue) => {
          const expectedDeliveryDate = toIsoDate(addDaysToDate(currentDate, -daysOverdue));
          const order: ProcurementOrder = {
            id: 'o-1', projectId: 'proj-1', orderNumber: 'PO-001',
            description: 'D', supplierId: 's1', supplierName: 'S',
            value: 1000, expectedDeliveryDate, status: 'ordered',
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isDeliveryOverdue(order, currentDate)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('returns false when status is delivered', () => {
      fc.assert(
        fc.property(currentDateArb, daysOffsetArb, (currentDate, offset) => {
          const expectedDeliveryDate = toIsoDate(addDaysToDate(currentDate, offset));
          const order: ProcurementOrder = {
            id: 'o-1', projectId: 'proj-1', orderNumber: 'PO-001',
            description: 'D', supplierId: 's1', supplierName: 'S',
            value: 1000, expectedDeliveryDate, status: 'delivered',
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isDeliveryOverdue(order, currentDate)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('isContractExpiringSoon', () => {
    it('returns true when expiry is within 30 days for an active contract', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 0, max: CONTRACT_EXPIRY_THRESHOLD_DAYS }), (currentDate, daysUntilExpiry) => {
          const expiryDate = toIsoDate(addDaysToDate(currentDate, daysUntilExpiry));
          const contract: ContractItem = {
            id: 'c-1', projectId: 'proj-1', reference: 'REF-1',
            contractorSupplier: 'CS', scope: 'S', value: 1000,
            form: 'jbcc_pba', startDate: '2024-01-01', expiryDate, status: 'active',
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isContractExpiringSoon(contract, currentDate)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('returns false when expiry is more than 30 days away', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 31, max: 365 }), (currentDate, daysUntilExpiry) => {
          const expiryDate = toIsoDate(addDaysToDate(currentDate, daysUntilExpiry));
          const contract: ContractItem = {
            id: 'c-1', projectId: 'proj-1', reference: 'REF-1',
            contractorSupplier: 'CS', scope: 'S', value: 1000,
            form: 'jbcc_pba', startDate: '2024-01-01', expiryDate, status: 'active',
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isContractExpiringSoon(contract, currentDate)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('isInspectionDueSoon', () => {
    it('returns true when inspection is within 7 days for incomplete nhbrc_inspection', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 0, max: INSPECTION_DUE_THRESHOLD_DAYS }), (currentDate, daysUntil) => {
          const plannedDate = toIsoDate(addDaysToDate(currentDate, daysUntil));
          const milestone: CommandCentreMilestone = {
            id: 'm-1', projectId: 'proj-1', name: 'Inspection',
            plannedDate, status: 'pending', category: 'nhbrc_inspection',
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isInspectionDueSoon(milestone, currentDate)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('returns false when inspection is more than 7 days away', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 8, max: 365 }), (currentDate, daysUntil) => {
          const plannedDate = toIsoDate(addDaysToDate(currentDate, daysUntil));
          const milestone: CommandCentreMilestone = {
            id: 'm-1', projectId: 'proj-1', name: 'Inspection',
            plannedDate, status: 'pending', category: 'nhbrc_inspection',
            createdBy: 'u1', createdAt: '', updatedAt: '',
          };
          expect(isInspectionDueSoon(milestone, currentDate)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('daysDifference utility', () => {
    it('returns negative when target is in the past', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 1, max: 365 }), (currentDate, daysPast) => {
          const target = toIsoDate(addDaysToDate(currentDate, -daysPast));
          expect(daysDifference(target, currentDate)).toBeLessThan(0);
        }),
        { numRuns: 100 },
      );
    });

    it('returns positive when target is in the future', () => {
      fc.assert(
        fc.property(currentDateArb, fc.integer({ min: 1, max: 365 }), (currentDate, daysFuture) => {
          const target = toIsoDate(addDaysToDate(currentDate, daysFuture));
          expect(daysDifference(target, currentDate)).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });
  });
});
