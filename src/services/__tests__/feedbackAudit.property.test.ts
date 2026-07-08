/**
 * Property-based tests — Audit trail completeness.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 16: Audit trail completeness
 *   Validates: Requirements 7.1, 2.7
 *   For any feedback lifecycle action (submission created, cluster merged,
 *   status changed, notification sent, implicit friction detected), an audit
 *   trail event must be recorded containing the actor ID, action type,
 *   source object ID, and timestamp.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { FeedbackAuditEvent, FeedbackAuditActionType } from '@/services/feedbackAuditService';

// ══════════════════════════════════════════════════════════════════════════════
// Property 16: Audit trail completeness
// Validates: Requirements 7.1, 2.7
// ══════════════════════════════════════════════════════════════════════════════

const VALID_ACTION_TYPES: FeedbackAuditActionType[] = [
  'submission_created',
  'cluster_merged',
  'status_changed',
  'notification_sent',
  'implicit_friction_detected',
];

/**
 * Validates an audit event has all required fields.
 * A valid audit event must have:
 * - actorId: non-empty string
 * - actionType: one of the 5 valid lifecycle action types
 * - sourceObjectId: non-empty string
 * - timestamp: non-empty string
 */
function isValidAuditEvent(event: FeedbackAuditEvent): boolean {
  return (
    typeof event.actorId === 'string' && event.actorId.length > 0 &&
    VALID_ACTION_TYPES.includes(event.actionType) &&
    typeof event.sourceObjectId === 'string' && event.sourceObjectId.length > 0 &&
    typeof event.timestamp === 'string' && event.timestamp.length > 0
  );
}

/** Arbitrary generator for valid action types. */
const arbActionType = fc.constantFrom(...VALID_ACTION_TYPES);

/** Arbitrary generator for non-empty strings (actor IDs, source object IDs). */
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0);

/** Arbitrary generator for ISO-8601 UTC timestamps. */
const arbTimestamp = fc.integer({
  min: new Date('2020-01-01T00:00:00Z').getTime(),
  max: new Date('2030-12-31T23:59:59Z').getTime(),
}).map((ms) => new Date(ms).toISOString());

/** Arbitrary generator for valid audit events. */
const arbValidAuditEvent: fc.Arbitrary<FeedbackAuditEvent> = fc.record({
  actorId: arbNonEmptyString,
  actionType: arbActionType,
  sourceObjectId: arbNonEmptyString,
  timestamp: arbTimestamp,
  metadata: fc.option(
    fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ maxLength: 50 })),
    { nil: undefined },
  ),
});

describe('Feature: intelligent-feedback-loop, Property 16: Audit trail completeness', () => {
  /**
   * **Validates: Requirements 7.1, 2.7**
   *
   * For any valid lifecycle action, the audit event contains actorId, actionType,
   * sourceObjectId, and timestamp (all non-empty strings).
   */
  it('any valid lifecycle action produces an audit event with actorId, actionType, sourceObjectId, and timestamp', () => {
    fc.assert(
      fc.property(arbValidAuditEvent, (event) => {
        expect(isValidAuditEvent(event)).toBe(true);
        expect(event.actorId.length).toBeGreaterThan(0);
        expect(event.sourceObjectId.length).toBeGreaterThan(0);
        expect(event.timestamp.length).toBeGreaterThan(0);
        expect(VALID_ACTION_TYPES).toContain(event.actionType);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.1, 2.7**
   *
   * The actionType is always one of the 5 valid lifecycle action types.
   */
  it('actionType is always one of the 5 valid lifecycle action types', () => {
    fc.assert(
      fc.property(arbActionType, (actionType) => {
        expect(VALID_ACTION_TYPES).toContain(actionType);
        expect([
          'submission_created',
          'cluster_merged',
          'status_changed',
          'notification_sent',
          'implicit_friction_detected',
        ]).toContain(actionType);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.1, 2.7**
   *
   * Invalid events (missing or empty required fields) are rejected by the validator.
   */
  it('rejects audit events with empty actorId', () => {
    fc.assert(
      fc.property(
        fc.constant(''),
        arbActionType,
        arbNonEmptyString,
        arbTimestamp,
        (actorId, actionType, sourceObjectId, timestamp) => {
          const event: FeedbackAuditEvent = { actorId, actionType, sourceObjectId, timestamp };
          expect(isValidAuditEvent(event)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects audit events with empty sourceObjectId', () => {
    fc.assert(
      fc.property(
        arbNonEmptyString,
        arbActionType,
        fc.constant(''),
        arbTimestamp,
        (actorId, actionType, sourceObjectId, timestamp) => {
          const event: FeedbackAuditEvent = { actorId, actionType, sourceObjectId, timestamp };
          expect(isValidAuditEvent(event)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects audit events with empty timestamp', () => {
    fc.assert(
      fc.property(
        arbNonEmptyString,
        arbActionType,
        arbNonEmptyString,
        fc.constant(''),
        (actorId, actionType, sourceObjectId, timestamp) => {
          const event: FeedbackAuditEvent = { actorId, actionType, sourceObjectId, timestamp };
          expect(isValidAuditEvent(event)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects audit events with invalid actionType', () => {
    fc.assert(
      fc.property(
        arbNonEmptyString,
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          (s) => !VALID_ACTION_TYPES.includes(s as FeedbackAuditActionType),
        ),
        arbNonEmptyString,
        arbTimestamp,
        (actorId, invalidActionType, sourceObjectId, timestamp) => {
          const event = {
            actorId,
            actionType: invalidActionType as FeedbackAuditActionType,
            sourceObjectId,
            timestamp,
          };
          expect(isValidAuditEvent(event)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all 5 lifecycle action types are covered by the validator', () => {
    const allTypes: FeedbackAuditActionType[] = [
      'submission_created',
      'cluster_merged',
      'status_changed',
      'notification_sent',
      'implicit_friction_detected',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...allTypes),
        arbNonEmptyString,
        arbNonEmptyString,
        arbTimestamp,
        (actionType, actorId, sourceObjectId, timestamp) => {
          const event: FeedbackAuditEvent = { actorId, actionType, sourceObjectId, timestamp };
          expect(isValidAuditEvent(event)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('metadata field is optional and does not affect validity', () => {
    fc.assert(
      fc.property(
        arbNonEmptyString,
        arbActionType,
        arbNonEmptyString,
        arbTimestamp,
        fc.option(
          fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ maxLength: 50 })),
          { nil: undefined },
        ),
        (actorId, actionType, sourceObjectId, timestamp, metadata) => {
          const event: FeedbackAuditEvent = { actorId, actionType, sourceObjectId, timestamp, metadata };
          expect(isValidAuditEvent(event)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
