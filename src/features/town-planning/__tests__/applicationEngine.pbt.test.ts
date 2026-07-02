/**
 * Property-Based Tests for Application Engine (Properties 4 & 5)
 *
 * Feature: town-planning-workflow
 *
 * **Validates: Requirements 4, 5**
 *
 * Property 4:
 * For any input with missing mandatory fields, creation SHALL be rejected
 * with a validation error. The system never persists invalid data.
 *
 * Property 5:
 * For any valid input, creation SHALL produce an application with a unique
 * reference number (format TP-{projectShort}-{seq}), status='preparation',
 * and an audit record created.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  createApplication,
  type ActorContext,
  type ApplicationAuditFn,
  type PassportFn,
} from '../services/applicationEngine';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { ApplicationType } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockDb(existingCount = 0): FirestoreDB {
  const docs = Array.from({ length: existingCount }, (_, i) => ({
    exists: true,
    id: `existing-${i}`,
    data: () => ({ applicationType: 'rezoning' }),
  }));

  const mockDocRef = {
    get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => undefined }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const mockCollectionRef = {
    doc: vi.fn().mockReturnValue(mockDocRef),
    add: vi.fn().mockResolvedValue({ id: `app-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
    get: vi.fn().mockResolvedValue({ docs, empty: existingCount === 0 }),
  };

  return {
    collection: vi.fn().mockReturnValue(mockCollectionRef),
  };
}

const actor: ActorContext = { id: 'pbt-actor', role: 'town_planner' };

// ─── Generators ──────────────────────────────────────────────────────────────

const APPLICATION_TYPES: ApplicationType[] = [
  'rezoning',
  'departure',
  'subdivision',
  'consolidation',
  'removal_of_restrictive_conditions',
  'township_establishment',
  'consent_use',
  'amendment_of_scheme',
];

const TYPES_NEEDING_DETAILS: ApplicationType[] = [
  'rezoning',
  'departure',
  'subdivision',
  'consolidation',
  'removal_of_restrictive_conditions',
];

const TYPES_NO_DETAILS: ApplicationType[] = [
  'township_establishment',
  'consent_use',
  'amendment_of_scheme',
];

const arbApplicationType = fc.oneof(...APPLICATION_TYPES.map((t) => fc.constant(t)));
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const arbProjectId = fc.stringMatching(/^[a-zA-Z0-9]{4,20}$/);

/**
 * Generates a VALID application params object for any type.
 */
const arbValidParams = arbApplicationType.chain((appType) => {
  const base = fc.record({
    applicationType: fc.constant(appType),
    municipalityId: arbNonEmptyString,
    propertyId: arbNonEmptyString,
    applicantName: arbNonEmptyString,
    applicantContact: arbNonEmptyString,
    description: arbNonEmptyString,
  });

  switch (appType) {
    case 'rezoning':
      return fc.tuple(base, fc.record({
        currentZoning: arbNonEmptyString,
        proposedZoning: arbNonEmptyString,
        motivation: arbNonEmptyString,
      })).map(([b, details]) => ({ ...b, rezoningDetails: details }));

    case 'departure':
      return fc.tuple(base, fc.record({
        departureType: arbNonEmptyString,
        extent: arbNonEmptyString,
        motivation: arbNonEmptyString,
      })).map(([b, details]) => ({ ...b, departureDetails: details }));

    case 'subdivision':
    case 'consolidation':
      return fc.tuple(base, fc.record({
        numberOfPortions: fc.integer({ min: 2, max: 100 }),
        layoutDescription: arbNonEmptyString,
      })).map(([b, details]) => ({ ...b, subdivisionDetails: details }));

    case 'removal_of_restrictive_conditions':
      return fc.tuple(base, fc.record({
        conditionReference: arbNonEmptyString,
        conditionText: arbNonEmptyString,
        reasonForRemoval: arbNonEmptyString,
      })).map(([b, details]) => ({ ...b, restrictiveConditionDetails: details }));

    default:
      // township_establishment, consent_use, amendment_of_scheme — no extra details needed
      return base;
  }
});

/**
 * Generates an INVALID application params object — missing at least one mandatory field.
 * Strategy: take a valid params shape and remove/empty a required field.
 */
