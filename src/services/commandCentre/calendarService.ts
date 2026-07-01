/**
 * Project Command Centre — Calendar Service
 *
 * Aggregates events from milestones, inspections, deliveries, meetings,
 * and task due dates into a unified calendar view.
 * Persisted at `projects/{projectId}/calendar_events/`.
 *
 * Each event references its source entity type and ID for navigation.
 *
 * @module commandCentre/calendarService
 */

import {
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import type {
  CalendarEvent,
  CommandCentreMilestone,
  ProcurementOrder,
  TaskBoardItem,
} from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const CALENDAR_EVENTS_COL = 'calendar_events';
const MILESTONES_COL = 'milestones';
const TASKS_COL = 'tasks';
const PROCUREMENT_ORDERS_COL = 'procurement_orders';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function calendarEventsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, CALENDAR_EVENTS_COL);
}

function milestonesCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, MILESTONES_COL);
}

function tasksCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, TASKS_COL);
}

function procurementOrdersCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, PROCUREMENT_ORDERS_COL);
}

// ── Date Range Interface ─────────────────────────────────────────────────────

export interface DateRange {
  startDate: string;
  endDate: string;
}

// ── Pure Aggregation Functions (exported for testability) ────────────────────

/**
 * Converts milestones into calendar events.
 * Milestone events use the plannedDate as the event date.
 */
export function milestoneToCalendarEvents(
  projectId: string,
  milestones: CommandCentreMilestone[],
): CalendarEvent[] {
  return milestones.map((milestone) => ({
    id: generateId(),
    projectId,
    date: milestone.plannedDate,
    title: milestone.name,
    type: 'milestone' as const,
    sourceEntityType: 'milestone',
    sourceEntityId: milestone.id,
    status: milestone.status,
  }));
}

/**
 * Converts milestones with NHBRC inspection category into inspection calendar events.
 * Only milestones with category 'nhbrc_inspection' produce inspection events.
 */
export function inspectionToCalendarEvents(
  projectId: string,
  milestones: CommandCentreMilestone[],
): CalendarEvent[] {
  return milestones
    .filter((m) => m.category === 'nhbrc_inspection')
    .map((milestone) => ({
      id: generateId(),
      projectId,
      date: milestone.plannedDate,
      title: `Inspection: ${milestone.name}`,
      type: 'inspection' as const,
      sourceEntityType: 'milestone',
      sourceEntityId: milestone.id,
      status: milestone.status,
    }));
}

/**
 * Converts procurement orders into delivery calendar events.
 * Uses the expectedDeliveryDate as the event date.
 */
export function deliveryToCalendarEvents(
  projectId: string,
  orders: ProcurementOrder[],
): CalendarEvent[] {
  return orders.map((order) => ({
    id: generateId(),
    projectId,
    date: order.expectedDeliveryDate,
    title: `Delivery: ${order.description}`,
    type: 'delivery' as const,
    sourceEntityType: 'procurement_order',
    sourceEntityId: order.id,
    status: order.status,
  }));
}

/**
 * Converts tasks into task_due calendar events.
 * Uses the task dueDate as the event date.
 */
export function taskDueToCalendarEvents(
  projectId: string,
  tasks: TaskBoardItem[],
): CalendarEvent[] {
  return tasks.map((task) => ({
    id: generateId(),
    projectId,
    date: task.dueDate,
    title: `Task due: ${task.title}`,
    type: 'task_due' as const,
    sourceEntityType: 'task',
    sourceEntityId: task.id,
    status: task.status,
  }));
}

/**
 * Aggregates all source data into a unified list of calendar events.
 * Combines milestones, inspections, deliveries, and task due dates.
 * Meeting events are included from persisted calendar events.
 *
 * Note: General (non-inspection) milestones produce 'milestone' type events.
 * NHBRC inspection milestones produce 'inspection' type events.
 */
export function aggregateCalendarEvents(
  projectId: string,
  milestones: CommandCentreMilestone[],
  orders: ProcurementOrder[],
  tasks: TaskBoardItem[],
  existingMeetingEvents: CalendarEvent[] = [],
): CalendarEvent[] {
  // General milestones (non-inspection)
  const generalMilestones = milestones.filter((m) => m.category !== 'nhbrc_inspection');
  const milestoneEvents = milestoneToCalendarEvents(projectId, generalMilestones);

  // Inspection milestones
  const inspectionEvents = inspectionToCalendarEvents(projectId, milestones);

  // Delivery events from procurement orders
  const deliveryEvents = deliveryToCalendarEvents(projectId, orders);

  // Task due date events
  const taskDueEvents = taskDueToCalendarEvents(projectId, tasks);

  // Meeting events from persisted calendar_events (meeting type only)
  const meetingEvents = existingMeetingEvents.filter((e) => e.type === 'meeting');

  return [
    ...milestoneEvents,
    ...inspectionEvents,
    ...deliveryEvents,
    ...taskDueEvents,
    ...meetingEvents,
  ];
}

/**
 * Filters calendar events by date range.
 * Events are included if their date falls within [startDate, endDate] inclusive.
 */
export function filterEventsByDateRange(
  events: CalendarEvent[],
  dateRange: DateRange,
): CalendarEvent[] {
  return events.filter(
    (event) => event.date >= dateRange.startDate && event.date <= dateRange.endDate,
  );
}

/**
 * Filters calendar events for a specific date.
 */
export function filterEventsByDate(
  events: CalendarEvent[],
  date: string,
): CalendarEvent[] {
  return events.filter((event) => event.date === date);
}

/**
 * Filters calendar events by event type.
 */
export function filterEventsByType(
  events: CalendarEvent[],
  type: CalendarEvent['type'],
): CalendarEvent[] {
  return events.filter((event) => event.type === type);
}

