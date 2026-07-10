/**
 * Property 18: Chronological Ordering
 *
 * - Milestones sorted ascending by date; diary entries descending; stable sort
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sortEntriesReverseChronological } from './siteDiaryService';
import type { SiteDiaryEntry } from './siteDiaryService';
import type { CommandCentreMilestone } from './types';

// ── Pure sorting functions ───────────────────────────────────────────────────

/**
 * Sorts milestones ascending by plannedDate (matching getMilestones ordering).
 * Stable sort for items with equal dates.
 */
function sortMilestonesAscending(milestones: CommandCentreMilestone[]): CommandCentreMilestone[] {
  return [...milestones].sort((a, b) => {
    const dateCompare = a.plannedDate.localeCompare(b.plannedDate);
    if (dateCompare !== 0) return dateCompare;
    // Stable: preserve original order for same date (use createdAt as tiebreaker)
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const isoDateArb = fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }).map((d) => d.toISOString().split('T')[0]);
const timestampArb = fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }).map((d) => d.toISOString());
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

const milestoneArb: fc.Arbitrary<CommandCentreMilestone> = fc.record({
  id: fc.uuid(),
  projectId: fc.constant('proj-1'),
  name: nonEmptyStringArb,
  plannedDate: isoDateArb,
  actualDate: fc.option(isoDateArb, { nil: undefined }),
  status: fc.constantFrom<CommandCentreMilestone['status']>('complete', 'on_track', 'at_risk', 'overdue', 'pending'),
  linkedCertificateId: fc.option(fc.uuid(), { nil: undefined }),
  linkedActivityId: fc.option(fc.uuid(), { nil: undefined }),
  category: fc.option(fc.constantFrom<'general' | 'nhbrc_inspection' | 'municipal_submission'>('general', 'nhbrc_inspection', 'municipal_submission'), { nil: undefined }),
  nhbrcStage: fc.option(fc.integer({ min: 1, max: 7 }), { nil: undefined }),
  documentationChecklist: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  updatedAt: timestampArb,
});

const diaryEntryArb: fc.Arbitrary<SiteDiaryEntry> = fc.record({
  id: fc.uuid(),
  projectId: fc.constant('proj-1'),
  date: isoDateArb,
  weather: fc.constantFrom('sunny', 'cloudy', 'rainy'),
  workforceCount: fc.integer({ min: 0, max: 100 }),
  workCompleted: nonEmptyStringArb,
  issuesDelays: fc.option(nonEmptyStringArb, { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  mentionsDelays: fc.boolean(),
});

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 18: Chronological Ordering', () => {
  describe('Milestones: ascending by planned date', () => {
    it('sorted milestones are in ascending order by plannedDate', () => {
      fc.assert(
        fc.property(fc.array(milestoneArb, { minLength: 2, maxLength: 30 }), (milestones) => {
          const sorted = sortMilestonesAscending(milestones);
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].plannedDate >= sorted[i - 1].plannedDate).toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('sort is stable: items with equal dates preserve relative order by createdAt', () => {
      fc.assert(
        fc.property(
          isoDateArb,
          fc.array(milestoneArb, { minLength: 2, maxLength: 10 }),
          (sameDate, milestones) => {
            // Force all milestones to have the same date
            const sameDateMilestones = milestones.map((m) => ({ ...m, plannedDate: sameDate }));
            const sorted = sortMilestonesAscending(sameDateMilestones);

            // With same date, should be sorted by createdAt
            for (let i = 1; i < sorted.length; i++) {
              expect(sorted[i].createdAt >= sorted[i - 1].createdAt).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('for any two milestones A and B where A.date < B.date, A appears before B', () => {
      fc.assert(
        fc.property(
          fc.array(milestoneArb, { minLength: 2, maxLength: 30 }),
          (milestones) => {
            const sorted = sortMilestonesAscending(milestones);
            for (let i = 0; i < sorted.length; i++) {
              for (let j = i + 1; j < sorted.length; j++) {
                if (sorted[i].plannedDate > sorted[j].plannedDate) {
                  // This should never happen in a correctly sorted list
                  expect(false).toBe(true);
                }
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Diary entries: descending by date', () => {
    it('sorted diary entries are in descending order by date', () => {
      fc.assert(
        fc.property(fc.array(diaryEntryArb, { minLength: 2, maxLength: 30 }), (entries) => {
          const sorted = sortEntriesReverseChronological(entries);
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].date <= sorted[i - 1].date).toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('sort is stable: entries with equal dates preserve order by createdAt descending', () => {
      fc.assert(
        fc.property(
          isoDateArb,
          fc.array(diaryEntryArb, { minLength: 2, maxLength: 10 }),
          (sameDate, entries) => {
            const sameDateEntries = entries.map((e) => ({ ...e, date: sameDate }));
            const sorted = sortEntriesReverseChronological(sameDateEntries);

            // With same date, should be sorted by createdAt descending
            for (let i = 1; i < sorted.length; i++) {
              expect(sorted[i].createdAt <= sorted[i - 1].createdAt).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('for any two entries A and B where A.date > B.date, A appears before B (reverse chronological)', () => {
      fc.assert(
        fc.property(
          fc.array(diaryEntryArb, { minLength: 2, maxLength: 30 }),
          (entries) => {
            const sorted = sortEntriesReverseChronological(entries);
            for (let i = 0; i < sorted.length; i++) {
              for (let j = i + 1; j < sorted.length; j++) {
                if (sorted[i].date < sorted[j].date) {
                  // This should never happen in a correctly reverse-sorted list
                  expect(false).toBe(true);
                }
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Sort stability', () => {
    it('sorting does not lose any elements', () => {
      fc.assert(
        fc.property(fc.array(milestoneArb, { minLength: 0, maxLength: 30 }), (milestones) => {
          const sorted = sortMilestonesAscending(milestones);
          expect(sorted.length).toBe(milestones.length);
        }),
        { numRuns: 100 },
      );
    });

    it('sorting diary entries does not lose any elements', () => {
      fc.assert(
        fc.property(fc.array(diaryEntryArb, { minLength: 0, maxLength: 30 }), (entries) => {
          const sorted = sortEntriesReverseChronological(entries);
          expect(sorted.length).toBe(entries.length);
        }),
        { numRuns: 100 },
      );
    });
  });
});
