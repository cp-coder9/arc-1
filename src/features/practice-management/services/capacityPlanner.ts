/**
 * Practice Management — Capacity Planner Service
 *
 * Pure business logic for staff capacity planning and resource forecasting:
 * - Per-staff utilisation: allocated / (available − leave) × 100
 * - 12-week forward forecast weighted by pipeline conversion probability
 * - Capacity alerts: over-allocation and firm >85% utilisation
 * - Leave recording reduces available hours for affected periods
 *
 * Key formulas:
 *   utilisationPercentage = allocatedHours / (availableHours − leaveHours) × 100
 *   pipelineWeighted = Σ(pipeline hours × conversionProbability per stage)
 *   firmUtilisation = totalAllocated / totalCapacity × 100
 *   Over-allocation: allocatedHours > availableHours (after leave adjustment)
 *   Capacity warning: firmUtilisation > threshold (default 85%)
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import type {
  StaffMember,
  Allocation,
  LeaveRecord,
  StaffUtilisation,
  CapacityForecast,
  EnquiryRecord,
} from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Capacity Planner Types ───────────────────────────────────────────────────

export interface ConversionRates {
  quote_sent: number;   // default 0.30 (30%)
  quote_accepted: number; // default 0.70 (70%)
}

export interface CapacityAlert {
  type: 'over_allocation' | 'firm_utilisation_warning';
  weekStart: string;
  message: string;
  details: {
    staffId?: string;
    staffName?: string;
    allocatedHours?: number;
    availableHours?: number;
    firmUtilisation?: number;
    threshold?: number;
  };
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/** Round to 2 decimal places to avoid floating point drift */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Get the Monday of the week containing the given date (ISO week start).
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  // Sunday = 0, Monday = 1, etc. Adjust so Monday = 0
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Format a date as ISO date string (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculate the number of working days (Mon-Fri) in a given week
 * that overlap with a leave period for a specific staff member.
 * Returns hours of leave in that week (working days × daily hours).
 */
function calculateLeaveHoursForWeek(
  leave: LeaveRecord[],
  staffId: string,
  weekStart: Date,
  dailyHours: number
): number {
  // Working week: Monday to Friday (5 days)
  const weekMonday = normalizeDate(weekStart);
  const weekFriday = new Date(weekMonday);
  weekFriday.setDate(weekFriday.getDate() + 4);

  let leaveDays = 0;

  for (const record of leave) {
    if (record.staffId !== staffId) continue;

    const leaveStart = normalizeDate(new Date(record.startDate));
    const leaveEnd = normalizeDate(new Date(record.endDate));

    // Check overlap between leave period and working week (Mon-Fri)
    const overlapStart = leaveStart.getTime() >= weekMonday.getTime() ? leaveStart : weekMonday;
    const overlapEnd = leaveEnd.getTime() <= weekFriday.getTime() ? leaveEnd : weekFriday;

    if (overlapStart.getTime() > overlapEnd.getTime()) continue;

    // Count working days in overlap
    const current = new Date(overlapStart);
    while (current.getTime() <= overlapEnd.getTime()) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        leaveDays++;
      }
      current.setDate(current.getDate() + 1);
    }
  }

  return round2(leaveDays * dailyHours);
}

/**
 * Normalize a date to midnight local time (strip time component).
 */
function normalizeDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate allocated hours for a staff member in a given week.
 */
function calculateAllocatedHoursForWeek(
  allocations: Allocation[],
  staffId: string,
  weekStart: Date
): number {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Sunday)

  let totalAllocated = 0;

  for (const allocation of allocations) {
    if (allocation.staffId !== staffId) continue;

    const allocStart = new Date(allocation.startDate);
    const allocEnd = allocation.endDate ? new Date(allocation.endDate) : null;

    // Allocation is active if it started on or before end of week
    // and hasn't ended before the start of the week
    if (allocStart > weekEnd) continue;
    if (allocEnd && allocEnd < weekStart) continue;

    totalAllocated += allocation.hoursPerWeek;
  }

  return round2(totalAllocated);
}

