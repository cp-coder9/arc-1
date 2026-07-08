/**
 * Resource Planner Service
 *
 * Pure business logic for forward-looking resource capacity planning. Provides:
 * - Per-person capacity view (available hours, allocated, leave, remaining)
 * - Over-allocation detection (allocated > available, including when available is zero)
 * - Firm-wide capacity aggregation with utilisation percentage
 * - Forward-looking views: 4, 8, 12 weeks ahead
 * - Pipeline impact as a separate layer distinguishable from confirmed allocations
 *
 * Available Hours = standard_working_hours − approved_leave_hours − public_holiday_hours
 * Over-allocated = allocated_hours > available_hours (including when available is zero)
 *
 * This service operates on typed data objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 * @module practiceManagement/resourcePlannerService
 */

import type {
  PersonCapacity,
  WeekCapacity,
  CapacityView,
  OverAllocation,
  BillingRateRole,
  LeaveRequest,
  PipelineOpportunity,
} from './types';
import { getPublicHolidays } from './leaveManagerService';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Standard working hours per week (5 days × 8 hours) */
export const STANDARD_WEEKLY_HOURS = 40;

/** Standard working hours per day */
export const STANDARD_DAILY_HOURS = 8;

// ─── Input Types ─────────────────────────────────────────────────────────────

/**
 * Represents a team member's profile for capacity planning.
 */
export interface TeamMember {
  userId: string;
  displayName: string;
  role: BillingRateRole;
  /** Standard working hours per week (defaults to STANDARD_WEEKLY_HOURS if not provided) */
  standardWeeklyHours?: number;
}

/**
 * Represents a confirmed resource allocation on a project.
 */
export interface ResourceAllocation {
  userId: string;
  projectId: string;
  /** Allocated hours per week for this assignment */
  hoursPerWeek: number;
  /** ISO date string (YYYY-MM-DD) — first day of allocation */
  startDate: string;
  /** ISO date string (YYYY-MM-DD) — last day of allocation (inclusive) */
  endDate: string;
}

/**
 * Configuration for capacity view generation.
 */
