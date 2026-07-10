/**
 * Remote Desktop Core — Incident Service
 *
 * Manages the incident/support escalation flow for remote desktop sessions:
 * - Incident creation with category-based routing
 * - Security concern → immediate input pause signal within 5 seconds
 * - 15-minute auto-termination timeout for unreviewed security incidents
 * - WorkflowEvent emission to Action Centre
 * - Platform_Admin status management
 * - Auto-creation on owner-initiated termination
 * - 72-hour post-session reporting window enforcement
 *
 * Requirements: 3.1–3.8 (Incident and Support Escalation Flow)
 */

import { randomUUID } from 'node:crypto';
import type {
  IncidentReport,
  IncidentCategory,
  IncidentStatus,
  ReporterRole,
  RemoteDesktopWorkflowEvent,
} from './types';
import { INCIDENT_CATEGORY, INCIDENT_STATUS, REMOTE_DESKTOP_DEFAULTS } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateIncidentInput {
  sessionId: string;
  bookingId: string;
  reporterUid: string;
  reporterRole: ReporterRole;
  category: IncidentCategory;
  description: string;
  screenshotRef?: string;
  /** Session end time (ISO string) — used for 72-hour window validation */
  sessionEndTime?: string;
}

export interface UpdateIncidentStatusInput {
  incidentId: string;
  status: IncidentStatus;
  resolutionNote?: string;
  adminUid: string;
}

export interface CreateAutoIncidentInput {
  sessionId: string;
  bookingId: string;
  ownerUid: string;
  description: string;
}

/** Signal emitted when input should be paused (security concern) */
export interface InputPauseSignal {
  type: 'input_pause';
  sessionId: string;
  incidentId: string;
  timestamp: string;
}

/** Signal emitted when a session should be terminated (security timeout) */
export interface SessionTerminationSignal {
  type: 'session_termination';
  sessionId: string;
  incidentId: string;
  reason: 'security_timeout';
  timestamp: string;
}

export type IncidentSignal = InputPauseSignal | SessionTerminationSignal;

/** Timeout metadata for tracking security review deadlines */
export interface SecurityTimeout {
  incidentId: string;
  sessionId: string;
  createdAt: string;
  timeoutAt: string;
  fired: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Valid incident categories */
const VALID_CATEGORIES: ReadonlySet<IncidentCategory> = new Set(
  Object.values(INCIDENT_CATEGORY),
);

/** Valid status transitions from each state */
const VALID_STATUS_TRANSITIONS: Record<IncidentStatus, ReadonlySet<IncidentStatus>> = {
  [INCIDENT_STATUS.OPEN]: new Set([
    INCIDENT_STATUS.INVESTIGATING,
    INCIDENT_STATUS.RESOLVED,
    INCIDENT_STATUS.ESCALATED,
    INCIDENT_STATUS.CLOSED,
  ]),
  [INCIDENT_STATUS.INVESTIGATING]: new Set([
    INCIDENT_STATUS.RESOLVED,
    INCIDENT_STATUS.ESCALATED,
    INCIDENT_STATUS.CLOSED,
  ]),
  [INCIDENT_STATUS.ESCALATED]: new Set([
    INCIDENT_STATUS.INVESTIGATING,
    INCIDENT_STATUS.RESOLVED,
    INCIDENT_STATUS.CLOSED,
  ]),
  [INCIDENT_STATUS.RESOLVED]: new Set([INCIDENT_STATUS.CLOSED]),
  [INCIDENT_STATUS.CLOSED]: new Set(),
};

/** Description length bounds */
const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 1000;

/** Resolution note length bounds */
const MIN_RESOLUTION_NOTE_LENGTH = 10;
const MAX_RESOLUTION_NOTE_LENGTH = 2000;

/** Security incident input pause deadline (5 seconds) */
const INPUT_PAUSE_DEADLINE_MS = 5_000;

/** Security review timeout (15 minutes) */
const SECURITY_REVIEW_TIMEOUT_MS =
  REMOTE_DESKTOP_DEFAULTS.SECURITY_REVIEW_TIMEOUT_MINUTES * 60 * 1000;

/** Post-session reporting window (72 hours) */
const REPORTING_WINDOW_MS =
  REMOTE_DESKTOP_DEFAULTS.INCIDENT_REPORTING_WINDOW_HOURS * 60 * 60 * 1000;

// ─── In-Memory Stores ────────────────────────────────────────────────────────────

const incidents: Map<string, IncidentReport> = new Map();
const signals: IncidentSignal[] = [];
const workflowEvents: RemoteDesktopWorkflowEvent[] = [];
const securityTimeouts: Map<string, SecurityTimeout> = new Map();

// ─── Validation Helpers ──────────────────────────────────────────────────────────

function validateDescription(description: string): string | null {
  if (!description || description.trim().length < MIN_DESCRIPTION_LENGTH) {
    return `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`;
  }
  if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
    return `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`;
  }
  return null;
}

