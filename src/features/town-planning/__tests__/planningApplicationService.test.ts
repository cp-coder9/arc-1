/**
 * Planning Application Service — Property-Based Tests
 *
 * Validates correctness properties for core planning services using fast-check.
 * - Property 10: Municipality Profile Fallback
 * - Property 1: Sequential Stage Progression
 * - Property 2: Stage Gate Completeness
 * - Property 14: Reference Number Uniqueness
 *
 * Uses fast-check with minimum 100 iterations per property test.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

import {
  createApplication,
  advanceStage,
  validateStageGate,
  getApplication,
  getStageIndex,
  getNextStage,
  _resetStore as resetApplicationStore,
} from '../services/planningApplicationService';

import {
  resolveProfile,
  getDefaultProfile,
  getTimeframes,
  createProfile,
  _resetStore as resetProfileStore,
} from '../services/municipalityProfileService';

import { PLANNING_STAGES, SPLUMA_DEFAULT_TIMEFRAMES, DEFAULT_DOCUMENT_TYPES } from '../constants';
import type { PlanningApplicationType, PlanningStage, DocumentChecklistItem } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APPLICATION_TYPE_VALUES: PlanningApplicationType[] = [
  'rezoning',
  'consent_use',
  'subdivision',
  'consolidation',
  'site_development_plan',
  'removal_of_restrictive_conditions',
  'township_establishment',
];

/** Arbitrary for generating a valid PlanningApplicationType. */
const arbApplicationType = fc.constantFrom(...APPLICATION_TYPE_VALUES);

/** Creates a test application with minimal valid params. */
function createTestApplication(overrides?: {
  tenantId?: string;
  applicationType?: PlanningApplicationType;
}) {
  return createApplication({
    projectId: 'project-1',
    tenantId: overrides?.tenantId ?? 'tenant-1',
    applicationType: overrides?.applicationType ?? 'rezoning',
    municipalityId: 'muni-1',
    assignedTownPlannerId: 'planner-1',
    propertyDescription: 'Erf 123, Test Township',
    erfNumber: 'ERF-123',
    titleDeedReference: 'T1234/2025',
    applicantName: 'Test Applicant',
    applicantContactDetails: {
      name: 'Test Applicant',
      email: 'test@example.com',
      phone: '011-555-1234',
    },
  });
}

/**
 * Generates the uploaded document checklist items needed to pass the stage gate
 * for a given application at its current stage.
 */
function generateUploadedDocuments(
  applicationId: string,
  applicationType: PlanningApplicationType,
  stage: PlanningStage,
): DocumentChecklistItem[] {
  const requiredDocTypes = DEFAULT_DOCUMENT_TYPES[applicationType]?.[stage] ?? [];
  return requiredDocTypes.map((docType, idx) => ({
    id: `doc-${idx}-${Date.now()}`,
    applicationId,
    documentType: docType,
    description: `Uploaded: ${docType}`,
    required: true,
    stage,
    documentId: `file-${idx}`,
    status: 'uploaded' as const,
  }));
}

// ─── Property 10: Municipality Profile Fallback ──────────────────────────────
// **Validates: Requirements 5.5, 5.2**
//
// For any application where the selected municipality has no configured profile,
// the system must fall back to the SPLUMA default profile and apply national
// timeframes, forms, and process steps.

