// @vitest-environment node
/**
 * Property-based tests — ITP Compliance Score, Threshold Crossing, and ITP Completion
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 17: Compliance score calculation
 *   Validates: Requirements 8.2
 *   For any project with P passed inspections, T passed material tests,
 *   RI total required inspections, and RT total required material tests:
 *   if (RI + RT) = 0 then score = 100%; otherwise
 *   score = ((P + T) / (RI + RT)) × 100 rounded to 1 decimal place.
 *
 * Property 18: Compliance score threshold crossing emits risk signal
 *   Validates: Requirements 8.3
 *   For any compliance score recalculation where the previous score was ≥ 80%
 *   and the new score is < 80%, the service shall emit a ProjectRiskSignal with
 *   category 'delay' and severity 'high'; for all other (previous, new)
 *   combinations, no signal shall be emitted.
 *
 * Property 19: ITP completion when all items in terminal pass state
 *   Validates: Requirements 8.4
 *   For any approved ITP where every inspection item has status 'passed' or
 *   'conditional_accepted' (defined as having a non-empty conditionsClosedAt),
 *   the ITP status shall transition to 'completed' with a recorded completion
 *   timestamp.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { vi } from 'vitest';
import fc from 'fast-check';

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user' } },
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', READ: 'READ', UPDATE: 'UPDATE', DELETE: 'DELETE', LIST: 'LIST', UPLOAD: 'UPLOAD', GET: 'GET', WRITE: 'WRITE' },
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: vi.fn(),
  getDemoCol: vi.fn(),
  useDemoMode: vi.fn(() => false),
}));

import { computeComplianceScore, evaluateITPCompletion } from '@/services/itpService';
import { emitComplianceRiskSignal, mapITPToProjectRecord } from '@/services/itpPassportAdapter';
import type { ITP, ITPInspectionItem, ITPStatus, InspectionItemStatus, ConstructionStage } from '@/types';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for non-negative integers representing passed/total counts. */
const arbNonNegInt = fc.nat({ max: 500 });

/**
 * Generates (passed, total) pairs where passed ≤ total.
 * This models valid inspection/test counts.
 */
const arbPassedAndTotal = fc.tuple(arbNonNegInt, arbNonNegInt).map(([a, b]) => {
  const total = Math.max(a, b);
  const passed = Math.min(a, b);
  return { passed, total };
});

/** Arbitrary for a compliance score percentage [0, 100]. */
const arbScorePercent = fc.double({ min: 0, max: 100, noNaN: true });

/** Arbitrary for a score that is ≥ 80 (at or above threshold). */
const arbScoreAtOrAboveThreshold = fc.double({ min: 80, max: 100, noNaN: true });

/** Arbitrary for a score that is < 80 (below threshold). */
const arbScoreBelowThreshold = fc.double({ min: 0, max: 79.9, noNaN: true });

/** Arbitrary for a project ID. */
const arbProjectId = fc.uuid();

/** Arbitrary for valid ITP statuses eligible for completion. */
const arbEligibleITPStatus: fc.Arbitrary<ITPStatus> = fc.constantFrom('approved', 'in_progress');

/** Arbitrary for ITP statuses NOT eligible for completion. */
const arbNonEligibleITPStatus: fc.Arbitrary<ITPStatus> = fc.constantFrom(
  'draft',
  'completed',
  'superseded',
  'deleted',
);

/** Terminal pass statuses for inspection items. */
const arbTerminalPassStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(
  'passed',
  'conditional_accepted',
);

