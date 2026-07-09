/**
 * Public Participation Service — Records and manages objections, responses,
 * and participation summaries during the statutory advertising period.
 *
 * Handles late objection detection, response linkage, and report generation
 * for tribunal submissions.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type {
  Objection,
  ObjectionResponse,
  ObjectionStatus,
  PublicParticipationSummary,
  ContactDetails,
} from '../types';

// ── In-Memory Store ─────────────────────────────────────────────────────────

/** In-memory store for objections (MVP — replaces Firestore). */
let objections: Objection[] = [];

/** In-memory store for objection responses (MVP — replaces Firestore). */
let responses: ObjectionResponse[] = [];

/** Auto-incrementing counter for generating unique IDs. */
let idCounter = 0;

/**
 * Generate a unique ID with a descriptive prefix.
 */
function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ── Participation Report Interface ──────────────────────────────────────────

/**
 * Full participation report suitable for tribunal submission.
 * Includes the summary, all objections, and all responses for an application.
 */
export interface ParticipationReport {
  applicationId: string;
  referenceNumber: string;
  summary: PublicParticipationSummary;
  objections: Objection[];
  responses: ObjectionResponse[];
  generatedAt: string;
}

// ── Objection Management ────────────────────────────────────────────────────

/**
 * Records a new objection against a planning application.
 *
 * Auto-detects whether the objection is late by comparing `dateReceived`
 * to the `objectionPeriodEnd` parameter. If dateReceived > objectionPeriodEnd,
 * the `isLate` flag is set to true.
 *
 * @param params - Objection details including application context and objector info
 * @returns The created Objection record
 */
export function recordObjection(params: {
  applicationId: string;
  objectorName: string;
  objectorContactDetails: ContactDetails;
  groundsOfObjection: string;
  supportingDocumentIds: string[];
  dateReceived: string;
  objectionPeriodEnd: string;
}): Objection {
  const isLate = params.dateReceived > params.objectionPeriodEnd;

  const objection: Objection = {
    id: generateId('obj'),
    applicationId: params.applicationId,
    objectorName: params.objectorName,
    objectorContactDetails: params.objectorContactDetails,
    dateReceived: params.dateReceived,
    groundsOfObjection: params.groundsOfObjection,
    supportingDocumentIds: [...params.supportingDocumentIds],
    status: 'received' as ObjectionStatus,
    isLate,
  };

  objections.push(objection);
  return objection;
}

/**
 * Records a response to an objection.
 *
 * Links the response to the original objection by setting `responseId` on
 * the objection and updating its status to 'responded'.
 *
 * @param params - Response details including the objection ID and response text
 * @returns The created ObjectionResponse record
 * @throws Error if the objection is not found
 */
export function recordResponse(params: {
  objectionId: string;
  applicationId: string;
  responseText: string;
  respondedBy: string;
  supportingDocumentIds: string[];
}): ObjectionResponse {
  const objection = objections.find((o) => o.id === params.objectionId);
  if (!objection) {
    throw new Error(`Objection not found: ${params.objectionId}`);
  }

  const response: ObjectionResponse = {
    id: generateId('resp'),
    objectionId: params.objectionId,
    applicationId: params.applicationId,
    responseText: params.responseText,
    respondedBy: params.respondedBy,
    respondedAt: new Date().toISOString(),
    supportingDocumentIds: [...params.supportingDocumentIds],
  };

  responses.push(response);

  // Link response to objection and update status
  objection.responseId = response.id;
  objection.status = 'responded';

  return response;
}

/**
 * Returns all objections for a given application.
 *
 * @param applicationId - The planning application ID
 * @returns Array of Objection records for the application
 */
export function getObjections(applicationId: string): Objection[] {
  return objections.filter((o) => o.applicationId === applicationId);
}

/**
 * Returns objections with status 'received' (not yet responded to).
 *
 * @param applicationId - The planning application ID
 * @returns Array of unanswered Objection records
 */
export function getUnansweredObjections(applicationId: string): Objection[] {
  return objections.filter(
    (o) => o.applicationId === applicationId && o.status === 'received',
  );
}