export interface CapacityViewConfig {
  /** Number of weeks to look ahead: 4, 8, or 12 */
  weeks: 4 | 8 | 12;
  /** ISO date string (YYYY-MM-DD) — start date for the view (defaults to next Monday) */
  startDate?: string;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Generates a complete capacity view for all team members in a firm.
 *
 * Validates: Requirements 8.1, 8.4, 8.5
 * THE Resource_Planner SHALL display a capacity view showing each team member's
 * total available hours, allocated hours, leave hours, and remaining capacity per week.
 * THE Resource_Planner SHALL support forward-looking capacity views (4, 8, 12 weeks ahead).
 * WHEN pipeline projects are included in forecasting, THE Resource_Planner SHALL show
 * projected capacity impact as a separate layer distinguishable from confirmed allocations.
 *
 * @param firmId - The firm ID for the capacity view
 * @param teamMembers - All team members in the firm
 * @param allocations - All resource allocations (confirmed project assignments)
 * @param leaveRequests - Approved leave requests for the team
 * @param pipelineOpportunities - High-confidence pipeline opportunities impacting capacity
 * @param config - Configuration for the view (weeks ahead, start date)
 * @returns CapacityView with per-person weekly breakdown and firm totals
 */
export function getCapacityView(
  firmId: string,
  teamMembers: TeamMember[],
  allocations: ResourceAllocation[],
  leaveRequests: LeaveRequest[],
  pipelineOpportunities: PipelineOpportunity[],
  config: CapacityViewConfig,
): CapacityView {
  const weekStarts = generateWeekStarts(config.weeks, config.startDate);

  const people: PersonCapacity[] = teamMembers.map((member) =>
    getPersonCapacity(
      member,
      allocations.filter((a) => a.userId === member.userId),
      leaveRequests.filter((l) => l.userId === member.userId && l.status === 'approved'),
      pipelineOpportunities,
      weekStarts,
    ),
  );

  // Calculate firm-wide totals
  let firmTotalAvailable = 0;
  let firmTotalAllocated = 0;

  for (const person of people) {
    for (const week of person.weeks) {
      firmTotalAvailable += week.totalAvailableHours;
      firmTotalAllocated += week.allocatedHours;
    }
  }

  const firmUtilisationPercent =
    firmTotalAvailable > 0
      ? Math.round((firmTotalAllocated / firmTotalAvailable) * 100 * 100) / 100
      : 0;

  return {
    firmId,
    people,
    firmTotalAvailable,
    firmTotalAllocated,
    firmUtilisationPercent,
  };
}

/**
 * Generates capacity data for a single person across the specified weeks.
 *
 * Validates: Requirements 8.1, 8.3
 * THE Resource_Planner SHALL display each team member's total available hours,
 * allocated hours, leave hours, and remaining capacity per week.
 * THE Resource_Planner SHALL calculate available hours as:
 * standard working hours minus approved leave hours minus public holidays.
 *
 * @param member - The team member's profile
 * @param allocations - Resource allocations for this person
 * @param approvedLeave - Approved leave requests for this person
 * @param pipelineOpportunities - High-confidence pipeline opportunities
 * @param weekStarts - Array of week start dates (ISO YYYY-MM-DD, Mondays)
 * @returns PersonCapacity with weekly breakdown
 */
export function getPersonCapacity(
  member: TeamMember,
  allocations: ResourceAllocation[],
  approvedLeave: LeaveRequest[],
  pipelineOpportunities: PipelineOpportunity[],
  weekStarts: string[],
): PersonCapacity {
  const standardWeeklyHours = member.standardWeeklyHours ?? STANDARD_WEEKLY_HOURS;

  const weeks: WeekCapacity[] = weekStarts.map((weekStart) => {
    const weekEnd = getWeekEnd(weekStart);

    // Calculate leave hours for this week
    const leaveHours = calculateLeaveHoursForWeek(
      approvedLeave,
      weekStart,
      weekEnd,
    );

    // Calculate public holiday hours for this week
    const holidayHours = calculateHolidayHoursForWeek(weekStart, weekEnd);

    // Available hours = standard - leave - holidays
    const totalAvailableHours = Math.max(
      0,
      standardWeeklyHours - leaveHours - holidayHours,
    );

    // Calculate allocated hours from confirmed project assignments
    const allocatedHours = calculateAllocatedHoursForWeek(
      allocations,
      weekStart,
      weekEnd,
    );

    // Calculate pipeline impact hours (separate layer)
    const pipelineImpactHours = calculatePipelineImpactForWeek(
      pipelineOpportunities,
      member,
      weekStart,
      weekEnd,
    );

    // Remaining capacity (can be negative if over-allocated)
    const remainingCapacity = totalAvailableHours - allocatedHours;

    // Over-allocated when allocated > available (including when available is zero)
    const isOverAllocated = allocatedHours > totalAvailableHours;

    return {
      weekStart,
      totalAvailableHours,
      allocatedHours,
      leaveHours,
      remainingCapacity,
      isOverAllocated,
      pipelineImpactHours,
    };
  });

  return {
    userId: member.userId,
    displayName: member.displayName,
    role: member.role,
    weeks,
  };
}

/**
 * Identifies all over-allocated team members for a specific week.
 *
 * Validates: Requirement 8.2
 * WHEN a team member's allocated hours exceed 100% of available hours for any week
 * (including when available hours is zero due to leave or holidays),
 * THE Resource_Planner SHALL flag the member as over-allocated.
 *
 * @param firmId - The firm ID
 * @param teamMembers - All team members in the firm
 * @param allocations - All resource allocations
 * @param leaveRequests - Approved leave requests
 * @param weekStart - ISO date string (YYYY-MM-DD, Monday) for the week to check
 * @returns Array of OverAllocation entries for over-allocated members
 */
export function getOverAllocated(
  firmId: string,
  teamMembers: TeamMember[],
  allocations: ResourceAllocation[],
  leaveRequests: LeaveRequest[],
  weekStart: string,
): OverAllocation[] {
  const weekEnd = getWeekEnd(weekStart);
  const overAllocations: OverAllocation[] = [];

  for (const member of teamMembers) {
    const standardWeeklyHours = member.standardWeeklyHours ?? STANDARD_WEEKLY_HOURS;

    // Calculate leave hours for this week
    const memberLeave = leaveRequests.filter(
      (l) => l.userId === member.userId && l.status === 'approved',
    );
    const leaveHours = calculateLeaveHoursForWeek(memberLeave, weekStart, weekEnd);

    // Calculate public holiday hours for this week
    const holidayHours = calculateHolidayHoursForWeek(weekStart, weekEnd);

    // Available hours
    const availableHours = Math.max(0, standardWeeklyHours - leaveHours - holidayHours);

    // Allocated hours
    const memberAllocations = allocations.filter((a) => a.userId === member.userId);
    const allocatedHours = calculateAllocatedHoursForWeek(
      memberAllocations,
      weekStart,
      weekEnd,
    );

    // Over-allocated when allocated > available (including when available is zero)
    if (allocatedHours > availableHours) {
      overAllocations.push({
        userId: member.userId,
        displayName: member.displayName,
        weekStart,
        allocatedHours,
        availableHours,
        overBy: allocatedHours - availableHours,
      });
    }
  }

  return overAllocations;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Generates an array of week start dates (Mondays) for the specified number
 * of weeks ahead from the given start date.
 */
export function generateWeekStarts(weeks: number, startDate?: string): string[] {
  const start = startDate ? parseDate(startDate) : getNextMonday(new Date());
  const weekStarts: string[] = [];

  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + i * 7);
    weekStarts.push(formatDate(weekStart));
  }

