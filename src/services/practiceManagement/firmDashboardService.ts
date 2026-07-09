/**
 * Firm Dashboard Service
 *
 * Pure business logic for firm-wide metrics, portfolio reporting, and board-ready exports.
 * Provides:
 * - Summary metrics: total revenue, total WIP exposure, average margin, utilisation, pipeline value
 * - Project portfolio table: each active project with fee, costs, WIP, margin, status
 * - Staff utilisation metrics: firm average, billable/non-billable split, per-person with trend
 * - Write-off aggregation as percentage of total fees
 * - Date range filtering (monthly, quarterly, annually)
 * - PDF export for board reporting
 *
 * This service operates on typed data objects (dependency injection pattern)
 * with no Firestore dependencies. It aggregates data from other pure services
 * (WIP, Profitability, Resource Planner, Write-Off Tracker, CRM Pipeline).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 * @module practiceManagement/firmDashboardService
 */

import type {
  FirmSummaryMetrics,
  ProjectPortfolioEntry,
  UtilisationMetrics,
  DateRange,
  ProjectFeeStructure,
  PracticeInvoice,
  PipelineOpportunity,
  WriteOffEntry,
} from './types';

// ─── Input Types ─────────────────────────────────────────────────────────────

/**
 * Project financial data used to build portfolio entries and summary metrics.
 */
export interface ProjectFinancialData {
  projectId: string;
  projectName: string;
  feeStructure: ProjectFeeStructure;
  /** Total time costs from approved timesheets (cents) */
  timeCostsCents: number;
  /** Total disbursement costs from approved expenses (cents) */
  disbursementsCents: number;
  /** Total write-offs (cents) */
  writeOffsCents: number;
  /** Total amount invoiced (cents) */
  amountInvoicedCents: number;
  /** Total amount collected (cents) */
  amountCollectedCents: number;
}

/**
 * Person timesheet data for utilisation calculations.
 */
export interface PersonTimesheetData {
  userId: string;
  displayName: string;
  /** Total billable hours in the current period */
  billableHours: number;
  /** Total non-billable hours in the current period */
  nonBillableHours: number;
  /** Total available hours in the period */
  availableHours: number;
  /** Billable hours from the previous period (for trend) */
  previousPeriodBillableHours: number;
  /** Available hours from the previous period (for trend) */
  previousPeriodAvailableHours: number;
}

/**
 * Complete data inputs needed for the firm dashboard to compute all metrics.
 */
export interface FirmDashboardInput {
  firmId: string;
  dateRange: DateRange;
  /** Financial data per active project */
  projects: ProjectFinancialData[];
  /** Pipeline opportunities (for weighted pipeline value) */
  pipelineOpportunities: PipelineOpportunity[];
  /** All invoices within the date range (for revenue calculation) */
  invoices: PracticeInvoice[];
  /** Person-level timesheet data for utilisation */
  personTimesheets: PersonTimesheetData[];
  /** Write-off entries within the date range */
  writeOffEntries: WriteOffEntry[];
}

/**
 * Dashboard export data — assembled for PDF generation.
 */
export interface DashboardExportData {
  firmId: string;
  dateRange: DateRange;
  generatedAt: string;
  summaryMetrics: FirmSummaryMetrics;
  portfolio: ProjectPortfolioEntry[];
  utilisation: UtilisationMetrics;
}

// ─── Date Range Helpers ──────────────────────────────────────────────────────

/**
 * Checks whether a date string (ISO format) falls within a DateRange.
 */
export function isWithinDateRange(dateStr: string, dateRange: DateRange): boolean {
  return dateStr >= dateRange.from && dateStr <= dateRange.to;
}

/**
 * Filters invoices by date range (using issuedDate or createdAt).
 */
export function filterInvoicesByDateRange(
  invoices: PracticeInvoice[],
  dateRange: DateRange,
): PracticeInvoice[] {
  return invoices.filter((inv) => {
    const date = inv.issuedDate ?? inv.createdAt;
    return isWithinDateRange(date, dateRange);
  });
}

// ─── Summary Metrics ─────────────────────────────────────────────────────────

/**
 * Calculates firm-wide summary metrics for the dashboard.
 *
 * Validates: Requirements 12.1, 12.4, 12.5
 * THE Firm_Dashboard SHALL display firm-wide summary metrics: total revenue (invoiced),
 * total WIP exposure, average project margin, firm utilisation rate, and pipeline value.
 * THE Firm_Dashboard SHALL aggregate write-off totals and display cumulative firm-wide
 * write-offs as a percentage of total fees.
 * THE Firm_Dashboard SHALL support date range filtering (monthly, quarterly, annually).
 *
 * @param input - Complete dashboard data inputs
 * @returns FirmSummaryMetrics
 */
