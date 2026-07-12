// @vitest-environment node
/**
 * Timesheet Engine Service — Unit Tests
 *
 * Tests for:
 * - validateTimesheetEntry: required fields, date rules, hours rules, daily max
 * - calculateTimesheetMetrics: total hours, billable %, utilisation rate
 * - submitWeekForApproval: entry status locking, submission creation
 * - canEditEntry: immutability enforcement for approved/invoiced entries
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.9, 10.10
 */

import { describe, it, expect } from 'vitest';
import {
  validateTimesheetEntry,
  calculateTimesheetMetrics,
  submitWeekForApproval,
  canEditEntry,
} from '../services/timesheetEngine';
import type { TimesheetEntry, TimesheetEntryInput } from '../types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<TimesheetEntry> = {}): TimesheetEntry {
  return {
    id: 'ts-1',
    firmId: 'firm-1',
    staffId: 'staff-1',
    projectId: 'proj-1',
    date: '2025-06-10',
    activityCategory: 'design',
    hours: 4,
    description: 'Design work',
    billable: true,
    status: 'draft',
    createdAt: '2025-06-10T08:00:00.000Z',
    updatedAt: '2025-06-10T08:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<TimesheetEntryInput> = {}): TimesheetEntryInput {
  return {
    date: '2025-06-10',
    projectId: 'proj-1',
    activityCategory: 'design',
    hours: 4,
    description: 'Design work on building plans',
    billable: true,
    ...overrides,
  };
}

// ─── validateTimesheetEntry ───────────────────────────────────────────────────

describe('validateTimesheetEntry', () => {
  const now = new Date('2025-06-15T12:00:00.000Z');

  describe('valid entries', () => {
    it('should accept a valid entry with all required fields', () => {
      const input = makeInput();
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.errors).toBeUndefined();
      }
    });

    it('should accept entry with 0.25 hours (minimum)', () => {
      const input = makeInput({ hours: 0.25 });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
      }
    });

    it('should accept entry with 24 hours (maximum)', () => {
      const input = makeInput({ hours: 24 });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
      }
    });

    it('should accept entry with hours in valid 0.25 increments', () => {
      for (const hours of [0.5, 0.75, 1, 1.25, 2.5, 7.75, 8]) {
        const input = makeInput({ hours });
        const result = validateTimesheetEntry(input, [], now);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.valid).toBe(true);
        }
      }
    });
  });

  describe('date validation', () => {
    it('should reject entry with empty date', () => {
      const input = makeInput({ date: '' });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toContain('Date is required.');
      }
    });

    it('should reject entry with future date', () => {
      const input = makeInput({ date: '2025-12-31' });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('future')])
        );
      }
    });

    it('should accept entry with today date', () => {
      const input = makeInput({ date: '2025-06-15' });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
      }
    });

    it('should accept entry with past date', () => {
      const input = makeInput({ date: '2025-01-01' });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
      }
    });
  });

  describe('hours validation', () => {
    it('should reject hours below minimum (0.25)', () => {
      const input = makeInput({ hours: 0.1 });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('between')])
        );
      }
    });

    it('should reject hours above maximum (24)', () => {
      const input = makeInput({ hours: 25 });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('between')])
        );
      }
    });

    it('should reject hours not in 0.25 increments', () => {
      const input = makeInput({ hours: 1.3 });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('0.25 increments')])
        );
      }
    });
  });

  describe('required fields', () => {
    it('should reject entry with empty projectId', () => {
      const input = makeInput({ projectId: '' });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('Project reference')])
        );
      }
    });

    it('should reject entry with empty description', () => {
      const input = makeInput({ description: '' });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('Description is required')])
        );
      }
    });

    it('should reject description exceeding 500 characters', () => {
      const input = makeInput({ description: 'x'.repeat(501) });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('500 characters')])
        );
      }
    });

    it('should reject invalid activity category', () => {
      const input = makeInput({ activityCategory: 'invalid' as any });
      const result = validateTimesheetEntry(input, [], now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('Activity category')])
        );
      }
    });
  });

  describe('daily max enforcement', () => {
    it('should reject entry that would exceed 24h daily limit', () => {
      const existing = [
        makeEntry({ date: '2025-06-10', hours: 20 }),
      ];
      const input = makeInput({ date: '2025-06-10', hours: 5 });
      const result = validateTimesheetEntry(input, existing, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('Daily maximum')])
        );
      }
    });

    it('should accept entry that exactly reaches 24h daily limit', () => {
      const existing = [
        makeEntry({ date: '2025-06-10', hours: 20 }),
      ];
      const input = makeInput({ date: '2025-06-10', hours: 4 });
      const result = validateTimesheetEntry(input, existing, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
      }
    });

    it('should not count entries from other dates toward daily max', () => {
      const existing = [
        makeEntry({ date: '2025-06-09', hours: 20 }),
      ];
      const input = makeInput({ date: '2025-06-10', hours: 8 });
      const result = validateTimesheetEntry(input, existing, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
      }
    });

    it('should sum multiple existing entries for daily max', () => {
      const existing = [
        makeEntry({ id: 'ts-1', date: '2025-06-10', hours: 8 }),
        makeEntry({ id: 'ts-2', date: '2025-06-10', hours: 8 }),
        makeEntry({ id: 'ts-3', date: '2025-06-10', hours: 7.75 }),
      ];
      const input = makeInput({ date: '2025-06-10', hours: 0.5 });
      const result = validateTimesheetEntry(input, existing, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('Daily maximum')])
        );
      }
    });
  });
});

