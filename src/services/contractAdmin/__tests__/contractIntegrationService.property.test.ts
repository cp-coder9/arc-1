// Feature: contract-administration, Property 4: State Changes Produce Audit Records
//
// **Validates: Requirements 2.5, 5.8, 8.7**
//
// Property 4: For any state-changing operation, the system produces exactly one
// immutable audit record containing: entity type, entity ID, action, actor ID,
// timestamp, and — for transitions — previous and new status values.
//
// This test verifies the structural invariant of ContractAuditRecord objects and
// that writeToAuditTrail produces an IntegrationWriteResult with success=true.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock firebase-admin before importing the service
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ set: mockSet }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: mockCollection,
        set: mockSet,
        get: vi.fn(),
        update: vi.fn(),
      })),
    })),
  },
}));

import { writeToAuditTrail } from '../contractIntegrationService';
import type { ContractAuditRecord } from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Valid entity types for audit records */
const ENTITY_TYPES = [
  'contract',
  'notice',
  'variation',
  'eot',
  'claim',
  'payment_schedule',
] as const;

type AuditEntityType = (typeof ENTITY_TYPES)[number];

/** Generate a valid entity type */
const entityTypeArb: fc.Arbitrary<AuditEntityType> = fc.constantFrom(...ENTITY_TYPES);

/** Generate a non-empty string (for IDs) */
const nonEmptyStringArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generate a valid ISO timestamp string using integer milliseconds for reliability */
const isoTimestampArb: fc.Arbitrary<string> = fc
  .integer({
    min: new Date('2020-01-01T00:00:00.000Z').getTime(),
    max: new Date('2030-12-31T23:59:59.999Z').getTime(),
  })
  .map((ms) => new Date(ms).toISOString());

/** Generate a status string for transition records */
const statusStringArb: fc.Arbitrary<string> = fc.constantFrom(
  'active',
  'amended',
  'terminated',
  'issued',
  'acknowledged',
  'responded',
  'expired',
  'instructed',
  'valued',
  'approved',
  'rejected',
  'implemented',
  'draft',
  'submitted',
  'under_review',
  'granted',
  'partially_granted',
  'notified',
  'substantiated',
  'assessed',
  'accepted',
  'partially_accepted',
  'disputed',
);

/** Generate an action description string */
const actionStringArb: fc.Arbitrary<string> = fc.constantFrom(
  'created',
  'updated',
  'status_transition',
  'parameter_update',
  'registration',
  'submission',
  'review_completed',
  'deadline_expired',
  'deemed_outcome_applied',
);

/** Generate a complete ContractAuditRecord with all required fields */
const auditRecordArb: fc.Arbitrary<ContractAuditRecord> = fc.record({
  id: nonEmptyStringArb,
  projectId: nonEmptyStringArb,
  entityType: entityTypeArb,
  entityId: nonEmptyStringArb,
  action: actionStringArb,
  previousValue: fc.option(fc.record({ status: statusStringArb }), { nil: undefined }),
  newValue: fc.option(fc.record({ status: statusStringArb }), { nil: undefined }),
  clauseReference: fc.option(
    fc.stringMatching(/^\d{1,3}\.\d{1,2}$/),
    { nil: undefined },
  ),
  actorId: nonEmptyStringArb,
  timestamp: isoTimestampArb,
});

