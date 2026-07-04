/**
 * Unit tests for Calendar Service
 *
 * Tests pure aggregation functions and filtering logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  aggregateCalendarEvents,
  milestoneToCalendarEvents,
  inspectionToCalendarEvents,
  deliveryToCalendarEvents,
  taskDueToCalendarEvents,
  filterEventsByDateRange,
  filterEventsByDate,
  filterEventsByType,
} from './calendarService';
import type {
  CalendarEvent,
  CommandCentreMilestone,
  ProcurementOrder,
  TaskBoardItem,
} from './types';

// ── Test Data Factories ──────────────────────────────────────────────────────

function makeMilestone(overrides: Partial<CommandCentreMilestone> = {}): CommandCentreMilestone {
  return {
    id: 'ms-1',
    projectId: 'proj-1',
    name: 'Foundation Complete',
    plannedDate: '2026-03-15',
    status: 'on_track',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInspectionMilestone(overrides: Partial<CommandCentreMilestone> = {}): CommandCentreMilestone {
  return makeMilestone({
    id: 'ms-insp-1',
    name: 'NHBRC Stage 1',
    category: 'nhbrc_inspection',
    nhbrcStage: 1,
    plannedDate: '2026-04-01',
    ...overrides,
  });
}

function makeProcurementOrder(overrides: Partial<ProcurementOrder> = {}): ProcurementOrder {
  return {
    id: 'po-1',
    projectId: 'proj-1',
    orderNumber: 'PO-0001',
    description: 'Structural Steel',
    supplierId: 'sup-1',
    supplierName: 'Steel Corp',
    value: 250000,
    expectedDeliveryDate: '2026-03-20',
    status: 'ordered',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskBoardItem> = {}): TaskBoardItem {
  return {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Submit drawings',
    status: 'todo',
    assigneeId: 'user-1',
    assigneeName: 'John Doe',
    priority: 'high',
    dueDate: '2026-03-10',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMeetingEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-meeting-1',
    projectId: 'proj-1',
    date: '2026-03-12',
    title: 'Progress Meeting',
    type: 'meeting',
    sourceEntityType: 'meeting',
    sourceEntityId: 'meet-1',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('calendarService — milestoneToCalendarEvents', () => {
  it('converts milestones to calendar events with correct fields', () => {
    const milestones = [makeMilestone()];
    const events = milestoneToCalendarEvents('proj-1', milestones);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      projectId: 'proj-1',
      date: '2026-03-15',
      title: 'Foundation Complete',
      type: 'milestone',
      sourceEntityType: 'milestone',
      sourceEntityId: 'ms-1',
      status: 'on_track',
    });
    expect(events[0].id).toBeTruthy();
  });

  it('returns empty array for no milestones', () => {
    const events = milestoneToCalendarEvents('proj-1', []);
    expect(events).toHaveLength(0);
  });
});

describe('calendarService — inspectionToCalendarEvents', () => {
  it('only creates events for nhbrc_inspection category milestones', () => {
    const milestones = [
      makeMilestone(), // general, no category
      makeInspectionMilestone(),
    ];
    const events = inspectionToCalendarEvents('proj-1', milestones);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'inspection',
      title: 'Inspection: NHBRC Stage 1',
      sourceEntityType: 'milestone',
      sourceEntityId: 'ms-insp-1',
    });
  });

  it('returns empty when no inspection milestones exist', () => {
    const events = inspectionToCalendarEvents('proj-1', [makeMilestone()]);
    expect(events).toHaveLength(0);
  });
});

describe('calendarService — deliveryToCalendarEvents', () => {
  it('converts procurement orders to delivery events', () => {
    const orders = [makeProcurementOrder()];
    const events = deliveryToCalendarEvents('proj-1', orders);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: '2026-03-20',
      title: 'Delivery: Structural Steel',
      type: 'delivery',
      sourceEntityType: 'procurement_order',
      sourceEntityId: 'po-1',
      status: 'ordered',
    });
  });
});

describe('calendarService — taskDueToCalendarEvents', () => {
  it('converts tasks to task_due events', () => {
    const tasks = [makeTask()];
    const events = taskDueToCalendarEvents('proj-1', tasks);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: '2026-03-10',
      title: 'Task due: Submit drawings',
      type: 'task_due',
      sourceEntityType: 'task',
      sourceEntityId: 'task-1',
      status: 'todo',
    });
  });
});

describe('calendarService — aggregateCalendarEvents', () => {
  it('aggregates all source types into unified event list', () => {
    const milestones = [makeMilestone(), makeInspectionMilestone()];
    const orders = [makeProcurementOrder()];
    const tasks = [makeTask()];
    const meetingEvents = [makeMeetingEvent()];

    const events = aggregateCalendarEvents('proj-1', milestones, orders, tasks, meetingEvents);

    // 1 general milestone + 1 inspection + 1 delivery + 1 task_due + 1 meeting = 5
    expect(events).toHaveLength(5);

    const types = events.map((e) => e.type);
    expect(types).toContain('milestone');
    expect(types).toContain('inspection');
    expect(types).toContain('delivery');
    expect(types).toContain('task_due');
    expect(types).toContain('meeting');
  });

  it('each event references source entity type and ID', () => {
    const milestones = [makeMilestone()];
    const events = aggregateCalendarEvents('proj-1', milestones, [], [], []);

    for (const event of events) {
      expect(event.sourceEntityType).toBeTruthy();
      expect(event.sourceEntityId).toBeTruthy();
    }
  });

  it('returns empty array when no source data', () => {
    const events = aggregateCalendarEvents('proj-1', [], [], [], []);
    expect(events).toHaveLength(0);
  });

  it('does not produce duplicate events from inspection milestones', () => {
    // An NHBRC inspection milestone should produce ONLY an inspection event,
    // not both a milestone and inspection event
    const milestones = [makeInspectionMilestone()];
    const events = aggregateCalendarEvents('proj-1', milestones, [], [], []);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('inspection');
  });

  it('total event count equals sum of individual source counts', () => {
    const milestones = [
      makeMilestone({ id: 'ms-1' }),
      makeMilestone({ id: 'ms-2', name: 'Roof Complete' }),
      makeInspectionMilestone({ id: 'ms-insp-1' }),
    ];
    const orders = [
      makeProcurementOrder({ id: 'po-1' }),
      makeProcurementOrder({ id: 'po-2', description: 'Cement' }),
    ];
    const tasks = [makeTask({ id: 'task-1' })];
    const meetings = [makeMeetingEvent()];

    const events = aggregateCalendarEvents('proj-1', milestones, orders, tasks, meetings);

    // 2 general milestones + 1 inspection + 2 deliveries + 1 task_due + 1 meeting = 7
    expect(events).toHaveLength(7);
  });
});

describe('calendarService — filterEventsByDateRange', () => {
  const events: CalendarEvent[] = [
    { id: '1', projectId: 'p', date: '2026-03-01', title: 'A', type: 'milestone', sourceEntityType: 'milestone', sourceEntityId: 'm1' },
    { id: '2', projectId: 'p', date: '2026-03-15', title: 'B', type: 'delivery', sourceEntityType: 'procurement_order', sourceEntityId: 'po1' },
    { id: '3', projectId: 'p', date: '2026-03-31', title: 'C', type: 'task_due', sourceEntityType: 'task', sourceEntityId: 't1' },
    { id: '4', projectId: 'p', date: '2026-04-05', title: 'D', type: 'meeting', sourceEntityType: 'meeting', sourceEntityId: 'mt1' },
  ];

  it('includes events within range (inclusive)', () => {
    const result = filterEventsByDateRange(events, { startDate: '2026-03-10', endDate: '2026-03-31' });
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(['2', '3']);
  });

  it('includes boundary dates', () => {
    const result = filterEventsByDateRange(events, { startDate: '2026-03-01', endDate: '2026-04-05' });
    expect(result).toHaveLength(4);
  });

  it('returns empty when no events in range', () => {
    const result = filterEventsByDateRange(events, { startDate: '2026-05-01', endDate: '2026-06-01' });
    expect(result).toHaveLength(0);
  });
});

describe('calendarService — filterEventsByDate', () => {
  const events: CalendarEvent[] = [
    { id: '1', projectId: 'p', date: '2026-03-15', title: 'A', type: 'milestone', sourceEntityType: 'milestone', sourceEntityId: 'm1' },
    { id: '2', projectId: 'p', date: '2026-03-15', title: 'B', type: 'delivery', sourceEntityType: 'procurement_order', sourceEntityId: 'po1' },
    { id: '3', projectId: 'p', date: '2026-03-16', title: 'C', type: 'task_due', sourceEntityType: 'task', sourceEntityId: 't1' },
  ];

  it('returns all events for a specific date', () => {
    const result = filterEventsByDate(events, '2026-03-15');
    expect(result).toHaveLength(2);
  });

  it('returns empty when no events on date', () => {
    const result = filterEventsByDate(events, '2026-03-20');
    expect(result).toHaveLength(0);
  });
});

describe('calendarService — filterEventsByType', () => {
  const events: CalendarEvent[] = [
    { id: '1', projectId: 'p', date: '2026-03-15', title: 'A', type: 'milestone', sourceEntityType: 'milestone', sourceEntityId: 'm1' },
    { id: '2', projectId: 'p', date: '2026-03-15', title: 'B', type: 'delivery', sourceEntityType: 'procurement_order', sourceEntityId: 'po1' },
    { id: '3', projectId: 'p', date: '2026-03-16', title: 'C', type: 'delivery', sourceEntityType: 'procurement_order', sourceEntityId: 'po2' },
    { id: '4', projectId: 'p', date: '2026-03-16', title: 'D', type: 'meeting', sourceEntityType: 'meeting', sourceEntityId: 'mt1' },
  ];

  it('filters events by type', () => {
    const result = filterEventsByType(events, 'delivery');
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.type === 'delivery')).toBe(true);
  });

  it('returns empty when no events of given type', () => {
    const result = filterEventsByType(events, 'inspection');
    expect(result).toHaveLength(0);
  });
});
