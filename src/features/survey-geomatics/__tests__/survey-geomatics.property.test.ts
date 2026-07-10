// @vitest-environment node
// Feature: p1-platform-extensions, Properties 19-21: Survey & Geomatics
//
// Property 19: Survey Instruction Stage Transitions — Validates: Requirements 16.2, 16.7
// Property 20: SG Diagram Stage Transitions — Validates: Requirements 17.2
// Property 21: As-Built Deviation and Compliance — Validates: Requirements 19.3, 19.4
import * as fc from 'fast-check';

import { createSurveyEngineService } from '../services/surveyEngineService';
import { createSGTrackerService } from '../services/sgTrackerService';
import { createAsBuiltComparatorService } from '../services/asBuiltComparatorService';
import { createWorkingDayCalculator } from '../../p1-shared/services/workingDayCalculator';

import type { SurveyType, SurveyInstructionStage, SGDiagramStage } from '../types';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Ordered stages for survey instructions. */
const INSTRUCTION_STAGE_ORDER: SurveyInstructionStage[] = [
  'drafted',
  'issued',
  'accepted',
  'fieldwork_in_progress',
  'office_processing',
  'submitted_to_sg',
  'completed',
];

/** Survey types that may bypass submitted_to_sg. */
const SG_BYPASS_TYPES: SurveyType[] = ['topographic_survey', 'as_built_survey'];

/** All survey types. */
const ALL_SURVEY_TYPES: SurveyType[] = [
  'boundary_determination',
  'topographic_survey',
  'as_built_survey',
  'sectional_title_survey',
  'subdivision_survey',
  'consolidation_survey',
  'general_purposes_diagram',
];

/** Sequential SG diagram stages (excluding queries loop & terminal states). */
const SG_SEQUENTIAL_STAGES: SGDiagramStage[] = [
  'prepared',
  'checked',
  'lodged',
  'examination_in_progress',
  'approved',
  'registered',
];

/** Stages that allow withdrawal (before approved). */
const SG_WITHDRAWABLE_STAGES: SGDiagramStage[] = [
  'prepared',
  'checked',
  'lodged',
  'examination_in_progress',
  'queries_raised',
  'queries_resolved',
];

/** Non-withdrawable stages. */
const SG_NON_WITHDRAWABLE_STAGES: SGDiagramStage[] = ['approved', 'registered'];

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a survey type. */
const surveyTypeArb: fc.Arbitrary<SurveyType> = fc.constantFrom(...ALL_SURVEY_TYPES);

/** Generate the stage index in the sequential flow to start from (0=drafted through 5=submitted_to_sg). */
const stageIndexArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 5 });

/** Generate an SG withdrawable stage. */
const sgWithdrawableStageArb: fc.Arbitrary<SGDiagramStage> = fc.constantFrom(...SG_WITHDRAWABLE_STAGES);

/** Generate an SG non-withdrawable stage. */
const sgNonWithdrawableStageArb: fc.Arbitrary<SGDiagramStage> = fc.constantFrom(...SG_NON_WITHDRAWABLE_STAGES);

/** Generate measurement values: approved dimension (0.001–99999.999). */
const approvedDimensionArb: fc.Arbitrary<number> = fc
  .integer({ min: 1, max: 99999999 })
  .map((n) => Math.round(n * 0.001 * 1000) / 1000);

/** Generate measurement values: as-built dimension (0.001–99999.999). */
const asBuiltDimensionArb: fc.Arbitrary<number> = fc
  .integer({ min: 1, max: 99999999 })
  .map((n) => Math.round(n * 0.001 * 1000) / 1000);

/** Generate tolerance threshold (0.001–1.000). */
const toleranceArb: fc.Arbitrary<number> = fc
  .integer({ min: 1, max: 1000 })
  .map((n) => n / 1000);

/** Generate a measurement triplet: [approved, asBuilt, tolerance]. */
const measurementTripletArb: fc.Arbitrary<{ approved: number; asBuilt: number; tolerance: number }> =
  fc.record({
    approved: approvedDimensionArb,
    asBuilt: asBuiltDimensionArb,
    tolerance: toleranceArb,
  });