// ─── Calculate Staff Utilisation ──────────────────────────────────────────────

/**
 * Calculate utilisation for a single staff member in a specific week.
 *
 * Formula: utilisationPercentage = allocated / (available − leave) × 100
 * If (available − leave) <= 0, utilisation is 0 (staff fully on leave).
 *
 * @param staff - Staff member record
 * @param allocations - All allocations (filtered internally by staffId)
 * @param leave - All leave records (filtered internally by staffId)
 * @param week - Any date within the target week (will resolve to Monday)
 * @returns StaffUtilisation with hours breakdown and percentage
 */
export function calculateStaffUtilisation(
  staff: StaffMember,
  allocations: Allocation[],
  leave: LeaveRecord[],
  week: Date
): ServiceResult<StaffUtilisation> {
  if (!staff || !staff.id) {
    return {
      success: false,
      error: {
        code: 'INVALID_STAFF',
        message: 'A valid staff member record is required.',
      },
    };
  }

  if (!Array.isArray(allocations) || !Array.isArray(leave)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Allocations and leave must be valid arrays.',
      },
    };
  }

  if (!(week instanceof Date) || isNaN(week.getTime())) {
    return {
      success: false,
      error: {
        code: 'INVALID_DATE',
        message: 'Week must be a valid Date.',
      },
    };
  }

  const weekStart = getWeekStart(week);
  const dailyHours = staff.availableHoursPerWeek / 5; // 5 working days

  // Calculate leave hours for this week
  const leaveHours = calculateLeaveHoursForWeek(leave, staff.id, weekStart, dailyHours);

  // Effective available hours = total available − leave hours
  const effectiveAvailable = Math.max(0, staff.availableHoursPerWeek - leaveHours);

  // Calculate allocated hours for this week
  const allocatedHours = calculateAllocatedHoursForWeek(allocations, staff.id, weekStart);

  // Available capacity = effective available − allocated (can be negative for over-allocation)
  const availableCapacity = round2(effectiveAvailable - allocatedHours);

  // Utilisation percentage: allocated / effectiveAvailable × 100
  // If effectiveAvailable is 0 (full leave), utilisation is 0
  const utilisationPercentage = effectiveAvailable === 0
    ? 0
    : round2((allocatedHours / effectiveAvailable) * 100);

  const result: StaffUtilisation = {
    staffId: staff.id,
    availableHours: round2(effectiveAvailable),
    allocatedHours: round2(allocatedHours),
    availableCapacity,
    utilisationPercentage,
  };

  return { success: true, data: result };
}

// ─── Forecast Capacity ────────────────────────────────────────────────────────

/**
 * Generate a multi-week forward capacity forecast for the firm.
 *
 * For each week in the forecast window:
 * - totalCapacity = Σ(staff available hours − leave hours)
 * - totalAllocated = Σ(allocated hours from active project allocations)
 * - pipelineWeighted = Σ(pipeline hours × conversion probability by stage)
 * - totalAvailable = totalCapacity − totalAllocated − pipelineWeighted
 * - firmUtilisation = (totalAllocated + pipelineWeighted) / totalCapacity × 100
 *
 * Pipeline entries at quote_sent/quote_accepted weighted by conversion probability.
 *
 * @param staff - All firm staff members
 * @param allocations - All active allocations
 * @param leave - All leave records
 * @param pipeline - Enquiry records (only quote_sent and quote_accepted are used)
 * @param conversionRates - Conversion probabilities per pipeline stage
 * @param weeks - Number of weeks to forecast (default 12)
 * @returns Array of CapacityForecast, one per week
 */