/** Non-terminal statuses (items that block ITP completion). */
const arbNonTerminalStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(
  'pending',
  'in_progress',
  'failed',
  'conditional',
  'ncr_resolved',
  'review_required',
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a minimal ITP object for testing.
 */
function buildITP(overrides: Partial<ITP> = {}): ITP {
  return {
    id: 'itp-001',
    projectId: 'project-001',
    title: 'Test ITP',
    description: 'Test ITP for property testing',
    constructionStage: 'foundations',
    revisionNumber: 1,
    status: 'in_progress',
    createdBy: 'user-001',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    isDeleted: false,
    ...overrides,
  };
}

/**
 * Builds a minimal inspection item for testing.
 */
function buildItem(
  status: InspectionItemStatus,
  seq: number,
  conditionsClosedAt?: string,
): ITPInspectionItem {
  return {
    id: `item-${seq}`,
    itpId: 'itp-001',
    projectId: 'project-001',
    sequenceNumber: seq,
    title: `Inspection Item ${seq}`,
    description: `Description for item ${seq}`,
    inspectionType: 'hold_point',
    acceptanceCriteria: 'Must conform to spec',
    responsibleInspectorRole: 'engineer',
    specificationReference: 'SANS 10400 clause 4.2.1',
    linkedMaterialTestIds: [],
    status,
    conditionsClosedAt,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 17: Compliance score calculation
// Validates: Requirements 8.2
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 17: Compliance score calculation', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * When both total required inspections and total required material tests are 0,
   * the compliance score shall be 100%.
   */
  it('returns 100% when denominator is 0 (no required inspections or tests)', () => {
    fc.assert(
      fc.property(
        arbNonNegInt,
        arbNonNegInt,
        (P, T) => {
          const score = computeComplianceScore(P, T, 0, 0);
          expect(score).toBe(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.2**
   *
   * For any valid (P, T, RI, RT) where RI + RT > 0:
   * score = ((P + T) / (RI + RT)) × 100 rounded to 1 decimal place.
   */
  it('computes score as ((P + T) / (RI + RT)) × 100 rounded to 1 decimal place', () => {
    fc.assert(
      fc.property(
        arbPassedAndTotal,
        arbPassedAndTotal,
        (inspections, tests) => {
          const P = inspections.passed;
          const RI = inspections.total;
          const T = tests.passed;
          const RT = tests.total;

          // Skip the trivial case where denominator is 0
          if (RI + RT === 0) return;

          const score = computeComplianceScore(P, T, RI, RT);

          // Compute expected value manually
          const expected = Math.round(((P + T) / (RI + RT)) * 1000) / 10;

          expect(score).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.2**
   *
   * The score shall always be between 0% and a maximum value that is
   * ((P + T) / (RI + RT)) × 100. Since P ≤ RI and T ≤ RT in normal operation,
   * score ≤ 100; but even with P > RI (edge case), score is still a valid number.
   */
  it('score is always a finite non-negative number', () => {
    fc.assert(
      fc.property(
        arbNonNegInt,
        arbNonNegInt,
        arbNonNegInt,
        arbNonNegInt,
        (P, T, RI, RT) => {
          const score = computeComplianceScore(P, T, RI, RT);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(score)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.2**
   *
   * When all required items are passed (P === RI and T === RT), score === 100%.
   */
  it('returns exactly 100% when all items are passed', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }).filter((n) => n > 0),
        fc.nat({ max: 100 }),
        (RI, RT) => {
          const score = computeComplianceScore(RI, RT, RI, RT);
          expect(score).toBe(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.2**
   *
   * When no items are passed (P === 0 and T === 0) but there are required items,
   * score === 0%.
   */
  it('returns 0% when no items are passed but requirements exist', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 200 }).filter((n) => n > 0),
        fc.nat({ max: 200 }),
        (RI, RT) => {
          // Ensure at least one required item
          if (RI + RT === 0) return;
          const score = computeComplianceScore(0, 0, RI, RT);
          expect(score).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 18: Compliance score threshold crossing emits risk signal
// Validates: Requirements 8.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 18: Compliance score threshold crossing emits risk signal', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * When the previous score was ≥ 80% and the new score is < 80%,
   * a ProjectRiskSignal shall be emitted with category 'delay' and severity 'high'.
   */
  it('emits risk signal when score crosses below 80% threshold', () => {
    fc.assert(
      fc.property(
        arbProjectId,
        arbScoreAtOrAboveThreshold,
        arbScoreBelowThreshold,
        (projectId, previousScore, newScore) => {
          const signal = emitComplianceRiskSignal(projectId, newScore, previousScore);

          expect(signal).not.toBeNull();
          expect(signal!.category).toBe('delay');
          expect(signal!.severity).toBe('high');
          expect(signal!.sourceModule).toBe('site');
          expect(signal!.title).toContain('80%');
          expect(signal!.detail).toContain(String(newScore));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * When both previous and new scores are ≥ 80%, no signal shall be emitted.
   */
  it('does not emit signal when both scores are at or above 80%', () => {
    fc.assert(
      fc.property(
        arbProjectId,
        arbScoreAtOrAboveThreshold,
        arbScoreAtOrAboveThreshold,
        (projectId, previousScore, newScore) => {
          const signal = emitComplianceRiskSignal(projectId, newScore, previousScore);
          expect(signal).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * When both previous and new scores are < 80%, no signal shall be emitted
   * (the crossing has already occurred).
   */
  it('does not emit signal when both scores are below 80%', () => {
    fc.assert(
      fc.property(
        arbProjectId,
        arbScoreBelowThreshold,
        arbScoreBelowThreshold,
        (projectId, previousScore, newScore) => {
          const signal = emitComplianceRiskSignal(projectId, newScore, previousScore);
          expect(signal).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * When previous score was < 80% and new score is ≥ 80% (recovery),
   * no signal shall be emitted.
   */
  it('does not emit signal when score recovers from below to above 80%', () => {
    fc.assert(
      fc.property(
        arbProjectId,
        arbScoreBelowThreshold,
        arbScoreAtOrAboveThreshold,
        (projectId, previousScore, newScore) => {
          const signal = emitComplianceRiskSignal(projectId, newScore, previousScore);
          expect(signal).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * Boundary case: previous score exactly 80% and new score < 80%
   * shall emit a signal (80% is "at or above").
   */
  it('emits signal when previous is exactly 80% and new is below', () => {
    fc.assert(
      fc.property(
        arbProjectId,
        arbScoreBelowThreshold,
        (projectId, newScore) => {
          const signal = emitComplianceRiskSignal(projectId, newScore, 80);

          expect(signal).not.toBeNull();
          expect(signal!.category).toBe('delay');
          expect(signal!.severity).toBe('high');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * Boundary case: new score exactly 80% and previous ≥ 80%
   * shall NOT emit a signal (80% is not < 80%).
   */
  it('does not emit signal when new score is exactly 80%', () => {
    fc.assert(
      fc.property(
        arbProjectId,
        arbScoreAtOrAboveThreshold,
        (projectId, previousScore) => {
          const signal = emitComplianceRiskSignal(projectId, 80, previousScore);
          expect(signal).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 19: ITP completion when all items in terminal pass state
// Validates: Requirements 8.4
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 19: ITP completion when all items in terminal pass state', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * For any approved/in_progress ITP where every item is 'passed' or
   * 'conditional_accepted', evaluateITPCompletion returns shouldComplete=true
   * with a completion timestamp.
   */
  it('returns shouldComplete=true when all items are in terminal pass state', () => {
    fc.assert(
      fc.property(
        arbEligibleITPStatus,
        fc.array(arbTerminalPassStatus, { minLength: 1, maxLength: 20 }),
        (itpStatus, itemStatuses) => {
          const itp = buildITP({ status: itpStatus });
          const items = itemStatuses.map((status, idx) => {
            const conditionsClosedAt =
              status === 'conditional_accepted' ? '2025-02-01T00:00:00.000Z' : undefined;
            return buildItem(status, idx + 1, conditionsClosedAt);
          });

          const result = evaluateITPCompletion(itp, items);

          expect(result.shouldComplete).toBe(true);
          expect(result.completedAt).toBeDefined();
          expect(typeof result.completedAt).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * For any ITP where at least one item is NOT in a terminal pass state,
   * evaluateITPCompletion returns shouldComplete=false.
   */
  it('returns shouldComplete=false when any item is not in terminal pass state', () => {
    fc.assert(
      fc.property(
        arbEligibleITPStatus,
        fc.array(arbTerminalPassStatus, { minLength: 0, maxLength: 10 }),
        arbNonTerminalStatus,
        fc.array(arbTerminalPassStatus, { minLength: 0, maxLength: 10 }),
        (itpStatus, passBefore, failingStatus, passAfter) => {
          const itp = buildITP({ status: itpStatus });
          const allStatuses = [...passBefore, failingStatus, ...passAfter];
          const items = allStatuses.map((status, idx) => {
            const conditionsClosedAt =
              status === 'conditional_accepted' ? '2025-02-01T00:00:00.000Z' : undefined;
            return buildItem(status, idx + 1, conditionsClosedAt);
          });

          const result = evaluateITPCompletion(itp, items);

          expect(result.shouldComplete).toBe(false);
          expect(result.completedAt).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * For any ITP with a non-eligible status (draft, completed, superseded, deleted),
   * evaluateITPCompletion returns shouldComplete=false regardless of item states.
   */
  it('returns shouldComplete=false for non-eligible ITP statuses', () => {
    fc.assert(
      fc.property(
        arbNonEligibleITPStatus,
        fc.array(arbTerminalPassStatus, { minLength: 1, maxLength: 10 }),
        (itpStatus, itemStatuses) => {
          const itp = buildITP({ status: itpStatus });
          const items = itemStatuses.map((status, idx) => {
            const conditionsClosedAt =
              status === 'conditional_accepted' ? '2025-02-01T00:00:00.000Z' : undefined;
            return buildItem(status, idx + 1, conditionsClosedAt);
          });

          const result = evaluateITPCompletion(itp, items);

          expect(result.shouldComplete).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * An eligible ITP with zero items shall not be marked as completed
   * (there must be at least one item in terminal pass state).
   */
  it('returns shouldComplete=false when ITP has no items', () => {
    fc.assert(
      fc.property(
        arbEligibleITPStatus,
        (itpStatus) => {
          const itp = buildITP({ status: itpStatus });
          const items: ITPInspectionItem[] = [];

          const result = evaluateITPCompletion(itp, items);

          expect(result.shouldComplete).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * Items with status 'conditional' that have a conditionsClosedAt timestamp
   * are treated as terminal pass (conditional_accepted equivalent).
   */
  it('treats conditional items with conditionsClosedAt as terminal pass', () => {
    fc.assert(
      fc.property(
        arbEligibleITPStatus,
        fc.nat({ max: 10 }).filter((n) => n > 0),
        (itpStatus, itemCount) => {
          const itp = buildITP({ status: itpStatus });
          // Mix of 'passed' and 'conditional' items with conditionsClosedAt
          const items = Array.from({ length: itemCount }, (_, idx) => {
            if (idx % 2 === 0) {
              return buildItem('passed', idx + 1);
            }
            return buildItem('conditional', idx + 1, '2025-02-15T10:00:00.000Z');
          });

          const result = evaluateITPCompletion(itp, items);

          expect(result.shouldComplete).toBe(true);
          expect(result.completedAt).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * The completion timestamp is a valid ISO string.
   */
  it('provides a valid ISO timestamp when completing', () => {
    fc.assert(
      fc.property(
        arbEligibleITPStatus,
        fc.nat({ max: 5 }).filter((n) => n > 0),
        (itpStatus, itemCount) => {
          const itp = buildITP({ status: itpStatus });
          const items = Array.from({ length: itemCount }, (_, idx) =>
            buildItem('passed', idx + 1),
          );

          const result = evaluateITPCompletion(itp, items);

          expect(result.shouldComplete).toBe(true);
          expect(result.completedAt).toBeDefined();
          // Verify it's a valid ISO string
          const parsed = new Date(result.completedAt!);
          expect(parsed.toISOString()).toBe(result.completedAt);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// Property 20: ITP-to-ProjectRecord status mapping
// Validates: Requirements 8.5
// ══════════════════════════════════════════════════════════════════════════════

/** Arbitrary for ITPStatus values. */
const arbITPStatus: fc.Arbitrary<ITPStatus> = fc.constantFrom(
  'draft',
  'approved',
  'in_progress',
  'completed',
  'superseded',
  'deleted',
);

/** Arbitrary for construction stages. */
const arbConstructionStage: fc.Arbitrary<ConstructionStage> = fc.constantFrom(
  'site_establishment',
  'earthworks',
  'foundations',
  'substructure',
  'superstructure',
  'roof',
  'external_envelope',
  'internal_finishes',
  'mechanical_electrical',
  'external_works',
  'commissioning',
);

/** Generates a random ITP object with a specific status. */
const arbITP = (status?: ITPStatus) =>
  fc.record({
    id: fc.uuid(),
    projectId: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 200 }),
    description: fc.string({ maxLength: 2000 }),
    constructionStage: arbConstructionStage,
    revisionNumber: fc.nat({ max: 50 }).map((n) => n + 1),
    status: status ? fc.constant(status) : arbITPStatus,
    createdBy: fc.uuid(),
    approvedBy: fc.option(fc.uuid(), { nil: undefined }),
    approvedAt: fc.option(fc.constant('2025-06-01T10:00:00.000Z'), { nil: undefined }),
    previousRevisionId: fc.option(fc.uuid(), { nil: undefined }),
    nextRevisionId: fc.option(fc.uuid(), { nil: undefined }),
    completedAt: fc.option(fc.constant('2025-06-15T10:00:00.000Z'), { nil: undefined }),
    createdAt: fc.constant('2025-01-01T00:00:00.000Z'),
    updatedAt: fc.constant('2025-01-15T00:00:00.000Z'),
    isDeleted: fc.constant(false),
  }) as fc.Arbitrary<ITP>;

describe('Feature: qaqc-inspection-test-plans, Property 20: ITP-to-ProjectRecord status mapping', () => {
  /**
   * **Validates: Requirements 8.5**
   *
   * For any ITP, the mapped ProjectRecord shall have recordType 'inspection_test_plan'.
   */
  it('always maps recordType to inspection_test_plan', () => {
    fc.assert(
      fc.property(
        arbITP(),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.recordType).toBe('inspection_test_plan');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * For any ITP, the mapped ProjectRecord shall have phase 'construction_execution'.
   */
  it('always maps phase to construction_execution', () => {
    fc.assert(
      fc.property(
        arbITP(),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.phase).toBe('construction_execution');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * draft ITP status maps to 'draft' RecordStatus.
   */
  it('maps draft ITP status to draft RecordStatus', () => {
    fc.assert(
      fc.property(
        arbITP('draft'),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.status).toBe('draft');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * approved ITP status maps to 'approved' RecordStatus.
   */
  it('maps approved ITP status to approved RecordStatus', () => {
    fc.assert(
      fc.property(
        arbITP('approved'),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.status).toBe('approved');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * in_progress ITP status maps to 'issued' RecordStatus.
   */
  it('maps in_progress ITP status to issued RecordStatus', () => {
    fc.assert(
      fc.property(
        arbITP('in_progress'),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.status).toBe('issued');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * completed ITP status maps to 'approved' RecordStatus.
   */
  it('maps completed ITP status to approved RecordStatus', () => {
    fc.assert(
      fc.property(
        arbITP('completed'),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.status).toBe('approved');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * superseded ITP status maps to 'superseded' RecordStatus.
   */
  it('maps superseded ITP status to superseded RecordStatus', () => {
    fc.assert(
      fc.property(
        arbITP('superseded'),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.status).toBe('superseded');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * For any ITP with any valid status, the complete status mapping holds:
   * draft→draft, approved→approved, in_progress→issued, completed→approved, superseded→superseded.
   */
  it('correctly maps all ITP statuses to expected RecordStatus values', () => {
    const expectedMapping: Record<ITPStatus, string> = {
      draft: 'draft',
      approved: 'approved',
      in_progress: 'issued',
      completed: 'approved',
      superseded: 'superseded',
      deleted: 'draft',
    };

    fc.assert(
      fc.property(
        arbITP(),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.status).toBe(expectedMapping[itp.status]);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * The mapped ProjectRecord preserves the ITP's id, projectId, and title.
   */
  it('preserves ITP id, projectId, and title in the ProjectRecord', () => {
    fc.assert(
      fc.property(
        arbITP(),
        (itp) => {
          const record = mapITPToProjectRecord(itp);
          expect(record.id).toBe(itp.id);
          expect(record.projectId).toBe(itp.projectId);
          expect(record.title).toBe(itp.title);
        },
      ),
      { numRuns: 100 },
    );
  });
});