// ─── calculateTimesheetMetrics ────────────────────────────────────────────────

describe('calculateTimesheetMetrics', () => {
  it('should calculate metrics correctly for mixed billable/non-billable entries', () => {
    const entries = [
      makeEntry({ hours: 8, billable: true }),
      makeEntry({ hours: 4, billable: false }),
      makeEntry({ hours: 6, billable: true }),
    ];
    const availableHours = 40;

    const result = calculateTimesheetMetrics(entries, availableHours);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalHoursWeek).toBe(18);
      expect(result.data.totalHoursMonth).toBe(18);
      // billable: 14 / total: 18 × 100 = 77.78%
      expect(result.data.billablePercentage).toBeCloseTo(77.78, 1);
      // utilisation: 14 / 40 × 100 = 35%
      expect(result.data.utilisationRate).toBe(35);
    }
  });

  it('should return 0% billable when all entries are non-billable', () => {
    const entries = [
      makeEntry({ hours: 4, billable: false }),
      makeEntry({ hours: 2, billable: false }),
    ];

    const result = calculateTimesheetMetrics(entries, 40);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.billablePercentage).toBe(0);
      expect(result.data.utilisationRate).toBe(0);
    }
  });

  it('should return 100% billable when all entries are billable', () => {
    const entries = [
      makeEntry({ hours: 8, billable: true }),
      makeEntry({ hours: 8, billable: true }),
    ];

    const result = calculateTimesheetMetrics(entries, 40);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.billablePercentage).toBe(100);
      // utilisation: 16 / 40 × 100 = 40%
      expect(result.data.utilisationRate).toBe(40);
    }
  });

  it('should return zeros for empty entries', () => {
    const result = calculateTimesheetMetrics([], 40);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalHoursWeek).toBe(0);
      expect(result.data.totalHoursMonth).toBe(0);
      expect(result.data.billablePercentage).toBe(0);
      expect(result.data.utilisationRate).toBe(0);
    }
  });

  it('should reject invalid available hours (zero)', () => {
    const result = calculateTimesheetMetrics([], 0);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AVAILABLE_HOURS');
    }
  });

  it('should reject negative available hours', () => {
    const result = calculateTimesheetMetrics([], -10);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AVAILABLE_HOURS');
    }
  });
});

// ─── submitWeekForApproval ────────────────────────────────────────────────────

describe('submitWeekForApproval', () => {
  const weekStart = new Date('2025-06-09');

  it('should submit draft entries and transition them to submitted', () => {
    const entries = [
      makeEntry({ id: 'ts-1', status: 'draft' }),
      makeEntry({ id: 'ts-2', status: 'draft' }),
    ];

    const result = submitWeekForApproval(entries, weekStart);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('submitted');
      expect(result.data.weekStart).toBe('2025-06-09');
      expect(result.data.entries).toHaveLength(2);
      expect(result.data.entries.every(e => e.status === 'submitted')).toBe(true);
      expect(result.data.submittedAt).toBeTruthy();
    }
  });

  it('should reject if any entries are not in draft status', () => {
    const entries = [
      makeEntry({ id: 'ts-1', status: 'draft' }),
      makeEntry({ id: 'ts-2', status: 'approved' }),
    ];

    const result = submitWeekForApproval(entries, weekStart);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_ENTRY_STATUS');
    }
  });

  it('should reject empty entries array', () => {
    const result = submitWeekForApproval([], weekStart);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NO_ENTRIES');
    }
  });

  it('should reject already submitted entries', () => {
    const entries = [
      makeEntry({ id: 'ts-1', status: 'submitted' }),
    ];

    const result = submitWeekForApproval(entries, weekStart);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_ENTRY_STATUS');
    }
  });

  it('should reject invoiced entries', () => {
    const entries = [
      makeEntry({ id: 'ts-1', status: 'invoiced' }),
    ];

    const result = submitWeekForApproval(entries, weekStart);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_ENTRY_STATUS');
    }
  });
});

// ─── canEditEntry ─────────────────────────────────────────────────────────────

describe('canEditEntry', () => {
  it('should allow editing draft entries', () => {
    const entry = makeEntry({ status: 'draft' });
    const result = canEditEntry(entry);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.editable).toBe(true);
      expect(result.data.reason).toBeUndefined();
    }
  });

  it('should allow editing submitted entries', () => {
    const entry = makeEntry({ status: 'submitted' });
    const result = canEditEntry(entry);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.editable).toBe(true);
    }
  });

  it('should reject editing approved entries', () => {
    const entry = makeEntry({ status: 'approved' });
    const result = canEditEntry(entry);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.editable).toBe(false);
      expect(result.data.reason).toContain('Approved');
    }
  });

  it('should reject editing invoiced entries', () => {
    const entry = makeEntry({ status: 'invoiced' });
    const result = canEditEntry(entry);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.editable).toBe(false);
      expect(result.data.reason).toContain('Invoiced');
    }
  });
});
