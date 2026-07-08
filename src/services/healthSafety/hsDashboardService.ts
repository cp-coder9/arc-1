/**
 * H&S Dashboard Aggregation Service
 *
 * Provides role-differentiated dashboard data by aggregating
 * Safety File, Permit, HIRA, Incident, and Induction data
 * across assigned projects.
 */

import type { SafetyFile, HSPlan, Permit, Incident, HazardEntry, Induction } from './hsTypes';
import { calculateComplianceScore } from './safetyFileService';
import { getHighRiskHazards } from './hiraService';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HSDashboardData {
  safetyFileCompletion: number;
  pendingPlanApprovals: number;
  overduePermits: number;
  upcomingInductions: number;
  openInvestigations: number;
  highCriticalHIRA: number;
}

export type HSViewRole = 'health_safety' | 'contractor' | 'client' | 'architect';

export interface DashboardParams {
  safetyFiles: SafetyFile[];
  plans: HSPlan[];
  permits: Permit[];
  incidents: Incident[];
  hazards: HazardEntry[];
  inductions: Induction[];
}

// ─── Dashboard Aggregation ──────────────────────────────────────────────────

/**
 * Aggregates H&S data across all provided project data into dashboard metrics.
 *
 * - safetyFileCompletion: average compliance score across all safety files
 * - pendingPlanApprovals: count of plans in 'pending_approval' state
 * - overduePermits: count of permits in 'expired' state
 * - openInvestigations: count of incidents in 'under_investigation' or 'corrective_actions' state
 * - highCriticalHIRA: count of hazards with residualRisk 'high' or 'critical'
 * - upcomingInductions: simplified to 0 (workforce vs inducted comparison not available at this layer)
 */
export function getDashboardData(
  _role: HSViewRole,
  params: DashboardParams
): HSDashboardData {
  const { safetyFiles, plans, permits, incidents, hazards } = params;

  // Average compliance score across all safety files
  const safetyFileCompletion =
    safetyFiles.length > 0
      ? Math.round(
          safetyFiles.reduce((sum, file) => sum + calculateComplianceScore(file), 0) /
            safetyFiles.length
        )
      : 0;

  // Count plans awaiting approval
  const pendingPlanApprovals = plans.filter(
    (plan) => plan.state === 'pending_approval'
  ).length;

  // Count expired permits (overdue for close-out)
  const overduePermits = permits.filter(
    (permit) => permit.state === 'expired'
  ).length;

  // Count incidents under active investigation or corrective action
  const openInvestigations = incidents.filter(
    (incident) =>
      incident.state === 'under_investigation' || incident.state === 'corrective_actions'
  ).length;

  // Count high/critical residual risk hazards
  const highCriticalHIRA = getHighRiskHazards(hazards).length;

  // Upcoming inductions: simplified to 0 (workforce data not available at this aggregation layer)
  const upcomingInductions = 0;

  return {
    safetyFileCompletion,
    pendingPlanApprovals,
    overduePermits,
    upcomingInductions,
    openInvestigations,
    highCriticalHIRA,
  };
}

// ─── Role-Differentiated Views ──────────────────────────────────────────────

/**
 * Returns a role-filtered subset of dashboard data.
 *
 * - H&S Officer (health_safety): full operational view — ALL fields
 * - Principal Contractor (contractor): safetyFileCompletion, pendingPlanApprovals, overduePermits
 * - Client: pendingPlanApprovals, safetyFileCompletion (plan approval + overall score only)
 * - Designer/Architect: placeholder — empty/minimal view
 */
export function getRoleView(
  role: HSViewRole,
  data: HSDashboardData
): Partial<HSDashboardData> {
  switch (role) {
    case 'health_safety':
      // Full operational view
      return { ...data };

    case 'contractor':
      // File compliance + approvals + permits
      return {
        safetyFileCompletion: data.safetyFileCompletion,
        pendingPlanApprovals: data.pendingPlanApprovals,
        overduePermits: data.overduePermits,
      };

    case 'client':
      // Plan approval status + overall compliance score
      return {
        pendingPlanApprovals: data.pendingPlanApprovals,
        safetyFileCompletion: data.safetyFileCompletion,
      };

    case 'architect':
      // Minimal placeholder for designer role
      return {};
  }
}