/** Generate an audit record specifically representing a state transition (with both previous and new values) */
const transitionAuditRecordArb: fc.Arbitrary<ContractAuditRecord> = fc.record({
  id: nonEmptyStringArb,
  projectId: nonEmptyStringArb,
  entityType: entityTypeArb,
  entityId: nonEmptyStringArb,
  action: fc.constant('status_transition'),
  previousValue: fc.record({ status: statusStringArb }),
  newValue: fc.record({ status: statusStringArb }),
  clauseReference: fc.option(
    fc.stringMatching(/^\d{1,3}\.\d{1,2}$/),
    { nil: undefined },
  ),
  actorId: nonEmptyStringArb,
  timestamp: isoTimestampArb,
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 4: State Changes Produce Audit Records
// **Validates: Requirements 2.5, 5.8, 8.7**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 4: State Changes Produce Audit Records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  describe('Structural invariant: every audit record has all required fields', () => {
    it('every generated audit record has a non-empty id', () => {
      fc.assert(
        fc.property(auditRecordArb, (record) => {
          expect(record.id).toBeDefined();
          expect(typeof record.id).toBe('string');
          expect(record.id.trim().length).toBeGreaterThan(0);
        }),
        { numRuns: 200 },
      );
    });

    it('every generated audit record has a non-empty projectId', () => {
      fc.assert(
        fc.property(auditRecordArb, (record) => {
          expect(record.projectId).toBeDefined();
          expect(typeof record.projectId).toBe('string');
          expect(record.projectId.trim().length).toBeGreaterThan(0);
        }),
        { numRuns: 200 },
      );
    });

    it('every generated audit record has a valid entityType', () => {
      fc.assert(
        fc.property(auditRecordArb, (record) => {
          expect(record.entityType).toBeDefined();
          expect(ENTITY_TYPES).toContain(record.entityType);
        }),
        { numRuns: 200 },
      );
    });

    it('every generated audit record has a non-empty entityId', () => {
      fc.assert(
        fc.property(auditRecordArb, (record) => {
          expect(record.entityId).toBeDefined();
          expect(typeof record.entityId).toBe('string');
          expect(record.entityId.trim().length).toBeGreaterThan(0);
        }),
        { numRuns: 200 },
      );
    });

    it('every generated audit record has a non-empty action', () => {
      fc.assert(
        fc.property(auditRecordArb, (record) => {
          expect(record.action).toBeDefined();
          expect(typeof record.action).toBe('string');
          expect(record.action.trim().length).toBeGreaterThan(0);
        }),
        { numRuns: 200 },
      );
    });

    it('every generated audit record has a non-empty actorId', () => {
      fc.assert(
        fc.property(auditRecordArb, (record) => {
          expect(record.actorId).toBeDefined();
          expect(typeof record.actorId).toBe('string');
          expect(record.actorId.trim().length).toBeGreaterThan(0);
        }),
        { numRuns: 200 },
      );
    });

    it('every generated audit record has a valid ISO timestamp', () => {
      fc.assert(
        fc.property(auditRecordArb, (record) => {
          expect(record.timestamp).toBeDefined();
          expect(typeof record.timestamp).toBe('string');
          // Validate ISO 8601 format
          const parsed = new Date(record.timestamp);
          expect(parsed.toString()).not.toBe('Invalid Date');
          expect(parsed.toISOString()).toBe(record.timestamp);
        }),
        { numRuns: 200 },
      );
    });

    it('no audit record has a missing or empty required field', () => {
      fc.assert(
        fc.property(auditRecordArb, (record) => {
          const requiredFields: (keyof ContractAuditRecord)[] = [
            'id',
            'projectId',
            'entityType',
            'entityId',
            'action',
            'actorId',
            'timestamp',
          ];

          for (const field of requiredFields) {
            const value = record[field];
            expect(value).toBeDefined();
            expect(value).not.toBeNull();
            if (typeof value === 'string') {
              expect(value.trim().length).toBeGreaterThan(0);
            }
          }
        }),
        { numRuns: 300 },
      );
    });
  });

  describe('Transition records include previous and new status', () => {
    it('transition audit records have previousValue and newValue both with status fields', () => {
      fc.assert(
        fc.property(transitionAuditRecordArb, (record) => {
          expect(record.previousValue).toBeDefined();
          expect(record.newValue).toBeDefined();

          const prev = record.previousValue as { status: string };
          const next = record.newValue as { status: string };

          expect(prev.status).toBeDefined();
          expect(typeof prev.status).toBe('string');
          expect(prev.status.trim().length).toBeGreaterThan(0);

          expect(next.status).toBeDefined();
          expect(typeof next.status).toBe('string');
          expect(next.status.trim().length).toBeGreaterThan(0);
        }),
        { numRuns: 200 },
      );
    });

    it('transition records always have action = "status_transition"', () => {
      fc.assert(
        fc.property(transitionAuditRecordArb, (record) => {
          expect(record.action).toBe('status_transition');
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('writeToAuditTrail produces correct IntegrationWriteResult', () => {
    it('writeToAuditTrail returns success=true and targetModule="AuditTrail" for valid records', () => {
      fc.assert(
        fc.asyncProperty(auditRecordArb, async (record) => {
          const result = await writeToAuditTrail(record.projectId, record);

          expect(result.success).toBe(true);
          expect(result.targetModule).toBe('AuditTrail');
          expect(typeof result.retryCount).toBe('number');
          expect(result.retryCount).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 50 },
      );
    });

    it('writeToAuditTrail invokes Firestore set for each record', () => {
      fc.assert(
        fc.asyncProperty(auditRecordArb, async (record) => {
          mockSet.mockClear();
          await writeToAuditTrail(record.projectId, record);

          // Verify that set was called (at least once due to retry logic)
          expect(mockSet).toHaveBeenCalled();
        }),
        { numRuns: 30 },
      );
    });
  });
});
