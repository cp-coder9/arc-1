/**
 * Leave Manager Service
 *
 * Pure business logic for leave request management. Supports:
 * - Leave request creation with working days calculation
 * - Approval workflow with capacity deduction
 * - Rejection with reason notification
 * - Leave balance tracking per staff member per leave type per annual cycle
 * - Team leave viewing within date ranges
 *
 * This service operates on arrays of typed objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 * @module practiceManagement/leaveManagerService
 */

import type {
  LeaveRequest,
  LeaveBalance,
  LeaveType,
  LeaveRequestInput,
} from './types';

// ─── Public Holidays (South Africa) ─────────────────────────────────────────

/**
 * South African public holidays for a given year.
 * Returns ISO date strings (YYYY-MM-DD) for all gazetted public holidays.
 */
export function getPublicHolidays(year: number): string[] {
  const holidays: string[] = [
    `${year}-01-01`, // New Year's Day
    `${year}-03-21`, // Human Rights Day
    `${year}-04-27`, // Freedom Day
    `${year}-05-01`, // Workers' Day
    `${year}-06-16`, // Youth Day
    `${year}-08-09`, // National Women's Day
    `${year}-09-24`, // Heritage Day
    `${year}-12-16`, // Day of Reconciliation
    `${year}-12-25`, // Christmas Day
    `${year}-12-26`, // Day of Goodwill
  ];

  // Easter-based holidays (Good Friday & Family Day) — use approximate algorithm
  const easter = calculateEasterDate(year);
  const goodFriday = addDays(easter, -2);
  const familyDay = addDays(easter, 1);

  holidays.push(formatDate(goodFriday));
  holidays.push(formatDate(familyDay));

  return holidays;
}

/**
 * Calculates working days between two dates (inclusive), excluding weekends
 * and South African public holidays.
 *
 * Validates: Requirement 9.2
 * WHEN a leave request is submitted, THE Leave_Manager SHALL calculate
 * the number of working days (excluding weekends and public holidays).
 *
 * @param startDate - ISO date string (YYYY-MM-DD) for leave start
 * @param endDate - ISO date string (YYYY-MM-DD) for leave end
 * @param publicHolidays - Optional pre-computed list of public holiday ISO date strings
 * @returns Number of working days in the range
 */
export function calculateWorkingDays(
  startDate: string,
  endDate: string,
  publicHolidays?: string[],
): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (end < start) return 0;

  // Collect holidays for all years in the range
  const holidays = publicHolidays ?? getHolidaysForRange(start, end);
  const holidaySet = new Set(holidays);

  let workingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = formatDate(current);

    // Skip weekends (Saturday = 6, Sunday = 0) and public holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
      workingDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return workingDays;
}

/**
 * Creates a new leave request with calculated working days.
 *
 * Validates: Requirement 9.1
 * WHEN a staff member requests leave, THE Leave_Manager SHALL require leave type,
 * start date, end date, and optional notes.
 *
 * Validates: Requirement 9.2
 * WHEN a leave request is submitted, THE Leave_Manager SHALL calculate the number
 * of working days (excluding weekends and public holidays) and create an approval action.
 *
 * Validates: Requirement 9.5
 * THE Leave_Manager SHALL validate balance sufficiency before processing a leave request,
 * rejecting requests that would exceed the available balance.
 *
 * @param input - The leave request input
 * @param balances - Existing leave balances for the user
 * @param publicHolidays - Optional pre-computed list of public holiday dates
 * @returns Object with the leave request if successful, or an error if balance insufficient
 */