export function forecastCapacity(
  staff: StaffMember[],
  allocations: Allocation[],
  leave: LeaveRecord[],
  pipeline: EnquiryRecord[],
  conversionRates: ConversionRates,
  weeks: number = 12
): ServiceResult<CapacityForecast[]> {
  if (!Array.isArray(staff) || staff.length === 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_STAFF',
        message: 'At least one staff member is required for capacity forecasting.',
      },
    };
  }

  if (!Array.isArray(allocations) || !Array.isArray(leave) || !Array.isArray(pipeline)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Allocations, leave, and pipeline must be valid arrays.',
      },
    };
  }

  if (typeof weeks !== 'number' || weeks < 1 || weeks > 52) {
    return {
      success: false,
      error: {
        code: 'INVALID_WEEKS',
        message: 'Weeks must be a number between 1 and 52.',
      },
    };
  }

  if (!conversionRates ||
      typeof conversionRates.quote_sent !== 'number' ||
      typeof conversionRates.quote_accepted !== 'number') {
    return {
      success: false,
      error: {
        code: 'INVALID_CONVERSION_RATES',
        message: 'Conversion rates must provide quote_sent and quote_accepted as numbers.',
      },
    };
  }

  // Filter pipeline to only relevant stages
  const relevantPipeline = pipeline.filter(
    (e) => e.currentStage === 'quote_sent' || e.currentStage === 'quote_accepted'
  );

  // Calculate pipeline weighted hours per week
  // Each pipeline enquiry contributes estimated hours weighted by conversion probability
  // We distribute pipeline demand evenly across forecast weeks as a simplification
  let totalPipelineWeightedHours = 0;
  for (const enquiry of relevantPipeline) {
    const rate = enquiry.currentStage === 'quote_sent'
      ? conversionRates.quote_sent
      : conversionRates.quote_accepted;

    // Estimate weekly hours from fee value / average hourly rate
    // Use a simple heuristic: estimated fee / (weeks × average rate)
    // Since we don't have a rate, use estimatedFeeValueZAR as a proxy for demand
    // The pipeline weighted contribution is the fee weighted by probability
    // For simplicity, express as a proportion of total firm capacity
    totalPipelineWeightedHours += enquiry.estimatedFeeValueZAR * rate;
  }

  // Distribute pipeline weighted demand evenly across forecast weeks
  // Convert ZAR to approximate hours: assume average charge-out rate from staff
  const avgChargeOutRate = staff.reduce((sum, s) => sum + s.clientChargeOutRate, 0) / staff.length;
  const pipelineHoursTotal = avgChargeOutRate > 0
    ? totalPipelineWeightedHours / avgChargeOutRate
    : 0;
  const pipelineHoursPerWeek = round2(pipelineHoursTotal / weeks);

  const forecasts: CapacityForecast[] = [];
  const today = new Date();
  const currentWeekStart = getWeekStart(today);

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() + (w * 7));

    let totalCapacity = 0;
    let totalAllocated = 0;

    for (const member of staff) {
      const dailyHours = member.availableHoursPerWeek / 5;
      const leaveHours = calculateLeaveHoursForWeek(leave, member.id, weekStart, dailyHours);
      const effectiveAvailable = Math.max(0, member.availableHoursPerWeek - leaveHours);
      const allocated = calculateAllocatedHoursForWeek(allocations, member.id, weekStart);

      totalCapacity += effectiveAvailable;
      totalAllocated += allocated;
    }

    const pipelineWeighted = pipelineHoursPerWeek;
    const totalAvailable = Math.max(0, totalCapacity - totalAllocated - pipelineWeighted);
    const firmUtilisation = totalCapacity === 0
      ? 0
      : round2(((totalAllocated + pipelineWeighted) / totalCapacity) * 100);

    forecasts.push({
      weekStart: formatDate(weekStart),
      totalCapacity: round2(totalCapacity),
      totalAllocated: round2(totalAllocated),
      pipelineWeighted: round2(pipelineWeighted),
      totalAvailable: round2(totalAvailable),
      firmUtilisation,
    });
  }

  return { success: true, data: forecasts };
}

// ─── Evaluate Capacity Alerts ─────────────────────────────────────────────────