// ── Late Objections ─────────────────────────────────────────────────────────

/**
 * Flags an objection as late.
 *
 * Sets the objection's `isLate` flag to true.
 *
 * @param objectionId - The ID of the objection to flag
 * @throws Error if the objection is not found
 */
export function flagLateObjection(objectionId: string): void {
  const objection = objections.find((o) => o.id === objectionId);
  if (!objection) {
    throw new Error(`Objection not found: ${objectionId}`);
  }
  objection.isLate = true;
}

/**
 * Records whether a late objection is accepted or rejected.
 *
 * Updates the objection status to 'late_accepted' or 'late_rejected'
 * and stores the decision reason.
 *
 * @param objectionId - The ID of the late objection
 * @param decision - Whether to accept or reject the late objection
 * @param reason - The reason for the decision
 * @throws Error if the objection is not found
 */
export function decideLateObjection(
  objectionId: string,
  decision: 'accepted' | 'rejected',
  reason: string,
): void {
  const objection = objections.find((o) => o.id === objectionId);
  if (!objection) {
    throw new Error(`Objection not found: ${objectionId}`);
  }

  objection.lateDecision = decision;
  objection.lateDecisionReason = reason;
  objection.status = decision === 'accepted' ? 'late_accepted' : 'late_rejected';
}

// ── Summaries and Reports ───────────────────────────────────────────────────

/**
 * Returns a PublicParticipationSummary for an application.
 *
 * Includes counts of objections, comments, responses complete/pending,
 * and whether the objection period is closed (current date past objectionPeriodEnd).
 *
 * @param applicationId - The planning application ID
 * @param objectionPeriodStart - ISO date string for period start
 * @param objectionPeriodEnd - ISO date string for period end
 * @returns A PublicParticipationSummary object
 */
export function getParticipationSummary(
  applicationId: string,
  objectionPeriodStart: string,
  objectionPeriodEnd: string,
): PublicParticipationSummary {
  const appObjections = getObjections(applicationId);
  const responsesComplete = appObjections.filter(
    (o) => o.status === 'responded',
  ).length;
  const responsesPending = appObjections.filter(
    (o) => o.status === 'received',
  ).length;

  const now = new Date().toISOString();
  const periodClosed = now > objectionPeriodEnd;

  return {
    applicationId,
    totalObjections: appObjections.length,
    totalComments: 0, // Comments tracked separately if needed
    responsesComplete,
    responsesPending,
    objectionPeriodStart,
    objectionPeriodEnd,
    periodClosed,
  };
}

/**
 * Generates a full ParticipationReport suitable for tribunal submission.
 *
 * Includes the participation summary, all objections, and all responses
 * for the given application.
 *
 * @param applicationId - The planning application ID
 * @param referenceNumber - The application reference number for the report
 * @returns A ParticipationReport object
 */
export function generateParticipationReport(
  applicationId: string,
  referenceNumber: string,
): ParticipationReport {
  const appObjections = getObjections(applicationId);
  const appResponses = responses.filter(
    (r) => r.applicationId === applicationId,
  );

  // Derive period dates from earliest/latest objection dates, or use empty strings
  let objectionPeriodStart = '';
  let objectionPeriodEnd = '';

  if (appObjections.length > 0) {
    const dates = appObjections.map((o) => o.dateReceived).sort();
    objectionPeriodStart = dates[0];
    objectionPeriodEnd = dates[dates.length - 1];
  }

  const summary = getParticipationSummary(
    applicationId,
    objectionPeriodStart,
    objectionPeriodEnd,
  );

  return {
    applicationId,
    referenceNumber,
    summary,
    objections: appObjections,
    responses: appResponses,
    generatedAt: new Date().toISOString(),
  };
}

// ── Store Management (for testing) ──────────────────────────────────────────

/**
 * Resets the in-memory store. Intended for use in tests only.
 */
export function _resetStore(): void {
  objections = [];
  responses = [];
  idCounter = 0;
}