  return weekStarts;
}

/**
 * Calculates the number of leave hours that fall within a specific week.
 * Counts working days of overlap between leave period and the week,
 * then multiplies by standard daily hours.
 */
export function calculateLeaveHoursForWeek(
  approvedLeave: LeaveRequest[],
  weekStart: string,
  weekEnd: string,
): number {
  let totalLeaveHours = 0;

  for (const leave of approvedLeave) {
    // Find overlap between leave period and the week
    const overlapStart = leave.startDate > weekStart ? leave.startDate : weekStart;
    const overlapEnd = leave.endDate < weekEnd ? leave.endDate : weekEnd;

    if (overlapStart > overlapEnd) continue;

    // Count working days in the overlap (exclude weekends)
    const workingDays = countWorkingDaysInRange(overlapStart, overlapEnd);
    totalLeaveHours += workingDays * STANDARD_DAILY_HOURS;
  }

  return totalLeaveHours;
}

/**
 * Calculates the number of public holiday hours that fall within a specific week.
 * Only counts holidays that fall on working days (Mon-Fri).
 */
export function calculateHolidayHoursForWeek(
  weekStart: string,
  weekEnd: string,
): number {
  const startDate = parseDate(weekStart);
  const endDate = parseDate(weekEnd);

  // Get public holidays for all years in the range
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  const allHolidays: string[] = [];

  for (let year = startYear; year <= endYear; year++) {
    allHolidays.push(...getPublicHolidays(year));
  }

  let holidayHours = 0;

  for (const holiday of allHolidays) {
    if (holiday >= weekStart && holiday <= weekEnd) {
      const holidayDate = parseDate(holiday);
      const dayOfWeek = holidayDate.getDay();

      // Only count holidays on working days (Mon=1 to Fri=5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        holidayHours += STANDARD_DAILY_HOURS;
      }
    }
  }

  return holidayHours;
}

/**
 * Calculates the total allocated hours for a person in a specific week
 * from confirmed project assignments.
 */
export function calculateAllocatedHoursForWeek(
  allocations: ResourceAllocation[],
  weekStart: string,
  weekEnd: string,
): number {
  let totalAllocated = 0;

  for (const allocation of allocations) {
    // Check if the allocation overlaps with this week
    if (allocation.startDate <= weekEnd && allocation.endDate >= weekStart) {
      totalAllocated += allocation.hoursPerWeek;
    }
  }

  return totalAllocated;
}

/**
 * Calculates the pipeline impact hours for a specific person in a week.
 * Only includes high-confidence pipeline opportunities that match the
 * person's role and overlap with the week.
 *
 * Validates: Requirement 8.5
 * Pipeline impact is shown as a separate layer distinguishable from
 * confirmed allocations.
 */
export function calculatePipelineImpactForWeek(
  pipelineOpportunities: PipelineOpportunity[],
  member: TeamMember,
  weekStart: string,
  weekEnd: string,
): number {
  let pipelineHours = 0;

  for (const opportunity of pipelineOpportunities) {
    // Only include high-confidence opportunities that are included in capacity planning
    if (!opportunity.isHighConfidence || !opportunity.includedInCapacity) continue;

    // Check if the person's role is required by the opportunity
    if (!opportunity.requiredDisciplines.includes(member.role)) continue;

    // Check if the opportunity's expected start date overlaps with this week
    if (!opportunity.expectedStartDate) continue;

    if (opportunity.expectedStartDate <= weekEnd) {
      // Estimate hours per person per week based on headcount
      // Default: divide evenly among required headcount, or assume full-time (40h)
      const headcount = opportunity.requiredHeadcount ?? 1;
      const estimatedHoursPerPerson = STANDARD_WEEKLY_HOURS / headcount;
      pipelineHours += estimatedHoursPerPerson;
    }
  }

  return pipelineHours;
}

/**
 * Gets the end of the week (Friday) given a Monday start date.
 */
function getWeekEnd(weekStart: string): string {
  const start = parseDate(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 4); // Monday + 4 = Friday
  return formatDate(end);
}

/**
 * Counts working days (Mon-Fri) between two dates inclusive.
 */
function countWorkingDaysInRange(startDate: string, endDate: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Gets the next Monday from the given date.
 * If the given date is a Monday, returns that Monday.
 */
function getNextMonday(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const daysUntilMonday = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

/**
 * Parses an ISO date string (YYYY-MM-DD) into a Date object at midnight local time.
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
