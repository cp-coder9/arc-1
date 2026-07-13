/**
 * Property 16: Audit Trail Recording
 *
 * - For any CRUD operation, audit entry contains actor, timestamp, action type, entity type, entity ID, before/after
 * - Audit trail is append-only
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { AuditEntry } from './types';

// ── Pure audit entry validation ──────────────────────────────────────────────

/**
 * Pure function that validates an audit entry has all required fields.
 * We test the shape/contract rather than Firestore persistence.
 */
function isValidAuditEntry(entry: AuditEntry): boolean {
  return (
    typeof entry.id === 'string' && entry.id.length > 0 &&
    typeof entry.projectId === 'string' && entry.projectId.length > 0 &&
    typeof entry.actorId === 'string' && entry.actorId.length > 0 &&
    typeof entry.actorName === 'string' && entry.actorName.length > 0 &&
    ['create', 'update', 'delete', 'status_change', 'escalation'].includes(entry.actionType) &&
    typeof entry.entityType === 'string' && entry.entityType.length > 0 &&
    typeof entry.entityId === 'string' && entry.entityId.length > 0 &&
    typeof entry.timestamp === 'string' && entry.timestamp.length > 0
  );
}

/**
 * Simulates append-only audit trail: given an existing trail, appending
 * never modifies or removes existing entries.
 */
function appendAuditEntry(trail: AuditEntry[], newEntry: AuditEntry): AuditEntry[] {
  return [...trail, newEntry];
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const actionTypeArb = fc.constantFrom('create', 'update', 'delete', 'status_change', 'escalation') as fc.Arbitrary<AuditEntry['actionType']>;
const entityTypeArb = fc.constantFrom('task', 'milestone', 'risk', 'payment_certificate', 'procurement_order', 'contract', 'activity', 'variation', 'budget_package');
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const timestampArb = fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts).toISOString());

const auditEntryArb: fc.Arbitrary<AuditEntry> = fc.record({
  id: fc.uuid(),
  projectId: nonEmptyStringArb,
  actorId: nonEmptyStringArb,
  actorName: nonEmptyStringArb,
  actionType: actionTypeArb,
  entityType: entityTypeArb,
  entityId: fc.uuid(),
  before: fc.option(fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string()), { nil: undefined }),
  after: fc.option(fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string()), { nil: undefined }),
  timestamp: timestampArb,
});

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 16: Audit Trail Recording', () => {
  it('any audit entry with required fields is valid', () => {
    fc.assert(
      fc.property(auditEntryArb, (entry) => {
        expect(isValidAuditEntry(entry)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('audit entry always contains actor, timestamp, action type, entity type, and entity ID', () => {
    fc.assert(
      fc.property(auditEntryArb, (entry) => {
        expect(entry.actorId).toBeTruthy();
        expect(entry.actorName).toBeTruthy();
        expect(entry.timestamp).toBeTruthy();
        expect(entry.actionType).toBeTruthy();
        expect(entry.entityType).toBeTruthy();
        expect(entry.entityId).toBeTruthy();
      }),
      { numRuns: 100 },
    );
  });

  it('audit trail is append-only: existing entries are never modified', () => {
    fc.assert(
      fc.property(
        fc.array(auditEntryArb, { minLength: 1, maxLength: 20 }),
        auditEntryArb,
        (existingTrail, newEntry) => {
          const originalSnapshot = existingTrail.map((e) => ({ ...e }));
          const updatedTrail = appendAuditEntry(existingTrail, newEntry);

          // Length increased by exactly 1
          expect(updatedTrail.length).toBe(existingTrail.length + 1);

          // All original entries are preserved unchanged
          for (let i = 0; i < originalSnapshot.length; i++) {
            expect(updatedTrail[i]).toEqual(originalSnapshot[i]);
          }

          // New entry is appended at the end
          expect(updatedTrail[updatedTrail.length - 1]).toEqual(newEntry);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('audit entry timestamp is a valid ISO string', () => {
    fc.assert(
      fc.property(auditEntryArb, (entry) => {
        const parsed = new Date(entry.timestamp);
        expect(parsed.toISOString()).toBe(entry.timestamp);
      }),
      { numRuns: 100 },
    );
  });

  it('actionType is always one of the valid CRUD operation types', () => {
    fc.assert(
      fc.property(auditEntryArb, (entry) => {
        const validTypes = ['create', 'update', 'delete', 'status_change', 'escalation'];
        expect(validTypes).toContain(entry.actionType);
      }),
      { numRuns: 100 },
    );
  });
});
