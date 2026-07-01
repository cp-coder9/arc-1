/**
 * Property 15: Critical Path Identification
 *
 * - For any DAG, critical path is the longest path (zero float activities)
 * - Activities on critical path have totalFloat === 0
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateCriticalPath,
  computeEarliestDates,
  computeLatestDates,
} from './programmeService';
import type { Activity, ActivityDependency } from './programmeService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(baseDate: string, days: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function makeActivity(id: string, startOffset: number, duration: number): Activity {
  const baseDate = '2025-01-01';
  return {
    id,
    projectId: 'proj-1',
    name: `Activity ${id}`,
    startDate: addDays(baseDate, startOffset),
    endDate: addDays(baseDate, startOffset + duration),
    assigneeId: 'user-1',
    assigneeName: 'User 1',
    percentComplete: 0,
    isCritical: false,
    dependencies: [],
  };
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const durationArb = fc.integer({ min: 1, max: 30 });
const startOffsetArb = fc.integer({ min: 0, max: 100 });

// A simple chain DAG: A → B → C → ... (finish-to-start)
const chainDagArb = fc.integer({ min: 2, max: 6 }).chain((chainLength) => {
  return fc.array(durationArb, { minLength: chainLength, maxLength: chainLength }).map((durations) => {
    const activities: Activity[] = [];
    const dependencies: ActivityDependency[] = [];
    let currentOffset = 0;

    for (let i = 0; i < chainLength; i++) {
      const id = `act-${i}`;
      activities.push(makeActivity(id, currentOffset, durations[i]));
      if (i > 0) {
        dependencies.push({
          fromActivityId: `act-${i - 1}`,
          toActivityId: id,
          type: 'FS',
        });
      }
      currentOffset += durations[i];
    }

    return { activities, dependencies };
  });
});

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 15: Critical Path Identification', () => {
  it('for a linear chain, all activities are on the critical path', () => {
    fc.assert(
      fc.property(chainDagArb, ({ activities, dependencies }) => {
        const result = calculateCriticalPath(activities, dependencies);
        // In a linear chain, every activity is critical (zero float)
        expect(result.criticalPathIds.length).toBe(activities.length);
        for (const schedule of result.schedules) {
          expect(schedule.totalFloat).toBe(0);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('critical path activities have totalFloat === 0', () => {
    fc.assert(
      fc.property(chainDagArb, ({ activities, dependencies }) => {
        const result = calculateCriticalPath(activities, dependencies);
        for (const id of result.criticalPathIds) {
          const schedule = result.schedules.find((s) => s.activityId === id);
          expect(schedule?.totalFloat).toBe(0);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('project end date equals the sum of durations for a linear chain', () => {
    fc.assert(
      fc.property(chainDagArb, ({ activities, dependencies }) => {
        const earliest = computeEarliestDates(activities, dependencies);
        let projectEnd = 0;
        for (const [, data] of earliest) {
          projectEnd = Math.max(projectEnd, data.earliestFinish);
        }
        // For a linear FS chain, project end = sum of all durations
        const totalDuration = activities.reduce((sum, a) => {
          const d = Math.max(1, Math.round((new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / (1000 * 60 * 60 * 24)));
          return sum + d;
        }, 0);
        expect(projectEnd).toBe(totalDuration);
      }),
      { numRuns: 50 },
    );
  });

  it('non-critical activities have positive total float in a parallel DAG', () => {
    // Create parallel paths: A → B (short) and A → C (long), both feeding into D
    fc.assert(
      fc.property(
        durationArb,
        durationArb,
        durationArb,
        durationArb,
        (dA, dShort, dLong, dD) => {
          // Ensure the long path is actually longer
          const longDuration = dShort + dLong + 1;
          const activities: Activity[] = [
            makeActivity('A', 0, dA),
            makeActivity('short', dA, dShort),
            makeActivity('long', dA, longDuration),
            makeActivity('D', dA + longDuration, dD),
          ];
          const dependencies: ActivityDependency[] = [
            { fromActivityId: 'A', toActivityId: 'short', type: 'FS' },
            { fromActivityId: 'A', toActivityId: 'long', type: 'FS' },
            { fromActivityId: 'short', toActivityId: 'D', type: 'FS' },
            { fromActivityId: 'long', toActivityId: 'D', type: 'FS' },
          ];

          const result = calculateCriticalPath(activities, dependencies);

          // The short path activity should have positive float
          const shortSchedule = result.schedules.find((s) => s.activityId === 'short');
          expect(shortSchedule!.totalFloat).toBeGreaterThan(0);

          // The long path activity should be on the critical path
          expect(result.criticalPathIds).toContain('long');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('empty activity list returns empty results', () => {
    const result = calculateCriticalPath([], []);
    expect(result.activities).toEqual([]);
    expect(result.schedules).toEqual([]);
    expect(result.criticalPathIds).toEqual([]);
  });
});
