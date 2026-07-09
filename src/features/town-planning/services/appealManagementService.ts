/**
 * Appeal Management Service — Tracks appeals lodged against Records of Decision,
 * manages tribunal hearings, and records appeal outcomes.
 *
 * Validates appeals against the 21-day statutory period (SPLUMA Section 51),
 * schedules and postpones hearings, and produces hearing preparation checklists.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 13.1, 13.2, 13.3, 13.4, 13.5
 */

import type {
  Appeal,
  AppealOutcome,
  ContactDetails,
  DocumentChecklistItem,
  Hearing,
} from '../types';
import { SPLUMA_DEFAULT_TIMEFRAMES } from '../constants';

// ── In-Memory Store ─────────────────────────────────────────────────────────

/** In-memory store for appeals (MVP — replaces Firestore). */
let appeals: Appeal[] = [];

/** In-memory store for hearings (MVP — replaces Firestore). */
let hearings: Hearing[] = [];

/** Auto-incrementing counter for generating unique IDs. */
let idCounter = 0;

/**
 * Generate a unique ID with a descriptive prefix.
 */
function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ── Appeal CRUD ─────────────────────────────────────────────────────────────

/**
 * Lodges a new appeal against a Record of Decision.
 *
 * Validates whether the appeal is within the 21-day statutory period by
 * comparing `dateLodged` to the RoD issue date (`rodIssuedDate` param).
 * Sets the `withinStatutoryPeriod` flag accordingly.
 *
 * @param params - Appeal details including appellant info and RoD issue date
 * @returns The created Appeal record
 */
export function lodgeAppeal(params: {
  applicationId: string;
  appellantName: string;
  appellantContactDetails: ContactDetails;
  groundsOfAppeal: string;
  dateLodged: string;
  supportingDocumentIds: string[];
  rodIssuedDate: string;
}): Appeal {
  const withinStatutory = validateWithinStatutoryPeriod(
    params.rodIssuedDate,
    params.dateLodged,
  );

  const appeal: Appeal = {
    id: generateId('appeal'),
    applicationId: params.applicationId,
    appellantName: params.appellantName,
    appellantContactDetails: { ...params.appellantContactDetails },
    groundsOfAppeal: params.groundsOfAppeal,
    dateLodged: params.dateLodged,
    withinStatutoryPeriod: withinStatutory,
    supportingDocumentIds: [...params.supportingDocumentIds],
    conditionsVaried: false,
  };

  appeals.push(appeal);
  return appeal;
}

/**
 * Retrieves a single appeal by ID.
 *
 * @param appealId - The unique appeal identifier
 * @returns The Appeal record or null if not found
 */
export function getAppeal(appealId: string): Appeal | null {
  return appeals.find((a) => a.id === appealId) ?? null;
}

/**
 * Returns all appeals lodged for a given application.
 *
 * @param applicationId - The planning application ID
 * @returns Array of Appeal records for the application
 */
export function getAppealsByApplication(applicationId: string): Appeal[] {
  return appeals.filter((a) => a.applicationId === applicationId);
}

// ── Hearing Management ──────────────────────────────────────────────────────

/**
 * Schedules a new tribunal hearing for an application.
 *
 * Creates a Hearing record with the specified date, time, venue, and
 * tribunal panel members.
 *
 * @param params - Hearing scheduling details
 * @returns The created Hearing record
 */
export function scheduleHearing(params: {
  applicationId: string;
  hearingDate: string;
  hearingTime: string;
  venue: string;
  tribunalPanel: string[];
}): Hearing {
  const hearing: Hearing = {
    id: generateId('hearing'),
    applicationId: params.applicationId,
    hearingDate: params.hearingDate,
    hearingTime: params.hearingTime,
    venue: params.venue,
    tribunalPanel: [...params.tribunalPanel],
    status: 'scheduled',
    previousDates: [],
    preparationAlertsSent: false,
  };

  hearings.push(hearing);
  return hearing;
}

/**
 * Postpones a hearing to a new date.
 *
 * Moves the current hearing date to the `previousDates` array, updates
 * the hearing date, sets status to 'postponed', and resets
 * `preparationAlertsSent` so new alerts will be generated for the new date.
 *
 * @param hearingId - The ID of the hearing to postpone
 * @param newDate - The new hearing date (ISO date string)
 * @param _reason - Reason for postponement (stored for audit, not on Hearing)
 * @returns The updated Hearing record
 * @throws Error if the hearing is not found
 */
export function postponeHearing(
  hearingId: string,
  newDate: string,
  _reason: string,
): Hearing {
  const hearing = hearings.find((h) => h.id === hearingId);
  if (!hearing) {
    throw new Error(`Hearing not found: ${hearingId}`);
  }

  // Move current date to history
  hearing.previousDates.push(hearing.hearingDate);

  // Update to new date
  hearing.hearingDate = newDate;
  hearing.status = 'postponed';
  hearing.preparationAlertsSent = false;

  return hearing;
}

