/**
 * Architex Practice Management Professional Services — Barrel Exports
 *
 * Firm-level practice management capabilities for architectural and engineering firms.
 * Tracks professional services: timesheets, expenses, billing rates, fee tracking,
 * WIP calculations, profitability analysis, invoicing, resource planning, leave,
 * write-offs, income forecasting, and CRM pipeline integration.
 *
 * @module practiceManagement
 */

// ─── Domain Types ────────────────────────────────────────────────────────────

export type {
  // SACAP
  SacapWorkStage,

  // Timesheet Engine
  TimesheetSubmissionStatus,
  TimesheetSubmission,
  PracticeTimesheetEntry,

  // Expense Manager
  ExpenseCategory,
  ExpenseType,
  ExpenseStatus,
  ExpenseClaim,
  ExpenseSummary,

  // Billing Rate Table
  BillingRateType,
  BillingRateRole,
  BillingRate,

  // Fee Tracker
  FeeBasis,
  ProjectFeeStructure,
  FeeStageAllocation,
  FeeStageBreakdown,
  FeeHealthMetrics,

  // WIP Engine
  WipPosition,
  WipReport,

  // Profitability Calculator
  ProfitabilityResult,
  FirmProfitabilityReport,

  // Practice Invoice Manager
  PracticeInvoiceType,
  PracticeInvoiceStatus,
  PracticeInvoice,

  // Resource Planner
  PersonCapacity,
  WeekCapacity,
  CapacityView,
  OverAllocation,

  // Leave Manager
  LeaveType,
  LeaveStatus,
  LeaveRequest,
  LeaveBalance,

  // Write-Off Tracker
  WriteOffReason,
  WriteOffEntry,
  WriteOffSummary,
  WriteOffWarning,
  FirmWriteOffReport,

  // Income Forecaster
  ForecastConfidence,
  MonthlyForecastEntry,
  IncomeForecast,

  // Firm Dashboard
  FirmSummaryMetrics,
  ProjectPortfolioEntry,
  UtilisationMetrics,
  DateRange,

  // CRM Pipeline
  PipelineOpportunity,

  // Audit Trail
  PracticeAuditAction,
  PracticeAuditEvent,

  // Forecast Trigger Events
  ForecastTriggerEvent,

  // Input Types
  CreateExpenseClaimInput,
  CreateBillingRateInput,
  CreateWriteOffInput,
  LeaveRequestInput,
  CreatePipelineOpportunityInput,
  CreatePracticeInvoiceInput,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

export { SACAP_STAGE_LABELS, SACAP_WORK_STAGES } from './types';

// ─── Services ────────────────────────────────────────────────────────────────

export {
  createRate,
  updateRate,
  getApplicableRate,
  getRatesForRole,
  getAllRates,
} from './billingRateTableService';

export {
  createTimesheetEntry,
  submitWeeklyTimesheet,
  approveSubmission,
  rejectSubmission,
  getSubmissionsForApproval,
  getMySubmissions,
  calculateDurationMinutes,
  getHourlyRateCents,
} from './timesheetEngineService';

export type {
  CreateTimesheetEntryInput,
  ActionCentreAction,
  ApprovalResult,
  RejectionResult,
  SubmissionResult,
} from './timesheetEngineService';

export {
  createExpenseClaim,
  submitForApproval,
  approveClaim,
  rejectClaim,
  getProjectExpenses,
  getExpenseSummary,
} from './expenseManagerService';

export {
  defineProjectFee,
  getStageBreakdown,
  checkFeeHealth,
  WARNING_THRESHOLD_PERCENT,
  OVERRUN_THRESHOLD_PERCENT,
} from './feeTrackerService';

export type {
  DefineProjectFeeInput,
  StageAllocationInput,
  StageCostData,
  FeeWarning,
  FeeHealthResult,
} from './feeTrackerService';

export {
  calculateProjectMargin,
  calculateStageMargin,
  getFirmProfitability,
  classifyMarginStatus,
  computeMarginPercent,
  generateProfitabilityNotifications,
} from './profitabilityCalculatorService';

export type {
  ProfitabilityInput,
  ProfitabilityNotification,
} from './profitabilityCalculatorService';

export {
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
} from './leaveManagerService';

export type {
  LeaveBalanceUpdate,
  LeaveBalanceRelease,
} from './leaveManagerService';

export {
  calculateProjectWip,
  calculateStageWip,
  getFirmWipReport,
} from './wipEngineService';

export type {
  ProjectCostData,
  WipStageCostData,
} from './wipEngineService';

export {
  createWriteOff,
  createReversal,
  getProjectWriteOffs,
  getFirmWriteOffs,
  getWriteOffTotalForProject,
} from './writeOffTrackerService';

export {
  createInvoice,
  updateInvoiceStatus,
  getProjectInvoices,
  getOverdueInvoices,
  checkOverdueInvoices,
  calculateTimeBasedTotal,
  getWipUpdateOnIssuance,
  validateInvoiceReadiness,
  isValidTransition,
  isOverdue,
  calculateDaysPastDue,
  OVERDUE_THRESHOLD_DAYS,
  VALID_STATUS_TRANSITIONS,
} from './practiceInvoiceManagerService';

export type {
  TimesheetEntryWithRate,
  InvoiceAction,
  InvoiceReadinessResult,
  WipUpdateResult,
} from './practiceInvoiceManagerService';

export {
  generateForecast,
  getMonthlyBreakdown,
  updateForecastOnEvent,
  determineConfidence,
  generateMonthRange,
  DEFAULT_FORECAST_MONTHS,
} from './incomeForecastService';

export {
  createOpportunity,
  updateOpportunity,
  winOpportunity,
  loseOpportunity,
  getWeightedPipelineValue,
  getHighConfidenceOpportunities,
  getCapacityImpactOpportunities,
  getPipelineForecastEntries,
  calculateWeightedValue,
  isHighConfidence,
  HIGH_CONFIDENCE_THRESHOLD,
} from './crmPipelineService';

export type {
  ForecastProjectInput,
  ForecastStageInput,
  ForecastPipelineInput,
  ForecastState,
  ForecastEntryState,
} from './incomeForecastService';

export {
  getSummaryMetrics,
  getProjectPortfolio,
  getUtilisationMetrics,
  exportToPdf,
  isWithinDateRange,
  filterInvoicesByDateRange,
  classifyProjectStatus,
  calculateUtilisationTrend,
} from './firmDashboardService';

export type {
  ProjectFinancialData,
  PersonTimesheetData,
  FirmDashboardInput,
  DashboardExportData,
} from './firmDashboardService';

export {
  getCapacityView,
  getPersonCapacity,
  getOverAllocated,
  generateWeekStarts,
  calculateLeaveHoursForWeek,
  calculateHolidayHoursForWeek,
  calculateAllocatedHoursForWeek,
  calculatePipelineImpactForWeek,
  STANDARD_WEEKLY_HOURS,
  STANDARD_DAILY_HOURS,
} from './resourcePlannerService';

export type {
  TeamMember,
  ResourceAllocation,
  CapacityViewConfig,
} from './resourcePlannerService';

export {
  checkAccess,
  checkAccessWithAudit,
  getRoleDataScope,
  getAllowedResources,
  canAccessResource,
  createAccessViolationEvent,
  canApprove,
  canManageBillingRates,
  canAccessFirmWideViews,
  canManageInvoices,
  filterAccessibleProjects,
  getPermissionsMatrix,
} from './roleAccessService';

export type {
  PracticeRole,
  PracticeResource,
  AccessCheckContext,
  AccessCheckResult,
  AccessViolation,
  RoleDataScope,
} from './roleAccessService';

// ─── Integration Adapters ────────────────────────────────────────────────────

export {
  buildPracticePassportData,
  type PracticePassportData,
  type PracticePassportInput,
} from './adapters';