export function getSummaryMetrics(input: FirmDashboardInput): FirmSummaryMetrics {
  const { projects, pipelineOpportunities, invoices, personTimesheets, dateRange, firmId } = input;

  // Total revenue = sum of paid/sent invoices within date range
  const filteredInvoices = filterInvoicesByDateRange(invoices, dateRange);
  const totalRevenueCents = filteredInvoices
    .filter((inv) => inv.status === 'paid' || inv.status === 'sent_to_client')
    .reduce((sum, inv) => sum + inv.amountCents, 0);

  // Total WIP exposure = sum of each project's WIP balance
  const totalWipExposureCents = projects.reduce((sum, proj) => {
    const wipBalance = calculateProjectWipBalance(proj);
    return sum + wipBalance;
  }, 0);

  // Average project margin (weighted by fee)
  const averageProjectMarginPercent = calculateWeightedAverageMargin(projects);

  // Firm utilisation rate
  const firmUtilisationPercent = calculateFirmUtilisation(personTimesheets);

  // Pipeline value (weighted)
  const pipelineValueCents = pipelineOpportunities
    .filter((o) => o.firmId === firmId && o.status === 'active')
    .reduce((sum, o) => sum + o.weightedValueCents, 0);

  // Write-off percentage (cumulative write-offs / total fees)
  const writeOffPercentage = calculateWriteOffPercentage(projects);

  return {
    totalRevenueCents,
    totalWipExposureCents,
    averageProjectMarginPercent,
    firmUtilisationPercent,
    pipelineValueCents,
    writeOffPercentage,
  };
}

// ─── Project Portfolio ───────────────────────────────────────────────────────

/**
 * Generates the project portfolio table showing each active project.
 *
 * Validates: Requirement 12.2
 * THE Firm_Dashboard SHALL provide a project portfolio table showing each active
 * project with its fee, costs, WIP, margin, and status indicators.
 *
 * @param projects - Financial data per active project
 * @returns Array of ProjectPortfolioEntry for each project
 */
export function getProjectPortfolio(
  projects: ProjectFinancialData[],
): ProjectPortfolioEntry[] {
  return projects.map((proj) => {
    const feeCents = proj.feeStructure.totalAgreedFeeCents;
    const costsCents = proj.timeCostsCents + proj.disbursementsCents;
    const wipCents = calculateProjectWipBalance(proj);
    const marginPercent = calculateProjectMarginPercent(proj);
    const status = classifyProjectStatus(marginPercent, costsCents, feeCents);

    return {
      projectId: proj.projectId,
      projectName: proj.projectName,
      feeCents,
      costsCents,
      wipCents,
      marginPercent,
      status,
    };
  });
}

// ─── Utilisation Metrics ─────────────────────────────────────────────────────

/**
 * Calculates staff utilisation metrics for the dashboard.
 *
 * Validates: Requirement 12.3
 * THE Firm_Dashboard SHALL display staff utilisation metrics: average utilisation rate,
 * billable vs non-billable split, and per-person utilisation with trend indicators.
 *
 * @param personTimesheets - Per-person timesheet data for the current and previous periods
 * @returns UtilisationMetrics
 */
export function getUtilisationMetrics(
  personTimesheets: PersonTimesheetData[],
): UtilisationMetrics {
  const totalBillableHours = personTimesheets.reduce((sum, p) => sum + p.billableHours, 0);
  const totalNonBillableHours = personTimesheets.reduce((sum, p) => sum + p.nonBillableHours, 0);
  const totalHours = totalBillableHours + totalNonBillableHours;
  const totalAvailableHours = personTimesheets.reduce((sum, p) => sum + p.availableHours, 0);

  const firmAverage = totalAvailableHours > 0
    ? Math.round((totalBillableHours / totalAvailableHours) * 100 * 100) / 100
    : 0;

  const byPerson = personTimesheets.map((person) => {
    const utilisation = person.availableHours > 0
      ? Math.round((person.billableHours / person.availableHours) * 100 * 100) / 100
      : 0;

    const trend = calculateUtilisationTrend(
      person.billableHours,
      person.availableHours,
      person.previousPeriodBillableHours,
      person.previousPeriodAvailableHours,
    );

    return {
      userId: person.userId,
      displayName: person.displayName,
      utilisation,
      trend,
    };
  });

  return {
    firmAverage,
    billableHours: totalBillableHours,
    nonBillableHours: totalNonBillableHours,
    totalHours,
    byPerson,
  };
}

// ─── PDF Export ──────────────────────────────────────────────────────────────

