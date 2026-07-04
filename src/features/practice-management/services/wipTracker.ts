/**
 * Practice Management — WIP Tracker Service
 *
 * Pure business logic for Work in Progress tracking:
 * - Project-level WIP calculation (billable hours × rate + unbilled disbursements − invoiced)
 * - Firm-wide WIP aggregation across all active projects
 * - Budget threshold alerts (80% warning, 100% critical)
 * - WIP ageing buckets (0–30, 31–60, 61–90, 90+ days)
 * - Per-discipline WIP within multi-discipline projects
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

import type {
  TimesheetEntry,
  ChargeOutRates,
  Disbursement,
  Invoice,
  WIPCalculation,
} from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── WIP Alert Types ──────────────────────────────────────────────────────────

export interface WIPAlert {
  alertType: 'budget_warning' | 'budget_critical';
  percentage: number;
  message: string;
}

// ─── WIP Ageing Types ─────────────────────────────────────────────────────────

export interface WIPAgeing {
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
}

// ─── Firm WIP Summary Types ───────────────────────────────────────────────────

export interface FirmWIPSummary {
  totalWIP: number;
  byProject: WIPCalculation[];
  projectCount: number;
}

// ─── Project WIP Data (input for firm-wide calc) ──────────────────────────────

export interface ProjectWIPData {
  projectId: string;
  timesheets: TimesheetEntry[];
  rates: ChargeOutRates[];
  disbursements: Disbursement[];
  invoices: Invoice[];
}

// ─── Calculate Project WIP ────────────────────────────────────────────────────

/**
 * Calculate WIP for a single project.
 *
 * Formula: WIP = (sum of billable hours × applicable charge-out rate per staff)
 *              + (unbilled disbursements)
 *              − (invoiced amounts)
 *
 * Only includes timesheet entries with status 'approved' (not draft, submitted, or invoiced).
 * Disbursements with invoiced=false are unbilled.
 * Invoiced amounts are the subtotalZAR of all invoices (excluding VAT).
 */
export function calculateProjectWIP(
  timesheets: TimesheetEntry[],
  rates: ChargeOutRates[],
  disbursements: Disbursement[],
  invoices: Invoice[]
): ServiceResult<WIPCalculation> {
  if (!Array.isArray(timesheets) || !Array.isArray(rates) || !Array.isArray(disbursements) || !Array.isArray(invoices)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'All inputs must be valid arrays.',
      },
    };
  }

  // Build rate lookup by staffId
  const rateMap = new Map<string, number>();
  for (const rate of rates) {
    rateMap.set(rate.staffId, rate.clientRate);
  }

  // Filter to only approved timesheet entries (billable)
  const approvedBillable = timesheets.filter(
    entry => entry.status === 'approved' && entry.billable
  );

  // Calculate billable value: hours × rate per staff member
  let billableValue = 0;
  let billableHours = 0;
  for (const entry of approvedBillable) {
    const rate = rateMap.get(entry.staffId) ?? 0;
    billableValue += entry.hours * rate;
    billableHours += entry.hours;
  }

  // Calculate unbilled disbursements (invoiced === false)
  const unbilledDisbursements = disbursements.filter(d => !d.invoiced);
  const unbilledDisbursementsValue = unbilledDisbursements.reduce(
    (sum, d) => sum + d.amountZAR, 0
  );

  // Calculate invoiced amounts (subtotal excluding VAT)
  const invoicedAmount = invoices.reduce(
    (sum, inv) => sum + inv.subtotalZAR, 0
  );

  // WIP = billable value + unbilled disbursements − invoiced amounts
  const totalWIP = billableValue + unbilledDisbursementsValue - invoicedAmount;

  // Determine last invoice date
  let lastInvoiceDate: string | undefined;
  if (invoices.length > 0) {
    const sorted = [...invoices].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    lastInvoiceDate = sorted[0].createdAt;
  }

  // Calculate WIP age (days since oldest approved unbilled entry)
  let wipAgeDays = 0;
  if (approvedBillable.length > 0) {
    const oldestDate = approvedBillable.reduce((oldest, entry) => {
      const entryDate = new Date(entry.date).getTime();
      return entryDate < oldest ? entryDate : oldest;
    }, Infinity);
    wipAgeDays = Math.floor((Date.now() - oldestDate) / (1000 * 60 * 60 * 24));
  }

  // Derive projectId from timesheets or disbursements
  const projectId = timesheets[0]?.projectId ?? disbursements[0]?.projectId ?? '';

  const result: WIPCalculation = {
    projectId,
    totalWIPValueZAR: Math.round(totalWIP * 100) / 100,
    billableHoursNotInvoiced: billableHours,
    unbilledDisbursementsZAR: Math.round(unbilledDisbursementsValue * 100) / 100,
    lastInvoiceDate,
    wipAgeDays,
  };

  return { success: true, data: result };
}

// ─── Calculate Firm WIP ───────────────────────────────────────────────────────

/**
 * Aggregate WIP across all active projects in a firm.
 *
 * Takes an array of per-project WIP data and calculates each project's WIP,
 * then aggregates into a firm-wide summary.
 */
