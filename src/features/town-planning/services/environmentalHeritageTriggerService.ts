/**
 * Environmental & Heritage Trigger Service — Detects and manages NHRA Section 38
 * heritage triggers and NEMA environmental screening triggers for planning applications.
 *
 * Handles parallel process lifecycle: detection → confirmation → resolution/deferral.
 * Unresolved confirmed triggers block the main application from advancing past
 * Tribunal/Decision stage.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4
 */

import type {
  EnvironmentalHeritageTrigger,
  PlanningApplication,
  PlanningApplicationType,
  TriggerType,
  ParallelProcessStatus,
  Deadline,
} from '../types';

// ── In-Memory Store ─────────────────────────────────────────────────────────

/** In-memory store for environmental/heritage triggers (MVP — replaces Firestore). */
let triggers: EnvironmentalHeritageTrigger[] = [];

/** Auto-incrementing counter for generating unique IDs. */
let idCounter = 0;

/**
 * Generate a unique ID with a descriptive prefix.
 */
function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ── Application types that involve land use change ──────────────────────────

/**
 * Application types that inherently involve land use change and therefore
 * warrant NEMA environmental screening consideration.
 */
const LAND_USE_CHANGE_TYPES: PlanningApplicationType[] = [
  'rezoning',
  'consent_use',
  'township_establishment',
];

// ── Detection ───────────────────────────────────────────────────────────────

/**
 * Evaluates a planning application for potential NHRA/NEMA triggers.
 *
 * Creates a heritage trigger if the property age exceeds 60 years (NHRA Section 38).
 * Flags for environmental screening if the application type involves land use change
 * (rezoning, consent_use, township_establishment).
 *
 * @param application - The planning application to evaluate
 * @param propertyAge - Age of the property in years (passed as additional field)
 * @returns Array of EnvironmentalHeritageTrigger records created
 */
export function evaluateTriggers(
  application: PlanningApplication,
  propertyAge?: number,
): EnvironmentalHeritageTrigger[] {
  const createdTriggers: EnvironmentalHeritageTrigger[] = [];

  // Heritage trigger: property older than 60 years
  if (propertyAge !== undefined && checkHeritageAge(propertyAge)) {
    const heritageTrigger: EnvironmentalHeritageTrigger = {
      id: generateId('trigger'),
      applicationId: application.id,
      triggerType: 'heritage_nhra_s38' as TriggerType,
      reason: `Property is ${propertyAge} years old (>60 years). NHRA Section 38 heritage assessment required.`,
      confirmed: false,
      parallelProcessStatus: 'pending' as ParallelProcessStatus,
      parallelDeadlines: [],
      parallelDocumentIds: [],
    };
    triggers.push(heritageTrigger);
    createdTriggers.push(heritageTrigger);
  }

  // Environmental screening: land use change application types
  if (checkEnvironmentalScreening(application.applicationType)) {
    const environmentalTrigger: EnvironmentalHeritageTrigger = {
      id: generateId('trigger'),
      applicationId: application.id,
      triggerType: 'environmental_nema' as TriggerType,
      reason: `Application type "${application.applicationType}" involves land use change. NEMA environmental screening required.`,
      confirmed: false,
      parallelProcessStatus: 'pending' as ParallelProcessStatus,
      parallelDeadlines: [],
      parallelDocumentIds: [],
    };
    triggers.push(environmentalTrigger);
    createdTriggers.push(environmentalTrigger);
  }

  return createdTriggers;
}

/**
 * Checks whether a property's age triggers the NHRA Section 38 heritage assessment.
 *
 * Properties older than 60 years require a heritage impact assessment per
 * the National Heritage Resources Act (NHRA).
 *
 * @param propertyAge - The age of the property in years
 * @returns true if the property age exceeds 60 years
 */
export function checkHeritageAge(propertyAge: number): boolean {
  return propertyAge > 60;
}

/**
 * Checks whether an application type and land use context warrant NEMA
 * environmental screening.
 *
 * Returns true if the application type is one of: rezoning, consent_use,
 * or township_establishment — all of which involve land use change.
 *
 * @param applicationType - The planning application type
 * @param _landUseChange - Optional additional land use change descriptor (reserved for future use)
 * @returns true if environmental screening is warranted
 */
export function checkEnvironmentalScreening(
  applicationType: PlanningApplicationType,
  _landUseChange?: string,
): boolean {
  return LAND_USE_CHANGE_TYPES.includes(applicationType);
}

// ── Parallel Process Management ─────────────────────────────────────────────

