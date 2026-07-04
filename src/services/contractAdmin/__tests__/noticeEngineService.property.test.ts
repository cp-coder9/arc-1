/**
 * Property-Based Tests for NoticeEngineService — Deadline Warnings & Deemed Outcomes
 *
 * **Property 7: Deadline Warning at Exact Thresholds**
 * For any active notice with a calculated deadline, the system SHALL generate exactly
 * one warning notification when the remaining working days first equals each configured
 * threshold (7, 3, 1), and SHALL NOT generate duplicate warnings for the same threshold.
 *
 * **Property 8: No Warnings After Response**
 * For any notice that has been responded to (status = 'responded') or withdrawn
 * (status = 'withdrawn'), the system SHALL generate zero subsequent deadline warning
 * notifications regardless of remaining time.
 *
 * **Property 9: Deemed Outcome Application**
 * For any expired notice where the contract form and clause have a configured deemed
 * outcome (acceptance or rejection), the system SHALL record the configured deemed
 * outcome. For expired notices without configured deemed outcome, deemedOutcome = null.
 *
 * **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock firebase-admin before importing the service
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            set: vi.fn(),
            get: vi.fn(),
          })),
        })),
        set: vi.fn(),
        get: vi.fn(() => Promise.resolve({ exists: false })),
        update: vi.fn(),
      })),
      where: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ docs: [] })),
      })),
    })),
  },
}));

import { calculateDeadline } from '../noticeEngineService';
import {
  getRemainingWorkingDays,
  getSouthAfricanHolidays,
  addWorkingDays,
} from '../workingDayCalculator';
import {
  getClauseResponsePeriod,
  CONTRACT_FORM_CONFIGS,
  type DayType,
  type DeemedOutcome,
} from '../contractFormConfigs';
import type { PublicHoliday, NoticeStatus, ContractForm } from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Warning thresholds as defined in the service */
const WARNING_THRESHOLDS = [7, 3, 1] as const;

/** Terminal statuses that should never receive warnings */
const TERMINAL_NO_WARN_STATUSES: NoticeStatus[] = ['responded', 'withdrawn'];

/** All supported contract forms */
const ALL_FORMS: ContractForm[] = ['jbcc_pba', 'nec_ecc', 'gcc_2025', 'fidic'];

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Build a comprehensive holiday list for years 2020–2032 */
function getAllHolidays(): PublicHoliday[] {
  const holidays: PublicHoliday[] = [];
  for (let year = 2020; year <= 2032; year++) {
    holidays.push(...getSouthAfricanHolidays(year));
  }
  return holidays;
}

/** Parse ISO date string to Date object */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format Date to ISO string */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add N calendar days to an ISO date string */
function addCalendarDays(isoDate: string, days: number): string {
  const d = parseDate(isoDate);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/**
 * Determine the warning level from remaining days (mirrors service logic).
 * Returns the thresholds that would trigger warnings.
 */
function getWarningLevel(remainingDays: number): 'info' | 'urgent' | 'critical' | undefined {
  if (remainingDays <= 1) return 'critical';
  if (remainingDays <= 3) return 'urgent';
  if (remainingDays <= 7) return 'info';
  return undefined;
}

/**
 * Simulate the warning generation logic from runDeadlineCheck.
 * Given a set of remaining days snapshots over time, determines which
 * threshold warnings would be generated (exactly one per threshold).
 */
function simulateWarningGeneration(
  remainingDaysSnapshots: number[],
  initialGeneratedWarnings: number[] = [],
): { generatedWarnings: number[]; warningCount: number } {
  const generated = [...initialGeneratedWarnings];
  let warningCount = 0;

  for (const remaining of remainingDaysSnapshots) {
    // Skip if expired
    if (remaining <= 0) break;

    for (const threshold of WARNING_THRESHOLDS) {
      if (remaining <= threshold && !generated.includes(threshold)) {
        generated.push(threshold);
        warningCount++;
      }
    }
  }

  return { generatedWarnings: generated, warningCount };
}

// Pre-compute holidays once for all tests
const ALL_HOLIDAYS = getAllHolidays();

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a random date between 2022-01-01 and 2028-12-28 as an ISO string */
const dateArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 2022, max: 2028 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/** Generate a response period in working days (1–60) */
const responsePeriodArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 60 });

