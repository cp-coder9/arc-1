/**
 * Project Command Centre — Stale Warning Service
 *
 * Manages the lifecycle of stale-source warnings when referenced documents
 * are superseded. Implements Property 24 from the design document.
 *
 * Lifecycle:
 * 1. Document transitions to "superseded" → generate stale-source warning
 * 2. User acknowledges warning → record timestamp + userId, remove badge
 * 3. If previously acknowledged reference is superseded again → generate new warning
 *
 * @module commandCentre/staleWarningService
 * @validates Requirements 18.5, 18.6
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface StaleSourceWarning {
  /** ID of the entity that references the superseded document. */
  entityId: string;
  entityType: string;
  /** The revision code that the entity currently references. */
  referencedRevision: string;
  /** The latest revision available. */
  currentRevision: string;
  /** ISO 8601 date when the document was superseded. */
  supersededAt: string;
  /** Deep link to the latest version of the document. */
  latestDocumentLink: string;
  /** Whether this warning has been acknowledged. */
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

/** Input for generating a stale-source warning. */
export interface SupersessionEvent {
  entityId: string;
  entityType: string;
  referencedRevision: string;
  newRevision: string;
  supersededAt: string;
  latestDocumentLink: string;
}

/** Input for acknowledging a warning. */
export interface AcknowledgementInput {
  entityId: string;
  userId: string;
  timestamp?: string;
}

/** Tracks the acknowledgement state of all warnings. */
export type WarningStore = Map<string, StaleSourceWarning>;

// ── Core Service Logic ───────────────────────────────────────────────────────

/**
 * Generates a stale-source warning for an entity when its referenced document
 * is superseded.
 *
 * Property 24(a): When the referenced document transitions to "superseded",
 * a stale-source warning SHALL be generated for that entity.
 *
 * @validates Requirement 18.1
 */
export function generateStaleWarning(
  event: SupersessionEvent,
): StaleSourceWarning {
  return {
    entityId: event.entityId,
    entityType: event.entityType,
    referencedRevision: event.referencedRevision,
    currentRevision: event.newRevision,
    supersededAt: event.supersededAt,
    latestDocumentLink: event.latestDocumentLink,
    acknowledged: false,
  };
}

/**
 * Acknowledges a stale-source warning, recording the timestamp and user ID.
 * After acknowledgement the badge should be removed from the entity.
 *
 * Property 24(b): After acknowledgement, the warning is removed.
 *
 * @validates Requirement 18.5
 */
export function acknowledgeWarning(
  warning: StaleSourceWarning,
  input: AcknowledgementInput,
): StaleSourceWarning {
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    ...warning,
    acknowledged: true,
    acknowledgedAt: timestamp,
    acknowledgedBy: input.userId,
  };
}

/**
 * Determines whether a new stale-source warning should be generated
 * after a previously acknowledged reference is superseded again.
 *
 * Property 24(c): If a further supersession occurs after acknowledgement
 * (newer supersession timestamp > acknowledgement timestamp), a new warning
 * is generated requiring separate acknowledgement.
 *
 * @param existingWarning - The previously acknowledged warning (or undefined if none).
 * @param event - The new supersession event.
 * @returns true if a new warning should be generated, false otherwise.
 *
 * @validates Requirement 18.6
 */
export function shouldGenerateNewWarning(
  existingWarning: StaleSourceWarning | undefined,
  event: SupersessionEvent,
): boolean {
  // No existing warning — always generate
  if (!existingWarning) return true;

  // Not acknowledged — already has an active warning, don't duplicate
  if (!existingWarning.acknowledged) return false;

  // Previously acknowledged: generate a new warning if the supersession is newer
  const acknowledgementTime = new Date(existingWarning.acknowledgedAt ?? '1970-01-01').getTime();
  const supersessionTime = new Date(event.supersededAt).getTime();

  return supersessionTime > acknowledgementTime;
}

/**
 * Processes a supersession event against the current warning store.
 * Generates or skips a new warning based on the current state.
 *
 * @param store - Mutable warning store (Map keyed by entityId).
 * @param event - The supersession event to process.
 * @returns The new or existing warning, or null if skipped.
 */
export function processSupersessionEvent(
  store: WarningStore,
  event: SupersessionEvent,
): StaleSourceWarning | null {
  const existing = store.get(event.entityId);

  if (shouldGenerateNewWarning(existing, event)) {
    const newWarning = generateStaleWarning(event);
    store.set(event.entityId, newWarning);
    return newWarning;
  }

  return null;
}

/**
 * Processes an acknowledgement against the warning store.
 *
 * @param store - Mutable warning store.
 * @param input - The acknowledgement input.
 * @returns The updated warning or null if no warning found.
 */
export function processAcknowledgement(
  store: WarningStore,
  input: AcknowledgementInput,
): StaleSourceWarning | null {
  const existing = store.get(input.entityId);
  if (!existing || existing.acknowledged) return null;

  const updated = acknowledgeWarning(existing, input);
  store.set(input.entityId, updated);
  return updated;
}

/**
 * Returns all active (unacknowledged) warnings from the store.
 */
export function getActiveWarnings(store: WarningStore): StaleSourceWarning[] {
  return Array.from(store.values()).filter((w) => !w.acknowledged);
}

/**
 * Returns the count of active (unacknowledged) warnings — for dashboard stat card.
 */
export function getActiveWarningCount(store: WarningStore): number {
  return getActiveWarnings(store).length;
}

// ── Service Export ───────────────────────────────────────────────────────────

export const staleWarningService = {
  generateStaleWarning,
  acknowledgeWarning,
  shouldGenerateNewWarning,
  processSupersessionEvent,
  processAcknowledgement,
  getActiveWarnings,
  getActiveWarningCount,
};

export default staleWarningService;