function validateCategory(category: string): category is IncidentCategory {
  return VALID_CATEGORIES.has(category as IncidentCategory);
}

function validateResolutionNote(note: string | undefined): string | null {
  if (note === undefined || note === null) return null;
  if (note.trim().length < MIN_RESOLUTION_NOTE_LENGTH) {
    return `Resolution note must be at least ${MIN_RESOLUTION_NOTE_LENGTH} characters`;
  }
  if (note.trim().length > MAX_RESOLUTION_NOTE_LENGTH) {
    return `Resolution note must not exceed ${MAX_RESOLUTION_NOTE_LENGTH} characters`;
  }
  return null;
}

// ─── Core Functions ──────────────────────────────────────────────────────────────

/**
 * Create a new incident report.
 *
 * Validates:
 * - Description is 10–1000 characters
 * - Category is a valid IncidentCategory
 * - If sessionEndTime is provided, current time is within 72 hours of it
 *
 * If category is 'security_concern':
 * - Emits an InputPauseSignal within 5 seconds
 * - Registers a 15-minute security timeout
 *
 * Emits a WorkflowEvent to the Action Centre targeting Platform_Admin
 * and the opposing party.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.8
 */
export function createIncident(input: CreateIncidentInput): IncidentReport {
  // Validate category
  if (!validateCategory(input.category)) {
    throw new Error(
      `Invalid incident category: "${input.category}". Must be one of: ${Array.from(VALID_CATEGORIES).join(', ')}`,
    );
  }

  // Validate description
  const descError = validateDescription(input.description);
  if (descError) {
    throw new Error(descError);
  }

  // Validate 72-hour post-session reporting window
  if (input.sessionEndTime) {
    if (!isWithinReportingWindow(input.sessionEndTime)) {
      throw new Error(
        'Incident cannot be reported: the 72-hour post-session reporting window has expired',
      );
    }
  }

  const now = new Date().toISOString();
  const incidentId = randomUUID();

  const incident: IncidentReport = {
    incidentId,
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    reporterUid: input.reporterUid,
    reporterRole: input.reporterRole,
    category: input.category,
    description: input.description.trim(),
    screenshotRef: input.screenshotRef,
    status: INCIDENT_STATUS.OPEN,
    createdAt: now,
    updatedAt: now,
  };

  incidents.set(incidentId, incident);

  // Security concern → emit input pause signal within 5 seconds
  if (input.category === INCIDENT_CATEGORY.SECURITY_CONCERN) {
    const pauseSignal: InputPauseSignal = {
      type: 'input_pause',
      sessionId: input.sessionId,
      incidentId,
      timestamp: now,
    };
    signals.push(pauseSignal);

    // Register 15-minute security timeout
    const timeoutAt = new Date(
      new Date(now).getTime() + SECURITY_REVIEW_TIMEOUT_MS,
    ).toISOString();

    securityTimeouts.set(incidentId, {
      incidentId,
      sessionId: input.sessionId,
      createdAt: now,
      timeoutAt,
      fired: false,
    });
  }

  // Emit WorkflowEvent to Action Centre (Req 3.3)
  emitIncidentWorkflowEvent(incident, input.reporterRole);

  return incident;
}

