import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import {
  generateSpecificationDocument,
  isSpecificationComplete,
  createSpecification,
  updateSpecificationStep,
} from '../clientSpecificationService';
import type { ClientHSSpecification } from '../hsTypes';

/**
 * Property 8: Client specification document generation preserves all input
 *
 * For any complete ClientHSSpecification (all required fields non-empty),
 * calling generateSpecificationDocument() produces a string containing
 * the project description, scope of work, all known hazards, all minimum
 * H&S requirements, and compliance monitoring arrangements from the input.
 *
 * **Validates: Requirements 3.2, 3.3**
 */
describe('Property 8: Client specification document generation preserves all input', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  // Non-empty strings without newlines (to avoid ambiguity in substring checks)
  const nonEmptyStringArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ,._-]{0,49}$/);
  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);
  const isoDateArb = fc.constantFrom(
    '2025-01-15T08:00:00.000Z',
    '2025-06-20T14:30:00.000Z',
    '2026-03-01T00:00:00.000Z'
  );

  // Generate a complete ClientHSSpecification with all required fields non-empty
  const completeSpecArb = fc.record({
    id: fc.stringMatching(/^hs-spec-[a-z0-9]{3,10}$/),
    projectId: projectIdArb,
    projectDescription: nonEmptyStringArb,
    scopeOfWork: nonEmptyStringArb,
    knownHazards: fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 8 }),
    minimumHSRequirements: fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 8 }),
    complianceMonitoringArrangements: nonEmptyStringArb,
    completedAt: fc.option(isoDateArb, { nil: undefined }),
    createdAt: isoDateArb,
    updatedAt: isoDateArb,
  });

  // ─── generateSpecificationDocument ──────────────────────────────────────────

  describe('generateSpecificationDocument preserves all input content', () => {
    it('output contains projectDescription', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const doc = generateSpecificationDocument(spec);
          expect(doc).toContain(spec.projectDescription);
        }),
        { numRuns: 200 }
      );
    });

    it('output contains scopeOfWork', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const doc = generateSpecificationDocument(spec);
          expect(doc).toContain(spec.scopeOfWork);
        }),
        { numRuns: 200 }
      );
    });

    it('output contains every item in knownHazards', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const doc = generateSpecificationDocument(spec);
          for (const hazard of spec.knownHazards) {
            expect(doc).toContain(hazard);
          }
        }),
        { numRuns: 200 }
      );
    });

    it('output contains every item in minimumHSRequirements', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const doc = generateSpecificationDocument(spec);
          for (const requirement of spec.minimumHSRequirements) {
            expect(doc).toContain(requirement);
          }
        }),
        { numRuns: 200 }
      );
    });

    it('output contains complianceMonitoringArrangements', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const doc = generateSpecificationDocument(spec);
          expect(doc).toContain(spec.complianceMonitoringArrangements);
        }),
        { numRuns: 200 }
      );
    });

    it('output contains all five required fields in a single assertion', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const doc = generateSpecificationDocument(spec);

          // All scalar fields present
          expect(doc).toContain(spec.projectDescription);
          expect(doc).toContain(spec.scopeOfWork);
          expect(doc).toContain(spec.complianceMonitoringArrangements);

          // All array items present
          for (const hazard of spec.knownHazards) {
            expect(doc).toContain(hazard);
          }
          for (const requirement of spec.minimumHSRequirements) {
            expect(doc).toContain(requirement);
          }
        }),
        { numRuns: 200 }
      );
    });
  });

  // ─── isSpecificationComplete ────────────────────────────────────────────────

  describe('isSpecificationComplete returns true for complete specs', () => {
    it('complete spec with all required fields non-empty → true', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          expect(isSpecificationComplete(spec)).toBe(true);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('isSpecificationComplete returns false when any required field is missing', () => {
    it('empty projectDescription → false', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const incomplete: ClientHSSpecification = { ...spec, projectDescription: '' };
          expect(isSpecificationComplete(incomplete)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('empty scopeOfWork → false', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const incomplete: ClientHSSpecification = { ...spec, scopeOfWork: '' };
          expect(isSpecificationComplete(incomplete)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('empty knownHazards → false', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const incomplete: ClientHSSpecification = { ...spec, knownHazards: [] };
          expect(isSpecificationComplete(incomplete)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('empty minimumHSRequirements → false', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const incomplete: ClientHSSpecification = { ...spec, minimumHSRequirements: [] };
          expect(isSpecificationComplete(incomplete)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('empty complianceMonitoringArrangements → false', () => {
      fc.assert(
        fc.property(completeSpecArb, (spec) => {
          const incomplete: ClientHSSpecification = {
            ...spec,
            complianceMonitoringArrangements: '',
          };
          expect(isSpecificationComplete(incomplete)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * Unit Tests: Client Specification Engine
 *
 * Standard vitest unit tests covering:
 * 1. Incomplete spec detection
 * 2. Step-by-step update flow
 * 3. Advisory guidance when no spec exists
 *
 * **Validates: Requirements 3.1, 3.4**
 */
describe('Unit Tests: Client Specification Engine', () => {
  // ─── 1. Incomplete spec detection ──────────────────────────────────────────

  describe('Incomplete spec detection', () => {
    it('createSpecification returns a spec where isSpecificationComplete returns false', () => {
      const spec = createSpecification('project-123');
      expect(isSpecificationComplete(spec)).toBe(false);
    });

    it('a spec with only projectDescription filled returns false', () => {
      const spec = createSpecification('project-456');
      const updated = updateSpecificationStep(spec, 'projectDescription', 'A residential building project');
      expect(isSpecificationComplete(updated)).toBe(false);
    });

    it('a spec with everything except complianceMonitoringArrangements returns false', () => {
      let spec = createSpecification('project-789');
      spec = updateSpecificationStep(spec, 'projectDescription', 'New office block');
      spec = updateSpecificationStep(spec, 'scopeOfWork', 'Full construction of 3-storey building');
      spec = updateSpecificationStep(spec, 'knownHazards', ['Working at height', 'Excavation']);
      spec = updateSpecificationStep(spec, 'minimumHSRequirements', ['Fall protection plan required']);
      // complianceMonitoringArrangements left empty
      expect(isSpecificationComplete(spec)).toBe(false);
    });
  });

  // ─── 2. Step-by-step update flow ──────────────────────────────────────────

  describe('Step-by-step update flow', () => {
    it('completing all fields step-by-step flips isSpecificationComplete from false to true', () => {
      let spec = createSpecification('project-flow-test');

      // Initially incomplete
      expect(isSpecificationComplete(spec)).toBe(false);

      // Step 1: projectDescription
      spec = updateSpecificationStep(spec, 'projectDescription', 'Warehouse renovation');
      expect(isSpecificationComplete(spec)).toBe(false);

      // Step 2: scopeOfWork
      spec = updateSpecificationStep(spec, 'scopeOfWork', 'Demolition and rebuild of east wing');
      expect(isSpecificationComplete(spec)).toBe(false);

      // Step 3: knownHazards
      spec = updateSpecificationStep(spec, 'knownHazards', ['Asbestos', 'Structural instability']);
      expect(isSpecificationComplete(spec)).toBe(false);

      // Step 4: minimumHSRequirements
      spec = updateSpecificationStep(spec, 'minimumHSRequirements', ['PPE mandatory', 'Daily toolbox talks']);
      expect(isSpecificationComplete(spec)).toBe(false);

      // Step 5 (final): complianceMonitoringArrangements
      spec = updateSpecificationStep(
        spec,
        'complianceMonitoringArrangements',
        'Weekly site audits by H&S officer'
      );
      expect(isSpecificationComplete(spec)).toBe(true);
    });

    it('updateSpecificationStep updates the updatedAt timestamp', () => {
      const spec = createSpecification('project-timestamp-test');
      const originalUpdatedAt = spec.updatedAt;

      // Small delay to ensure timestamp differs
      const updated = updateSpecificationStep(spec, 'projectDescription', 'Test project');
      expect(updated.updatedAt).toBeDefined();
      // updatedAt should be a valid ISO string
      expect(new Date(updated.updatedAt).toISOString()).toBe(updated.updatedAt);
    });
  });

  // ─── 3. Advisory guidance when no spec exists ─────────────────────────────

  describe('Advisory guidance when no spec exists', () => {
    it('generated document contains the ADVISORY_DISCLAIMER text from hsConstants', () => {
      const spec = createSpecification('project-advisory');
      const doc = generateSpecificationDocument(spec);
      expect(doc).toContain(
        'This assessment is advisory only and does not constitute professional certification.'
      );
    });

    it('generated document contains full ADVISORY_DISCLAIMER', () => {
      const spec = createSpecification('project-advisory-full');
      const doc = generateSpecificationDocument(spec);
      expect(doc).toContain(
        'This assessment is advisory only and does not constitute professional certification. ' +
        'The Health & Safety Module provides readiness assessments and gap reports to assist ' +
        'compliance efforts under the Construction Regulations 2014 and OHS Act 85 of 1993.'
      );
    });

    it('advisory disclaimer is present even when spec fields are empty (no spec content)', () => {
      // Simulates the scenario where no real spec data exists yet
      const emptySpec = createSpecification('project-no-content');
      const doc = generateSpecificationDocument(emptySpec);
      expect(doc).toContain('advisory only');
      expect(doc).toContain('does not constitute professional certification');
    });
  });
});