// ── Firestore Operations ─────────────────────────────────────────────────────

/**
 * Persists a list of calendar events to Firestore.
 * Used after aggregation to store the unified event set.
 */
export async function persistCalendarEvents(
  projectId: string,
  events: CalendarEvent[],
): Promise<void> {
  const col = calendarEventsCollection(projectId);

  try {
    for (const event of events) {
      await addDoc(col, event);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${CALENDAR_EVENTS_COL}`);
  }
}

/**
 * Retrieves persisted calendar events from Firestore for a date range.
 */
async function getPersistedEvents(
  projectId: string,
  dateRange?: DateRange,
): Promise<CalendarEvent[]> {
  try {
    const col = calendarEventsCollection(projectId);
    const constraints: Parameters<typeof query>[1][] = [orderBy('date', 'asc')];

    if (dateRange) {
      constraints.push(where('date', '>=', dateRange.startDate));
      constraints.push(where('date', '<=', dateRange.endDate));
    }

    const q = query(col, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${CALENDAR_EVENTS_COL}`);
    return [];
  }
}

/**
 * Retrieves source data from milestones, tasks, and procurement orders,
 * then returns meeting events already persisted in calendar_events.
 */
async function fetchMeetingEvents(projectId: string): Promise<CalendarEvent[]> {
  try {
    const col = calendarEventsCollection(projectId);
    const q = query(col, where('type', '==', 'meeting'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent));
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Gets aggregated calendar events for a project within a date range.
 * Fetches milestones, tasks, procurement orders, and meeting events,
 * then aggregates them into a unified event list.
 *
 * Requirements: 23.1, 23.2
 */
export async function getCalendarEvents(
  projectId: string,
  dateRange: DateRange,
): Promise<CalendarEvent[]> {
  if (!projectId) throw new Error('projectId is required');

  try {
    // Fetch source data in parallel
    const [milestonesSnap, tasksSnap, ordersSnap, meetingEvents] = await Promise.all([
      getDocs(query(milestonesCollection(projectId))),
      getDocs(query(tasksCollection(projectId))),
      getDocs(query(procurementOrdersCollection(projectId))),
      fetchMeetingEvents(projectId),
    ]);

    const milestones = milestonesSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as CommandCentreMilestone),
    );
    const tasks = tasksSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as TaskBoardItem),
    );
    const orders = ordersSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as ProcurementOrder),
    );

    // Aggregate all source events
    const allEvents = aggregateCalendarEvents(
      projectId,
      milestones,
      orders,
      tasks,
      meetingEvents,
    );

    // Filter by date range
    return filterEventsByDateRange(allEvents, dateRange);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${CALENDAR_EVENTS_COL}`);
    return [];
  }
}

/**
 * Gets calendar events for a specific date.
 * Aggregates from all source types and filters to the given date.
 *
 * Requirement: 23.2
 */
export async function getEventsByDate(
  projectId: string,
  date: string,
): Promise<CalendarEvent[]> {
  if (!projectId) throw new Error('projectId is required');
  if (!date) throw new Error('date is required');

  // Use the date as both start and end of the range
  return getCalendarEvents(projectId, { startDate: date, endDate: date });
}

/**
 * Gets calendar events filtered by type.
 * Aggregates from all source types and filters to the given event type.
 *
 * Requirement: 23.3
 */
export async function getEventsByType(
  projectId: string,
  type: CalendarEvent['type'],
): Promise<CalendarEvent[]> {
  if (!projectId) throw new Error('projectId is required');
  if (!type) throw new Error('type is required');

  try {
    // Fetch source data in parallel
    const [milestonesSnap, tasksSnap, ordersSnap, meetingEvents] = await Promise.all([
      getDocs(query(milestonesCollection(projectId))),
      getDocs(query(tasksCollection(projectId))),
      getDocs(query(procurementOrdersCollection(projectId))),
      fetchMeetingEvents(projectId),
    ]);

    const milestones = milestonesSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as CommandCentreMilestone),
    );
    const tasks = tasksSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as TaskBoardItem),
    );
    const orders = ordersSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as ProcurementOrder),
    );

    // Aggregate all source events
    const allEvents = aggregateCalendarEvents(
      projectId,
      milestones,
      orders,
      tasks,
      meetingEvents,
    );

    // Filter by type
    return filterEventsByType(allEvents, type);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${CALENDAR_EVENTS_COL}`);
    return [];
  }
}

/**
 * Adds a meeting event to the calendar.
 * Meetings are user-created events stored directly in calendar_events.
 */
export async function addMeetingEvent(
  projectId: string,
  data: { date: string; title: string; createdBy: string },
): Promise<CalendarEvent> {
  if (!projectId) throw new Error('projectId is required');

  const event: CalendarEvent = {
    id: generateId(),
    projectId,
    date: data.date,
    title: data.title,
    type: 'meeting',
    sourceEntityType: 'meeting',
    sourceEntityId: generateId(),
  };

  try {
    await addDoc(calendarEventsCollection(projectId), event);
    return event;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${CALENDAR_EVENTS_COL}`);
    throw error;
  }
}

// ── Service Export ───────────────────────────────────────────────────────────

export const calendarService = {
  getCalendarEvents,
  getEventsByDate,
  getEventsByType,
  addMeetingEvent,
  persistCalendarEvents,
  // Pure functions exported for testability
  aggregateCalendarEvents,
  milestoneToCalendarEvents,
  inspectionToCalendarEvents,
  deliveryToCalendarEvents,
  taskDueToCalendarEvents,
  filterEventsByDateRange,
  filterEventsByDate,
  filterEventsByType,
};

export default calendarService;
