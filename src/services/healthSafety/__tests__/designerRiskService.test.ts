import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import {
  captureDesignerRisk,
  getProjectDesignerRisks,
  generateDesignerRiskSummary,
} from '../designerRiskService';
import type { DesignerRiskAssessment } from '../hsTypes';

/**
 * Property 9: Designer risk assessment round-trip
 *
 * For any valid DesignerRiskAssessment input, calling captureDesignerRisk() then
 * filtering with getProjectDesignerRisks(projectId, assessments) returns an array
 * containing the captured assessment with all original fields preserved unchanged.
 * Furthermore, generateDesignerRiskSummary() on any non-empty set produces a string
 * mentioning every hazardDescription from the input set.
 *
 * **Validates: Requirements 4.1, 4.2, 4.4**
 */
describe('Property 9: Designer risk assessment round-trip', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);
  const nonEmptyStringArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 _-]{0,29}$/);
  const riskLevelArb = fc.constantFrom(
    'low' as const,
    'medium' as const,
    'high' as const,
    'critical' as const
  );
  const recommendedControlsArb = fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 });

  // Generate a valid DesignerRiskAssessment input (without id, createdAt, updatedAt)
  const designerRiskInputArb = fc.record({
    projectId: projectIdArb,
    designDiscipline: nonEmptyStringArb,
    hazardDescription: nonEmptyStringArb,
    associatedDesignElement: nonEmptyStringArb,
    riskLevel: riskLevelArb,
    recommendedControls: recommendedControlsArb,
    createdBy: nonEmptyStringArb,
  });

  // ─── Round-trip: capture → filter returns assessment with all fields preserved ──

  describe('captureDesignerRisk → getProjectDesignerRisks preserves all fields', () => {
    it('returned assessment contains all original input fields unchanged', () => {
      fc.assert(
        fc.property(designerRiskInputArb, (input) => {
          const captured = captureDesignerRisk(input);
          const filtered = getProjectDesignerRisks(input.projectId, [captured]);

          expect(filtered).toHaveLength(1);
          const result = filtered[0];

          // All input fields are preserved
          expect(result.projectId).toBe(input.projectId);
          expect(result.designDiscipline).toBe(input.designDiscipline);
          expect(result.hazardDescription).toBe(input.hazardDescription);
          expect(result.associatedDesignElement).toBe(input.associatedDesignElement);
          expect(result.riskLevel).toBe(input.riskLevel);
          expect(result.recommendedControls).toEqual(input.recommendedControls);
          expect(result.createdBy).toBe(input.createdBy);
        }),
        { numRuns: 200 }
      );
    });

    it('captured assessment has a non-empty id', () => {
      fc.assert(
        fc.property(designerRiskInputArb, (input) => {
          const captured = captureDesignerRisk(input);

          expect(typeof captured.id).toBe('string');
          expect(captured.id.length).toBeGreaterThan(0);
        }),
        { numRuns: 200 }
      );
    });

    it('captured assessment has non-empty createdAt and updatedAt', () => {
      fc.assert(
        fc.property(designerRiskInputArb, (input) => {
          const captured = captureDesignerRisk(input);

          expect(typeof captured.createdAt).toBe('string');
          expect(captured.createdAt.length).toBeGreaterThan(0);
          expect(typeof captured.updatedAt).toBe('string');
          expect(captured.updatedAt.length).toBeGreaterThan(0);
        }),
        { numRuns: 200 }
      );
    });

    it('filtering by a different projectId returns empty array', () => {
      fc.assert(
        fc.property(designerRiskInputArb, projectIdArb, (input, otherProjectId) => {
          fc.pre(otherProjectId !== input.projectId);

          const captured = captureDesignerRisk(input);
          const filtered = getProjectDesignerRisks(otherProjectId, [captured]);

          expect(filtered).toHaveLength(0);
        }),
        { numRuns: 200 }
      );
    });
  });

  // ─── generateDesignerRiskSummary mentions every hazardDescription ──────────

  describe('generateDesignerRiskSummary contains every hazardDescription', () => {
    it('summary string contains every hazardDescription from input assessments', () => {
      fc.assert(
        fc.property(
          fc.array(designerRiskInputArb, { minLength: 1, maxLength: 10 }),
          (inputs) => {
            const assessments: DesignerRiskAssessment[] = inputs.map((input) =>
              captureDesignerRisk(input)
            );

            const summary = generateDesignerRiskSummary(assessments);

            for (const assessment of assessments) {
              expect(summary).toContain(assessment.hazardDescription);
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('summary is a non-empty string for non-empty assessment sets', () => {
      fc.assert(
        fc.property(
          fc.array(designerRiskInputArb, { minLength: 1, maxLength: 5 }),
          (inputs) => {
            const assessments: DesignerRiskAssessment[] = inputs.map((input) =>
              captureDesignerRisk(input)
            );

            const summary = generateDesignerRiskSummary(assessments);

            expect(typeof summary).toBe('string');
            expect(summary.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