export function calculateFirmWIP(
  projects: ProjectWIPData[]
): ServiceResult<FirmWIPSummary> {
  if (!Array.isArray(projects)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Projects must be a valid array.',
      },
    };
  }

  const byProject: WIPCalculation[] = [];
  let totalWIP = 0;

  for (const project of projects) {
    const result = calculateProjectWIP(
      project.timesheets,
      project.rates,
      project.disbursements,
      project.invoices
    );

    if (!result.success) {
      return {
        success: false,
        error: {
          code: 'PROJECT_CALC_FAILED',
          message: `WIP calculation failed for project ${project.projectId}: ${result.error.message}`,
          details: { projectId: project.projectId },
        },
      };
    }

    // Ensure projectId is set from the input data
    const wipCalc: WIPCalculation = {
      ...result.data,
      projectId: project.projectId,
    };

    byProject.push(wipCalc);
    totalWIP += wipCalc.totalWIPValueZAR;
  }

  // Sort by WIP value descending (per requirement 9.3)
  byProject.sort((a, b) => b.totalWIPValueZAR - a.totalWIPValueZAR);

  return {
    success: true,
    data: {
      totalWIP: Math.round(totalWIP * 100) / 100,
      byProject,
      projectCount: byProject.length,
    },
  };
}

// ─── Evaluate WIP Alerts ──────────────────────────────────────────────────────

/**
 * Evaluate budget threshold alerts for a project's WIP.
 *
 * - 80% of budget → budget_warning
 * - 100% of budget → budget_critical
 * - No budget (null) → no alerts generated (requirement 9.8)
 */
export function evaluateWIPAlerts(
  projectWIP: WIPCalculation,
  budget: number | null
): ServiceResult<WIPAlert[]> {
  if (!projectWIP) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Project WIP data is required.',
      },
    };
  }

  // No budget set — no threshold alerts (requirement 9.8)
  if (budget === null || budget === undefined) {
    return { success: true, data: [] };
  }

  if (budget <= 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_BUDGET',
        message: 'Budget must be a positive number.',
      },
    };
  }

  const alerts: WIPAlert[] = [];
  const percentage = (projectWIP.totalWIPValueZAR / budget) * 100;

  // Critical alert at 100%+ (check first so both can fire if applicable)
  if (percentage >= 100) {
    const overrunAmount = projectWIP.totalWIPValueZAR - budget;
    alerts.push({
      alertType: 'budget_critical',
      percentage: Math.round(percentage * 100) / 100,
      message: `Project "${projectWIP.projectId}" has exceeded its fee budget. WIP is at ${Math.round(percentage)}% of budget (R${overrunAmount.toFixed(2)} overrun).`,
    });
  }

  // Warning alert at 80%+ (but below 100% — or alongside critical if ≥100%)
  if (percentage >= 80 && percentage < 100) {
    alerts.push({
      alertType: 'budget_warning',
      percentage: Math.round(percentage * 100) / 100,
      message: `Project "${projectWIP.projectId}" is approaching fee budget exhaustion. WIP is at ${Math.round(percentage)}% of budget.`,
    });
  }

  return { success: true, data: alerts };
}

// ─── Age WIP ──────────────────────────────────────────────────────────────────

/**
 * Calculate WIP ageing buckets based on timesheet entry dates.
 *
 * Only considers approved, billable entries (not yet invoiced).
 * Buckets: 0–30 days, 31–60 days, 61–90 days, 90+ days since time was recorded.
 *
 * Each bucket contains the sum of (hours × rate) for entries in that age range.
 * Since rates are not passed here, this returns just hour counts per bucket.
 * For value-based ageing, callers should use the full calculateProjectWIP with filtered entries.
 *
 * Note: This function ages based on approved billable hours (the count) per bucket.
 */
export function ageWIP(
  entries: TimesheetEntry[],
  now: Date
): ServiceResult<WIPAgeing> {
  if (!Array.isArray(entries)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Entries must be a valid array.',
      },
    };
  }

  const ageing: WIPAgeing = {
    bucket_0_30: 0,
    bucket_31_60: 0,
    bucket_61_90: 0,
    bucket_90_plus: 0,
  };

  // Only consider approved, billable entries (not invoiced)
  const relevantEntries = entries.filter(
    entry => entry.status === 'approved' && entry.billable
  );

  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const entry of relevantEntries) {
    const entryDate = new Date(entry.date).getTime();
    const ageDays = Math.floor((nowMs - entryDate) / dayMs);

    if (ageDays <= 30) {
      ageing.bucket_0_30 += entry.hours;
    } else if (ageDays <= 60) {
      ageing.bucket_31_60 += entry.hours;
    } else if (ageDays <= 90) {
      ageing.bucket_61_90 += entry.hours;
    } else {
      ageing.bucket_90_plus += entry.hours;
    }
  }

  // Round to avoid floating point issues
  ageing.bucket_0_30 = Math.round(ageing.bucket_0_30 * 100) / 100;
  ageing.bucket_31_60 = Math.round(ageing.bucket_31_60 * 100) / 100;
  ageing.bucket_61_90 = Math.round(ageing.bucket_61_90 * 100) / 100;
  ageing.bucket_90_plus = Math.round(ageing.bucket_90_plus * 100) / 100;

  return { success: true, data: ageing };
}