/**
 * Returns all hearings across the given project applications.
 *
 * Accepts a list of application IDs belonging to the project and returns
 * all hearings associated with any of those applications.
 *
 * @param _projectId - The project ID (used for context/logging)
 * @param applicationIds - Array of application IDs belonging to the project
 * @returns Array of Hearing records across the project
 */
export function getHearingsByProject(
  _projectId: string,
  applicationIds: string[],
): Hearing[] {
  return hearings.filter((h) => applicationIds.includes(h.applicationId));
}

/**
 * Returns a document checklist for hearing preparation.
 *
 * Produces a standard set of required documents for hearing readiness
 * including appeal grounds, motivation report, objection responses,
 * and supporting evidence.
 *
 * @param applicationId - The planning application ID
 * @returns Array of DocumentChecklistItem records for hearing preparation
 */
export function getHearingChecklist(
  applicationId: string,
): DocumentChecklistItem[] {
  const checklistItems: DocumentChecklistItem[] = [
    {
      id: generateId('chk'),
      applicationId,
      documentType: 'appeal_grounds',
      description: 'Written grounds of appeal',
      required: true,
      stage: 'appeal_period',
      status: 'required',
    },
    {
      id: generateId('chk'),
      applicationId,
      documentType: 'motivation_report',
      description: 'Original motivation report',
      required: true,
      stage: 'appeal_period',
      status: 'required',
    },
    {
      id: generateId('chk'),
      applicationId,
      documentType: 'response_to_objections',
      description: 'Response to objections (if applicable)',
      required: false,
      stage: 'appeal_period',
      status: 'required',
    },
    {
      id: generateId('chk'),
      applicationId,
      documentType: 'record_of_decision',
      description: 'Original Record of Decision',
      required: true,
      stage: 'appeal_period',
      status: 'required',
    },
    {
      id: generateId('chk'),
      applicationId,
      documentType: 'supporting_evidence',
      description: 'Supporting evidence and documentation',
      required: false,
      stage: 'appeal_period',
      status: 'required',
    },
    {
      id: generateId('chk'),
      applicationId,
      documentType: 'site_plan',
      description: 'Site plan / development layout',
      required: true,
      stage: 'appeal_period',
      status: 'required',
    },
  ];

  return checklistItems;
}

// ── Outcome ─────────────────────────────────────────────────────────────────

/**
 * Records the outcome of an appeal.
 *
 * Sets the outcome type (upheld, dismissed, varied), outcome date,
 * notes, and whether conditions were varied as a result of the appeal.
 *
 * @param appealId - The ID of the appeal to update
 * @param outcome - The appeal outcome (upheld, dismissed, or varied)
 * @param notes - Notes about the outcome decision
 * @param conditionsVaried - Whether RoD conditions were varied
 * @returns The updated Appeal record
 * @throws Error if the appeal is not found
 */
export function recordOutcome(
  appealId: string,
  outcome: AppealOutcome,
  notes: string,
  conditionsVaried: boolean,
): Appeal {
  const appeal = appeals.find((a) => a.id === appealId);
  if (!appeal) {
    throw new Error(`Appeal not found: ${appealId}`);
  }

  appeal.outcome = outcome;
  appeal.outcomeDate = new Date().toISOString();
  appeal.outcomeNotes = notes;
  appeal.conditionsVaried = conditionsVaried;

  return appeal;
}

// ── Statutory Period Validation ──────────────────────────────────────────────

/**
 * Validates whether an appeal was lodged within the 21-day statutory period.
 *
 * Per SPLUMA Section 51, an appeal must be lodged within 21 calendar days
 * of the date the Record of Decision was issued.
 *
 * @param rodIssuedDate - ISO date string when the Record of Decision was issued
 * @param dateLodged - ISO date string when the appeal was lodged
 * @returns true if within the 21-day period, false otherwise
 */
export function validateWithinStatutoryPeriod(
  rodIssuedDate: string,
  dateLodged: string,
): boolean {
  const rodDate = new Date(rodIssuedDate);
  const lodgedDate = new Date(dateLodged);

  // Calculate the deadline: rodIssuedDate + 21 days
  const deadline = new Date(rodDate);
  deadline.setDate(deadline.getDate() + SPLUMA_DEFAULT_TIMEFRAMES.appealPeriodDays);

  return lodgedDate <= deadline;
}

// ── Store Management (for testing) ──────────────────────────────────────────

/**
 * Resets the in-memory store. Intended for use in tests only.
 */
export function _resetStore(): void {
  appeals = [];
  hearings = [];
  idCounter = 0;
}