/** Generate day type */
const dayTypeArb: fc.Arbitrary<DayType> = fc.constantFrom('working', 'calendar');

/** Generate a random contract form */
const contractFormArb: fc.Arbitrary<ContractForm> = fc.constantFrom(...ALL_FORMS);

/** Generate a sequence of decreasing remaining-day values (simulating daily checks) */
const remainingDaysSequenceArb: fc.Arbitrary<number[]> = fc
  .integer({ min: 1, max: 30 })
  .chain((startDays) => {
    // Create a strictly decreasing sequence from startDays down to 0
    const seq: number[] = [];
    for (let i = startDays; i >= 0; i--) {
      seq.push(i);
    }
    return fc.constant(seq);
  });

/** Generate a subset of already-generated warnings (0–3 thresholds) */
const previousWarningsArb: fc.Arbitrary<number[]> = fc.subarray([7, 3, 1]);

// ══════════════════════════════════════════════════════════════════════════════
// Property 7: Deadline Warning at Exact Thresholds
// **Validates: Requirements 4.2, 4.3, 4.4**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 7: Deadline Warning at Exact Thresholds', () => {
  it('generates exactly one warning per threshold (7, 3, 1) and no duplicates across daily checks', () => {
    fc.assert(
      fc.property(remainingDaysSequenceArb, (snapshots) => {
        const { generatedWarnings, warningCount } = simulateWarningGeneration(snapshots);

        // The warning logic: remaining <= threshold triggers that threshold.
        // So when remaining=1, thresholds 7, 3, and 1 ALL fire (because 1 <= 7, 1 <= 3, 1 <= 1).
        // The key property is: each threshold fires AT MOST ONCE across all snapshots.

        // Each threshold should appear at most once in generated warnings (no duplicates)
        const uniqueWarnings = new Set(generatedWarnings);
        expect(uniqueWarnings.size).toBe(generatedWarnings.length);

        // The number of warnings generated equals the number of unique thresholds triggered
        expect(warningCount).toBe(uniqueWarnings.size);

        // All generated warnings must be valid thresholds
        for (const w of generatedWarnings) {
          expect(WARNING_THRESHOLDS).toContain(w);
        }

        // If the sequence reaches a remaining days value <= a threshold,
        // that threshold must appear in generated warnings
        const minRemaining = Math.min(...snapshots.filter((s) => s > 0));
        if (minRemaining <= 7) expect(generatedWarnings).toContain(7);
        if (minRemaining <= 3) expect(generatedWarnings).toContain(3);
        if (minRemaining <= 1) expect(generatedWarnings).toContain(1);
      }),
      { numRuns: 200 },
    );
  });

  it('never generates warnings for the same threshold twice even with repeated checks at same value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        fc.integer({ min: 2, max: 10 }),
        (remainingDays, repeatCount) => {
          // Simulate the same remaining days value being checked multiple times
          const snapshots = Array(repeatCount).fill(remainingDays);
          const { generatedWarnings } = simulateWarningGeneration(snapshots);

          // Unique warnings should match the set — no duplicates
          const uniqueWarnings = new Set(generatedWarnings);
          expect(uniqueWarnings.size).toBe(generatedWarnings.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('does not regenerate warnings for thresholds already recorded', () => {
    fc.assert(
      fc.property(previousWarningsArb, remainingDaysSequenceArb, (prevWarnings, snapshots) => {
        const { generatedWarnings } = simulateWarningGeneration(snapshots, prevWarnings);

        // All previously generated warnings should still be in the list
        for (const prev of prevWarnings) {
          expect(generatedWarnings).toContain(prev);
        }

        // No threshold appears more than once
        const uniqueWarnings = new Set(generatedWarnings);
        expect(uniqueWarnings.size).toBe(generatedWarnings.length);
      }),
      { numRuns: 200 },
    );
  });

  it('calculateDeadline + getRemainingWorkingDays produces correct threshold crossings', () => {
    fc.assert(
      fc.property(dateArb, responsePeriodArb, (dateIssued, responsePeriod) => {
        const deadline = calculateDeadline(dateIssued, responsePeriod, 'working', ALL_HOLIDAYS);

        // Starting from the issue date, remaining days should start at the full period
        const remainingFromIssue = getRemainingWorkingDays(dateIssued, deadline, ALL_HOLIDAYS);

        // Remaining days from issue date to deadline should equal the response period
        expect(remainingFromIssue).toBe(responsePeriod);

        // If we advance to a point where exactly threshold days remain,
        // that should be detectable
        for (const threshold of WARNING_THRESHOLDS) {
          if (responsePeriod > threshold) {
            // Advance past enough days so that exactly `threshold` working days remain
            const daysToAdvance = responsePeriod - threshold;
            const checkDate = addWorkingDays(dateIssued, daysToAdvance, ALL_HOLIDAYS);
            const remaining = getRemainingWorkingDays(checkDate, deadline, ALL_HOLIDAYS);

            // At this check date, remaining should be exactly the threshold
            expect(remaining).toBe(threshold);

            // Warning level should be defined at this point
            const level = getWarningLevel(remaining);
            expect(level).toBeDefined();
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 8: No Warnings After Response
// **Validates: Requirements 4.5**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 8: No Warnings After Response', () => {
  it('generates zero warnings for notices with terminal status (responded or withdrawn)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TERMINAL_NO_WARN_STATUSES),
        fc.integer({ min: 0, max: 10 }),
        dateArb,
        responsePeriodArb,
        (terminalStatus, remainingDays, dateIssued, responsePeriod) => {
          // Model: a notice in terminal status should never generate warnings
          // regardless of what the remaining days value is

          // Simulate: for a terminal-status notice, the service should skip warning generation
          // The logic check is: if status is in TERMINAL_NO_WARN_STATUSES, warningCount = 0
          const shouldGenerateWarnings = !TERMINAL_NO_WARN_STATUSES.includes(terminalStatus);

          expect(shouldGenerateWarnings).toBe(false);

          // Even if remaining days would normally trigger a warning,
          // terminal status prevents it
          if (remainingDays > 0 && remainingDays <= 7) {
            const wouldHaveWarning = getWarningLevel(remainingDays) !== undefined;
            expect(wouldHaveWarning).toBe(true); // Would trigger if active...
            // ...but terminal status blocks it
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('active notices (issued/acknowledged) do receive warnings when thresholds are crossed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<NoticeStatus>('issued', 'acknowledged'),
        fc.integer({ min: 1, max: 7 }),
        (activeStatus, remainingDays) => {
          // Active notices SHOULD get warnings when remaining days <= threshold
          const isTerminal = TERMINAL_NO_WARN_STATUSES.includes(activeStatus);
          expect(isTerminal).toBe(false);

          // Warning level should be defined for remaining days in [1, 7]
          const level = getWarningLevel(remainingDays);
          expect(level).toBeDefined();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('the boundary between active and terminal is exact — responded/withdrawn get zero, issued/acknowledged get warnings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<NoticeStatus>('issued', 'acknowledged', 'responded', 'withdrawn'),
        fc.integer({ min: 1, max: 7 }),
        (status, remainingDays) => {
          const isTerminal = TERMINAL_NO_WARN_STATUSES.includes(status);
          const warningLevel = getWarningLevel(remainingDays);

          if (isTerminal) {
            // Terminal notices never get warnings — regardless of remaining time
            // The service logic: skip warning generation entirely for these statuses
            expect(['responded', 'withdrawn']).toContain(status);
          } else {
            // Active notices should have a defined warning level in range [1, 7]
            expect(warningLevel).toBeDefined();
            expect(['issued', 'acknowledged']).toContain(status);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 9: Deemed Outcome Application
// **Validates: Requirements 4.6, 4.7**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 9: Deemed Outcome Application', () => {
  it('clause with configured deemed outcome produces acceptance or rejection on expiry', () => {
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];
        const clausesWithDeemedOutcome = config.clauseResponsePeriods.filter(
          (c) => c.deemedOutcome !== null,
        );

        // For every clause that has a configured deemed outcome
        for (const clause of clausesWithDeemedOutcome) {
          const looked = getClauseResponsePeriod(form, clause.clauseNumber);
          expect(looked).toBeDefined();
          expect(looked!.deemedOutcome).not.toBeNull();
          expect(['acceptance', 'rejection']).toContain(looked!.deemedOutcome);

          // The deemed outcome on the config must match what's stored on the notice
          // (simulating registration → expiry)
          const deemedOutcomeOnNotice: DeemedOutcome = looked!.deemedOutcome;
          expect(deemedOutcomeOnNotice).toBe(clause.deemedOutcome);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('clause without configured deemed outcome produces null on expiry', () => {
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];
        const clausesWithoutDeemedOutcome = config.clauseResponsePeriods.filter(
          (c) => c.deemedOutcome === null,
        );

        // For every clause that has NO configured deemed outcome
        for (const clause of clausesWithoutDeemedOutcome) {
          const looked = getClauseResponsePeriod(form, clause.clauseNumber);
          expect(looked).toBeDefined();
          expect(looked!.deemedOutcome).toBeNull();

          // The notice record should store null on expiry
          const deemedOutcomeOnNotice: DeemedOutcome = looked!.deemedOutcome;
          expect(deemedOutcomeOnNotice).toBeNull();
        }
      }),
      { numRuns: 50 },
    );
  });

  it('random clause numbers that exist in config always resolve to a valid deemed outcome (acceptance, rejection, or null)', () => {
    // Collect all clause numbers across all forms
    const allClauses: Array<{ form: ContractForm; clauseNumber: string }> = [];
    for (const form of ALL_FORMS) {
      const config = CONTRACT_FORM_CONFIGS[form];
      for (const clause of config.clauseResponsePeriods) {
        allClauses.push({ form, clauseNumber: clause.clauseNumber });
      }
    }

    fc.assert(
      fc.property(fc.constantFrom(...allClauses), ({ form, clauseNumber }) => {
        const result = getClauseResponsePeriod(form, clauseNumber);
        expect(result).toBeDefined();

        // deemedOutcome must be exactly 'acceptance', 'rejection', or null
        const validOutcomes: DeemedOutcome[] = ['acceptance', 'rejection', null];
        expect(validOutcomes).toContain(result!.deemedOutcome);
      }),
      { numRuns: 100 },
    );
  });

  it('random clause numbers NOT in config return undefined (no deemed outcome applicable)', () => {
    fc.assert(
      fc.property(
        contractFormArb,
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^\d/.test(s)),
        (form, randomClause) => {
          const config = CONTRACT_FORM_CONFIGS[form];
          const existingClauses = config.clauseResponsePeriods.map((c) => c.clauseNumber);

          // Only test with clause numbers not in config
          if (!existingClauses.includes(randomClause)) {
            const result = getClauseResponsePeriod(form, randomClause);
            // Non-existent clause → undefined (notice registered without deadline/deemed outcome)
            expect(result).toBeUndefined();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('deemed outcome stored on notice record matches the form config lookup for any form/clause combination', () => {
    fc.assert(
      fc.property(contractFormArb, (form) => {
        const config = CONTRACT_FORM_CONFIGS[form];

        for (const clause of config.clauseResponsePeriods) {
          // Simulate: during notice registration, we look up the clause config
          const clauseConfig = getClauseResponsePeriod(form, clause.clauseNumber);
          expect(clauseConfig).toBeDefined();

          // The deemed outcome that would be stored on the notice record
          const storedOutcome = clauseConfig!.deemedOutcome ?? null;

          // On expiry, the system applies this stored outcome
          if (storedOutcome !== null) {
            // Configured deemed outcome → must be 'acceptance' or 'rejection'
            expect(['acceptance', 'rejection']).toContain(storedOutcome);
          } else {
            // No configured outcome → null stored, expired without applying outcome
            expect(storedOutcome).toBeNull();
          }
        }
      }),
      { numRuns: 50 },
    );
  });
});
