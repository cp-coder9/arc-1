import type { z } from 'zod';

/**
 * Thrown when input data fails Zod schema validation before a write operation.
 * Wraps the Zod issues array for structured error reporting.
 *
 * Requirements: 1.8, 4.12
 */
export class SpecForgeValidationError extends Error {
  constructor(public readonly zodErrors: z.ZodIssue[]) {
    super('Validation failed');
    this.name = 'SpecForgeValidationError';
  }
}

/**
 * Thrown when a targeted document does not exist in Firestore
 * (e.g., update/delete on a missing item, section, or procurement entry).
 *
 * Requirements: 1.9, 3.7
 */
export class SpecForgeNotFoundError extends Error {
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'SpecForgeNotFoundError';
  }
}

/**
 * Thrown when a mutation is attempted on an immutable resource
 * (snapshots are write-once, audit events are append-only).
 *
 * Requirements: 2.2, 2.4
 */
export class SpecForgeImmutableError extends Error {
  constructor(public readonly resource: string) {
    super(`${resource} is immutable and cannot be modified`);
    this.name = 'SpecForgeImmutableError';
  }
}

/**
 * Thrown when a user's SpecForge role lacks the required capability
 * for the requested operation.
 *
 * Requirements: 5.10
 */
export class SpecForgeCapabilityError extends Error {
  constructor(public readonly role: string, public readonly capability: string) {
    super(`Role "${role}" lacks capability: ${capability}`);
    this.name = 'SpecForgeCapabilityError';
  }
}