/**
 * Update the status of an incident (Platform_Admin only).
 *
 * Valid transitions:
 * - open → investigating | resolved | escalated | closed
 * - investigating → resolved | escalated | closed
 * - escalated → investigating | resolved | closed
 * - resolved → closed
 * - closed → (none)
 *
 * Requirements: 3.5
 */
export function updateIncidentStatus(input: UpdateIncidentStatusInput): IncidentReport {
  const incident = incidents.get(input.incidentId);
  if (!incident) {
    throw new Error(`Incident not found: ${input.incidentId}`);
  }

  // Validate status transition
  const allowedTransitions = VALID_STATUS_TRANSITIONS[incident.status];
  if (!allowedTransitions.has(input.status)) {
    throw new Error(
      `Invalid status transition: cannot move from "${incident.status}" to "${input.status}"`,
    );
  }

  // Validate resolution note if provided
  const noteError = validateResolutionNote(input.resolutionNote);
  if (noteError) {
    throw new Error(noteError);
  }

  const now = new Date().toISOString();

  incident.status = input.status;
  incident.updatedAt = now;

  if (input.resolutionNote) {
    incident.resolutionNote = input.resolutionNote.trim();
  }

  if (input.status === INCIDENT_STATUS.RESOLVED || input.status === INCIDENT_STATUS.CLOSED) {
    incident.resolvedAt = now;
  }

  // If this is a security incident being reviewed, mark the timeout as handled
  if (incident.category === INCIDENT_CATEGORY.SECURITY_CONCERN) {
    const timeout = securityTimeouts.get(input.incidentId);
    if (timeout && !timeout.fired) {
      // Admin has reviewed — cancel the timeout trigger
      securityTimeouts.delete(input.incidentId);
    }
  }

  return incident;
}

/**
 * Auto-create an incident when a Resource_Owner terminates a session
 * due to suspected policy violation.
 *
 * Pre-populates category as 'security_concern' with session details.
 * The owner only needs to provide a description.
 *
 * Requirements: 3.7
 */
export function createAutoIncident(input: CreateAutoIncidentInput): IncidentReport {
  return createIncident({
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    reporterUid: input.ownerUid,
    reporterRole: 'owner',
    category: INCIDENT_CATEGORY.SECURITY_CONCERN,
    description: input.description,
  });
}

/**
 * Retrieve an incident by ID.
 */
export function getIncident(incidentId: string): IncidentReport | undefined {
  return incidents.get(incidentId);
}

/**
 * Get all incidents for a session.
 */