const arbInvalidParams = fc.oneof(
  // Missing base field (one of the mandatory ones set to empty string)
  arbValidParams.chain((validParams) => {
    const baseFields: (keyof typeof validParams)[] = [
      'municipalityId',
      'propertyId',
      'applicantName',
      'applicantContact',
      'description',
    ];
    return fc.constantFrom(...baseFields).map((field) => ({
      ...validParams,
      [field]: '',
    }));
  }),

  // Missing type-specific details for types that require them
  fc.constantFrom(...TYPES_NEEDING_DETAILS).chain((appType) => {
    return fc.record({
      applicationType: fc.constant(appType),
      municipalityId: arbNonEmptyString,
      propertyId: arbNonEmptyString,
      applicantName: arbNonEmptyString,
      applicantContact: arbNonEmptyString,
      description: arbNonEmptyString,
      // deliberately omit type-specific details
    });
  })
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Application Engine — Property-Based Tests', () => {
  describe('Property 4: Missing mandatory fields → rejection', () => {
    it('rejects any input with missing mandatory fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbInvalidParams,
          arbProjectId,
          async (invalidParams, projectId) => {
            const mockDb = createMockDb();
            const mockAuditFn: ApplicationAuditFn = vi.fn().mockResolvedValue(undefined);
            const mockPassportFn: PassportFn = vi.fn().mockResolvedValue(undefined);

            const result = await createApplication(projectId, invalidParams, actor, {
              db: mockDb,
              auditFn: mockAuditFn,
              passportFn: mockPassportFn,
            });

            // Must be rejected
            expect(result.success).toBe(false);

            // Must not persist
            const collRef = (mockDb.collection as ReturnType<typeof vi.fn>).mock.results;
            if (collRef.length > 0) {
              const ref = collRef[collRef.length - 1]?.value;
              if (ref && ref.add) {
                expect(ref.add).not.toHaveBeenCalled();
              }
            }

            // Must not call audit or passport
            expect(mockAuditFn).not.toHaveBeenCalled();
            expect(mockPassportFn).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: Valid input → unique reference, preparation status, audit record', () => {
    it('produces app with unique reference, status=preparation, and audit record', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbValidParams,
          arbProjectId,
          fc.integer({ min: 0, max: 50 }),
          async (validParams, projectId, existingCount) => {
            const mockDb = createMockDb(existingCount);
            const mockAuditFn: ApplicationAuditFn = vi.fn().mockResolvedValue(undefined);
            const mockPassportFn: PassportFn = vi.fn().mockResolvedValue(undefined);

            const result = await createApplication(projectId, validParams, actor, {
              db: mockDb,
              auditFn: mockAuditFn,
              passportFn: mockPassportFn,
            });

            // Must succeed
            expect(result.success).toBe(true);
            if (!result.success) return;

            // Reference number format: TP-{4 chars uppercased}-{3 digit seq}
            const refPattern = /^TP-[A-Z0-9]{4}-\d{3}$/;
            expect(result.data.referenceNumber).toMatch(refPattern);

            // First 4 chars of projectId are in the reference (uppercased)
            const projectShort = projectId.substring(0, 4).toUpperCase();
            expect(result.data.referenceNumber).toContain(projectShort);

            // Status is preparation
            expect(result.data.stage).toBe('preparation');

            // Audit function was called
            expect(mockAuditFn).toHaveBeenCalledTimes(1);
            expect(mockAuditFn).toHaveBeenCalledWith(
              expect.objectContaining({
                action: 'application_created',
                projectId,
                applicationType: validParams.applicationType,
                referenceNumber: result.data.referenceNumber,
              })
            );

            // Passport function was called
            expect(mockPassportFn).toHaveBeenCalledTimes(1);
            expect(mockPassportFn).toHaveBeenCalledWith(
              expect.objectContaining({
                projectId,
                applicationType: validParams.applicationType,
                status: 'preparation',
              })
            );

            // Sequential number is existingCount + 1
            const expectedSeq = String(existingCount + 1).padStart(3, '0');
            expect(result.data.referenceNumber).toBe(`TP-${projectShort}-${expectedSeq}`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