/** Generate a list of measurement triplets (1–50 items). */
const measurementListArb: fc.Arbitrary<{ approved: number; asBuilt: number; tolerance: number }[]> =
  fc.array(measurementTripletArb, { minLength: 1, maxLength: 50 });

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Create a valid survey instruction input. */
function makeInstructionInput(surveyType: SurveyType) {
  return {
    surveyType,
    propertyDescription: 'Test property',
    scopeOfWork: 'Test scope of work',
    appointedSurveyorName: 'J. Smith',
    appointedSurveyorPLATO: 'PL12345',
    requiredCompletionDate: '2026-06-01',
    linkedDocuments: [],
  };
}

/** Create a valid SG diagram input. */
function makeDiagramInput(ref: string) {
  return {
    diagramReference: ref,
    diagramType: 'general_plan' as const,
    linkedSurveyInstructionId: 'si_001',
    propertyDescription: 'Test property',
    lodgementDate: '2024-06-01',
    lodgementOffice: 'Cape Town' as const,
    surveyorName: 'J. Smith',
    surveyorPLATO: 'PL12345',
    expectedProcessingDays: 60,
  };
}

/** Advance a survey instruction sequentially to a given stage index. */
function advanceInstructionToStage(
  service: ReturnType<typeof createSurveyEngineService>,
  projectId: string,
  instructionId: string,
  targetStageIndex: number,
): void {
  // Stage 0 is 'drafted' (creation state), stage 1 is 'issued' (via issueInstruction)
  if (targetStageIndex >= 1) {
    service.issueInstruction(projectId, instructionId, 'actor-1');
  }
  // Stages 2+ are reached via transitionStage
  for (let i = 2; i <= targetStageIndex; i++) {
    service.transitionStage(projectId, instructionId, INSTRUCTION_STAGE_ORDER[i], 'actor-1');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 19: Survey Instruction Stage Transitions
// **Validates: Requirements 16.2, 16.7**
//
// For any instruction of type T in stage S, only the next sequential stage is
// permitted. The "submitted_to_sg" stage may be bypassed
// (office_processing→completed) iff T is "topographic_survey" or
// "as_built_survey". All other bypass attempts are rejected.
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 19: Survey Instruction Stage Transitions', () => {
  it('next sequential stage is always permitted from any non-terminal stage', () => {
    fc.assert(
      fc.property(surveyTypeArb, stageIndexArb, (surveyType, currentStageIdx) => {
        const service = createSurveyEngineService({
          now: (() => {
            let counter = 0;
            return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
          })(),
        });

        const projectId = 'proj-p19-seq';
        const input = makeInstructionInput(surveyType);
        const instruction = service.createInstruction(projectId, input, 'actor-1');

        // Advance to currentStageIdx
        advanceInstructionToStage(service, projectId, instruction.id, currentStageIdx);

        // The next sequential transition should succeed
        const nextIndex = currentStageIdx + 1;
        if (nextIndex < INSTRUCTION_STAGE_ORDER.length) {
          const result = service.transitionStage(
            projectId,
            instruction.id,
            INSTRUCTION_STAGE_ORDER[nextIndex],
            'actor-1',
          );
          expect(result.currentStage).toBe(INSTRUCTION_STAGE_ORDER[nextIndex]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('SG bypass (office_processing→completed) is allowed only for topographic_survey and as_built_survey', () => {
    fc.assert(
      fc.property(surveyTypeArb, (surveyType) => {
        const service = createSurveyEngineService({
          now: (() => {
            let counter = 0;
            return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
          })(),
        });

        const projectId = 'proj-p19-bypass';
        const input = makeInstructionInput(surveyType);
        const instruction = service.createInstruction(projectId, input, 'actor-1');

        // Advance to office_processing (index 4)
        advanceInstructionToStage(service, projectId, instruction.id, 4);

        const canBypass = SG_BYPASS_TYPES.includes(surveyType);

        if (canBypass) {
          // Should succeed: office_processing → completed (skipping submitted_to_sg)
          const result = service.transitionStage(
            projectId,
            instruction.id,
            'completed',
            'actor-1',
          );
          expect(result.currentStage).toBe('completed');
        } else {
          // Should be rejected
          expect(() =>
            service.transitionStage(projectId, instruction.id, 'completed', 'actor-1'),
          ).toThrow();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('non-sequential transitions (skipping stages) are rejected for non-bypass types', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'boundary_determination',
          'sectional_title_survey',
          'subdivision_survey',
          'consolidation_survey',
          'general_purposes_diagram',
        ) as fc.Arbitrary<SurveyType>,
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 2, max: 6 }),
        (surveyType, currentStageIdx, skipAhead) => {
          // Ensure skipAhead is at least 2 stages beyond current (skipping at least 1)
          const targetIdx = currentStageIdx + skipAhead;
          if (targetIdx >= INSTRUCTION_STAGE_ORDER.length) return;
          // Exclude the bypass case (office_processing→completed is only for bypass types)
          if (currentStageIdx === 4 && targetIdx === 6) return;

          const service = createSurveyEngineService({
            now: (() => {
              let counter = 0;
              return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
            })(),
          });

          const projectId = 'proj-p19-skip';
          const input = makeInstructionInput(surveyType);
          const instruction = service.createInstruction(projectId, input, 'actor-1');

          advanceInstructionToStage(service, projectId, instruction.id, currentStageIdx);

          expect(() =>
            service.transitionStage(
              projectId,
              instruction.id,
              INSTRUCTION_STAGE_ORDER[targetIdx],
              'actor-1',
            ),
          ).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 20: SG Diagram Stage Transitions
// **Validates: Requirements 17.2**
//
// Sequential progression (prepared→checked→lodged→examination_in_progress
//   →approved→registered),
// queries loop (examination_in_progress↔queries_raised→queries_resolved
//   →examination_in_progress),
// and withdrawal from any stage before "approved".
// Approved/registered cannot be withdrawn.
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 20: SG Diagram Stage Transitions', () => {
  it('sequential progression is valid through the main path', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }), // start sequential index (prepared=0 through approved=4)
        async (startIdx) => {
          const wdc = createWorkingDayCalculator();
          const service = createSGTrackerService({
            workingDayCalculator: wdc,
            now: (() => {
              let counter = 0;
              return () => new Date(2024, 0, 1, 0, 0, counter++);
            })(),
          });

          const projectId = 'proj-p20-seq';
          const ref = `REF-${startIdx}-${Math.random().toString(36).slice(2, 6)}`;

          let current = await service.registerDiagram(projectId, makeDiagramInput(ref), 'actor-1');

          // Advance sequentially to startIdx
          for (let i = 1; i <= startIdx; i++) {
            const data = SG_SEQUENTIAL_STAGES[i] === 'approved'
              ? { approvalDate: '2024-07-01', sgApprovalNumber: 'SG-001' }
              : undefined;
            current = await service.transitionStage(
              projectId,
              current.id,
              SG_SEQUENTIAL_STAGES[i],
              data,
              'actor-1',
            );
          }

          // Now advance one more step (should succeed)
          const nextIdx = startIdx + 1;
          if (nextIdx < SG_SEQUENTIAL_STAGES.length) {
            const data = SG_SEQUENTIAL_STAGES[nextIdx] === 'approved'
              ? { approvalDate: '2024-07-01', sgApprovalNumber: 'SG-001' }
              : undefined;
            const result = await service.transitionStage(
              projectId,
              current.id,
              SG_SEQUENTIAL_STAGES[nextIdx],
              data,
              'actor-1',
            );
            expect(result.currentStage).toBe(SG_SEQUENTIAL_STAGES[nextIdx]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('queries loop: examination_in_progress→queries_raised→queries_resolved→examination_in_progress', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // number of query loops
        async (loopCount) => {
          const wdc = createWorkingDayCalculator();
          const service = createSGTrackerService({
            workingDayCalculator: wdc,
            now: (() => {
              let counter = 0;
              return () => new Date(2024, 0, 1, 0, 0, counter++);
            })(),
          });

          const projectId = 'proj-p20-query';
          const ref = `QRY-${loopCount}-${Math.random().toString(36).slice(2, 6)}`;
          let current = await service.registerDiagram(projectId, makeDiagramInput(ref), 'actor-1');

          // Advance to examination_in_progress
          current = await service.transitionStage(projectId, current.id, 'checked', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'lodged', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'examination_in_progress', undefined, 'actor-1');

          // Execute query loops
          for (let i = 0; i < loopCount; i++) {
            current = await service.transitionStage(
              projectId,
              current.id,
              'queries_raised',
              { queryDetails: `Query batch ${i + 1}` },
              'actor-1',
            );
            expect(current.currentStage).toBe('queries_raised');

            current = await service.transitionStage(
              projectId,
              current.id,
              'queries_resolved',
              undefined,
              'actor-1',
            );
            expect(current.currentStage).toBe('queries_resolved');

            current = await service.transitionStage(
              projectId,
              current.id,
              'examination_in_progress',
              undefined,
              'actor-1',
            );
            expect(current.currentStage).toBe('examination_in_progress');
          }

          // After loops, can still proceed to approved
          current = await service.transitionStage(
            projectId,
            current.id,
            'approved',
            { approvalDate: '2024-08-01', sgApprovalNumber: 'SG-LOOP' },
            'actor-1',
          );
          expect(current.currentStage).toBe('approved');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('withdrawal is permitted from any stage before approved', async () => {
    await fc.assert(
      fc.asyncProperty(sgWithdrawableStageArb, async (targetStage) => {
        const wdc = createWorkingDayCalculator();
        const service = createSGTrackerService({
          workingDayCalculator: wdc,
          now: (() => {
            let counter = 0;
            return () => new Date(2024, 0, 1, 0, 0, counter++);
          })(),
        });

        const projectId = 'proj-p20-withdraw';
        const ref = `WD-${targetStage}-${Math.random().toString(36).slice(2, 6)}`;
        let current = await service.registerDiagram(projectId, makeDiagramInput(ref), 'actor-1');

        // Advance to the target stage
        if (targetStage === 'prepared') {
          // Already there
        } else if (targetStage === 'checked') {
          current = await service.transitionStage(projectId, current.id, 'checked', undefined, 'actor-1');
        } else if (targetStage === 'lodged') {
          current = await service.transitionStage(projectId, current.id, 'checked', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'lodged', undefined, 'actor-1');
        } else if (targetStage === 'examination_in_progress') {
          current = await service.transitionStage(projectId, current.id, 'checked', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'lodged', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'examination_in_progress', undefined, 'actor-1');
        } else if (targetStage === 'queries_raised') {
          current = await service.transitionStage(projectId, current.id, 'checked', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'lodged', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'examination_in_progress', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'queries_raised', { queryDetails: 'Test query' }, 'actor-1');
        } else if (targetStage === 'queries_resolved') {
          current = await service.transitionStage(projectId, current.id, 'checked', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'lodged', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'examination_in_progress', undefined, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'queries_raised', { queryDetails: 'Test query' }, 'actor-1');
          current = await service.transitionStage(projectId, current.id, 'queries_resolved', undefined, 'actor-1');
        }

        // Withdrawal should succeed
        const withdrawn = await service.withdrawDiagram(projectId, current.id, 'Test reason', 'actor-1');
        expect(withdrawn.currentStage).toBe('withdrawn');
        expect(withdrawn.withdrawalReason).toBe('Test reason');
      }),
      { numRuns: 100 },
    );
  });

  it('withdrawal is rejected from approved and registered stages', async () => {
    await fc.assert(
      fc.asyncProperty(sgNonWithdrawableStageArb, async (targetStage) => {
        const wdc = createWorkingDayCalculator();
        const service = createSGTrackerService({
          workingDayCalculator: wdc,
          now: (() => {
            let counter = 0;
            return () => new Date(2024, 0, 1, 0, 0, counter++);
          })(),
        });

        const projectId = 'proj-p20-nwd';
        const ref = `NWD-${targetStage}-${Math.random().toString(36).slice(2, 6)}`;
        let current = await service.registerDiagram(projectId, makeDiagramInput(ref), 'actor-1');

        // Advance to approved
        current = await service.transitionStage(projectId, current.id, 'checked', undefined, 'actor-1');
        current = await service.transitionStage(projectId, current.id, 'lodged', undefined, 'actor-1');
        current = await service.transitionStage(projectId, current.id, 'examination_in_progress', undefined, 'actor-1');
        current = await service.transitionStage(projectId, current.id, 'approved', { approvalDate: '2024-07-01', sgApprovalNumber: 'SG-X' }, 'actor-1');

        if (targetStage === 'registered') {
          current = await service.transitionStage(projectId, current.id, 'registered', undefined, 'actor-1');
        }

        // Withdrawal should be rejected
        await expect(
          service.withdrawDiagram(projectId, current.id, 'Attempted withdrawal', 'actor-1'),
        ).rejects.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 21: As-Built Deviation and Compliance
// **Validates: Requirements 19.3, 19.4**
//
// For any measurement pair with approved A, as-built B, and tolerance T:
//   deviation = B - A
//   absoluteDeviation = |B - A|
//   isWithinTolerance iff |B - A| <= T
// Compliance percentage = (count within / total * 100) to 1 dp, or 0.0% when N=0.
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 21: As-Built Deviation and Compliance', () => {
  it('deviation = asBuilt - approved, absoluteDeviation = |deviation|, isWithinTolerance iff absoluteDeviation <= tolerance', () => {
    fc.assert(
      fc.property(measurementTripletArb, ({ approved, asBuilt, tolerance }) => {
        const service = createAsBuiltComparatorService({
          now: (() => {
            let counter = 0;
            return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
          })(),
        });

        const comparison = service.createComparison(
          'proj-p21',
          {
            linkedSurveyInstructionId: 'si_001',
            linkedApprovedPlanRef: 'PLAN-001',
            surveyDate: '2024-06-01',
            surveyorId: 'surveyor-1',
          },
          'actor-1',
        );

        const result = service.addMeasurement(comparison.id, {
          dimensionDescription: 'Test dimension',
          approvedDimension: approved,
          asBuiltDimension: asBuilt,
          toleranceThreshold: tolerance,
        });

        const measurement = result.measurements[0];

        // deviation = asBuilt - approved
        const expectedDeviation = asBuilt - approved;
        expect(measurement.deviation).toBeCloseTo(expectedDeviation, 8);

        // absoluteDeviation = |deviation|
        const expectedAbsoluteDeviation = Math.abs(expectedDeviation);
        expect(measurement.absoluteDeviation).toBeCloseTo(expectedAbsoluteDeviation, 8);

        // isWithinTolerance iff absoluteDeviation <= tolerance
        const expectedWithin = expectedAbsoluteDeviation <= tolerance;
        expect(measurement.isWithinTolerance).toBe(expectedWithin);
      }),
      { numRuns: 200 },
    );
  });

  it('compliance percentage = (withinCount / total * 100) rounded to 1 dp, or 0.0 when empty', () => {
    fc.assert(
      fc.property(measurementListArb, (measurements) => {
        const service = createAsBuiltComparatorService({
          now: (() => {
            let counter = 0;
            return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
          })(),
        });

        const comparison = service.createComparison(
          'proj-p21-comp',
          {
            linkedSurveyInstructionId: 'si_002',
            linkedApprovedPlanRef: 'PLAN-002',
            surveyDate: '2024-06-01',
            surveyorId: 'surveyor-1',
          },
          'actor-1',
        );

        // Add all measurements
        let result = comparison;
        for (const m of measurements) {
          result = service.addMeasurement(result.id, {
            dimensionDescription: 'Dimension',
            approvedDimension: m.approved,
            asBuiltDimension: m.asBuilt,
            toleranceThreshold: m.tolerance,
          });
        }

        // Calculate expected compliance
        const total = measurements.length;
        const withinCount = measurements.filter((m) => {
          const absDev = Math.abs(m.asBuilt - m.approved);
          return absDev <= m.tolerance;
        }).length;
        const expectedCompliance = total > 0
          ? Math.round((withinCount / total) * 1000) / 10
          : 0.0;

        expect(result.compliancePercentage).toBeCloseTo(expectedCompliance, 5);
        expect(result.totalMeasurements).toBe(total);
        expect(result.withinTolerance).toBe(withinCount);
        expect(result.outsideTolerance).toBe(total - withinCount);
      }),
      { numRuns: 100 },
    );
  });

  it('empty comparison has 0.0% compliance', () => {
    const service = createAsBuiltComparatorService();
    const comparison = service.createComparison(
      'proj-p21-empty',
      {
        linkedSurveyInstructionId: 'si_003',
        linkedApprovedPlanRef: 'PLAN-003',
        surveyDate: '2024-06-01',
        surveyorId: 'surveyor-1',
      },
      'actor-1',
    );

    expect(comparison.compliancePercentage).toBe(0.0);
    expect(comparison.totalMeasurements).toBe(0);
    expect(comparison.withinTolerance).toBe(0);
    expect(comparison.outsideTolerance).toBe(0);
  });
});
