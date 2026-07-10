/**
 * Event Feed — Filtering Utilities
 *
 * Provides `filterEvents(events, filters)` for the Command Centre EventFeed component.
 *
 * Severity classification:
 *   - critical:      overdue items, escalated RFIs, critical path alerts, superseded warnings
 *   - standard:      approvals, completions, submissions, contract changes
 *   - informational: new entries, status updates, received comments
 *
 * The filter function is exported as a standalone utility so it can be imported
 * by property-based tests (Property 20) without any UI dependencies.
 *
 * @module commandCentre/eventFeedFilterUtils
 * @validates Requirements 15.4, 15.5, 15.7
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** All source modules that contribute events to the Event Feed. */
export type EventSourceModule =
  | 'specforge'
  | 'documents'
  | 'rfis'
  | 'site_diary'
  | 'programme'
  | 'procurement'
  | 'valuations'
  | 'contracts'
  | 'municipal'
  | 'messenger';

/** Event severity levels with defined classification rules. */
export type EventSeverity = 'critical' | 'standard' | 'informational';

/**
 * A single event feed item from any platform module.
 *
 * Matches the `EventFeedItem` interface from EventFeed.tsx and the
 * `EventFeedItem` interface in the design document.
 */
export interface EventFeedItem {
  id: string;
  projectId: string;
  sourceModule: EventSourceModule;
  severity: EventSeverity;
  description: string;
  actorName: string;
  timestamp: string;
  linkedEntityType: string;
  linkedEntityId: string;
  linkedView: string;
}

/**
 * Active filter state for the Event Feed.
 * Either filter may be absent (undefined), in which case that dimension is unfiltered.
 */
export interface EventFilters {
  /** When set, only events from this module are returned. */
  sourceModule?: EventSourceModule;
  /** When set, only events with this severity are returned. */
  severity?: EventSeverity;
}

// ── Severity Keyword Classification ──────────────────────────────────────────

/**
 * Keywords in event descriptions that indicate critical severity.
 * Used by `classifyEventSeverity` when no explicit severity is set.
 */
const CRITICAL_KEYWORDS: ReadonlyArray<string> = [
  'overdue',
  'escalated',
  'critical path',
  'superseded',
  'critical',
  'expired',
  'blocked',
];

/**
 * Keywords in event descriptions that indicate standard severity.
 * Checked after critical keywords — first match wins.
 */
const STANDARD_KEYWORDS: ReadonlyArray<string> = [
  'approved',
  'approval',
  'completed',
  'submitted',
  'signed',
  'certified',
  'awarded',
  'varied',
  'varied contract',
];

/**
 * Classifies an event description into a severity level based on keyword matching.
 *
 * Severity rules (in priority order):
 *   critical:      contains critical keyword (overdue, escalated, critical path, superseded)
 *   standard:      contains standard keyword (approvals, completions, submissions)
 *   informational: all other events (new entries, status updates)
 *
 * @param description - The event description text.
 * @returns The derived EventSeverity.
 *
 * @validates Requirement 15.4
 */
export function classifyEventSeverity(description: string): EventSeverity {
  const lower = description.toLowerCase();

  for (const keyword of CRITICAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return 'critical';
    }
  }

  for (const keyword of STANDARD_KEYWORDS) {
    if (lower.includes(keyword)) {
      return 'standard';
    }
  }

  return 'informational';
}

// ── Core Filter Function ─────────────────────────────────────────────────────

/**
 * Filters a list of `EventFeedItem` objects by the active filter criteria.
 *
 * Property 20: Event Feed Filtering
 * For any list of events and any combination of active source-module filter and
 * severity filter, `filterEvents(events, filters)` returns ONLY events where:
 *   - `sourceModule` matches the active module filter (if set), AND
 *   - `severity` matches the active severity filter (if set).
 *
 * When neither filter is set, all events are returned unchanged.
 * Filters apply to real-time events as they arrive (the function is pure and
 * can be called on any subset of the event list at any time).
 *
 * Input array order is preserved in the output.
 * Returns a new array — does NOT mutate the input.
 *
 * @param events  - The full list of EventFeedItem objects to filter.
 * @param filters - The active filter criteria (both optional).
 * @returns New filtered array containing only matching events.
 *
 * @validates Requirements 15.4, 15.5
 */
export function filterEvents(
  events: EventFeedItem[],
  filters: EventFilters,
): EventFeedItem[] {
  const { sourceModule, severity } = filters;

  // No filters active — return all events
  if (!sourceModule && !severity) {
    return [...events];
  }

  return events.filter((event) => {
    // If module filter is active, event must match
    if (sourceModule !== undefined && event.sourceModule !== sourceModule) {
      return false;
    }
    // If severity filter is active, event must match
    if (severity !== undefined && event.severity !== severity) {
      return false;
    }
    return true;
  });
}

// ── Utility Exports ──────────────────────────────────────────────────────────

export const eventFeedFilterUtils = {
  filterEvents,
  classifyEventSeverity,
  CRITICAL_KEYWORDS,
  STANDARD_KEYWORDS,
};

export default eventFeedFilterUtils;
