/**
 * Custom error classes for the Health & Safety module.
 */

/**
 * Thrown when an invalid state transition is attempted on a workflow entity
 * (e.g. approving a permit that is still in draft state).
 */
export class InvalidStateTransitionError extends Error {
  public readonly currentState: string;
  public readonly attemptedTransition: string;
  public readonly entityType: string;

  constructor(entityType: string, currentState: string, attemptedTransition: string) {
    super(
      `Invalid state transition for ${entityType}: cannot transition from "${currentState}" via "${attemptedTransition}"`
    );
    this.name = 'InvalidStateTransitionError';
    this.entityType = entityType;
    this.currentState = currentState;
    this.attemptedTransition = attemptedTransition;
  }
}

/**
 * Thrown when a referenced entity cannot be found.
 */
export class NotFoundError extends Error {
  public readonly entityType: string;
  public readonly entityId: string;

  constructor(entityType: string, entityId: string) {
    super(`${entityType} not found: ${entityId}`);
    this.name = 'NotFoundError';
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

/**
 * Thrown when a persistence operation (e.g. Firestore write) fails.
 * Wraps the original error for upstream handling.
 */
export class PersistenceError extends Error {
  public readonly originalError: Error;

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'PersistenceError';
    this.originalError = originalError;
  }
}
