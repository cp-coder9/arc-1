import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import {
  initialiseSafetyFile,
  updateSection,
  calculateComplianceScore,
  generateComplianceEvents,
  getMissingSections,
} from '../safetyFileService';
import { MANDATORY_SAFETY_FILE_SECTIONS } from '../hsConstants';

/**
 * Property 3: Compliance score calculation correctness
 *
 * For any SafetyFile with N mandatory sections (excluding 'not_applicable')
 * where K are in 'complete' status, calculateComplianceScore() SHALL return
 * a value equal to Math.round((K / N) * 100). Furthermore, if the new score
 * differs from the previous score, generateComplianceEvents() SHALL produce
 * exactly one WorkflowEvent; if scores are equal, it SHALL produce zero events.
 *
 * **Validates: Requirements 1.5, 1.6**
 */
describe('Property 3: Compliance score calculation correctness', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);
  const tenantIdArb = fc.stringMatching(/^tenant-[a-z0-9]{3,10}$/);
  const actorIdArb = fc.stringMatching(/^actor-[a-z0-9]{3,10}$/);

  // Number of sections to mark as complete (0 to 8, matching the 8 mandatory sections)
  const completeSectionsCountArb = fc.integer({ min: 0, max: 8 });

  // Helper: create a safety file with K of 8 sections marked as complete
  function buildFileWithKComplete(
    projectId: string,
    tenantId: string,
    actorId: string,
    k: number
  ) {
    let file = initialiseSafetyFile(projectId, tenantId);

    // Mark the first K sections as complete
    const sectionIds = MANDATORY_SAFETY_FILE_SECTIONS.map((s) => s.sectionId);
    for (let i = 0; i < k; i++) {
      file = updateSection(file, sectionIds[i], { status: 'complete' }, actorId);
    }

    return file;
  }

  // ─── Property: score equals Math.round((K / N) * 100) ─────────────────────

  describe('calculateComplianceScore returns correct percentage', () => {
    it('score === Math.round((K / N) * 100) for K complete out of N total sections', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          completeSectionsCountArb,
          (projectId, tenantId, actorId, k) => {
            const file = buildFileWithKComplete(projectId, tenantId, actorId, k);
            const score = calculateComplianceScore(file);
            const N = MANDATORY_SAFETY_FILE_SECTIONS.length; // 8
            const expectedScore = Math.round((k / N) * 100);

            expect(score).toBe(expectedScore);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('score is always between 0 and 100 inclusive', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          completeSectionsCountArb,
          (projectId, tenantId, actorId, k) => {
            const file = buildFileWithKComplete(projectId, tenantId, actorId, k);
            const score = calculateComplianceScore(file);

            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: score change → exactly 1 event; no change → 0 events ───────

  describe('generateComplianceEvents produces correct number of events', () => {
    it('when score differs from previousScore, returns exactly 1 event', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          completeSectionsCountArb,
          (projectId, tenantId, actorId, k) => {
            const file = buildFileWithKComplete(projectId, tenantId, actorId, k);
            const currentScore = calculateComplianceScore(file);

            // Use a previousScore that differs from currentScore
            const previousScore = currentScore === 0 ? 50 : 0;
            const events = generateComplianceEvents(file, previousScore);

            expect(events).toHaveLength(1);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('when score equals previousScore, returns empty array', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          completeSectionsCountArb,
          (projectId, tenantId, actorId, k) => {
            const file = buildFileWithKComplete(projectId, tenantId, actorId, k);
            const currentScore = calculateComplianceScore(file);

            // Pass the same score as previousScore
            const events = generateComplianceEvents(file, currentScore);

            expect(events).toHaveLength(0);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: score of 0 when no sections are complete ────────────────────

  describe('edge case: all sections incomplete', () => {
    it('score is 0 when no sections are complete', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          (projectId, tenantId) => {
            const file = initialiseSafetyFile(projectId, tenantId);
            const score = calculateComplianceScore(file);

            expect(score).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ─── Property: score of 100 when all sections are complete ─────────────────

  describe('edge case: all sections complete', () => {
    it('score is 100 when all 8 sections are complete', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          (projectId, tenantId, actorId) => {
            const file = buildFileWithKComplete(projectId, tenantId, actorId, 8);
            const score = calculateComplianceScore(file);

            expect(score).toBe(100);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * Property 4: Non-compliant section detection
 *
 * For any SafetyFile containing at least one mandatory section with status
 * 'incomplete' or 'expired', getMissingSections() SHALL return a non-empty
 * array containing exactly those non-compliant sections.
 *
 * **Validates: Requirements 1.3**
 */
describe('Property 4: Non-compliant section detection', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);
  const tenantIdArb = fc.stringMatching(/^tenant-[a-z0-9]{3,10}$/);
  const actorIdArb = fc.stringMatching(/^actor-[a-z0-9]{3,12}$/);

  // Generate a subset of section indices to mark as 'complete', leaving at least 1 incomplete
  const sectionIndicesToCompleteArb = fc
    .subarray(
      Array.from({ length: MANDATORY_SAFETY_FILE_SECTIONS.length }, (_, i) => i),
      { minLength: 0, maxLength: MANDATORY_SAFETY_FILE_SECTIONS.length - 1 }
    );

  // ─── Property: getMissingSections returns non-empty array when non-compliant sections exist ─────

  describe('returns non-empty array when at least one section is incomplete or expired', () => {
    it('initialised file (all incomplete) → getMissingSections returns all sections', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          (projectId, tenantId) => {
            const file = initialiseSafetyFile(projectId, tenantId);

            const missing = getMissingSections(file);

            // All sections start as 'incomplete', so all should be returned
            expect(missing.length).toBe(MANDATORY_SAFETY_FILE_SECTIONS.length);
            expect(missing.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('file with some sections completed still returns remaining incomplete ones', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          sectionIndicesToCompleteArb,
          actorIdArb,
          (projectId, tenantId, indicesToComplete, actorId) => {
            let file = initialiseSafetyFile(projectId, tenantId);

            // Mark selected sections as 'complete'
            for (const idx of indicesToComplete) {
              const sectionId = MANDATORY_SAFETY_FILE_SECTIONS[idx].sectionId;
              file = updateSection(file, sectionId, { status: 'complete' }, actorId);
            }

            const missing = getMissingSections(file);

            // Since we leave at least 1 section incomplete (maxLength is length-1),
            // there should always be at least one missing section
            const expectedIncompleteCount = MANDATORY_SAFETY_FILE_SECTIONS.length - indicesToComplete.length;
            expect(missing.length).toBe(expectedIncompleteCount);
            expect(missing.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: every returned section has status 'incomplete' or 'expired' ─────

  describe('every section in the result has status incomplete or expired', () => {
    it('all returned sections have non-compliant status', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          sectionIndicesToCompleteArb,
          actorIdArb,
          (projectId, tenantId, indicesToComplete, actorId) => {
            let file = initialiseSafetyFile(projectId, tenantId);

            for (const idx of indicesToComplete) {
              const sectionId = MANDATORY_SAFETY_FILE_SECTIONS[idx].sectionId;
              file = updateSection(file, sectionId, { status: 'complete' }, actorId);
            }

            const missing = getMissingSections(file);

            for (const section of missing) {
              expect(['incomplete', 'expired']).toContain(section.status);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: no section with status 'complete' or 'not_applicable' appears in result ─────

  describe('no complete or not_applicable section appears in the result', () => {
    it('complete sections are excluded from getMissingSections', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          sectionIndicesToCompleteArb,
          actorIdArb,
          (projectId, tenantId, indicesToComplete, actorId) => {
            let file = initialiseSafetyFile(projectId, tenantId);

            for (const idx of indicesToComplete) {
              const sectionId = MANDATORY_SAFETY_FILE_SECTIONS[idx].sectionId;
              file = updateSection(file, sectionId, { status: 'complete' }, actorId);
            }

            const missing = getMissingSections(file);
            const missingIds = missing.map((s) => s.sectionId);

            // No section marked complete should appear in the result
            for (const idx of indicesToComplete) {
              const sectionId = MANDATORY_SAFETY_FILE_SECTIONS[idx].sectionId;
              expect(missingIds).not.toContain(sectionId);
            }

            // No section in result should have status 'complete' or 'not_applicable'
            for (const section of missing) {
              expect(section.status).not.toBe('complete');
              expect(section.status).not.toBe('not_applicable');
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('not_applicable sections are excluded from getMissingSections', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          (projectId, tenantId, actorId) => {
            let file = initialiseSafetyFile(projectId, tenantId);

            // Mark first section as not_applicable
            const sectionId = MANDATORY_SAFETY_FILE_SECTIONS[0].sectionId;
            file = updateSection(file, sectionId, { status: 'not_applicable' }, actorId);

            const missing = getMissingSections(file);
            const missingIds = missing.map((s) => s.sectionId);

            // The not_applicable section should NOT appear in missing
            expect(missingIds).not.toContain(sectionId);

            // All returned sections should be incomplete or expired
            for (const section of missing) {
              expect(['incomplete', 'expired']).toContain(section.status);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ─── Property: all sections complete → getMissingSections returns empty array ─────

  describe('fully compliant file returns empty array', () => {
    it('when ALL sections are complete, getMissingSections returns empty array', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          tenantIdArb,
          actorIdArb,
          (projectId, tenantId, actorId) => {
            let file = initialiseSafetyFile(projectId, tenantId);

            // Mark all sections as complete
            for (const section of MANDATORY_SAFETY_FILE_SECTIONS) {
              file = updateSection(file, section.sectionId, { status: 'complete' }, actorId);
            }

            const missing = getMissingSections(file);

            expect(missing).toEqual([]);
            expect(missing.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
