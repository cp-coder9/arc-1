/**
 * SpecForge → Project Passport Adapter
 *
 * Computes budget summaries, readiness counts, issue status, and risk findings
 * from a SpecForge workspace for inclusion in the Project Passport.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6
 */

import type { RiskFinding } from '@/services/lifecycleTypes';
import type {
  SpecBudgetSummary,
  SpecForgeWorkspace,
  SpecIssueStatus,
} from '@/types/specforgeTypes';

// ── Exported Interface ──────────────────────────────────────────────────────

export interface SpecForgePassportData {
  budgetSummary: SpecBudgetSummary | null;
  readiness: {
    blockerCount: number;
    pendingClientDecisions: number;
    longLeadItemCount: number;
  } | null;
  issueStatus: SpecIssueStatus | null;
  latestRevision: string | null;
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Build passport-ready data from a SpecForge workspace.
 * Returns null values for all fields when workspace is null (Req 7.6).
 */
export function buildSpecForgePassportData(
  workspace: SpecForgeWorkspace | null,
): SpecForgePassportData {
  if (!workspace) {
    return {
      budgetSummary: null,
      readiness: null,
      issueStatus: null,
      latestRevision: null,
    };
  }

  const items = workspace.items;

  // Budget summary (Req 7.1)
  const allowance = items.reduce((sum, item) => sum + item.budgetAllowance, 0);
  const estimate = items.reduce((sum, item) => sum + item.estimatedCost, 0);
  const delta = estimate - allowance;
  const deltaPct = allowance > 0
    ? Math.round((delta / allowance) * 1000) / 10
    : 0;

  const budgetSummary: SpecBudgetSummary = {
    allowance,
    estimate,
    delta,
    deltaPct,
    overBudgetItems: items
      .filter((item) => item.estimatedCost > item.budgetAllowance)
      .map((item) => item.id),
    longLeadItems: items
      .filter((item) => item.leadTimeDays >= 56)
      .map((item) => item.id),
    staleItems: items
      .filter((item) => item.supersededBy)
      .map((item) => item.id),
  };

  // Readiness counts (Req 7.2)
  const blockerCount = items.filter((item) => item.supersededBy).length;
  const pendingClientDecisions = items.filter(
    (item) =>
      item.clientDecision &&
      item.status === 'needs_decision',
  ).length;
  const longLeadItemCount = items.filter(
    (item) => item.leadTimeDays >= 56,
  ).length;

  // Issue status and revision (Req 7.3)
  const issueStatus: SpecIssueStatus = workspace.issueStatus;
  const latestRevision: string = workspace.revision;

  return {
    budgetSummary,
    readiness: {
      blockerCount,
      pendingClientDecisions,
      longLeadItemCount,
    },
    issueStatus,
    latestRevision,
  };
}

/**
 * Derive risk findings from SpecForge passport data.
 * If budget delta percentage exceeds 10%, returns a high-priority budget risk (Req 7.5).
 */
export function specForgeRiskFindings(
  data: SpecForgePassportData,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  if (!data.budgetSummary) {
    return findings;
  }

  const { deltaPct } = data.budgetSummary;

  if (deltaPct !== undefined && deltaPct > 10) {
    findings.push({
      code: 'SPECFORGE_BUDGET_OVERRUN',
      priority: 'high',
      message: `Specification budget exceeds allowance by ${deltaPct}% (threshold: 10%).`,
      assignedRoles: ['quantity_surveyor', 'architect', 'client_developer'],
    });
  }

  return findings;
}
