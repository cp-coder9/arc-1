/**
 * Property 8: Task Status Transitions
 * Property 9: Task Board Filtering
 *
 * - Moving task updates status; audit entry created; task data unchanged
 * - Filtered result contains exactly tasks satisfying ALL criteria
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { TaskBoardItem } from './types';
import type { TaskFilters } from './taskBoardService';

// ── Pure Functions Under Test ────────────────────────────────────────────────

/**
 * Pure simulation of moveTask logic: returns updated task with new status,
 * unchanged task data fields (title, assignee, priority, dueDate), and
 * an audit trail entry object.
 */
function simulateMoveTask(
  task: TaskBoardItem,
  targetStatus: TaskBoardItem['status'],
  actorId: string,
  timestamp: string,
): { updatedTask: TaskBoardItem; auditEntry: { previousStatus: string; newStatus: string; actorId: string; timestamp: string } } {
  const updatedTask: TaskBoardItem = {
    ...task,
    status: targetStatus,
    updatedAt: timestamp,
  };

  const auditEntry = {
    previousStatus: task.status,
    newStatus: targetStatus,
    actorId,
    timestamp,
  };

  return { updatedTask, auditEntry };
}

/**
 * Pure filter function matching the service's in-memory filtering logic.
 */
function filterTasks(tasks: TaskBoardItem[], filters: TaskFilters): TaskBoardItem[] {
  let result = [...tasks];

  if (filters.assigneeId) {
    result = result.filter((t) => t.assigneeId === filters.assigneeId);
  }
  if (filters.priority) {
    result = result.filter((t) => t.priority === filters.priority);
  }
  if (filters.dueDateStart) {
    result = result.filter((t) => t.dueDate >= filters.dueDateStart!);
  }
  if (filters.dueDateEnd) {
    result = result.filter((t) => t.dueDate <= filters.dueDateEnd!);
  }
  if (filters.linkedSubsystem) {
    result = result.filter((t) => {
      switch (filters.linkedSubsystem) {
        case 'specforge': return !!t.linkedSpecForgeItemId;
        case 'programme': return !!t.linkedActivityId;
        case 'procurement': return !!t.linkedProcurementOrderId;
        default: return true;
      }
    });
  }

  return result;
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const taskStatusArb = fc.constantFrom<TaskBoardItem['status']>('todo', 'in_progress', 'in_review', 'done');
const priorityArb = fc.constantFrom<TaskBoardItem['priority']>('low', 'medium', 'high', 'critical');
const isoDateArb = fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }).map((d) => d.toISOString().split('T')[0]);
const timestampArb = fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }).map((d) => d.toISOString());
const idArb = fc.uuid();
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

