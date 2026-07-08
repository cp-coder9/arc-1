import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { generateComplianceReport } from '../hsIntegrationService';
import { initialiseSafetyFile, updateSection, generateComplianceEvents, calculateComplianceScore } from '../safetyFileService';
import { MANDATORY_SAFETY_FILE_SECTIONS, ADVISORY_DISCLAIMER } from '../hsConstants';

/**
 * Property 21: Advisory disclaimer invariant
 *
 * For any generated report or compliance score output from the Safety File Builder,
 * the output string SHALL contain the advisory-only disclaimer text stating the module
 * does not constitute professional certification.
 *
 * **Validates: Requirements 11.5**
 */
describe('Property 21: Advisory disclaimer invariant', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);
  const tenantIdArb = fc.stringMatching(/^tenant-[a-z0-9]{3,10}$/);
  const actorIdArb = fc.stringMatching(/^actor-[a-z0-9]{3,10}$/);

  // Generate a random subset of section indices to mark as complete
  const sectionIndicesToCompleteArb = fc.subarray(
    Array.from({ length: MANDATORY_SAFETY_FILE_SECTIONS.length }, (_, i) => i),
    { minLength: 0, maxLength: MANDATORY_SAFETY_FILE_SECTIONS.length }
  );

  // ─── Property: generateComplianceReport always contains ADVISORY_DISCLAIMER ─

  describe('generateComplianceReport contains advisory disclaimer', () => {
    it('report output always includes the advisory disclaimer text for any SafetyFile', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          sectionIndicesToCompleteArb,
          (projectId, tenantId, actorId, indicesToComplete) => {
            let file = initialiseSafetyFile(projectId, tenantId);

            // Mark selected sections as complete
            for (const idx of indicesToComplete) {
              const sectionId = MANDATORY_SAFETY_FILE_SECTIONS[idx].sectionId;
              file = updateSection(file, sectionId, { status: 'complete' }, actorId);
            }

            const report = generateComplianceReport(file);

            expect(report).toContain(ADVISORY_DISCLAIMER);
            expect(report).toContain(
              'This assessment is advisory only and does not constitute professional certification'
            );
          }
        ),
        { numRuns: 200 }
      );
    });

    it('report contains disclaimer even for a freshly initialised safety file (score 0)', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          (projectId, tenantId) => {
            const file = initialiseSafetyFile(projectId, tenantId);
            const report = generateComplianceReport(file);

            expect(report).toContain(ADVISORY_DISCLAIMER);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('report contains disclaimer for a fully complete safety file (score 100)', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          (projectId, tenantId, actorId) => {
            let file = initialiseSafetyFile(projectId, tenantId);

            for (const section of MANDATORY_SAFETY_FILE_SECTIONS) {
              file = updateSection(file, section.sectionId, { status: 'complete' }, actorId);
            }

            const report = generateComplianceReport(file);

            expect(report).toContain(ADVISORY_DISCLAIMER);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ─── Property: generateComplianceEvents includes disclaimer in event detail ─

  describe('generateComplianceEvents includes advisory disclaimer in event detail', () => {
    it('when score changes and an event is generated, event detail contains the disclaimer', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          sectionIndicesToCompleteArb,
          (projectId, tenantId, actorId, indicesToComplete) => {
            let file = initialiseSafetyFile(projectId, tenantId);

            // Mark selected sections as complete
            for (const idx of indicesToComplete) {
              const sectionId = MANDATORY_SAFETY_FILE_SECTIONS[idx].sectionId;
              file = updateSection(file, sectionId, { status: 'complete' }, actorId);
            }

            const currentScore = calculateComplianceScore(file);
            // Use a previousScore that differs from currentScore to trigger event generation
            const previousScore = currentScore === 0 ? 50 : 0;

            const events = generateComplianceEvents(file, previousScore);

            // Should have exactly 1 event since scores differ
            expect(events).toHaveLength(1);

            // The event detail must contain the advisory disclaimer
            expect(events[0].detail).toContain(ADVISORY_DISCLAIMER);
            expect(events[0].detail).toContain(
              'This assessment is advisory only and does not constitute professional certification'
            );
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