export function requestLeave(
  input: LeaveRequestInput,
  balances: LeaveBalance[],
  publicHolidays?: string[],
): { request: LeaveRequest; error?: never } | { request?: never; error: string } {
  const workingDays = calculateWorkingDays(input.startDate, input.endDate, publicHolidays);

  if (workingDays === 0) {
    return { error: 'Leave request covers zero working days' };
  }

  // Validate balance sufficiency (Requirement 9.5)
  // Unpaid leave does not require balance check
  if (input.leaveType !== 'unpaid') {
    const annualCycle = getAnnualCycle(input.startDate);
    const balance = balances.find(
      (b) =>
        b.userId === input.userId &&
        b.firmId === input.firmId &&
        b.leaveType === input.leaveType &&
        b.annualCycle === annualCycle,
    );

    if (!balance) {
      return { error: `No leave balance found for ${input.leaveType} leave in cycle ${annualCycle}` };
    }

    if (workingDays > balance.available) {
      return {
        error: `Insufficient ${input.leaveType} leave balance: requested ${workingDays} days but only ${balance.available} available`,
      };
    }
  }

  const now = new Date().toISOString();
  const id = generateLeaveRequestId(input.firmId, input.userId, input.startDate);

  const request: LeaveRequest = {
    id,
    firmId: input.firmId,
    userId: input.userId,
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    workingDays,
    notes: input.notes,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  return { request };
}

/**
 * Approves a leave request and deducts leave days from the staff member's
 * available capacity.
 *
 * Validates: Requirement 9.3
 * WHEN a leave request is approved, THE Leave_Manager SHALL deduct the leave days
 * from the staff member's available capacity in the Resource_Planner.
 *
 * @param requests - All leave requests (used to find the target)
 * @param requestId - The ID of the request to approve
 * @param approverId - The userId of the approver
 * @returns Object with the updated LeaveRequest and updated LeaveBalance, or null if invalid
 */
export function approveLeave(
  requests: LeaveRequest[],
  requestId: string,
  approverId: string,
): { request: LeaveRequest; balanceUpdate: LeaveBalanceUpdate } | null {
  const request = requests.find((r) => r.id === requestId);
  if (!request) return null;

  // Only pending requests can be approved
  if (request.status !== 'pending') return null;

  const now = new Date().toISOString();
  const updatedRequest: LeaveRequest = {
    ...request,
    status: 'approved',
    approvedBy: approverId,
    approvedAt: now,
    updatedAt: now,
  };

  // Calculate balance deduction for Resource Planner capacity
  const balanceUpdate: LeaveBalanceUpdate = {
    userId: request.userId,
    firmId: request.firmId,
    leaveType: request.leaveType,
    annualCycle: getAnnualCycle(request.startDate),
    daysToDeduct: request.workingDays,
    // Move days from pending to used
    pendingReduction: request.workingDays,
    usedIncrease: request.workingDays,
  };

  return { request: updatedRequest, balanceUpdate };
}

/**
 * Rejects a leave request with a reason.
 *
 * Validates: Requirement 9.4
 * WHEN a leave request is rejected, THE Leave_Manager SHALL notify the staff member
 * with a reason.
 *
 * @param requests - All leave requests (used to find the target)
 * @param requestId - The ID of the request to reject
 * @param approverId - The userId of the approver performing the rejection
 * @param reason - The reason for rejection
 * @returns Object with updated LeaveRequest and balance release, or null if invalid
 */
export function rejectLeave(
  requests: LeaveRequest[],
  requestId: string,
  approverId: string,
  reason: string,
): { request: LeaveRequest; balanceRelease: LeaveBalanceRelease } | null {
  const request = requests.find((r) => r.id === requestId);
  if (!request) return null;

  // Only pending requests can be rejected
  if (request.status !== 'pending') return null;

  const now = new Date().toISOString();
  const updatedRequest: LeaveRequest = {
    ...request,
    status: 'rejected',
    rejectedBy: approverId,
    rejectedAt: now,
    rejectionReason: reason,
    updatedAt: now,
  };

  // Release pending days back to available
  const balanceRelease: LeaveBalanceRelease = {
    userId: request.userId,
    firmId: request.firmId,
    leaveType: request.leaveType,
    annualCycle: getAnnualCycle(request.startDate),
    daysToRelease: request.workingDays,
  };

  return { request: updatedRequest, balanceRelease };
}

/**
 * Gets the leave balance for a specific staff member, leave type, and annual cycle.
 *
 * Validates: Requirement 9.5
 * THE Leave_Manager SHALL maintain a leave balance per staff member per leave type
 * per annual cycle.
 *
 * @param balances - All leave balances
 * @param userId - The staff member's user ID
 * @param firmId - The firm ID
 * @param leaveType - The leave type to query
 * @param annualCycle - Optional annual cycle (defaults to current year)
 * @returns The LeaveBalance, or a default zero balance if none found
 */
export function getLeaveBalance(
  balances: LeaveBalance[],
  userId: string,
  firmId: string,
  leaveType: LeaveType,
  annualCycle?: string,
): LeaveBalance {
  const cycle = annualCycle ?? new Date().getFullYear().toString();

  const balance = balances.find(
    (b) =>
      b.userId === userId &&
      b.firmId === firmId &&
      b.leaveType === leaveType &&
      b.annualCycle === cycle,
  );

  if (balance) return balance;

  // Return a default zero balance if none exists
  return {
    userId,
    firmId,
    leaveType,
    annualCycle: cycle,
    entitlement: 0,
    used: 0,
    pending: 0,
    available: 0,
  };
}

/**
 * Gets all leave requests for a team within a date range.
 *
 * Used by the Resource Planner to show team absences and the Leave Calendar component.
 *
 * @param requests - All leave requests
 * @param firmId - The firm ID to scope the search
 * @param dateFrom - Start of date range (ISO date string)
 * @param dateTo - End of date range (ISO date string)
 * @returns Array of LeaveRequest objects that overlap with the given date range
 */
export function getTeamLeave(
  requests: LeaveRequest[],
  firmId: string,
  dateFrom: string,
  dateTo: string,
): LeaveRequest[] {
  return requests
    .filter((r) => {
      if (r.firmId !== firmId) return false;
      // Include only approved or pending leave in team view
      if (r.status !== 'approved' && r.status !== 'pending') return false;
      // Check date overlap: request overlaps range if it starts before range ends
      // and ends after range starts
      return r.startDate <= dateTo && r.endDate >= dateFrom;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Applies a balance update after leave approval (increments used, decrements pending).
 *
 * @param balance - The current leave balance
 * @param update - The balance update to apply
 * @returns Updated LeaveBalance
 */
export function applyBalanceUpdate(
  balance: LeaveBalance,
  update: LeaveBalanceUpdate,
): LeaveBalance {
  const newUsed = balance.used + update.usedIncrease;
  const newPending = Math.max(0, balance.pending - update.pendingReduction);
  return {
    ...balance,
    used: newUsed,
    pending: newPending,
    available: balance.entitlement - newUsed - newPending,
  };
}

/**
 * Applies a balance release after leave rejection (releases pending days).
 *
 * @param balance - The current leave balance
 * @param release - The balance release to apply
 * @returns Updated LeaveBalance
 */
export function applyBalanceRelease(
  balance: LeaveBalance,
  release: LeaveBalanceRelease,
): LeaveBalance {
  const newPending = Math.max(0, balance.pending - release.daysToRelease);
  return {
    ...balance,
    pending: newPending,
    available: balance.entitlement - balance.used - newPending,
  };
}

/**
 * Adds pending days to a balance when a new leave request is created.
 *
 * @param balance - The current leave balance
 * @param workingDays - Number of days to add as pending
 * @returns Updated LeaveBalance
 */
export function addPendingDays(
  balance: LeaveBalance,
  workingDays: number,
): LeaveBalance {
  return {
    ...balance,
    pending: balance.pending + workingDays,
    available: balance.available - workingDays,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Represents a balance update instruction after leave approval */
export interface LeaveBalanceUpdate {
  userId: string;
  firmId: string;
  leaveType: LeaveType;
  annualCycle: string;
  daysToDeduct: number;
  pendingReduction: number;
  usedIncrease: number;
}

/** Represents a balance release instruction after leave rejection */
export interface LeaveBalanceRelease {
  userId: string;
  firmId: string;
  leaveType: LeaveType;
  annualCycle: string;
  daysToRelease: number;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Parses an ISO date string (YYYY-MM-DD) into a Date object at midnight UTC.
 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Formats a Date to ISO date string (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds days to a Date, returning a new Date.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Gets public holidays for the full range of years between two dates.
 */
function getHolidaysForRange(start: Date, end: Date): string[] {
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const holidays: string[] = [];

  for (let year = startYear; year <= endYear; year++) {
    holidays.push(...getPublicHolidays(year));
  }

  return holidays;
}

/**
 * Extracts the annual cycle (year) from an ISO date string.
 */
function getAnnualCycle(dateStr: string): string {
  return dateStr.substring(0, 4);
}

/**
 * Calculates Easter date using the Anonymous Gregorian algorithm.
 * Returns a Date object for Easter Sunday.
 */
function calculateEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

/**
 * Generates a unique leave request ID.
 */
function generateLeaveRequestId(firmId: string, userId: string, startDate: string): string {
  return `leave_${firmId}_${userId}_${startDate}_${Date.now()}`;
}