describe('Property 10: Municipality Profile Fallback', () => {
  beforeEach(() => {
    resetProfileStore();
  });

  it('resolveProfile with a nonexistent ID returns the SPLUMA default profile', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (randomId) => {
        const profile = resolveProfile(randomId);
        expect(profile.id).toBe('spluma_default');
        expect(profile.name).toBe('SPLUMA Default');
        expect(profile.province).toBe('National');
      }),
      { numRuns: 100 },
    );
  });

  it('the default profile has correct SPLUMA timeframes (28, 21, 60 days)', () => {
    const profile = getDefaultProfile();
    const objection = profile.customTimeframes.find(
      (t) => t.deadlineType === 'objection_period',
    );
    const appeal = profile.customTimeframes.find(
      (t) => t.deadlineType === 'appeal_period',
    );
    const decision = profile.customTimeframes.find(
      (t) => t.deadlineType === 'decision_period',
    );

    expect(objection?.defaultDays).toBe(28);
    expect(objection?.municipalityDays).toBe(28);
    expect(appeal?.defaultDays).toBe(21);
    expect(appeal?.municipalityDays).toBe(21);
    expect(decision?.defaultDays).toBe(60);
    expect(decision?.municipalityDays).toBe(60);
  });

  it('getTimeframes falls back to SPLUMA defaults when profile has empty customTimeframes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50, unit: 'grapheme-ascii' }),
        (randomName) => {
          resetProfileStore();

          const profile = createProfile({
            tenantId: 'tenant-1',
            name: `Muni-${randomName}`,
            province: 'GP',
            contactDetails: { name: 'X', email: 'x@x.com', phone: '0' },
            landUseSchemeReference: 'X',
            feeSchedule: [],
            requiredForms: [],
            processVariations: [],
            customTimeframes: [],
          });

          const timeframes = getTimeframes(profile.id);
          expect(timeframes).toHaveLength(3);

          const objection = timeframes.find((t) => t.deadlineType === 'objection_period');
          const appeal = timeframes.find((t) => t.deadlineType === 'appeal_period');
          const decision = timeframes.find((t) => t.deadlineType === 'decision_period');

          expect(objection?.defaultDays).toBe(SPLUMA_DEFAULT_TIMEFRAMES.objectionPeriodDays);
          expect(appeal?.defaultDays).toBe(SPLUMA_DEFAULT_TIMEFRAMES.appealPeriodDays);
          expect(decision?.defaultDays).toBe(SPLUMA_DEFAULT_TIMEFRAMES.decisionPeriodDays);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 1: Sequential Stage Progression ────────────────────────────────
// **Validates: Requirements 2.1**
//
// For any planning application, the lifecycle stages must progress sequentially —
// no stage can be skipped, and the current stage must always be one of the 10
// defined stages in order.

describe('Property 1: Sequential Stage Progression', () => {
  beforeEach(() => {
    resetApplicationStore();
    resetProfileStore();
  });

  it('advanceStage moves from one stage to exactly the next (not skipping any)', () => {
    fc.assert(
      fc.property(arbApplicationType, (applicationType) => {
        resetApplicationStore();

        const app = createTestApplication({ applicationType });
        const initialStage = app.currentStage;
        const initialIndex = getStageIndex(initialStage);
        const expectedNextStage = PLANNING_STAGES[initialIndex + 1]?.id;

        // Provide required documents to pass the gate
        const docs = generateUploadedDocuments(app.id, applicationType, initialStage);
        const transition = advanceStage(app.id, 'user-1', 'Test advance', docs);

        expect(transition.fromStage).toBe(initialStage);
        expect(transition.toStage).toBe(expectedNextStage);

        const updated = getApplication(app.id);
        expect(updated?.currentStage).toBe(expectedNextStage);
      }),
      { numRuns: 100 },
    );
  });

  it('cannot advance past completion', () => {
    const app = createTestApplication({ applicationType: 'rezoning' });

    // Advance through all stages to completion
    for (let i = 0; i < PLANNING_STAGES.length - 1; i++) {
      const current = getApplication(app.id)!;
      const docs = generateUploadedDocuments(app.id, 'rezoning', current.currentStage);
      advanceStage(app.id, 'user-1', `Advance ${i}`, docs);
    }

    // Verify we're at completion
    const completed = getApplication(app.id)!;
    expect(completed.currentStage).toBe('completion');

    // Trying to advance past completion should throw
    expect(() => advanceStage(app.id, 'user-1', 'Past completion', [])).toThrow();
  });

  it('the stage progression follows the exact 10-stage order from constants', () => {
    const app = createTestApplication({ applicationType: 'rezoning' });
    const visitedStages: PlanningStage[] = [app.currentStage];

    for (let i = 0; i < PLANNING_STAGES.length - 1; i++) {
      const current = getApplication(app.id)!;
      const docs = generateUploadedDocuments(app.id, 'rezoning', current.currentStage);
      advanceStage(app.id, 'user-1', `Step ${i}`, docs);
      const updated = getApplication(app.id)!;
      visitedStages.push(updated.currentStage);
    }

    // Should match the exact PLANNING_STAGES order
    const expectedOrder = PLANNING_STAGES.map((s) => s.id);
    expect(visitedStages).toEqual(expectedOrder);
  });
});

// ─── Property 2: Stage Gate Completeness ─────────────────────────────────────
// **Validates: Requirements 2.2, 7.3**
//
// For any stage transition attempt, the transition succeeds if and only if all
// required documents for the current stage are marked as complete. An advance
// request with incomplete requirements must be rejected.

describe('Property 2: Stage Gate Completeness', () => {
  beforeEach(() => {
    resetApplicationStore();
    resetProfileStore();
  });

  it('advanceStage with missing required documents throws an error', () => {
    fc.assert(
      fc.property(arbApplicationType, (applicationType) => {
        resetApplicationStore();

        const app = createTestApplication({ applicationType });
        const stage = app.currentStage;
        const requiredDocTypes = DEFAULT_DOCUMENT_TYPES[applicationType]?.[stage] ?? [];

        if (requiredDocTypes.length > 0) {
          // Provide no documents — should fail
          expect(() => advanceStage(app.id, 'user-1', 'No docs', [])).toThrow(
            /Cannot advance stage/,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it('advanceStage succeeds when all required documents are uploaded', () => {
    fc.assert(
      fc.property(arbApplicationType, (applicationType) => {
        resetApplicationStore();

        const app = createTestApplication({ applicationType });
        const docs = generateUploadedDocuments(app.id, applicationType, app.currentStage);

        // Should not throw
        const transition = advanceStage(app.id, 'user-1', 'All docs present', docs);
        expect(transition.fromStage).toBe('pre_consultation');
        expect(transition.documentsVerified).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('validateStageGate returns canAdvance: false with missing documents', () => {
    fc.assert(
      fc.property(arbApplicationType, (applicationType) => {
        resetApplicationStore();

        const app = createTestApplication({ applicationType });
        const stage = app.currentStage;
        const requiredDocTypes = DEFAULT_DOCUMENT_TYPES[applicationType]?.[stage] ?? [];

        if (requiredDocTypes.length > 0) {
          const result = validateStageGate(app.id, [], []);
          expect(result.canAdvance).toBe(false);
          expect(result.missingDocuments.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('validateStageGate returns canAdvance: true when all documents uploaded', () => {
    fc.assert(
      fc.property(arbApplicationType, (applicationType) => {
        resetApplicationStore();

        const app = createTestApplication({ applicationType });
        const docs = generateUploadedDocuments(app.id, applicationType, app.currentStage);

        const result = validateStageGate(app.id, docs, []);
        expect(result.canAdvance).toBe(true);
        expect(result.missingDocuments).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 14: Reference Number Uniqueness ────────────────────────────────
// **Validates: Requirements 1.4**
//
// For any two planning applications within the same tenant, their reference
// numbers must be distinct.

describe('Property 14: Reference Number Uniqueness', () => {
  beforeEach(() => {
    resetApplicationStore();
  });

  it('creating multiple applications produces unique reference numbers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), (count) => {
        resetApplicationStore();
        const refNumbers = new Set<string>();

        for (let i = 0; i < count; i++) {
          const app = createTestApplication({ tenantId: 'tenant-1' });
          refNumbers.add(app.referenceNumber);
        }

        // All reference numbers should be distinct
        expect(refNumbers.size).toBe(count);
      }),
      { numRuns: 100 },
    );
  });

  it('reference numbers follow the TP-{YEAR}-{SEQ} format', () => {
    fc.assert(
      fc.property(arbApplicationType, (applicationType) => {
        resetApplicationStore();

        const app = createTestApplication({ applicationType });
        const year = new Date().getFullYear();
        const pattern = new RegExp(`^TP-${year}-\\d{3}$`);
        expect(app.referenceNumber).toMatch(pattern);
      }),
      { numRuns: 100 },
    );
  });

  it('sequential creation increments the sequence correctly', () => {
    const year = new Date().getFullYear();

    const app1 = createTestApplication();
    const app2 = createTestApplication();
    const app3 = createTestApplication();

    expect(app1.referenceNumber).toBe(`TP-${year}-001`);
    expect(app2.referenceNumber).toBe(`TP-${year}-002`);
    expect(app3.referenceNumber).toBe(`TP-${year}-003`);
  });
});
