/**
 * Planning Reporting Service — Generates reports and analytics for
 * planning application portfolios.
 *
 * Pure functions that compute metrics from data passed as parameters.
 * No internal state — operates on application, deadline, objection,
 * and hearing data provided by the caller.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import type {
  PlanningApplication,
  PlanningStage,
  Deadline,
  StageTransition,
  Objection,
  Hearing,
  ApplicationStatus,
} from '../types';

import { PLANNING_STAGES, SPLUMA_DEFAULT_TIMEFRAMES } from '../constants';

// ── Report Interfaces ───────────────────────────────────────────────────────

/** Portfolio summary report grouped by status, municipality, and type. */
export interface PortfolioReport {
  generatedAt: string;
  applicationsByStatus: Record<string, number>;
  applicationsByMunicipality: Record<string, number>;
  applicationsByType: Record<string, number>;
  activeApplications: PlanningApplication[];
}

/** Client-facing project status report. */
export interface ClientReport {
  projectId: string;
  generatedAt: string;
  applications: Array<{
    application: PlanningApplication;
    currentStage: PlanningStage;
    upcomingDeadlines: Deadline[];
    outstandingActions: string[];
    riskIndicators: string[];
  }>;
}

/** Compliance report showing deadlines met/missed over a date range. */
export interface ComplianceReport {
  dateRange: { from: string; to: string };
  deadlinesMet: number;
  deadlinesMissed: number;
  complianceRate: number;
  missedDeadlineDetails: Deadline[];
}

/** Dashboard metrics summary. */
export interface DashboardMetrics {
  totalActive: number;
  atRisk: number;
  overdueDeadlines: number;
  approachingDeadlines: number;
  pendingObjectionResponses: number;
  hearingsThisMonth: number;
}

/** Gantt timeline data for a single application. */
export interface GanttTimelineData {
  applicationId: string;
  stages: Array<{
    stage: PlanningStage;
    plannedStart: string;
    plannedEnd: string;
    actualStart?: string;
    actualEnd?: string;
    status: 'complete' | 'active' | 'upcoming' | 'overdue';
    isCriticalPath: boolean;
  }>;
}

/** Application at risk with reasons and severity. */
export interface RiskApplication {
  application: PlanningApplication;
  riskReasons: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'urgent';
}

// ── Portfolio Reports ────────────────────────────────────────────────────────

/**
 * Generates a portfolio report summarising all applications for a planner.
 *
 * @param applications - All applications to include in the report
 * @returns PortfolioReport with groupings by status, municipality, and type
 */
export function generatePortfolioReport(
  applications: PlanningApplication[],
): PortfolioReport {
  const applicationsByStatus: Record<string, number> = {};
  const applicationsByMunicipality: Record<string, number> = {};
  const applicationsByType: Record<string, number> = {};

  for (const app of applications) {
    applicationsByStatus[app.status] = (applicationsByStatus[app.status] ?? 0) + 1;
    applicationsByMunicipality[app.municipalityId] = (applicationsByMunicipality[app.municipalityId] ?? 0) + 1;
    applicationsByType[app.applicationType] = (applicationsByType[app.applicationType] ?? 0) + 1;
  }

  const activeApplications = applications.filter(
    (app) => app.status === 'active' || app.status === 'draft',
  );

  return {
    generatedAt: new Date().toISOString(),
    applicationsByStatus,
    applicationsByMunicipality,
    applicationsByType,
    activeApplications,
  };
}

/**
 * Generates a client-facing report for a specific project.
 *
 * @param projectId - The project ID
 * @param applications - Applications for the project
 * @param deadlines - All deadlines across the project's applications
 * @returns ClientReport with per-application details
 */
