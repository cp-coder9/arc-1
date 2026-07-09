/**
 * Leave Manager Service — Unit Tests
 *
 * Tests leave request creation, working days calculation, balance validation,
 * approval with capacity deduction, and rejection workflows.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import {
  requestLeave,
  approveLeave,
  rejectLeave,
  getLeaveBalance,
  getTeamLeave,
  calculateWorkingDays,
  getPublicHolidays,
  applyBalanceUpdate,
  applyBalanceRelease,
  addPendingDays,
} from '../leaveManagerService';
import type { LeaveRequest, LeaveBalance, LeaveRequestInput } from '../types';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeBalance(overrides: Partial<LeaveBalance> = {}): LeaveBalance {
  return {
    userId: 'user-1',
    firmId: 'firm-1',
    leaveType: 'annual',
    annualCycle: '2025',
    entitlement: 21,
    used: 5,
    pending: 3,
    available: 13, // 21 - 5 - 3
    ...overrides,
  };
}

function makeLeaveRequest(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'leave_firm-1_user-1_2025-03-10_1234567890',
    firmId: 'firm-1',
    userId: 'user-1',
    leaveType: 'annual',
    startDate: '2025-03-10',
    endDate: '2025-03-14',
    workingDays: 5,
    status: 'pending',
    createdAt: '2025-03-01T00:00:00.000Z',
    updatedAt: '2025-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<LeaveRequestInput> = {}): LeaveRequestInput {
  return {
    firmId: 'firm-1',
    userId: 'user-1',
    leaveType: 'annual',
    startDate: '2025-03-10', // Monday
    endDate: '2025-03-14', // Friday
    notes: 'Family holiday',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LeaveManagerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── calculateWorkingDays ────────────────────────────────────────────

  describe('calculateWorkingDays', () => {
    it('counts weekdays only, excluding weekends', () => {
      // Mon 10 Mar to Fri 14 Mar 2025 = 5 working days
      expect(calculateWorkingDays('2025-03-10', '2025-03-14')).toBe(5);
    });

    it('excludes Saturday and Sunday from the count', () => {
      // Mon 10 Mar to Sun 16 Mar 2025 = 5 working days (Sat+Sun excluded)
      expect(calculateWorkingDays('2025-03-10', '2025-03-16')).toBe(5);
    });

    it('excludes public holidays', () => {
      // 21 March 2025 is Human Rights Day (Friday)
      // Mon 17 Mar to Fri 21 Mar 2025 = 4 working days (21st is public holiday)
      expect(calculateWorkingDays('2025-03-17', '2025-03-21')).toBe(4);
    });

    it('returns 0 when end date is before start date', () => {
      expect(calculateWorkingDays('2025-03-14', '2025-03-10')).toBe(0);
    });

    it('returns 1 for a single working day', () => {
      expect(calculateWorkingDays('2025-03-10', '2025-03-10')).toBe(1);
    });

    it('returns 0 for a single weekend day', () => {
      // 15 March 2025 is a Saturday
      expect(calculateWorkingDays('2025-03-15', '2025-03-15')).toBe(0);
    });

    it('handles two weeks correctly', () => {
      // Mon 10 Mar to Fri 21 Mar 2025 = 10 weekdays - 1 holiday (21st) = 9
      expect(calculateWorkingDays('2025-03-10', '2025-03-21')).toBe(9);
    });

    it('accepts pre-computed public holidays', () => {
      // Pass custom holiday list that includes 2025-03-10 (a Monday)
      const customHolidays = ['2025-03-10'];
      // Mon 10 to Fri 14 = 5 weekdays, minus 1 holiday = 4
      expect(calculateWorkingDays('2025-03-10', '2025-03-14', customHolidays)).toBe(4);
    });
  });

  // ─── getPublicHolidays ───────────────────────────────────────────────

  describe('getPublicHolidays', () => {
    it('returns 12 public holidays for a year', () => {
      const holidays = getPublicHolidays(2025);
      expect(holidays.length).toBe(12);
    });

    it('includes fixed date holidays', () => {
      const holidays = getPublicHolidays(2025);
      expect(holidays).toContain('2025-01-01'); // New Year's Day
      expect(holidays).toContain('2025-03-21'); // Human Rights Day
      expect(holidays).toContain('2025-04-27'); // Freedom Day
      expect(holidays).toContain('2025-05-01'); // Workers' Day
      expect(holidays).toContain('2025-06-16'); // Youth Day
      expect(holidays).toContain('2025-12-25'); // Christmas Day
    });

    it('includes Easter-based holidays', () => {
      // Easter 2025 is April 20
      const holidays = getPublicHolidays(2025);
      expect(holidays).toContain('2025-04-18'); // Good Friday
      expect(holidays).toContain('2025-04-21'); // Family Day (Easter Monday)
    });
  });

  // ─── requestLeave ───────────────────────────────────────────────────

  describe('requestLeave', () => {
    it('creates a leave request with calculated working days', () => {
      const input = makeInput();
      const balances = [makeBalance()];

      const result = requestLeave(input, balances);

      expect(result.error).toBeUndefined();
      expect(result.request).toBeDefined();
      expect(result.request!.workingDays).toBe(5);
      expect(result.request!.status).toBe('pending');
      expect(result.request!.leaveType).toBe('annual');
      expect(result.request!.firmId).toBe('firm-1');
      expect(result.request!.userId).toBe('user-1');
      expect(result.request!.startDate).toBe('2025-03-10');
      expect(result.request!.endDate).toBe('2025-03-14');
      expect(result.request!.notes).toBe('Family holiday');
    });

    it('rejects when working days is zero', () => {
      // Saturday to Sunday — 0 working days
      const input = makeInput({ startDate: '2025-03-15', endDate: '2025-03-16' });
      const balances = [makeBalance()];

      const result = requestLeave(input, balances);

      expect(result.error).toBe('Leave request covers zero working days');
      expect(result.request).toBeUndefined();
    });

    it('rejects when balance is insufficient (Requirement 9.5)', () => {
      const input = makeInput({
        startDate: '2025-03-03', // Monday
        endDate: '2025-03-19', // Wednesday (spans 13 working days minus holiday = 12)
      });
      // Only 2 available days
      const balances = [makeBalance({ available: 2 })];

      const result = requestLeave(input, balances);

      expect(result.error).toContain('Insufficient');
      expect(result.request).toBeUndefined();
    });

    it('rejects when no balance record exists', () => {
      const input = makeInput();
      const balances: LeaveBalance[] = []; // No balances at all

      const result = requestLeave(input, balances);

      expect(result.error).toContain('No leave balance found');
      expect(result.request).toBeUndefined();
    });

    it('allows unpaid leave without balance check', () => {
      const input = makeInput({ leaveType: 'unpaid' });
      const balances: LeaveBalance[] = []; // No balances

      const result = requestLeave(input, balances);

      expect(result.error).toBeUndefined();
      expect(result.request).toBeDefined();
      expect(result.request!.leaveType).toBe('unpaid');
      expect(result.request!.workingDays).toBe(5);
    });

    it('generates a unique ID', () => {
      const input = makeInput();
      const balances = [makeBalance()];

      const result = requestLeave(input, balances);

      expect(result.request!.id).toMatch(/^leave_firm-1_user-1_2025-03-10_/);
    });
  });

  // ─── approveLeave ──────────────────────────────────────────────────

  describe('approveLeave', () => {
    it('approves a pending leave request (Requirement 9.3)', () => {
      const requests = [makeLeaveRequest()];

      const result = approveLeave(requests, requests[0].id, 'approver-1');

      expect(result).not.toBeNull();
      expect(result!.request.status).toBe('approved');
      expect(result!.request.approvedBy).toBe('approver-1');
      expect(result!.request.approvedAt).toBeDefined();
    });

    it('returns balance update for capacity deduction', () => {
      const requests = [makeLeaveRequest({ workingDays: 5 })];

      const result = approveLeave(requests, requests[0].id, 'approver-1');

      expect(result!.balanceUpdate.daysToDeduct).toBe(5);
      expect(result!.balanceUpdate.usedIncrease).toBe(5);
      expect(result!.balanceUpdate.pendingReduction).toBe(5);
      expect(result!.balanceUpdate.userId).toBe('user-1');
      expect(result!.balanceUpdate.leaveType).toBe('annual');
    });

    it('returns null for non-existent request', () => {
      const result = approveLeave([], 'nonexistent-id', 'approver-1');
      expect(result).toBeNull();
    });

    it('returns null for already-approved request', () => {
      const requests = [makeLeaveRequest({ status: 'approved' })];

      const result = approveLeave(requests, requests[0].id, 'approver-1');
      expect(result).toBeNull();
    });

    it('returns null for rejected request', () => {
      const requests = [makeLeaveRequest({ status: 'rejected' })];

      const result = approveLeave(requests, requests[0].id, 'approver-1');
      expect(result).toBeNull();
    });
  });

  // ─── rejectLeave ──────────────────────────────────────────────────

  describe('rejectLeave', () => {
    it('rejects a pending leave request with reason (Requirement 9.4)', () => {
      const requests = [makeLeaveRequest()];

      const result = rejectLeave(requests, requests[0].id, 'approver-1', 'Team too thin this week');

      expect(result).not.toBeNull();
      expect(result!.request.status).toBe('rejected');
      expect(result!.request.rejectedBy).toBe('approver-1');
      expect(result!.request.rejectedAt).toBeDefined();
      expect(result!.request.rejectionReason).toBe('Team too thin this week');
    });

    it('returns balance release for pending days', () => {
      const requests = [makeLeaveRequest({ workingDays: 5 })];

      const result = rejectLeave(requests, requests[0].id, 'approver-1', 'Denied');

      expect(result!.balanceRelease.daysToRelease).toBe(5);
      expect(result!.balanceRelease.userId).toBe('user-1');
      expect(result!.balanceRelease.leaveType).toBe('annual');
    });

    it('returns null for non-existent request', () => {
      const result = rejectLeave([], 'nonexistent-id', 'approver-1', 'No reason');
      expect(result).toBeNull();
    });

    it('returns null for already-approved request', () => {
      const requests = [makeLeaveRequest({ status: 'approved' })];

      const result = rejectLeave(requests, requests[0].id, 'approver-1', 'Too late');
      expect(result).toBeNull();
    });
  });

  // ─── getLeaveBalance ──────────────────────────────────────────────

  describe('getLeaveBalance', () => {
    it('returns matching balance for user/firm/type/cycle', () => {
      const balances = [
        makeBalance(),
        makeBalance({ userId: 'user-2' }),
        makeBalance({ leaveType: 'sick', entitlement: 10, used: 2, pending: 0, available: 8 }),
      ];

      const result = getLeaveBalance(balances, 'user-1', 'firm-1', 'annual', '2025');

      expect(result.entitlement).toBe(21);
      expect(result.used).toBe(5);
      expect(result.available).toBe(13);
    });

    it('returns sick leave balance when requested', () => {
      const balances = [
        makeBalance(),
        makeBalance({ leaveType: 'sick', entitlement: 10, used: 2, pending: 0, available: 8 }),
      ];

      const result = getLeaveBalance(balances, 'user-1', 'firm-1', 'sick', '2025');

      expect(result.entitlement).toBe(10);
      expect(result.used).toBe(2);
      expect(result.available).toBe(8);
    });

    it('returns zero balance when no record exists', () => {
      const result = getLeaveBalance([], 'user-1', 'firm-1', 'annual', '2025');

      expect(result.entitlement).toBe(0);
      expect(result.used).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.available).toBe(0);
    });

    it('defaults to current year when annualCycle not specified', () => {
      const balances = [makeBalance({ annualCycle: '2025' })];

      // System time set to 2025-03-01 in beforeEach
      const result = getLeaveBalance(balances, 'user-1', 'firm-1', 'annual');

      expect(result.annualCycle).toBe('2025');
      expect(result.entitlement).toBe(21);
    });
  });

  // ─── getTeamLeave ─────────────────────────────────────────────────

  describe('getTeamLeave', () => {
    it('returns leave requests overlapping with the date range', () => {
      const requests = [
        makeLeaveRequest({ id: 'r1', startDate: '2025-03-10', endDate: '2025-03-14', status: 'approved' }),
        makeLeaveRequest({ id: 'r2', startDate: '2025-03-17', endDate: '2025-03-21', status: 'pending' }),
        makeLeaveRequest({ id: 'r3', startDate: '2025-04-01', endDate: '2025-04-05', status: 'approved' }),
      ];

      const result = getTeamLeave(requests, 'firm-1', '2025-03-01', '2025-03-31');

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('r1');
      expect(result[1].id).toBe('r2');
    });

    it('excludes rejected and cancelled leave', () => {
      const requests = [
        makeLeaveRequest({ id: 'r1', status: 'rejected' }),
        makeLeaveRequest({ id: 'r2', status: 'cancelled' }),
        makeLeaveRequest({ id: 'r3', status: 'approved' }),
      ];

      const result = getTeamLeave(requests, 'firm-1', '2025-03-01', '2025-03-31');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('r3');
    });

    it('filters by firm ID', () => {
      const requests = [
        makeLeaveRequest({ firmId: 'firm-1', status: 'approved' }),
        makeLeaveRequest({ firmId: 'firm-2', status: 'approved' }),
      ];

      const result = getTeamLeave(requests, 'firm-1', '2025-03-01', '2025-03-31');

      expect(result.length).toBe(1);
    });

    it('returns empty array when no leave in range', () => {
      const requests = [
        makeLeaveRequest({ startDate: '2025-04-01', endDate: '2025-04-05', status: 'approved' }),
      ];

      const result = getTeamLeave(requests, 'firm-1', '2025-03-01', '2025-03-15');

      expect(result.length).toBe(0);
    });

    it('includes partially overlapping leave requests', () => {
      const requests = [
        // Leave starts before range, ends during range
        makeLeaveRequest({ id: 'r1', startDate: '2025-02-28', endDate: '2025-03-03', status: 'approved' }),
        // Leave starts during range, ends after range
        makeLeaveRequest({ id: 'r2', startDate: '2025-03-28', endDate: '2025-04-02', status: 'approved' }),
      ];

      const result = getTeamLeave(requests, 'firm-1', '2025-03-01', '2025-03-31');

      expect(result.length).toBe(2);
    });
  });

  // ─── Balance Update Helpers ───────────────────────────────────────

  describe('applyBalanceUpdate', () => {
    it('moves days from pending to used on approval', () => {
      const balance = makeBalance({ entitlement: 21, used: 5, pending: 5, available: 11 });
      const update = {
        userId: 'user-1',
        firmId: 'firm-1',
        leaveType: 'annual' as const,
        annualCycle: '2025',
        daysToDeduct: 3,
        pendingReduction: 3,
        usedIncrease: 3,
      };

      const result = applyBalanceUpdate(balance, update);

      expect(result.used).toBe(8); // 5 + 3
      expect(result.pending).toBe(2); // 5 - 3
      expect(result.available).toBe(11); // 21 - 8 - 2 = 11
    });
  });

  describe('applyBalanceRelease', () => {
    it('releases pending days back to available on rejection', () => {
      const balance = makeBalance({ entitlement: 21, used: 5, pending: 5, available: 11 });
      const release = {
        userId: 'user-1',
        firmId: 'firm-1',
        leaveType: 'annual' as const,
        annualCycle: '2025',
        daysToRelease: 3,
      };

      const result = applyBalanceRelease(balance, release);

      expect(result.pending).toBe(2); // 5 - 3
      expect(result.available).toBe(14); // 21 - 5 - 2 = 14
      expect(result.used).toBe(5); // unchanged
    });
  });

  describe('addPendingDays', () => {
    it('adds pending days and reduces available', () => {
      const balance = makeBalance({ entitlement: 21, used: 5, pending: 3, available: 13 });

      const result = addPendingDays(balance, 5);

      expect(result.pending).toBe(8); // 3 + 5
      expect(result.available).toBe(8); // 13 - 5
      expect(result.used).toBe(5); // unchanged
    });
  });
});