/**
 * Generates a dashboard export data package for PDF rendering.
 *
 * Validates: Requirement 12.5
 * THE Firm_Dashboard SHALL support export to PDF for board reporting.
 *
 * This function assembles all metrics into a structured export object.
 * The actual PDF rendering is delegated to a PDF library in the caller layer.
 *
 * @param input - Complete dashboard data inputs
 * @returns DashboardExportData ready for PDF generation
 */
export function exportToPdf(input: FirmDashboardInput): DashboardExportData {
  const summaryMetrics = getSummaryMetrics(input);
  const portfolio = getProjectPortfolio(input.projects);
  const utilisation = getUtilisationMetrics(input.personTimesheets);

  return {
    firmId: input.firmId,
    dateRange: input.dateRange,
    generatedAt: new Date().toISOString(),
    summaryMetrics,
    portfolio,
    utilisation,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Calculates WIP balance for a project:
 * agreed_fee − costs_incurred − amount_invoiced
 */
function calculateProjectWipBalance(proj: ProjectFinancialData): number {
  const fee = proj.feeStructure.totalAgreedFeeCents;
  const costs = proj.timeCostsCents + proj.disbursementsCents;
  return fee - costs - proj.amountInvoicedCents;
}

/**
 * Calculates project margin percentage:
 * (fee − time_cost − disbursements − write_offs) / fee × 100
 */
function calculateProjectMarginPercent(proj: ProjectFinancialData): number {
  const fee = proj.feeStructure.totalAgreedFeeCents;
  if (fee === 0) {
    const totalCosts = proj.timeCostsCents + proj.disbursementsCents + proj.writeOffsCents;
    return totalCosts > 0 ? -100 : 0;
  }
  const netProfit = fee - proj.timeCostsCents - proj.disbursementsCents - proj.writeOffsCents;
  return (netProfit / fee) * 100;
}

/**
 * Classifies project status based on margin and cost vs fee:
 * - loss_making: margin < 0%
 * - over_run: costs exceed fee (even if margin is somehow 0)
 * - warning: margin between 0% and 20%
 * - healthy: margin >= 20%
 */
export function classifyProjectStatus(
  marginPercent: number,
  costsCents: number,
  feeCents: number,
): 'healthy' | 'warning' | 'over_run' | 'loss_making' {
  if (marginPercent < 0) return 'loss_making';
  if (costsCents > feeCents) return 'over_run';
  if (marginPercent < 20) return 'warning';
  return 'healthy';
}

/**
 * Calculates weighted average margin across all projects (weighted by fee).
 */
function calculateWeightedAverageMargin(projects: ProjectFinancialData[]): number {
  const totalFee = projects.reduce((sum, p) => sum + p.feeStructure.totalAgreedFeeCents, 0);
  if (totalFee === 0) return 0;

  const totalProfit = projects.reduce((sum, p) => {
    const fee = p.feeStructure.totalAgreedFeeCents;
    return sum + (fee - p.timeCostsCents - p.disbursementsCents - p.writeOffsCents);
  }, 0);

  return (totalProfit / totalFee) * 100;
}

/**
 * Calculates firm utilisation as billable / available across all staff.
 */
function calculateFirmUtilisation(personTimesheets: PersonTimesheetData[]): number {
  const totalBillable = personTimesheets.reduce((sum, p) => sum + p.billableHours, 0);
  const totalAvailable = personTimesheets.reduce((sum, p) => sum + p.availableHours, 0);

  if (totalAvailable === 0) return 0;
  return Math.round((totalBillable / totalAvailable) * 100 * 100) / 100;
}

/**
 * Calculates write-off percentage: total write-offs / total fees × 100.
 */
function calculateWriteOffPercentage(projects: ProjectFinancialData[]): number {
  const totalWriteOffs = projects.reduce((sum, p) => sum + p.writeOffsCents, 0);
  const totalFees = projects.reduce((sum, p) => sum + p.feeStructure.totalAgreedFeeCents, 0);

  if (totalFees === 0) return 0;
  return (totalWriteOffs / totalFees) * 100;
}

/**
 * Determines utilisation trend by comparing current to previous period.
 * Trend threshold: ±2 percentage points considered "stable".
 */
export function calculateUtilisationTrend(
  currentBillable: number,
  currentAvailable: number,
  previousBillable: number,
  previousAvailable: number,
): 'up' | 'down' | 'stable' {
  const TREND_THRESHOLD = 2; // percentage points

  const currentRate = currentAvailable > 0
    ? (currentBillable / currentAvailable) * 100
    : 0;

  const previousRate = previousAvailable > 0
    ? (previousBillable / previousAvailable) * 100
    : 0;

  const diff = currentRate - previousRate;

  if (diff > TREND_THRESHOLD) return 'up';
  if (diff < -TREND_THRESHOLD) return 'down';
  return 'stable';
}
