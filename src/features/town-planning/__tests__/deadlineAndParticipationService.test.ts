/**
 * Deadline Engine & Public Participation Service — Property-Based Tests
 *
 * Validates correctness properties for deadline calculations, deemed-refusal
 * detection, alert escalation, late objection detection, and response linkage.
 *
 * - Property 3: Objection Period Calculation
 * - Property 4: Appeal Deadline Calculation
 * - Property 5: Decision Period Deemed-Refusal
 * - Property 6: Deadline Alert Escalation
 * - Property 7: Late Objection Detection
 * - Property 15: Objection Response Linkage
 *
 * Uses fast-check with minimum 100 iterations per property test.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

import {
  calculateObjectionPeriodEnd,
  calculateAppealDeadline,
  checkDeemedRefused,
  evaluateDeadlineAlerts,
  _resetStore as resetDeadlineStore,
  _getStore as getDeadlineStore,
} from '../services/deadlineEngineService';

import {
  recordObjection,
  recordResponse,
  getObjections,
  _resetStore as resetParticipationStore,
} from '../services/publicParticipationService';

import type { Deadline } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Adds a specified number of days to an ISO date string and returns
 * the resulting ISO date string (YYYY-MM-DD).
 */
function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Returns today's ISO date string (YYYY-MM-DD).
 */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Arbitrary that generates valid ISO date strings (YYYY-MM-DD) within
 * a reasonable range (2020-01-01 to 2035-12-31).
 */
const arbISODate = fc
  .date({
    min: new Date('2020-01-01T00:00:00Z'),
    max: new Date('2035-12-31T00:00:00Z'),
  })
  .map((d) => d.toISOString().split('T')[0]);

/**
 * Creates a test deadline directly in the store for testing evaluateDeadlineAlerts.
 */
function insertDeadline(overrides: Partial<Deadline> & { applicationId: string; dueDate: string }): Deadline {
  const store = getDeadlineStore();
  const deadline: Deadline = {
    id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    applicationId: overrides.applicationId,
    type: overrides.type ?? 'statutory',
    label: overrides.label ?? 'Test Deadline',
    dueDate: overrides.dueDate,
    status: overrides.status ?? 'pending',
    linkedStage: overrides.linkedStage ?? 'tribunal_decision',
    statutoryBasis: overrides.statutoryBasis ?? 'Test',
    daysRemaining: 0,
    alertGenerated: overrides.alertGenerated ?? false,
  };
  store.push(deadline);
  return deadline;
}

// ─── Property 3: Objection Period Calculation ────────────────────────────────
// **Validates: Requirements 2.4, 3.4**
//
// For any application entering the Circulation/Advertising stage, the calculated
// objection period end date equals the advertising start date plus exactly 28
// calendar days (or municipality-specific override).