export function generateClientReport(
  projectId: string,
  applications: PlanningApplication[],
  deadlines: Deadline[],
): ClientReport {
  const now = new Date().toISOString().split('T')[0];

  const reportApplications = applications.map((app) => {
    const appDeadlines = deadlines.filter((d) => d.applicationId === app.id);
    const upcomingDeadlines = appDeadlines.filter(
      (d) => d.status !== 'met' && d.status !== 'waived' && d.dueDate >= now,
    );
    const outstandingActions: string[] = [];
    const riskIndicators: string[] = [];

    const overdueDeadlines = appDeadlines.filter(
      (d) => d.status === 'overdue' || (d.status !== 'met' && d.status !== 'waived' && d.dueDate < now),
    );
    if (overdueDeadlines.length > 0) {
      riskIndicators.push(`${overdueDeadlines.length} overdue deadline(s)`);
    }

    const approachingDl = upcomingDeadlines.filter((d) => {
      const days = Math.ceil((new Date(d.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return days <= SPLUMA_DEFAULT_TIMEFRAMES.deadlineApproachingDays;
    });
    if (approachingDl.length > 0) {
      outstandingActions.push(`${approachingDl.length} approaching deadline(s) require attention`);
    }

    return {
      application: app,
      currentStage: app.currentStage,
      upcomingDeadlines,
      outstandingActions,
      riskIndicators,
    };
  });

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    applications: reportApplications,
  };
}

/**
 * Generates a compliance report showing deadlines met/missed over a date range.
 *
 * @param deadlines - All deadlines to evaluate
 * @param dateRange - The date range to filter by
 * @returns ComplianceReport with rates and missed details
 */
export function generateComplianceReport(
  deadlines: Deadline[],
  dateRange: { from: string; to: string },
): ComplianceReport {
  const rangeDeadlines = deadlines.filter(
    (d) => d.dueDate >= dateRange.from && d.dueDate <= dateRange.to,
  );

  const met = rangeDeadlines.filter((d) => d.status === 'met').length;
  const missed = rangeDeadlines.filter((d) => d.status === 'overdue').length;
  const total = met + missed;
  const complianceRate = total > 0 ? Math.round((met / total) * 100) : 100;

  return {
    dateRange,
    deadlinesMet: met,
    deadlinesMissed: missed,
    complianceRate,
    missedDeadlineDetails: rangeDeadlines.filter((d) => d.status === 'overdue'),
  };
}

// ── Analytics ────────────────────────────────────────────────────────────────

/**
 * Calculates average processing time (days from createdAt to now) for applications.
 *
 * @param applications - Applications to compute average for
 * @returns Average days as a number
 */
export function getAverageProcessingTimes(applications: PlanningApplication[]): number {
  if (applications.length === 0) return 0;

  const now = new Date().getTime();
  const totalDays = applications.reduce((sum, app) => {
    const created = new Date(app.createdAt).getTime();
    const days = Math.ceil((now - created) / (1000 * 60 * 60 * 24));
    return sum + days;
  }, 0);

  return Math.round(totalDays / applications.length);
}

/**
 * Identifies applications at risk based on overdue or approaching deadlines.
 *
 * @param applications - Applications to evaluate
 * @param deadlines - All deadlines
 * @returns Array of RiskApplication objects
 */
export function getAtRiskApplications(
  applications: PlanningApplication[],
  deadlines: Deadline[],
): RiskApplication[] {
  const now = new Date().toISOString().split('T')[0];
  const results: RiskApplication[] = [];

  for (const app of applications) {
    const appDeadlines = deadlines.filter((d) => d.applicationId === app.id);
    const riskReasons: string[] = [];

    const overdue = appDeadlines.filter(
      (d) => d.status !== 'met' && d.status !== 'waived' && d.dueDate < now,
    );
    if (overdue.length > 0) {
      riskReasons.push(`${overdue.length} overdue deadline(s)`);
    }

    const approaching = appDeadlines.filter((d) => {
      if (d.status === 'met' || d.status === 'waived') return false;
      const days = Math.ceil((new Date(d.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= SPLUMA_DEFAULT_TIMEFRAMES.deadlineApproachingDays;
    });
    if (approaching.length > 0) {
      riskReasons.push(`${approaching.length} deadline(s) approaching within 7 days`);
    }

    if (riskReasons.length > 0) {
      const riskLevel = overdue.length > 0 ? 'high' : 'medium';
      results.push({ application: app, riskReasons, riskLevel });
    }
  }

  return results;
}

/**
 * Returns dashboard metrics for the planner's portfolio.
 *
 * @param applications - All applications
 * @param deadlines - All deadlines
 * @param objections - All objections
 * @param hearings - All hearings
 * @returns DashboardMetrics object
 */
export function getDashboardMetrics(
  applications: PlanningApplication[],
  deadlines: Deadline[],
  objections: Objection[],
  hearings: Hearing[],
): DashboardMetrics {
  const now = new Date().toISOString().split('T')[0];
  const activeApps = applications.filter((a) => a.status === 'active' || a.status === 'draft');

  const overdueDeadlines = deadlines.filter(
    (d) => d.status !== 'met' && d.status !== 'waived' && d.dueDate < now,
  ).length;

  const approachingDeadlines = deadlines.filter((d) => {
    if (d.status === 'met' || d.status === 'waived') return false;
    const days = Math.ceil((new Date(d.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return days > 0 && days <= SPLUMA_DEFAULT_TIMEFRAMES.deadlineApproachingDays;
  }).length;

  const pendingObjectionResponses = objections.filter(
    (o) => o.status === 'received',
  ).length;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const hearingsThisMonth = hearings.filter((h) => {
    const hDate = new Date(h.hearingDate);
    return hDate.getMonth() === currentMonth && hDate.getFullYear() === currentYear;
  }).length;

  const atRisk = getAtRiskApplications(activeApps, deadlines).length;

  return {
    totalActive: activeApps.length,
    atRisk,
    overdueDeadlines,
    approachingDeadlines,
    pendingObjectionResponses,
    hearingsThisMonth,
  };
}

// ── Timeline ─────────────────────────────────────────────────────────────────

/**
 * Generates Gantt timeline data for a single application.
 *
 * @param applicationId - The application ID
 * @param transitions - Stage transition records for the application
 * @param currentStage - The application's current stage
 * @returns GanttTimelineData with stage durations and statuses
 */
export function generateGanttData(
  applicationId: string,
  transitions: StageTransition[],
  currentStage: PlanningStage,
): GanttTimelineData {
  const currentStageIndex = PLANNING_STAGES.findIndex((s) => s.id === currentStage);
  const appTransitions = transitions
    .filter((t) => t.applicationId === applicationId)
    .sort((a, b) => a.transitionedAt.localeCompare(b.transitionedAt));

  const stages = PLANNING_STAGES.map((stageDef, index) => {
    let status: 'complete' | 'active' | 'upcoming' | 'overdue';
    let actualStart: string | undefined;
    let actualEnd: string | undefined;

    if (index < currentStageIndex) {
      status = 'complete';
      // Find transition into this stage
      const entryTransition = appTransitions.find((t) => t.toStage === stageDef.id);
      const exitTransition = appTransitions.find((t) => t.fromStage === stageDef.id);
      actualStart = entryTransition?.transitionedAt?.split('T')[0];
      actualEnd = exitTransition?.transitionedAt?.split('T')[0];
    } else if (index === currentStageIndex) {
      status = 'active';
      const entryTransition = appTransitions.find((t) => t.toStage === stageDef.id);
      actualStart = entryTransition?.transitionedAt?.split('T')[0];
    } else {
      status = 'upcoming';
    }

    // Planned dates: estimate 14 days per stage from creation
    const baseDate = appTransitions.length > 0
      ? appTransitions[0].transitionedAt
      : new Date().toISOString();
    const plannedStart = addDays(baseDate.split('T')[0], index * 14);
    const plannedEnd = addDays(plannedStart, 14);

    return {
      stage: stageDef.id,
      plannedStart,
      plannedEnd,
      actualStart,
      actualEnd,
      status,
      isCriticalPath: index >= 3 && index <= 6, // Circulation through RoD is critical
    };
  });

  return { applicationId, stages };
}

// ── Utility ──────────────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