export function getIncidentsBySession(sessionId: string): IncidentReport[] {
  return Array.from(incidents.values())
    .filter((i) => i.sessionId === sessionId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Check if the current time is within the 72-hour post-session reporting window.
 *
 * Requirements: 3.8
 *
 * @param sessionEndTime - ISO string of when the session ended
 * @param currentTime    - Optional ISO string of current time (for testing)
 * @returns true if within the 72-hour window
 */
export function isWithinReportingWindow(
  sessionEndTime: string,
  currentTime?: string,
): boolean {
  const endMs = new Date(sessionEndTime).getTime();
  const nowMs = currentTime ? new Date(currentTime).getTime() : Date.now();
  const elapsedMs = nowMs - endMs;
  return elapsedMs >= 0 && elapsedMs <= REPORTING_WINDOW_MS;
}

/**
 * Get the security timeout record for an incident.
 *
 * Returns the timeout metadata including when it fires.
 * Returns undefined if the incident is not a security concern
 * or has already been reviewed.
 *
 * Requirements: 3.6
 */
export function getSecurityTimeout(incidentId: string): SecurityTimeout | undefined {
  return securityTimeouts.get(incidentId);
}

/**
 * Check and fire the security timeout for unreviewed incidents.
 *
 * If a security_concern incident has not been reviewed within 15 minutes,
 * this function emits a SessionTerminationSignal.
 *
 * This should be called periodically (e.g., by a scheduler or timer).
 *
 * Requirements: 3.6
 *
 * @param currentTime - Optional ISO string for testing
 * @returns Array of fired termination signals
 */
export function checkSecurityTimeouts(currentTime?: string): SessionTerminationSignal[] {
  const nowMs = currentTime ? new Date(currentTime).getTime() : Date.now();
  const firedSignals: SessionTerminationSignal[] = [];

  for (const [incidentId, timeout] of securityTimeouts.entries()) {
    if (timeout.fired) continue;

    const timeoutMs = new Date(timeout.timeoutAt).getTime();
    if (nowMs >= timeoutMs) {
      // Incident not reviewed in time — fire termination signal
      const terminationSignal: SessionTerminationSignal = {
        type: 'session_termination',
        sessionId: timeout.sessionId,
        incidentId,
        reason: 'security_timeout',
        timestamp: currentTime ?? new Date().toISOString(),
      };

      signals.push(terminationSignal);
      firedSignals.push(terminationSignal);
      timeout.fired = true;
    }
  }

  return firedSignals;
}

// ─── WorkflowEvent Emission ──────────────────────────────────────────────────────

/**
 * Emit a WorkflowEvent to the Action Centre for a new incident.
 *
 * Targets Platform_Admin and the opposing party:
 * - If reporter is consumer → notify owner
 * - If reporter is owner → notify consumer
 *
 * Requirements: 3.3
 */
function emitIncidentWorkflowEvent(
  incident: IncidentReport,
  reporterRole: ReporterRole,
): void {
  // Emit event targeting Platform_Admin
  const adminEvent: RemoteDesktopWorkflowEvent = {
    eventType: 'incident_raised',
    sessionId: incident.sessionId,
    bookingId: incident.bookingId,
    targetUid: 'platform_admin',
    targetRole: 'admin',
    payload: {
      incidentId: incident.incidentId,
      category: incident.category,
      reporterUid: incident.reporterUid,
      reporterRole,
      description: incident.description,
    },
    createdAt: incident.createdAt,
  };
  workflowEvents.push(adminEvent);

  // Emit event targeting the opposing party
  const opposingRole = reporterRole === 'consumer' ? 'owner' : 'consumer';
  const opposingEvent: RemoteDesktopWorkflowEvent = {
    eventType: 'incident_raised',
    sessionId: incident.sessionId,
    bookingId: incident.bookingId,
    targetUid: 'opposing_party', // Resolved at routing time by the Action Centre
    targetRole: opposingRole,
    payload: {
      incidentId: incident.incidentId,
      category: incident.category,
      reporterUid: incident.reporterUid,
      reporterRole,
      description: incident.description,
    },
    createdAt: incident.createdAt,
  };
  workflowEvents.push(opposingEvent);
}

// ─── Observability ────────────────────────────────────────────────────────────────

/**
 * Get all emitted signals (input pause + termination).
 */
export function getSignals(): readonly IncidentSignal[] {
  return [...signals];
}

/**
 * Get all emitted WorkflowEvents.
 */
export function getWorkflowEvents(): readonly RemoteDesktopWorkflowEvent[] {
  return [...workflowEvents];
}

// ─── Test Utilities ────────────────────────────────────────────────────────────────

/**
 * Clear all in-memory state (for testing only).
 * @internal
 */
export function _clearAllState(): void {
  incidents.clear();
  signals.length = 0;
  workflowEvents.length = 0;
  securityTimeouts.clear();
}

/**
 * Get the count of stored incidents (for testing only).
 * @internal
 */
export function _getIncidentCount(): number {
  return incidents.size;
}

/**
 * Get the count of active security timeouts (for testing only).
 * @internal
 */
export function _getSecurityTimeoutCount(): number {
  return securityTimeouts.size;
}