describe('Property 3: Objection Period Calculation', () => {
  it('calculateObjectionPeriodEnd returns advertising start + 28 days for a known date', () => {
    const result = calculateObjectionPeriodEnd('2026-06-22');
    expect(result).toBe('2026-07-20');
  });

  it('calculateObjectionPeriodEnd always returns exactly 28 days after start date', () => {
    fc.assert(
      fc.property(arbISODate, (startDate) => {
        const result = calculateObjectionPeriodEnd(startDate);
        const expected = addDays(startDate, 28);
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('the result is always a valid ISO date string', () => {
    fc.assert(
      fc.property(arbISODate, (startDate) => {
        const result = calculateObjectionPeriodEnd(startDate);
        // Verify it matches YYYY-MM-DD pattern
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Verify it parses to a valid date
        const parsed = new Date(result);
        expect(parsed.toString()).not.toBe('Invalid Date');
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Appeal Deadline Calculation ─────────────────────────────────
// **Validates: Requirements 2.5, 3.4**
//
// For any application entering the Appeal Period stage, the calculated appeal
// deadline equals the RoD issue date plus exactly 21 calendar days.

describe('Property 4: Appeal Deadline Calculation', () => {
  it('calculateAppealDeadline returns RoD issue date + 21 days for a known date', () => {
    const result = calculateAppealDeadline('2026-07-01');
    expect(result).toBe('2026-07-22');
  });

  it('calculateAppealDeadline always returns exactly 21 days after RoD issue date', () => {
    fc.assert(
      fc.property(arbISODate, (rodDate) => {
        const result = calculateAppealDeadline(rodDate);
        const expected = addDays(rodDate, 21);
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('the result is always a valid ISO date string', () => {
    fc.assert(
      fc.property(arbISODate, (rodDate) => {
        const result = calculateAppealDeadline(rodDate);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const parsed = new Date(result);
        expect(parsed.toString()).not.toBe('Invalid Date');
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: Decision Period Deemed-Refusal ──────────────────────────────
// **Validates: Requirements 2.6, 3.6**
//
// For any application in the Tribunal/Decision stage where the 60-day decision
// period has elapsed without a recorded decision, the system must flag as
// deemed-refused.

describe('Property 5: Decision Period Deemed-Refusal', () => {
  beforeEach(() => {
    resetDeadlineStore();
  });

  it('checkDeemedRefused returns true when decision deadline is past due', () => {
    const appId = 'app-deemed-refused';
    const pastDate = addDays(todayISO(), -5); // 5 days overdue

    insertDeadline({
      applicationId: appId,
      dueDate: pastDate,
      linkedStage: 'tribunal_decision',
      type: 'statutory',
      status: 'pending',
    });

    expect(checkDeemedRefused(appId)).toBe(true);
  });

  it('checkDeemedRefused returns false when decision deadline is in the future', () => {
    const appId = 'app-not-refused';
    const futureDate = addDays(todayISO(), 30); // 30 days remaining

    insertDeadline({
      applicationId: appId,
      dueDate: futureDate,
      linkedStage: 'tribunal_decision',
      type: 'statutory',
      status: 'pending',
    });

    expect(checkDeemedRefused(appId)).toBe(false);
  });

  it('any deadline with a past due date triggers deemed-refused', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        (daysOverdue) => {
          resetDeadlineStore();

          const appId = `app-${daysOverdue}`;
          const pastDate = addDays(todayISO(), -daysOverdue);

          insertDeadline({
            applicationId: appId,
            dueDate: pastDate,
            linkedStage: 'tribunal_decision',
            type: 'statutory',
            status: 'pending',
          });

          expect(checkDeemedRefused(appId)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('any deadline with a future due date does not trigger deemed-refused', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        (daysRemaining) => {
          resetDeadlineStore();

          const appId = `app-future-${daysRemaining}`;
          const futureDate = addDays(todayISO(), daysRemaining);

          insertDeadline({
            applicationId: appId,
            dueDate: futureDate,
            linkedStage: 'tribunal_decision',
            type: 'statutory',
            status: 'pending',
          });

          expect(checkDeemedRefused(appId)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('checkDeemedRefused returns false when no decision deadline exists', () => {
    expect(checkDeemedRefused('nonexistent-app')).toBe(false);
  });
});

// ─── Property 6: Deadline Alert Escalation ───────────────────────────────────
// **Validates: Requirements 3.2, 3.3, 10.1, 10.2**
//
// For any deadline in the register: when within 7 days, generate approaching
// alert (medium priority); when within 2 days, escalate to high priority; when
// past due, mark overdue with urgent priority.

describe('Property 6: Deadline Alert Escalation', () => {
  beforeEach(() => {
    resetDeadlineStore();
  });

  it('deadline within 3-7 days generates medium priority alert', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 7 }),
        (daysAway) => {
          resetDeadlineStore();

          const appId = `app-approaching-${daysAway}`;
          const dueDate = addDays(todayISO(), daysAway);

          insertDeadline({ applicationId: appId, dueDate });

          const alerts = evaluateDeadlineAlerts(appId);
          expect(alerts.length).toBe(1);
          expect(alerts[0].priority).toBe('medium');
          expect(alerts[0].status).toBe('approaching');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deadline within 0-2 days generates high priority alert', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        (daysAway) => {
          resetDeadlineStore();

          const appId = `app-urgent-${daysAway}`;
          const dueDate = addDays(todayISO(), daysAway);

          insertDeadline({ applicationId: appId, dueDate });

          const alerts = evaluateDeadlineAlerts(appId);
          expect(alerts.length).toBe(1);
          expect(alerts[0].priority).toBe('high');
          expect(alerts[0].status).toBe('approaching');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deadline past due generates urgent priority alert', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        (daysOverdue) => {
          resetDeadlineStore();

          const appId = `app-overdue-${daysOverdue}`;
          const dueDate = addDays(todayISO(), -daysOverdue);

          insertDeadline({ applicationId: appId, dueDate });

          const alerts = evaluateDeadlineAlerts(appId);
          expect(alerts.length).toBe(1);
          expect(alerts[0].priority).toBe('urgent');
          expect(alerts[0].status).toBe('overdue');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deadline more than 7 days away generates no alert', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 365 }),
        (daysAway) => {
          resetDeadlineStore();

          const appId = `app-distant-${daysAway}`;
          const dueDate = addDays(todayISO(), daysAway);

          insertDeadline({ applicationId: appId, dueDate });

          const alerts = evaluateDeadlineAlerts(appId);
          expect(alerts.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 7: Late Objection Detection ────────────────────────────────────
// **Validates: Requirements 4.5**
//
// For any objection recorded with a dateReceived after the objection period end
// date, the system must flag it as a late objection.

describe('Property 7: Late Objection Detection', () => {
  beforeEach(() => {
    resetParticipationStore();
  });

  it('objection with dateReceived after objectionPeriodEnd is flagged late', () => {
    fc.assert(
      fc.property(
        arbISODate,
        fc.integer({ min: 1, max: 90 }),
        (periodEnd, daysAfter) => {
          resetParticipationStore();

          const dateReceived = addDays(periodEnd, daysAfter);

          const objection = recordObjection({
            applicationId: 'app-1',
            objectorName: 'Test Objector',
            objectorContactDetails: {
              name: 'Test Objector',
              email: 'objector@test.com',
              phone: '012-345-6789',
            },
            groundsOfObjection: 'Test grounds',
            supportingDocumentIds: [],
            dateReceived,
            objectionPeriodEnd: periodEnd,
          });

          expect(objection.isLate).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('objection with dateReceived on or before objectionPeriodEnd is not late', () => {
    fc.assert(
      fc.property(
        arbISODate,
        fc.integer({ min: 0, max: 28 }),
        (periodEnd, daysBefore) => {
          resetParticipationStore();

          const dateReceived = addDays(periodEnd, -daysBefore);

          const objection = recordObjection({
            applicationId: 'app-1',
            objectorName: 'Test Objector',
            objectorContactDetails: {
              name: 'Test Objector',
              email: 'objector@test.com',
              phone: '012-345-6789',
            },
            groundsOfObjection: 'Test grounds',
            supportingDocumentIds: [],
            dateReceived,
            objectionPeriodEnd: periodEnd,
          });

          expect(objection.isLate).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('objection received exactly on the period end date is not late', () => {
    const periodEnd = '2026-07-20';

    const objection = recordObjection({
      applicationId: 'app-exact',
      objectorName: 'Exact Objector',
      objectorContactDetails: {
        name: 'Exact Objector',
        email: 'exact@test.com',
        phone: '012-345-6789',
      },
      groundsOfObjection: 'Submitted on the last day',
      supportingDocumentIds: [],
      dateReceived: periodEnd,
      objectionPeriodEnd: periodEnd,
    });

    expect(objection.isLate).toBe(false);
  });
});

// ─── Property 15: Objection Response Linkage ─────────────────────────────────
// **Validates: Requirements 4.2**
//
// For any objection response, it must be linked to exactly one original
// objection, and the response date must be recorded.

describe('Property 15: Objection Response Linkage', () => {
  beforeEach(() => {
    resetParticipationStore();
  });

  it('recordResponse links the response to the original objection and updates its status', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100, unit: 'grapheme-ascii' }),
        fc.string({ minLength: 1, maxLength: 50, unit: 'grapheme-ascii' }),
        (responseText, respondedBy) => {
          resetParticipationStore();

          // First record an objection
          const objection = recordObjection({
            applicationId: 'app-response-test',
            objectorName: 'Objector',
            objectorContactDetails: {
              name: 'Objector',
              email: 'obj@test.com',
              phone: '011-111-1111',
            },
            groundsOfObjection: 'Test grounds',
            supportingDocumentIds: [],
            dateReceived: '2026-06-15',
            objectionPeriodEnd: '2026-07-20',
          });

          // Record a response
          const response = recordResponse({
            objectionId: objection.id,
            applicationId: 'app-response-test',
            responseText,
            respondedBy,
            supportingDocumentIds: [],
          });

          // Verify linkage: response links to the objection
          expect(response.objectionId).toBe(objection.id);

          // Verify the response has a date recorded
          expect(response.respondedAt).toBeDefined();
          expect(response.respondedAt.length).toBeGreaterThan(0);

          // Verify the original objection now has the responseId set
          const allObjections = getObjections('app-response-test');
          const updatedObjection = allObjections.find((o) => o.id === objection.id);
          expect(updatedObjection?.responseId).toBe(response.id);

          // Verify the objection status changed to 'responded'
          expect(updatedObjection?.status).toBe('responded');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('recordResponse throws when objection does not exist', () => {
    expect(() =>
      recordResponse({
        objectionId: 'nonexistent-id',
        applicationId: 'app-1',
        responseText: 'Test response',
        respondedBy: 'planner-1',
        supportingDocumentIds: [],
      }),
    ).toThrow(/Objection not found/);
  });

  it('each response has a unique ID and records the respondedAt timestamp', () => {
    const objection = recordObjection({
      applicationId: 'app-unique-resp',
      objectorName: 'Objector',
      objectorContactDetails: {
        name: 'Objector',
        email: 'obj@test.com',
        phone: '011-111-1111',
      },
      groundsOfObjection: 'Grounds',
      supportingDocumentIds: [],
      dateReceived: '2026-06-10',
      objectionPeriodEnd: '2026-07-20',
    });

    const response = recordResponse({
      objectionId: objection.id,
      applicationId: 'app-unique-resp',
      responseText: 'Response text',
      respondedBy: 'planner-1',
      supportingDocumentIds: [],
    });

    expect(response.id).toBeDefined();
    expect(response.id.startsWith('resp_')).toBe(true);
    // respondedAt should be a valid ISO timestamp
    const parsedDate = new Date(response.respondedAt);
    expect(parsedDate.toString()).not.toBe('Invalid Date');
  });
});
