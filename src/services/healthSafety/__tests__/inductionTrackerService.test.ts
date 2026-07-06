import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { getUninductedWorkers } from '../inductionTrackerService';
import type { Induction } from '../hsTypes';

/**
 * Property 12: Uninducted worker detection
 *
 * For any workforce list W and induction record set I for a project,
 * getUninductedWorkers(projectId, W, I) returns exactly the set
 * W \ {inductees in I with matching projectId and type 'site'}.
 *
 * **Validates: Requirements 6.3**
 */
describe('Property 12: Uninducted worker detection', () => {
  // Arbitrary for generating unique worker IDs
  const workerIdArb = fc.stringMatching(/^[a-z][a-z0-9_-]{2,19}$/);

  // Generate a set of unique worker IDs (the workforce)
  const workforceArb = fc.uniqueArray(workerIdArb, { minLength: 0, maxLength: 20 });

  // Generate a projectId
  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);

  // Build induction records for a given projectId and workforce subset
  function inductionArb(projectId: string, workforce: string[]) {
    return fc.record({
      inductedSubset: fc.subarray(workforce),
      otherWorkers: fc.uniqueArray(workerIdArb, { minLength: 0, maxLength: 5 }),
    }).map(({ inductedSubset, otherWorkers }) => {
      const inductions: Induction[] = [];

      // Create site inductions for the inducted subset (matching projectId)
      for (const workerId of inductedSubset) {
        inductions.push({
          id: `ind-${workerId}`,
          projectId,
          inducteeId: workerId,
          inducteeName: `Name of ${workerId}`,
          type: 'site',
          date: '2025-01-15',
          acknowledged: true,
          conductedBy: 'officer-1',
          createdAt: '2025-01-15T08:00:00Z',
        });
      }

      // Add noise: inductions for other workers on a different project
      for (const workerId of otherWorkers) {
        inductions.push({
          id: `ind-other-${workerId}`,
          projectId: 'other-project-id',
          inducteeId: workerId,
          inducteeName: `Name of ${workerId}`,
          type: 'site',
          date: '2025-01-15',
          acknowledged: true,
          conductedBy: 'officer-2',
          createdAt: '2025-01-15T08:00:00Z',
        });
      }

      return { inductions, inductedSubset };
    });
  }

  it('returns exactly the workers NOT in induction records for the project', () => {
    fc.assert(
      fc.property(
        projectIdArb,
        workforceArb,
        fc.context(),
        (projectId, workforce, ctx) => {
          // Use a chain to ensure inductionArb gets proper args
          const result = fc.sample(inductionArb(projectId, workforce), 1)[0];
          const { inductions, inductedSubset } = result;

          ctx.log(`workforce: ${workforce.length}, inducted: ${inductedSubset.length}`);

          const uninducted = getUninductedWorkers(projectId, workforce, inductions);

          // Expected: workforce minus inducted subset
          const expectedSet = new Set(workforce);
          for (const w of inductedSubset) {
            expectedSet.delete(w);
          }
          const expected = [...expectedSet];

          expect(new Set(uninducted)).toEqual(new Set(expected));
          expect(uninducted.length).toBe(expected.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('every returned worker is actually in the workforce list', () => {
    fc.assert(
      fc.property(
        projectIdArb,
        workforceArb,
        (projectId, workforce) => {
          const { inductions } = fc.sample(inductionArb(projectId, workforce), 1)[0];

          const uninducted = getUninductedWorkers(projectId, workforce, inductions);
          const workforceSet = new Set(workforce);

          for (const worker of uninducted) {
            expect(workforceSet.has(worker)).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('every returned worker does NOT have a site induction for the project', () => {
    fc.assert(
      fc.property(
        projectIdArb,
        workforceArb,
        (projectId, workforce) => {
          const { inductions } = fc.sample(inductionArb(projectId, workforce), 1)[0];

          const uninducted = getUninductedWorkers(projectId, workforce, inductions);

          const inductedForProject = new Set(
            inductions
              .filter((ind) => ind.projectId === projectId && ind.type === 'site')
              .map((ind) => ind.inducteeId)
          );

          for (const worker of uninducted) {
            expect(inductedForProject.has(worker)).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('no worker with a valid site induction is in the returned list', () => {
    fc.assert(
      fc.property(
        projectIdArb,
        workforceArb,
        (projectId, workforce) => {
          const { inductions } = fc.sample(inductionArb(projectId, workforce), 1)[0];

          const uninducted = getUninductedWorkers(projectId, workforce, inductions);
          const uninductedSet = new Set(uninducted);

          const inductedForProject = inductions
            .filter((ind) => ind.projectId === projectId && ind.type === 'site')
            .map((ind) => ind.inducteeId);

          for (const inductedWorker of inductedForProject) {
            if (workforce.includes(inductedWorker)) {
              expect(uninductedSet.has(inductedWorker)).toBe(false);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returned list + inducted workers = the full workforce (set complement property)', () => {
    fc.assert(
      fc.property(
        projectIdArb,
        workforceArb,
        (projectId, workforce) => {
          const { inductions } = fc.sample(inductionArb(projectId, workforce), 1)[0];

          const uninducted = getUninductedWorkers(projectId, workforce, inductions);

          const inductedForProject = new Set(
            inductions
              .filter((ind) => ind.projectId === projectId && ind.type === 'site')
              .map((ind) => ind.inducteeId)
          );

          // Workers who are both in the workforce AND inducted
          const inductedInWorkforce = workforce.filter((w) => inductedForProject.has(w));

          // Union of uninducted + inducted-in-workforce should equal the full workforce
          const union = new Set([...uninducted, ...inductedInWorkforce]);
          expect(union).toEqual(new Set(workforce));
          expect(union.size).toBe(workforce.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('ignores non-site induction types when computing uninducted workers', () => {
    fc.assert(
      fc.property(
        projectIdArb,
        workforceArb,
        (projectId, workforce) => {
          // Create only task_specific and visitor inductions for all workers
          const nonSiteInductions: Induction[] = workforce.map((workerId) => ({
            id: `ind-nonsit-${workerId}`,
            projectId,
            inducteeId: workerId,
            inducteeName: `Name of ${workerId}`,
            type: Math.random() > 0.5 ? 'task_specific' : 'visitor',
            date: '2025-01-15',
            acknowledged: true,
            conductedBy: 'officer-1',
            createdAt: '2025-01-15T08:00:00Z',
          }));

          const uninducted = getUninductedWorkers(projectId, workforce, nonSiteInductions);

          // All workers should be uninducted since none have 'site' type inductions
          expect(new Set(uninducted)).toEqual(new Set(workforce));
        }
      ),
      { numRuns: 100 }
    );
  });
});


import { recordToolboxTalk, recordInduction } from '../inductionTrackerService';

/**
 * Property 13: Induction and toolbox talk data preservation
 *
 * For any valid ToolboxTalk input (date, topic, presenter, duration, attendees, projectId),
 * calling recordToolboxTalk() produces a record preserving all input fields unchanged.
 * For any valid Induction input (inducteeId, inducteeName, type, date, acknowledged, conductedBy, projectId),
 * calling recordInduction() produces a record preserving all input fields unchanged.
 *
 * **Validates: Requirements 6.1, 6.2**
 */
describe('Property 13: Induction and toolbox talk data preservation', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  // Non-empty strings that satisfy min(1) schema constraints
  const nonEmptyStringArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 _-]{0,29}$/);
  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);
  const dateStringArb = fc.stringMatching(/^2025-\d{2}-\d{2}$/);
  const positiveDurationArb = fc.integer({ min: 1, max: 480 });
  const attendeesArb = fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 10 });
  const inductionTypeArb = fc.constantFrom('site' as const, 'task_specific' as const, 'visitor' as const);

  // ─── recordToolboxTalk ──────────────────────────────────────────────────────

  describe('recordToolboxTalk preserves all input fields', () => {
    it('output contains all input fields unchanged', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          dateStringArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          positiveDurationArb,
          attendeesArb,
          (projectId, date, topic, presenter, duration, attendees) => {
            const input = { projectId, date, topic, presenter, duration, attendees };
            const result = recordToolboxTalk(input);

            // All input fields preserved
            expect(result.projectId).toBe(projectId);
            expect(result.date).toBe(date);
            expect(result.topic).toBe(topic);
            expect(result.presenter).toBe(presenter);
            expect(result.duration).toBe(duration);
            expect(result.attendees).toEqual(attendees);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('output has a non-empty id string', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          dateStringArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          positiveDurationArb,
          attendeesArb,
          (projectId, date, topic, presenter, duration, attendees) => {
            const input = { projectId, date, topic, presenter, duration, attendees };
            const result = recordToolboxTalk(input);

            expect(typeof result.id).toBe('string');
            expect(result.id.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('output has a non-empty createdAt string', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          dateStringArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          positiveDurationArb,
          attendeesArb,
          (projectId, date, topic, presenter, duration, attendees) => {
            const input = { projectId, date, topic, presenter, duration, attendees };
            const result = recordToolboxTalk(input);

            expect(typeof result.createdAt).toBe('string');
            expect(result.createdAt.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ─── recordInduction ────────────────────────────────────────────────────────

  describe('recordInduction preserves all input fields', () => {
    it('output contains all input fields unchanged', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          inductionTypeArb,
          dateStringArb,
          fc.boolean(),
          nonEmptyStringArb,
          (projectId, inducteeId, inducteeName, type, date, acknowledged, conductedBy) => {
            const input = { projectId, inducteeId, inducteeName, type, date, acknowledged, conductedBy };
            const result = recordInduction(input);

            // All input fields preserved
            expect(result.projectId).toBe(projectId);
            expect(result.inducteeId).toBe(inducteeId);
            expect(result.inducteeName).toBe(inducteeName);
            expect(result.type).toBe(type);
            expect(result.date).toBe(date);
            expect(result.acknowledged).toBe(acknowledged);
            expect(result.conductedBy).toBe(conductedBy);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('output has a non-empty id string', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          inductionTypeArb,
          dateStringArb,
          fc.boolean(),
          nonEmptyStringArb,
          (projectId, inducteeId, inducteeName, type, date, acknowledged, conductedBy) => {
            const input = { projectId, inducteeId, inducteeName, type, date, acknowledged, conductedBy };
            const result = recordInduction(input);

            expect(typeof result.id).toBe('string');
            expect(result.id.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('output has a non-empty createdAt string', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          inductionTypeArb,
          dateStringArb,
          fc.boolean(),
          nonEmptyStringArb,
          (projectId, inducteeId, inducteeName, type, date, acknowledged, conductedBy) => {
            const input = { projectId, inducteeId, inducteeName, type, date, acknowledged, conductedBy };
            const result = recordInduction(input);

            expect(typeof result.createdAt).toBe('string');
            expect(result.createdAt.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
