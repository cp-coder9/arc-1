/**
 * Unit tests for TimesheetEngineService
 *
 * Tests entry creation, cost calculation, submission workflow,
 * approval, and rejection flows.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
import {
  createTimesheetEntry,
  submitWeeklyTimesheet,
  approveSubmission,
  rejectSubmission,
  getSubmissionsForApproval,
  getMySubmissions,
  calculateDurationMinutes,
  getHourlyRateCents,
} from '../timesheetEngineService';
import type { CreateTimesheetEntryInput } from '../timesheetEngineService';
import type {
  BillingRate,
  PracticeTimesheetEntry,
  TimesheetSubmission,
} from '../types';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';
const USER_ID = 'user_001';
const APPROVER_ID = 'approver_001';
const PROJECT_ID = 'project_001';

function makeBillingRate(overrides: Partial<BillingRate> = {}): BillingRate {
  return {
    id: 'rate_001',
    firmId: FIRM_ID,
    role: 'architect',
    rateType: 'hourly',
    rateCents: 85000, // R850/hr
    effectiveDate: '2025-01-01',
    createdBy: 'admin_001',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEntryInput(overrides: Partial<CreateTimesheetEntryInput> = {}): CreateTimesheetEntryInput {
  return {
    userId: USER_ID,
    firmId: FIRM_ID,
    projectId: PROJECT_ID,
    sacapStage: 'stage_3_design_development',
    activity: 'Design review meeting',
    date: '2025-06-16', // Monday
    startTime: '09:00',
    endTime: '11:00',
    role: 'architect',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<PracticeTimesheetEntry> = {}): PracticeTimesheetEntry {
  return {
    id: `entry_${Date.now()}`,
    userId: USER_ID,
    firmId: FIRM_ID,
    projectId: PROJECT_ID,
    date: '2025-06-16',
    startTime: '09:00',
    endTime: '11:00',
    durationMinutes: 120,
    description: 'Design review meeting',
    billable: 'billable',
    hourlyRateCents: 85000,
    totalValueCents: 170000,
    createdAt: '2025-06-16T09:00:00.000Z',
    sacapStage: 'stage_3_design_development',
    activity: 'Design review meeting',
    approvalStatus: 'draft',
    billingRateId: 'rate_001',
    ...overrides,
  };
}

function makeSubmission(overrides: Partial<TimesheetSubmission> = {}): TimesheetSubmission {
  return {
    id: 'sub_001',
    firmId: FIRM_ID,
    userId: USER_ID,
    weekStartDate: '2025-06-16',
    weekEndDate: '2025-06-22',
    entryIds: ['entry_1', 'entry_2'],
    status: 'pending_approval',
    submittedAt: '2025-06-22T17:00:00.000Z',
    totalHours: 16,
    totalValueCents: 1360000,
    createdAt: '2025-06-22T17:00:00.000Z',
    updatedAt: '2025-06-22T17:00:00.000Z',
    ...overrides,
  };
}

const sampleRates: BillingRate[] = [
  makeBillingRate({
    id: 'rate_arch_v1',
    role: 'architect',
    rateCents: 75000,
    effectiveDate: '2024-01-01',
  }),
  makeBillingRate({
    id: 'rate_arch_v2',
    role: 'architect',
    rateCents: 85000,
    effectiveDate: '2025-01-01',
  }),
  makeBillingRate({
    id: 'rate_tech_v1',
    role: 'technologist',
    rateCents: 55000,
    effectiveDate: '2024-06-01',
  }),
  makeBillingRate({
    id: 'rate_daily',
    role: 'technician',
    rateType: 'daily',
    rateCents: 320000, // R3200/day = R400/hr
    effectiveDate: '2025-01-01',
  }),
];

// ─── calculateDurationMinutes ───────────────────────────────────────────────

describe('TimesheetEngineService', () => {
  describe('calculateDurationMinutes', () => {
    it('calculates duration for same-day times', () => {
      expect(calculateDurationMinutes('09:00', '11:00')).toBe(120);
      expect(calculateDurationMinutes('08:30', '17:00')).toBe(510);
      expect(calculateDurationMinutes('14:00', '14:30')).toBe(30);
    });

    it('handles overnight work (endTime < startTime)', () => {
      // 22:00 to 02:00 = 4 hours
      expect(calculateDurationMinutes('22:00', '02:00')).toBe(240);
    });

    it('handles full day when start equals end', () => {
      // 09:00 to 09:00 = 24 hours (full day cycle)
      expect(calculateDurationMinutes('09:00', '09:00')).toBe(1440);
    });
  });

  // ─── getHourlyRateCents ─────────────────────────────────────────────────

  describe('getHourlyRateCents', () => {
    it('returns rateCents directly for hourly rates', () => {
      const rate = makeBillingRate({ rateType: 'hourly', rateCents: 85000 });
      expect(getHourlyRateCents(rate)).toBe(85000);
    });

    it('divides daily rate by 8 hours', () => {
      const rate = makeBillingRate({ rateType: 'daily', rateCents: 320000 });
      expect(getHourlyRateCents(rate)).toBe(40000); // 320000 / 8
    });

    it('returns rateCents for fixed rates', () => {
      const rate = makeBillingRate({ rateType: 'fixed', rateCents: 100000 });
      expect(getHourlyRateCents(rate)).toBe(100000);
    });
  });

  // ─── createTimesheetEntry ─────────────────────────────────────────────────

  describe('createTimesheetEntry', () => {
    it('creates an entry with all required fields', () => {
      const input = makeEntryInput();
      const entry = createTimesheetEntry(input, sampleRates);

      expect(entry.userId).toBe(USER_ID);
      expect(entry.firmId).toBe(FIRM_ID);
      expect(entry.projectId).toBe(PROJECT_ID);
      expect(entry.sacapStage).toBe('stage_3_design_development');
      expect(entry.activity).toBe('Design review meeting');
      expect(entry.date).toBe('2025-06-16');
      expect(entry.startTime).toBe('09:00');
      expect(entry.endTime).toBe('11:00');
      expect(entry.id).toBeTruthy();
      expect(entry.createdAt).toBeTruthy();
    });

    it('calculates duration in minutes', () => {
      const input = makeEntryInput({ startTime: '09:00', endTime: '12:30' });
      const entry = createTimesheetEntry(input, sampleRates);

      expect(entry.durationMinutes).toBe(210); // 3.5 hours
    });

    it('computes cost using applicable billing rate', () => {
      // 2 hours × R850/hr = R1700 = 170000 cents
      const input = makeEntryInput({
        date: '2025-06-16',
        startTime: '09:00',
        endTime: '11:00',
        role: 'architect',
      });
      const entry = createTimesheetEntry(input, sampleRates);

      expect(entry.hourlyRateCents).toBe(85000);
      expect(entry.totalValueCents).toBe(170000);
      expect(entry.billingRateId).toBe('rate_arch_v2');
    });

    it('uses temporal rate lookup (applies rate valid at entry date)', () => {
      // Entry in 2024 should use the 2024 rate (75000 cents/hr)
      const input = makeEntryInput({
        date: '2024-06-15',
        startTime: '09:00',
        endTime: '10:00',
        role: 'architect',
      });
      const entry = createTimesheetEntry(input, sampleRates);

      expect(entry.hourlyRateCents).toBe(75000);
      expect(entry.totalValueCents).toBe(75000); // 1 hour × R750
      expect(entry.billingRateId).toBe('rate_arch_v1');
    });

    it('handles daily billing rate (converts to hourly)', () => {
      const input = makeEntryInput({
        date: '2025-06-16',
        startTime: '09:00',
        endTime: '13:00', // 4 hours
        role: 'technician',
      });
      const entry = createTimesheetEntry(input, sampleRates);

      // Daily rate 320000 / 8 = 40000 cents/hr, 4 hours = 160000 cents
      expect(entry.hourlyRateCents).toBe(40000);
      expect(entry.totalValueCents).toBe(160000);
    });

    it('allows entry with zero cost when no applicable rate exists', () => {
      const input = makeEntryInput({
        role: 'admin', // No rate defined for admin
      });
      const entry = createTimesheetEntry(input, sampleRates);

      expect(entry.totalValueCents).toBe(0);
      expect(entry.hourlyRateCents).toBeUndefined();
      expect(entry.billingRateId).toBeUndefined();
    });

    it('sets approval status to draft on creation', () => {
      const input = makeEntryInput();
      const entry = createTimesheetEntry(input, sampleRates);

      expect(entry.approvalStatus).toBe('draft');
    });

    it('sets billable status to billable', () => {
      const input = makeEntryInput();
      const entry = createTimesheetEntry(input, sampleRates);

      expect(entry.billable).toBe('billable');
    });
  });

  // ─── submitWeeklyTimesheet ────────────────────────────────────────────────

  describe('submitWeeklyTimesheet', () => {
    it('creates a submission from draft entries for the week', () => {
      const entries: PracticeTimesheetEntry[] = [
        makeEntry({ id: 'e1', date: '2025-06-16' }),
        makeEntry({ id: 'e2', date: '2025-06-17' }),
        makeEntry({ id: 'e3', date: '2025-06-18' }),
      ];

      const result = submitWeeklyTimesheet(
        USER_ID,
        FIRM_ID,
        '2025-06-16',
        entries,
        APPROVER_ID,
      );

      expect(result.submission.status).toBe('pending_approval');
      expect(result.submission.userId).toBe(USER_ID);
      expect(result.submission.firmId).toBe(FIRM_ID);
      expect(result.submission.weekStartDate).toBe('2025-06-16');
      expect(result.submission.weekEndDate).toBe('2025-06-22');
      expect(result.submission.entryIds).toHaveLength(3);
      expect(result.submission.submittedAt).toBeTruthy();
    });

    it('calculates total hours and total value', () => {
      const entries: PracticeTimesheetEntry[] = [
        makeEntry({ id: 'e1', date: '2025-06-16', durationMinutes: 120, totalValueCents: 170000 }),
        makeEntry({ id: 'e2', date: '2025-06-17', durationMinutes: 480, totalValueCents: 680000 }),
      ];

      const result = submitWeeklyTimesheet(
        USER_ID,
        FIRM_ID,
        '2025-06-16',
        entries,
        APPROVER_ID,
      );

      expect(result.submission.totalHours).toBe(10); // (120 + 480) / 60
      expect(result.submission.totalValueCents).toBe(850000);
    });

    it('updates entries with submission ID and pending_approval status', () => {
      const entries: PracticeTimesheetEntry[] = [
        makeEntry({ id: 'e1', date: '2025-06-16' }),
      ];

      const result = submitWeeklyTimesheet(
        USER_ID,
        FIRM_ID,
        '2025-06-16',
        entries,
        APPROVER_ID,
      );

      expect(result.updatedEntries[0].submissionId).toBe(result.submission.id);
      expect(result.updatedEntries[0].approvalStatus).toBe('pending_approval');
    });

    it('creates an action centre action for the approver', () => {
      const entries: PracticeTimesheetEntry[] = [
        makeEntry({ id: 'e1', date: '2025-06-16' }),
      ];

      const result = submitWeeklyTimesheet(
        USER_ID,
        FIRM_ID,
        '2025-06-16',
        entries,
        APPROVER_ID,
      );

      expect(result.action.type).toBe('timesheet_approval_required');
      expect(result.action.targetUserId).toBe(APPROVER_ID);
      expect(result.action.submissionId).toBe(result.submission.id);
      expect(result.action.firmId).toBe(FIRM_ID);
      expect(result.action.message).toContain('2025-06-16');
    });

    it('throws when no draft entries exist for the week', () => {
      const entries: PracticeTimesheetEntry[] = [
        makeEntry({ id: 'e1', date: '2025-06-16', approvalStatus: 'approved' }),
      ];

      expect(() =>
        submitWeeklyTimesheet(USER_ID, FIRM_ID, '2025-06-16', entries, APPROVER_ID),
      ).toThrow('No draft entries found for the specified week');
    });

    it('only includes entries within the specified week', () => {
      const entries: PracticeTimesheetEntry[] = [
        makeEntry({ id: 'e1', date: '2025-06-16' }), // In week
        makeEntry({ id: 'e2', date: '2025-06-23' }), // Next week
        makeEntry({ id: 'e3', date: '2025-06-09' }), // Previous week
      ];

      const result = submitWeeklyTimesheet(
        USER_ID,
        FIRM_ID,
        '2025-06-16',
        entries,
        APPROVER_ID,
      );

      expect(result.submission.entryIds).toHaveLength(1);
      expect(result.submission.entryIds).toContain('e1');
    });

    it('excludes entries from other users', () => {
      const entries: PracticeTimesheetEntry[] = [
        makeEntry({ id: 'e1', date: '2025-06-16', userId: USER_ID }),
        makeEntry({ id: 'e2', date: '2025-06-17', userId: 'other_user' }),
      ];

      const result = submitWeeklyTimesheet(
        USER_ID,
        FIRM_ID,
        '2025-06-16',
        entries,
        APPROVER_ID,
      );

      expect(result.submission.entryIds).toHaveLength(1);
      expect(result.submission.entryIds).toContain('e1');
    });
  });

  // ─── approveSubmission ────────────────────────────────────────────────────

  describe('approveSubmission', () => {
    it('marks submission as approved with approver info', () => {
      const submission = makeSubmission({ status: 'pending_approval' });
      const entries = [
        makeEntry({ id: 'entry_1', approvalStatus: 'pending_approval' }),
        makeEntry({ id: 'entry_2', approvalStatus: 'pending_approval' }),
      ];

      const result = approveSubmission(submission, APPROVER_ID, entries);

      expect(result.submission.status).toBe('approved');
      expect(result.submission.approvedBy).toBe(APPROVER_ID);
      expect(result.submission.approvedAt).toBeTruthy();
    });

    it('marks all entries as approved', () => {
      const submission = makeSubmission({ entryIds: ['entry_1', 'entry_2'] });
      const entries = [
        makeEntry({ id: 'entry_1', approvalStatus: 'pending_approval' }),
        makeEntry({ id: 'entry_2', approvalStatus: 'pending_approval' }),
      ];

      const result = approveSubmission(submission, APPROVER_ID, entries);

      expect(result.updatedEntries).toHaveLength(2);
      expect(result.updatedEntries[0].approvalStatus).toBe('approved');
      expect(result.updatedEntries[1].approvalStatus).toBe('approved');
    });

    it('calculates project time cost deltas', () => {
      const submission = makeSubmission({ entryIds: ['entry_1', 'entry_2', 'entry_3'] });
      const entries = [
        makeEntry({ id: 'entry_1', projectId: 'proj_A', totalValueCents: 100000 }),
        makeEntry({ id: 'entry_2', projectId: 'proj_A', totalValueCents: 50000 }),
        makeEntry({ id: 'entry_3', projectId: 'proj_B', totalValueCents: 75000 }),
      ];

      const result = approveSubmission(submission, APPROVER_ID, entries);

      expect(result.projectTimeCostDelta).toHaveLength(2);

      const projA = result.projectTimeCostDelta.find((d) => d.projectId === 'proj_A');
      const projB = result.projectTimeCostDelta.find((d) => d.projectId === 'proj_B');

      expect(projA?.deltaCents).toBe(150000);
      expect(projB?.deltaCents).toBe(75000);
    });

    it('throws when trying to approve a non-pending submission', () => {
      const submission = makeSubmission({ status: 'approved' });
      const entries = [makeEntry({ id: 'entry_1' })];

      expect(() => approveSubmission(submission, APPROVER_ID, entries)).toThrow(
        'Cannot approve submission with status "approved"',
      );
    });

    it('throws when trying to approve a draft submission', () => {
      const submission = makeSubmission({ status: 'draft' });
      const entries = [makeEntry({ id: 'entry_1' })];

      expect(() => approveSubmission(submission, APPROVER_ID, entries)).toThrow(
        'Cannot approve submission with status "draft"',
      );
    });
  });

  // ─── rejectSubmission ─────────────────────────────────────────────────────

  describe('rejectSubmission', () => {
    it('marks submission as rejected with reason', () => {
      const submission = makeSubmission({ status: 'pending_approval' });
      const entries = [
        makeEntry({ id: 'entry_1', approvalStatus: 'pending_approval' }),
        makeEntry({ id: 'entry_2', approvalStatus: 'pending_approval' }),
      ];

      const result = rejectSubmission(
        submission,
        APPROVER_ID,
        'Incorrect project allocation for Monday entries',
        entries,
      );

      expect(result.submission.status).toBe('rejected');
      expect(result.submission.rejectedBy).toBe(APPROVER_ID);
      expect(result.submission.rejectedAt).toBeTruthy();
      expect(result.submission.rejectionReason).toBe(
        'Incorrect project allocation for Monday entries',
      );
    });

    it('marks entries as rejected and clears submission reference', () => {
      const submission = makeSubmission({ entryIds: ['entry_1', 'entry_2'] });
      const entries = [
        makeEntry({ id: 'entry_1', submissionId: 'sub_001', approvalStatus: 'pending_approval' }),
        makeEntry({ id: 'entry_2', submissionId: 'sub_001', approvalStatus: 'pending_approval' }),
      ];

      const result = rejectSubmission(submission, APPROVER_ID, 'Please revise', entries);

      expect(result.updatedEntries).toHaveLength(2);
      expect(result.updatedEntries[0].approvalStatus).toBe('rejected');
      expect(result.updatedEntries[0].submissionId).toBeUndefined();
      expect(result.updatedEntries[1].approvalStatus).toBe('rejected');
      expect(result.updatedEntries[1].submissionId).toBeUndefined();
    });

    it('creates a notification for the staff member', () => {
      const submission = makeSubmission({ status: 'pending_approval' });
      const entries = [makeEntry({ id: 'entry_1' })];

      const result = rejectSubmission(
        submission,
        APPROVER_ID,
        'Missing activity descriptions',
        entries,
      );

      expect(result.notification.type).toBe('timesheet_rejected');
      expect(result.notification.targetUserId).toBe(USER_ID);
      expect(result.notification.message).toContain('rejected');
      expect(result.notification.message).toContain('Missing activity descriptions');
    });

    it('throws when trying to reject a non-pending submission', () => {
      const submission = makeSubmission({ status: 'approved' });
      const entries = [makeEntry({ id: 'entry_1' })];

      expect(() => rejectSubmission(submission, APPROVER_ID, 'reason', entries)).toThrow(
        'Cannot reject submission with status "approved"',
      );
    });

    it('throws when rejection reason is empty', () => {
      const submission = makeSubmission({ status: 'pending_approval' });
      const entries = [makeEntry({ id: 'entry_1' })];

      expect(() => rejectSubmission(submission, APPROVER_ID, '', entries)).toThrow(
        'Rejection reason is required',
      );
    });

    it('throws when rejection reason is whitespace only', () => {
      const submission = makeSubmission({ status: 'pending_approval' });
      const entries = [makeEntry({ id: 'entry_1' })];

      expect(() => rejectSubmission(submission, APPROVER_ID, '   ', entries)).toThrow(
        'Rejection reason is required',
      );
    });
  });

  // ─── getSubmissionsForApproval ────────────────────────────────────────────

  describe('getSubmissionsForApproval', () => {
    it('returns only pending_approval submissions for the firm', () => {
      const submissions: TimesheetSubmission[] = [
        makeSubmission({ id: 's1', status: 'pending_approval', firmId: FIRM_ID }),
        makeSubmission({ id: 's2', status: 'approved', firmId: FIRM_ID }),
        makeSubmission({ id: 's3', status: 'pending_approval', firmId: FIRM_ID }),
        makeSubmission({ id: 's4', status: 'pending_approval', firmId: 'other_firm' }),
      ];

      const result = getSubmissionsForApproval(submissions, FIRM_ID);

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.id)).toEqual(['s1', 's3']);
    });

    it('returns empty array when no pending submissions exist', () => {
      const submissions: TimesheetSubmission[] = [
        makeSubmission({ id: 's1', status: 'approved', firmId: FIRM_ID }),
      ];

      const result = getSubmissionsForApproval(submissions, FIRM_ID);

      expect(result).toHaveLength(0);
    });
  });

  // ─── getMySubmissions ─────────────────────────────────────────────────────

  describe('getMySubmissions', () => {
    it('returns submissions for the specified user sorted by week descending', () => {
      const submissions: TimesheetSubmission[] = [
        makeSubmission({ id: 's1', userId: USER_ID, weekStartDate: '2025-06-09' }),
        makeSubmission({ id: 's2', userId: USER_ID, weekStartDate: '2025-06-23' }),
        makeSubmission({ id: 's3', userId: USER_ID, weekStartDate: '2025-06-16' }),
        makeSubmission({ id: 's4', userId: 'other_user', weekStartDate: '2025-06-16' }),
      ];

      const result = getMySubmissions(submissions, USER_ID, FIRM_ID);

      expect(result).toHaveLength(3);
      expect(result[0].weekStartDate).toBe('2025-06-23');
      expect(result[1].weekStartDate).toBe('2025-06-16');
      expect(result[2].weekStartDate).toBe('2025-06-09');
    });

    it('scopes results by firmId', () => {
      const submissions: TimesheetSubmission[] = [
        makeSubmission({ id: 's1', userId: USER_ID, firmId: FIRM_ID }),
        makeSubmission({ id: 's2', userId: USER_ID, firmId: 'other_firm' }),
      ];

      const result = getMySubmissions(submissions, USER_ID, FIRM_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1');
    });

    it('returns empty array when user has no submissions', () => {
      const submissions: TimesheetSubmission[] = [
        makeSubmission({ id: 's1', userId: 'other_user', firmId: FIRM_ID }),
      ];

      const result = getMySubmissions(submissions, USER_ID, FIRM_ID);

      expect(result).toHaveLength(0);
    });
  });
});
