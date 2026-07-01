/**
 * Tests for Deadline Detection Service
 *
 * Validates Property 2: Deadline and Threshold Detection
 * For any entity with a deadline field, correctly classify as overdue/triggered
 * when current date exceeds deadline, and not triggered when deadline has not passed.
 *
 * Validates: Requirements 3.6, 4.3, 7.6, 10.5, 12.4, 13.4
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDeadlineStatus,
  generateDeadlineAction,
  processDeadlineBatch,
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
import type { DeadlineEntity, RFIEntity } from './deadlineDetectionService';
import type {
  TaskBoardItem,
  CommandCentreMilestone,
  ProcurementOrder,
  ContractItem,
} from './types';

// ── Test Fixtures ────────────────────────────────────────────────────────────

const refDate = new Date('2025-06-15T00:00:00.000Z');

function makeTask(overrides: Partial<TaskBoardItem> = {}): TaskBoardItem {
  return {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Test Task',
    status: 'in_progress',
    assigneeId: 'user-1',
    assigneeName: 'Test User',
    priority: 'medium',
    dueDate: '2025-06-10',
    createdBy: 'user-1',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<CommandCentreMilestone> = {}): CommandCentreMilestone {
  return {
    id: 'ms-1',
    projectId: 'proj-1',
    name: 'Phase 1 Complete',
    plannedDate: '2025-06-10',
    status: 'pending',
    createdBy: 'user-1',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRFI(overrides: Partial<RFIEntity> = {}): RFIEntity {
  return {
    id: 'rfi-1',
    projectId: 'proj-1',
    rfiNumber: 1,
    subject: 'Foundation Detail',
    addresseeId: 'user-2',
    dateRaised: '2025-06-01',
    responseDueDate: '2025-06-10',
    status: 'pending',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<ProcurementOrder> = {}): ProcurementOrder {
  return {
    id: 'order-1',
    projectId: 'proj-1',
    orderNumber: 'PO-001',
    description: 'Bricks',
    supplierId: 'sup-1',
    supplierName: 'Brick Co',
    value: 50000,
    expectedDeliveryDate: '2025-06-10',
    status: 'ordered',
    createdBy: 'user-1',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeContract(overrides: Partial<ContractItem> = {}): ContractItem {
  return {
    id: 'con-1',
    projectId: 'proj-1',
    reference: 'CON-0001',
    contractorSupplier: 'Builder Ltd',
    scope: 'Main building works',
    value: 1000000,
    form: 'jbcc_pba',
    startDate: '2025-01-01',
    expiryDate: '2025-07-01',
    status: 'active',
    createdBy: 'user-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInspectionMilestone(overrides: Partial<CommandCentreMilestone> = {}): CommandCentreMilestone {
  return {
    id: 'insp-1',
    projectId: 'proj-1',
    name: 'NHBRC Stage 3 Inspection',
    plannedDate: '2025-06-20',
    status: 'pending',
    category: 'nhbrc_inspection',
    nhbrcStage: 3,
    createdBy: 'user-1',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── daysDifference utility ───────────────────────────────────────────────────

describe('daysDifference', () => {
  it('returns 0 when target equals current date', () => {
    expect(daysDifference('2025-06-15', refDate)).toBe(0);
  });

  it('returns positive for future dates', () => {
    expect(daysDifference('2025-06-20', refDate)).toBe(5);
  });

  it('returns negative for past dates', () => {
    expect(daysDifference('2025-06-10', refDate)).toBe(-5);
  });
});

// ── Task Deadline Detection ──────────────────────────────────────────────────

describe('Task deadline detection', () => {
  describe('isTaskOverdue', () => {
    it('returns true when task due date is in the past and not done', () => {
      const task = makeTask({ dueDate: '2025-06-10', status: 'in_progress' });
      expect(isTaskOverdue(task, refDate)).toBe(true);
    });

    it('returns false when task due date is in the future', () => {
      const task = makeTask({ dueDate: '2025-06-20', status: 'in_progress' });
      expect(isTaskOverdue(task, refDate)).toBe(false);
    });

    it('returns false when task is done even if past due', () => {
      const task = makeTask({ dueDate: '2025-06-10', status: 'done' });
      expect(isTaskOverdue(task, refDate)).toBe(false);
    });

    it('returns false when task due date is today', () => {
      const task = makeTask({ dueDate: '2025-06-15', status: 'in_progress' });
      expect(isTaskOverdue(task, refDate)).toBe(false);
    });
  });

  describe('classifyDeadlineStatus for task', () => {
    it('classifies overdue task correctly', () => {
      const entity: DeadlineEntity = { type: 'task', entity: makeTask({ dueDate: '2025-06-10' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('overdue');
      expect(result.triggered).toBe(true);
      expect(result.daysOverdue).toBe(5);
    });

    it('classifies on-track task correctly', () => {
      const entity: DeadlineEntity = { type: 'task', entity: makeTask({ dueDate: '2025-06-20' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('on_track');
      expect(result.triggered).toBe(false);
      expect(result.daysUntilDeadline).toBe(5);
    });

    it('classifies done task correctly', () => {
      const entity: DeadlineEntity = { type: 'task', entity: makeTask({ status: 'done' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('complete');
      expect(result.triggered).toBe(false);
    });
  });
});

// ── Milestone Deadline Detection ─────────────────────────────────────────────

describe('Milestone deadline detection', () => {
  describe('isMilestoneOverdue', () => {
    it('returns true when milestone planned date is past and not complete', () => {
      const ms = makeMilestone({ plannedDate: '2025-06-10', status: 'pending' });
      expect(isMilestoneOverdue(ms, refDate)).toBe(true);
    });

    it('returns false when milestone planned date is in the future', () => {
      const ms = makeMilestone({ plannedDate: '2025-06-20', status: 'pending' });
      expect(isMilestoneOverdue(ms, refDate)).toBe(false);
    });

    it('returns false when milestone is complete', () => {
      const ms = makeMilestone({ plannedDate: '2025-06-10', status: 'complete' });
      expect(isMilestoneOverdue(ms, refDate)).toBe(false);
    });
  });

  describe('classifyDeadlineStatus for milestone', () => {
    it('classifies overdue milestone correctly', () => {
      const entity: DeadlineEntity = { type: 'milestone', entity: makeMilestone({ plannedDate: '2025-06-10' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('overdue');
      expect(result.triggered).toBe(true);
      expect(result.daysOverdue).toBe(5);
    });

    it('classifies on-track milestone correctly', () => {
      const entity: DeadlineEntity = { type: 'milestone', entity: makeMilestone({ plannedDate: '2025-06-25' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('on_track');
      expect(result.triggered).toBe(false);
      expect(result.daysUntilDeadline).toBe(10);
    });
  });
});

// ── RFI Deadline Detection ───────────────────────────────────────────────────

describe('RFI deadline detection', () => {
  describe('isRFIEscalated', () => {
    it('returns true when response due date is past and not closed', () => {
      const rfi = makeRFI({ responseDueDate: '2025-06-10', status: 'pending' });
      expect(isRFIEscalated(rfi, refDate)).toBe(true);
    });

    it('returns false when response due date is in the future', () => {
      const rfi = makeRFI({ responseDueDate: '2025-06-20', status: 'pending' });
      expect(isRFIEscalated(rfi, refDate)).toBe(false);
    });

    it('returns false when RFI is closed', () => {
      const rfi = makeRFI({ responseDueDate: '2025-06-10', status: 'closed' });
      expect(isRFIEscalated(rfi, refDate)).toBe(false);
    });
  });

  describe('classifyDeadlineStatus for rfi', () => {
    it('classifies escalated RFI correctly', () => {
      const entity: DeadlineEntity = { type: 'rfi', entity: makeRFI({ responseDueDate: '2025-06-12' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('escalated');
      expect(result.triggered).toBe(true);
      expect(result.daysOverdue).toBe(3);
      expect(result.description).toContain('escalate to Critical');
    });

    it('classifies on-track RFI correctly', () => {
      const entity: DeadlineEntity = { type: 'rfi', entity: makeRFI({ responseDueDate: '2025-06-20' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('on_track');
      expect(result.triggered).toBe(false);
    });
  });
});

// ── Delivery Deadline Detection ──────────────────────────────────────────────

describe('Delivery deadline detection', () => {
  describe('isDeliveryOverdue', () => {
    it('returns true when expected delivery date is past and not delivered', () => {
      const order = makeOrder({ expectedDeliveryDate: '2025-06-10', status: 'in_transit' });
      expect(isDeliveryOverdue(order, refDate)).toBe(true);
    });

    it('returns false when delivery date is in the future', () => {
      const order = makeOrder({ expectedDeliveryDate: '2025-06-20', status: 'ordered' });
      expect(isDeliveryOverdue(order, refDate)).toBe(false);
    });

    it('returns false when order is delivered', () => {
      const order = makeOrder({ expectedDeliveryDate: '2025-06-10', status: 'delivered' });
      expect(isDeliveryOverdue(order, refDate)).toBe(false);
    });
  });

  describe('classifyDeadlineStatus for delivery', () => {
    it('classifies overdue delivery correctly', () => {
      const entity: DeadlineEntity = { type: 'delivery', entity: makeOrder({ expectedDeliveryDate: '2025-06-08' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('overdue');
      expect(result.triggered).toBe(true);
      expect(result.daysOverdue).toBe(7);
    });
  });
});

// ── Contract Deadline Detection ──────────────────────────────────────────────

describe('Contract deadline detection', () => {
  describe('isContractExpiringSoon', () => {
    it('returns true when expiry is within 30 days and contract is active', () => {
      // 16 days until expiry (2025-07-01 - 2025-06-15)
      const contract = makeContract({ expiryDate: '2025-07-01', status: 'active' });
      expect(isContractExpiringSoon(contract, refDate)).toBe(true);
    });

    it('returns false when expiry is more than 30 days away', () => {
      const contract = makeContract({ expiryDate: '2025-08-01', status: 'active' });
      expect(isContractExpiringSoon(contract, refDate)).toBe(false);
    });

    it('returns false when contract is not active', () => {
      const contract = makeContract({ expiryDate: '2025-07-01', status: 'expired' });
      expect(isContractExpiringSoon(contract, refDate)).toBe(false);
    });

    it('returns false when contract already expired', () => {
      const contract = makeContract({ expiryDate: '2025-06-10', status: 'active' });
      expect(isContractExpiringSoon(contract, refDate)).toBe(false);
    });

    it('returns true at exactly 30 days before expiry', () => {
      const contract = makeContract({ expiryDate: '2025-07-15', status: 'active' });
      expect(isContractExpiringSoon(contract, refDate)).toBe(true);
    });

    it('returns true at exactly 0 days (same day as expiry)', () => {
      const contract = makeContract({ expiryDate: '2025-06-15', status: 'active' });
      expect(isContractExpiringSoon(contract, refDate)).toBe(true);
    });
  });

  describe('classifyDeadlineStatus for contract', () => {
    it('classifies expiring-soon contract correctly', () => {
      const entity: DeadlineEntity = { type: 'contract', entity: makeContract({ expiryDate: '2025-07-01' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('expiring_soon');
      expect(result.triggered).toBe(true);
      expect(result.daysUntilDeadline).toBe(16);
    });

    it('classifies expired contract correctly', () => {
      const entity: DeadlineEntity = { type: 'contract', entity: makeContract({ expiryDate: '2025-06-10' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('overdue');
      expect(result.triggered).toBe(true);
      expect(result.daysOverdue).toBe(5);
    });

    it('classifies on-track contract (>30 days) correctly', () => {
      const entity: DeadlineEntity = { type: 'contract', entity: makeContract({ expiryDate: '2025-08-01' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('on_track');
      expect(result.triggered).toBe(false);
    });

    it('classifies non-active contract as complete', () => {
      const entity: DeadlineEntity = { type: 'contract', entity: makeContract({ status: 'terminated' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('complete');
      expect(result.triggered).toBe(false);
    });
  });
});

// ── Inspection Deadline Detection ────────────────────────────────────────────

describe('Inspection deadline detection', () => {
  describe('isInspectionDueSoon', () => {
    it('returns true when inspection due within 7 days and is nhbrc_inspection', () => {
      // 5 days until planned date
      const ms = makeInspectionMilestone({ plannedDate: '2025-06-20' });
      expect(isInspectionDueSoon(ms, refDate)).toBe(true);
    });

    it('returns false when inspection is more than 7 days away', () => {
      const ms = makeInspectionMilestone({ plannedDate: '2025-06-30' });
      expect(isInspectionDueSoon(ms, refDate)).toBe(false);
    });

    it('returns false when inspection is complete', () => {
      const ms = makeInspectionMilestone({ plannedDate: '2025-06-20', status: 'complete' });
      expect(isInspectionDueSoon(ms, refDate)).toBe(false);
    });

    it('returns false when milestone is not an nhbrc_inspection category', () => {
      const ms = makeInspectionMilestone({ plannedDate: '2025-06-20', category: 'general' });
      expect(isInspectionDueSoon(ms, refDate)).toBe(false);
    });

    it('returns true at exactly 7 days before', () => {
      const ms = makeInspectionMilestone({ plannedDate: '2025-06-22' });
      expect(isInspectionDueSoon(ms, refDate)).toBe(true);
    });

    it('returns true at exactly 0 days (same day)', () => {
      const ms = makeInspectionMilestone({ plannedDate: '2025-06-15' });
      expect(isInspectionDueSoon(ms, refDate)).toBe(true);
    });
  });

  describe('classifyDeadlineStatus for inspection', () => {
    it('classifies due-soon inspection correctly', () => {
      const entity: DeadlineEntity = { type: 'inspection', entity: makeInspectionMilestone({ plannedDate: '2025-06-20' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('due_soon');
      expect(result.triggered).toBe(true);
      expect(result.daysUntilDeadline).toBe(5);
      expect(result.description).toContain('prepare documentation');
    });

    it('classifies overdue inspection correctly', () => {
      const entity: DeadlineEntity = { type: 'inspection', entity: makeInspectionMilestone({ plannedDate: '2025-06-10' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('overdue');
      expect(result.triggered).toBe(true);
      expect(result.daysOverdue).toBe(5);
    });

    it('classifies on-track inspection (>7 days away) correctly', () => {
      const entity: DeadlineEntity = { type: 'inspection', entity: makeInspectionMilestone({ plannedDate: '2025-06-30' }) };
      const result = classifyDeadlineStatus(entity, refDate);
      expect(result.kind).toBe('on_track');
      expect(result.triggered).toBe(false);
    });
  });
});

// ── Action Centre Event Generation ───────────────────────────────────────────

describe('generateDeadlineAction', () => {
  it('generates an action for an overdue task', () => {
    const entity: DeadlineEntity = { type: 'task', entity: makeTask({ dueDate: '2025-06-10' }) };
    const action = generateDeadlineAction(entity, refDate);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('planning');
    expect(action!.sourceSubsystem).toBe('tasks');
    expect(action!.sourceEntityId).toBe('task-1');
    expect(action!.status).toBe('pending');
    expect(action!.assigneeId).toBe('user-1');
  });

  it('generates an action for an escalated RFI', () => {
    const entity: DeadlineEntity = { type: 'rfi', entity: makeRFI({ responseDueDate: '2025-06-10' }) };
    const action = generateDeadlineAction(entity, refDate);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('technical');
    expect(action!.sourceSubsystem).toBe('rfis');
  });

  it('generates an action for an expiring contract', () => {
    const entity: DeadlineEntity = { type: 'contract', entity: makeContract({ expiryDate: '2025-07-01' }) };
    const action = generateDeadlineAction(entity, refDate);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('financial');
    expect(action!.sourceSubsystem).toBe('contracts');
  });

  it('generates an action for a due-soon inspection', () => {
    const entity: DeadlineEntity = { type: 'inspection', entity: makeInspectionMilestone({ plannedDate: '2025-06-20' }) };
    const action = generateDeadlineAction(entity, refDate);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('technical');
    expect(action!.sourceSubsystem).toBe('quality');
    expect(action!.title).toContain('prepare documentation');
  });

  it('returns null for non-triggered entities', () => {
    const entity: DeadlineEntity = { type: 'task', entity: makeTask({ dueDate: '2025-06-20' }) };
    const action = generateDeadlineAction(entity, refDate);
    expect(action).toBeNull();
  });

  it('returns null for completed entities', () => {
    const entity: DeadlineEntity = { type: 'task', entity: makeTask({ status: 'done', dueDate: '2025-06-10' }) };
    const action = generateDeadlineAction(entity, refDate);
    expect(action).toBeNull();
  });
});

// ── Batch Processing ─────────────────────────────────────────────────────────

describe('processDeadlineBatch', () => {
  it('returns actions only for triggered entities', () => {
    const entities: DeadlineEntity[] = [
      { type: 'task', entity: makeTask({ dueDate: '2025-06-10' }) }, // triggered
      { type: 'task', entity: makeTask({ id: 'task-2', dueDate: '2025-06-20' }) }, // not triggered
      { type: 'milestone', entity: makeMilestone({ plannedDate: '2025-06-05' }) }, // triggered
      { type: 'contract', entity: makeContract({ expiryDate: '2025-08-01' }) }, // not triggered
    ];

    const actions = processDeadlineBatch(entities, refDate);
    expect(actions.length).toBe(2);
    expect(actions[0].sourceSubsystem).toBe('tasks');
    expect(actions[1].sourceSubsystem).toBe('milestones');
  });

  it('returns empty array when no entities are triggered', () => {
    const entities: DeadlineEntity[] = [
      { type: 'task', entity: makeTask({ dueDate: '2025-06-20', status: 'in_progress' }) },
      { type: 'contract', entity: makeContract({ expiryDate: '2025-12-01' }) },
    ];

    const actions = processDeadlineBatch(entities, refDate);
    expect(actions.length).toBe(0);
  });

  it('returns empty array for empty input', () => {
    const actions = processDeadlineBatch([], refDate);
    expect(actions.length).toBe(0);
  });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe('Constants', () => {
  it('CONTRACT_EXPIRY_THRESHOLD_DAYS is 30', () => {
    expect(CONTRACT_EXPIRY_THRESHOLD_DAYS).toBe(30);
  });

  it('INSPECTION_DUE_THRESHOLD_DAYS is 7', () => {
    expect(INSPECTION_DUE_THRESHOLD_DAYS).toBe(7);
  });
});