/**
 * Marks a trigger as confirmed.
 *
 * Confirmation indicates that the trigger has been reviewed and the parallel
 * process is acknowledged as required. Confirmed triggers will block stage
 * advancement until resolved or deferred.
 *
 * @param triggerId - The ID of the trigger to confirm
 * @returns The updated EnvironmentalHeritageTrigger
 * @throws Error if the trigger is not found
 */
export function confirmTrigger(triggerId: string): EnvironmentalHeritageTrigger {
  const trigger = triggers.find((t) => t.id === triggerId);
  if (!trigger) {
    throw new Error(`Trigger not found: ${triggerId}`);
  }

  trigger.confirmed = true;
  trigger.parallelProcessStatus = 'in_progress';
  return { ...trigger };
}

/**
 * Creates a parallel process for a confirmed trigger by storing deadlines
 * and document requirements.
 *
 * @param triggerId - The ID of the trigger to attach parallel process to
 * @param deadlines - Array of Deadline records for the parallel process
 * @param requiredDocumentTypes - Array of document type identifiers required
 * @throws Error if the trigger is not found
 */
export function createParallelProcess(
  triggerId: string,
  deadlines: Deadline[],
  requiredDocumentTypes: string[],
): void {
  const trigger = triggers.find((t) => t.id === triggerId);
  if (!trigger) {
    throw new Error(`Trigger not found: ${triggerId}`);
  }

  trigger.parallelDeadlines = [...deadlines];
  trigger.parallelDocumentIds = [...requiredDocumentTypes];
}

/**
 * Resolves a parallel process, indicating the environmental or heritage
 * assessment has been completed satisfactorily.
 *
 * Sets the parallelProcessStatus to 'resolved', removing it as a blocker
 * for stage advancement.
 *
 * @param triggerId - The ID of the trigger to resolve
 * @throws Error if the trigger is not found
 */
export function resolveParallelProcess(triggerId: string): void {
  const trigger = triggers.find((t) => t.id === triggerId);
  if (!trigger) {
    throw new Error(`Trigger not found: ${triggerId}`);
  }

  trigger.parallelProcessStatus = 'resolved';
}

/**
 * Defers a parallel process with a reason and user attribution.
 *
 * Sets the parallelProcessStatus to 'deferred', removing it as a blocker
 * for stage advancement. Records who deferred it and when for audit purposes.
 *
 * @param triggerId - The ID of the trigger to defer
 * @param userId - The user making the deferral decision
 * @param reason - The reason for deferral
 * @throws Error if the trigger is not found
 */
export function deferParallelProcess(
  triggerId: string,
  userId: string,
  reason: string,
): void {
  const trigger = triggers.find((t) => t.id === triggerId);
  if (!trigger) {
    throw new Error(`Trigger not found: ${triggerId}`);
  }

  trigger.parallelProcessStatus = 'deferred';
  trigger.deferredBy = userId;
  trigger.deferredAt = new Date().toISOString();
  // Store reason in the trigger reason field (append deferral note)
  trigger.reason = `${trigger.reason} [Deferred: ${reason}]`;
}

// ── Gate Check ──────────────────────────────────────────────────────────────

/**
 * Checks whether an application has any unresolved triggers that would
 * block stage advancement.
 *
 * A trigger is blocking if it is confirmed and its parallelProcessStatus
 * is neither 'resolved' nor 'deferred'.
 *
 * @param applicationId - The planning application ID
 * @returns true if there are confirmed triggers that are not resolved or deferred
 */
export function hasUnresolvedTriggers(applicationId: string): boolean {
  return getBlockingTriggers(applicationId).length > 0;
}

/**
 * Returns all triggers that are currently blocking stage advancement
 * for a given application.
 *
 * Blocking triggers are those that are confirmed and have a parallelProcessStatus
 * that is neither 'resolved' nor 'deferred'.
 *
 * @param applicationId - The planning application ID
 * @returns Array of blocking EnvironmentalHeritageTrigger records
 */
export function getBlockingTriggers(
  applicationId: string,
): EnvironmentalHeritageTrigger[] {
  return triggers.filter(
    (t) =>
      t.applicationId === applicationId &&
      t.confirmed === true &&
      t.parallelProcessStatus !== 'resolved' &&
      t.parallelProcessStatus !== 'deferred',
  );
}

// ── Store Management (for testing) ──────────────────────────────────────────

/**
 * Resets the in-memory store. Intended for use in tests only.
 */
export function _resetStore(): void {
  triggers = [];
  idCounter = 0;
}