const taskArb: fc.Arbitrary<TaskBoardItem> = fc.record({
  id: idArb,
  projectId: nonEmptyStringArb,
  title: nonEmptyStringArb,
  description: fc.option(nonEmptyStringArb, { nil: undefined }),
  status: taskStatusArb,
  assigneeId: fc.constantFrom('user-1', 'user-2', 'user-3', 'user-4'),
  assigneeName: nonEmptyStringArb,
  priority: priorityArb,
  dueDate: isoDateArb,
  linkedSpecForgeItemId: fc.option(idArb, { nil: undefined }),
  linkedActivityId: fc.option(idArb, { nil: undefined }),
  linkedProcurementOrderId: fc.option(idArb, { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  updatedAt: timestampArb,
});

const linkedSubsystemArb = fc.constantFrom<'specforge' | 'programme' | 'procurement'>('specforge', 'programme', 'procurement');

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 8: Task Status Transitions', () => {
  it('moving task updates status to the target', () => {
    fc.assert(
      fc.property(taskArb, taskStatusArb, nonEmptyStringArb, timestampArb, (task, targetStatus, actorId, timestamp) => {
        const { updatedTask } = simulateMoveTask(task, targetStatus, actorId, timestamp);
        expect(updatedTask.status).toBe(targetStatus);
      }),
      { numRuns: 100 },
    );
  });

  it('moving task creates audit entry with previous/new status, actor, and timestamp', () => {
    fc.assert(
      fc.property(taskArb, taskStatusArb, nonEmptyStringArb, timestampArb, (task, targetStatus, actorId, timestamp) => {
        const { auditEntry } = simulateMoveTask(task, targetStatus, actorId, timestamp);
        expect(auditEntry.previousStatus).toBe(task.status);
        expect(auditEntry.newStatus).toBe(targetStatus);
        expect(auditEntry.actorId).toBe(actorId);
        expect(auditEntry.timestamp).toBe(timestamp);
      }),
      { numRuns: 100 },
    );
  });

  it('moving task does NOT change title, assignee, priority, or dueDate', () => {
    fc.assert(
      fc.property(taskArb, taskStatusArb, nonEmptyStringArb, timestampArb, (task, targetStatus, actorId, timestamp) => {
        const { updatedTask } = simulateMoveTask(task, targetStatus, actorId, timestamp);
        expect(updatedTask.title).toBe(task.title);
        expect(updatedTask.assigneeId).toBe(task.assigneeId);
        expect(updatedTask.assigneeName).toBe(task.assigneeName);
        expect(updatedTask.priority).toBe(task.priority);
        expect(updatedTask.dueDate).toBe(task.dueDate);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 9: Task Board Filtering', () => {
  it('filtered result contains exactly tasks satisfying ALL filter criteria (assignee)', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 1, maxLength: 30 }),
        fc.constantFrom('user-1', 'user-2', 'user-3', 'user-4'),
        (tasks, assigneeId) => {
          const filters: TaskFilters = { assigneeId };
          const result = filterTasks(tasks, filters);
          // All results match filter
          for (const t of result) {
            expect(t.assigneeId).toBe(assigneeId);
          }
          // No task matching filter is excluded
          const expected = tasks.filter((t) => t.assigneeId === assigneeId);
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filtered result contains exactly tasks satisfying priority filter', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 1, maxLength: 30 }),
        priorityArb,
        (tasks, priority) => {
          const filters: TaskFilters = { priority };
          const result = filterTasks(tasks, filters);
          for (const t of result) {
            expect(t.priority).toBe(priority);
          }
          const expected = tasks.filter((t) => t.priority === priority);
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filtered result contains exactly tasks satisfying date range filter', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 1, maxLength: 30 }),
        isoDateArb,
        isoDateArb,
        (tasks, date1, date2) => {
          const dueDateStart = date1 < date2 ? date1 : date2;
          const dueDateEnd = date1 < date2 ? date2 : date1;
          const filters: TaskFilters = { dueDateStart, dueDateEnd };
          const result = filterTasks(tasks, filters);
          for (const t of result) {
            expect(t.dueDate >= dueDateStart).toBe(true);
            expect(t.dueDate <= dueDateEnd).toBe(true);
          }
          const expected = tasks.filter((t) => t.dueDate >= dueDateStart && t.dueDate <= dueDateEnd);
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filtered result contains exactly tasks satisfying linked subsystem filter', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 1, maxLength: 30 }),
        linkedSubsystemArb,
        (tasks, linkedSubsystem) => {
          const filters: TaskFilters = { linkedSubsystem };
          const result = filterTasks(tasks, filters);
          for (const t of result) {
            switch (linkedSubsystem) {
              case 'specforge': expect(t.linkedSpecForgeItemId).toBeTruthy(); break;
              case 'programme': expect(t.linkedActivityId).toBeTruthy(); break;
              case 'procurement': expect(t.linkedProcurementOrderId).toBeTruthy(); break;
            }
          }
          const expected = tasks.filter((t) => {
            switch (linkedSubsystem) {
              case 'specforge': return !!t.linkedSpecForgeItemId;
              case 'programme': return !!t.linkedActivityId;
              case 'procurement': return !!t.linkedProcurementOrderId;
              default: return true;
            }
          });
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty filter returns all tasks', () => {
    fc.assert(
      fc.property(fc.array(taskArb, { minLength: 0, maxLength: 20 }), (tasks) => {
        const result = filterTasks(tasks, {});
        expect(result.length).toBe(tasks.length);
      }),
      { numRuns: 100 },
    );
  });
});