/**
 * Evaluate capacity forecasts and generate alerts for:
 * - Over-allocation: any staff member's allocated hours > available hours
 * - Firm utilisation warning: firm utilisation exceeds threshold for any week
 *
 * @param forecast - Array of CapacityForecast from forecastCapacity()
 * @param threshold - Firm utilisation warning threshold (default 85%)
 * @returns Array of CapacityAlert
 */
export function evaluateCapacityAlerts(
  forecast: CapacityForecast[],
  threshold: number = 85
): ServiceResult<CapacityAlert[]> {
  if (!Array.isArray(forecast)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Forecast must be a valid array.',
      },
    };
  }

  if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
    return {
      success: false,
      error: {
        code: 'INVALID_THRESHOLD',
        message: 'Threshold must be a number between 0 and 100.',
      },
    };
  }

  const alerts: CapacityAlert[] = [];

  for (const week of forecast) {
    // Firm utilisation warning
    if (week.firmUtilisation > threshold) {
      alerts.push({
        type: 'firm_utilisation_warning',
        weekStart: week.weekStart,
        message: `Firm utilisation at ${week.firmUtilisation}% exceeds ${threshold}% threshold for week starting ${week.weekStart}. Review pipeline acceptance or resource planning.`,
        details: {
          firmUtilisation: week.firmUtilisation,
          threshold,
        },
      });
    }

    // Over-allocation: totalAllocated > totalCapacity
    if (week.totalAllocated > week.totalCapacity) {
      alerts.push({
        type: 'over_allocation',
        weekStart: week.weekStart,
        message: `Firm is over-allocated for week starting ${week.weekStart}: ${week.totalAllocated}h allocated against ${week.totalCapacity}h available capacity.`,
        details: {
          allocatedHours: week.totalAllocated,
          availableHours: week.totalCapacity,
        },
      });
    }
  }

  return { success: true, data: alerts };
}

// ─── Evaluate Staff Over-Allocation ───────────────────────────────────────────

/**
 * Check individual staff members for over-allocation in a given week.
 * Flags when a staff member's allocated hours exceed their available hours.
 *
 * @param staff - All firm staff members
 * @param allocations - All active allocations
 * @param leave - All leave records
 * @param week - Target week date
 * @returns Array of CapacityAlert for over-allocated staff
 */
export function evaluateStaffOverAllocation(
  staff: StaffMember[],
  allocations: Allocation[],
  leave: LeaveRecord[],
  week: Date
): ServiceResult<CapacityAlert[]> {
  if (!Array.isArray(staff) || !Array.isArray(allocations) || !Array.isArray(leave)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Staff, allocations, and leave must be valid arrays.',
      },
    };
  }

  if (!(week instanceof Date) || isNaN(week.getTime())) {
    return {
      success: false,
      error: {
        code: 'INVALID_DATE',
        message: 'Week must be a valid Date.',
      },
    };
  }

  const weekStart = getWeekStart(week);
  const alerts: CapacityAlert[] = [];

  for (const member of staff) {
    const dailyHours = member.availableHoursPerWeek / 5;
    const leaveHours = calculateLeaveHoursForWeek(leave, member.id, weekStart, dailyHours);
    const effectiveAvailable = Math.max(0, member.availableHoursPerWeek - leaveHours);
    const allocatedHours = calculateAllocatedHoursForWeek(allocations, member.id, weekStart);

    if (allocatedHours > effectiveAvailable) {
      alerts.push({
        type: 'over_allocation',
        weekStart: formatDate(weekStart),
        message: `${member.displayName} is over-allocated: ${allocatedHours}h allocated against ${effectiveAvailable}h available for week starting ${formatDate(weekStart)}.`,
        details: {
          staffId: member.id,
          staffName: member.displayName,
          allocatedHours: round2(allocatedHours),
          availableHours: round2(effectiveAvailable),
        },
      });
    }
  }

  return { success: true, data: alerts };
}
