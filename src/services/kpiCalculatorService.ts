/**
 * KPI Calculator Service
 * Computes 5 key performance indicators from ProjectRecords and related data.
 *
 * KPIs:
 * 1. Schedule Variance — planned vs actual milestone dates
 * 2. Cost to Complete — budget vs committed vs actual spend
 * 3. Defect Liability Remaining Days — per project tracking
 * 4. Retention Release Readiness — conditions met, amounts due
 * 5. Compliance Gap Count — expired registrations, lapsed insurance, missing docs
 */

import type {
  ComplianceGapKPI,
  CostToCompleteKPI,
  DefectLiabilityKPI,
  KPIComputationResult,
  KPIResult,
  RetentionReleaseKPI,
  ScheduleVarianceKPI,
} from '../types/analyticsReporting';

// ── Types for input data ────────────────────────────────────────────────────────

export interface ScheduleMilestone {
  id: string;
  title: string;
  plannedDate: string;
  actualDate?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'delayed';
}

export interface CostLineItem {
  category: string;
  budgeted: number;
  committed: number;
  actual: number;
}

export interface DefectLiabilityPeriod {
  startDate: string;
  endDate: string;
  totalDays: number;
}

export interface RetentionCondition {
  description: string;
  met: boolean;
  amount?: number;
}

export interface ComplianceItem {
  type: 'registration' | 'insurance' | 'document';
  name: string;
  expiryDate?: string;
  status: 'valid' | 'expiring_soon' | 'expired' | 'missing';
}

export interface KPIInputData {
  projectId: string;
  milestones?: ScheduleMilestone[];
  costLineItems?: CostLineItem[];
  defectLiability?: DefectLiabilityPeriod;
  retentionAmount?: number;
  retentionConditions?: RetentionCondition[];
  complianceItems?: ComplianceItem[];
}

// ── Constants ───────────────────────────────────────────────────────────────────

const KPI_VERSION = 1;
const COMPLIANCE_EXPIRY_WARNING_DAYS = 30;

// ── KPI 1: Schedule Variance ────────────────────────────────────────────────────

export function computeScheduleVariance(
  milestones: ScheduleMilestone[],
): ScheduleVarianceKPI {
  if (!milestones || milestones.length === 0) {
    return {
      name: 'schedule_variance',
      label: 'Schedule Variance',
      plannedMilestones: 0,
      completedOnTime: 0,
      delayed: 0,
      variancePercent: 0,
      unit: 'percent',
    };
  }

  const completed = milestones.filter((m) => m.status === 'completed');
  const delayed = milestones.filter((m) => m.status === 'delayed');
  const completedOnTime = completed.filter(
    (m) => !m.actualDate || new Date(m.actualDate) <= new Date(m.plannedDate),
  ).length;
  const totalWithDates = milestones.filter((m) => m.plannedDate).length;

  const variancePercent =
    totalWithDates > 0
      ? Math.round(((completedOnTime - delayed.length) / totalWithDates) * 100)
      : 0;

  return {
    name: 'schedule_variance',
    label: 'Schedule Variance',
    plannedMilestones: milestones.length,
    completedOnTime,
    delayed: delayed.length,
    variancePercent,
    unit: 'percent',
  };
}

// ── KPI 2: Cost to Complete ─────────────────────────────────────────────────────

export function computeCostToComplete(
  costItems: CostLineItem[],
): CostToCompleteKPI {
  if (!costItems || costItems.length === 0) {
    return {
      name: 'cost_to_complete',
      label: 'Cost to Complete',
      budgetedAmount: 0,
      committedAmount: 0,
      actualSpend: 0,
      remainingBudget: 0,
      percentComplete: 0,
      unit: 'ZAR',
    };
  }

  const budgetedAmount = costItems.reduce((sum, item) => sum + item.budgeted, 0);
  const committedAmount = costItems.reduce((sum, item) => sum + item.committed, 0);
  const actualSpend = costItems.reduce((sum, item) => sum + item.actual, 0);
  const remainingBudget = budgetedAmount - actualSpend;
  const percentComplete =
    budgetedAmount > 0 ? Math.round((actualSpend / budgetedAmount) * 100) : 0;

  return {
    name: 'cost_to_complete',
    label: 'Cost to Complete',
    budgetedAmount,
    committedAmount,
    actualSpend,
    remainingBudget,
    percentComplete,
    unit: 'ZAR',
  };
}

// ── KPI 3: Defect Liability Remaining Days ──────────────────────────────────────

export function computeDefectLiabilityRemaining(
  defectLiability: DefectLiabilityPeriod,
  referenceDate?: string,
): DefectLiabilityKPI {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const startDate = new Date(defectLiability.startDate);
  const endDate = new Date(defectLiability.endDate);
  const totalDays = defectLiability.totalDays || Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const remainingDays = Math.max(
    0,
    Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const isExpired = remainingDays <= 0;

  return {
    name: 'defect_liability_remaining_days',
    label: 'Defect Liability Remaining',
    totalDays,
    elapsedDays,
    remainingDays,
    isExpired,
    unit: 'days',
  };
}

// ── KPI 4: Retention Release Readiness ──────────────────────────────────────────

export function computeRetentionReleaseReadiness(
  totalRetentionAmount: number,
  conditions: RetentionCondition[],
): RetentionReleaseKPI {
  if (!conditions || conditions.length === 0) {
    return {
      name: 'retention_release_readiness',
      label: 'Retention Release Readiness',
      totalRetentionAmount,
      releasableAmount: 0,
      conditionsMet: 0,
      totalConditions: 0,
      isReadyForRelease: false,
      unit: 'ZAR',
    };
  }

  const conditionsMet = conditions.filter((c) => c.met).length;
  const totalConditions = conditions.length;
  const isReadyForRelease = conditionsMet === totalConditions && totalConditions > 0;

  // Releasable amount is proportional to conditions met, or full if all met
  const releasableAmount = isReadyForRelease
    ? totalRetentionAmount
    : Math.round((conditionsMet / totalConditions) * totalRetentionAmount);

  return {
    name: 'retention_release_readiness',
    label: 'Retention Release Readiness',
    totalRetentionAmount,
    releasableAmount,
    conditionsMet,
    totalConditions,
    isReadyForRelease,
    unit: 'ZAR',
  };
}

// ── KPI 5: Compliance Gap Count ─────────────────────────────────────────────────

export function computeComplianceGapCount(
  items: ComplianceItem[],
  referenceDate?: string,
): ComplianceGapKPI {
  if (!items || items.length === 0) {
    return {
      name: 'compliance_gap_count',
      label: 'Compliance Gap Count',
      expiredRegistrations: 0,
      lapsedInsurance: 0,
      missingDocuments: 0,
      totalGaps: 0,
      unit: 'count',
    };
  }

  const now = referenceDate ? new Date(referenceDate) : new Date();
  let expiredRegistrations = 0;
  let lapsedInsurance = 0;
  let missingDocuments = 0;

  for (const item of items) {
    switch (item.type) {
      case 'registration':
        if (item.status === 'expired') expiredRegistrations++;
        else if (
          item.status === 'expiring_soon' &&
          item.expiryDate &&
          new Date(item.expiryDate) <=
            new Date(now.getTime() + COMPLIANCE_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000)
        ) {
          expiredRegistrations++; // Count as gap if expiring within warning period
        }
        break;
      case 'insurance':
        if (item.status === 'expired' || item.status === 'missing') lapsedInsurance++;
        break;
      case 'document':
        if (item.status === 'missing' || item.status === 'expired') missingDocuments++;
        break;
    }
  }

  const totalGaps = expiredRegistrations + lapsedInsurance + missingDocuments;

  return {
    name: 'compliance_gap_count',
    label: 'Compliance Gap Count',
    expiredRegistrations,
    lapsedInsurance,
    missingDocuments,
    totalGaps,
    unit: 'count',
  };
}

// ── Aggregate computation ───────────────────────────────────────────────────────

export function computeAllKPIs(input: KPIInputData): KPIComputationResult {
  const kpis: KPIResult[] = [
    computeScheduleVariance(input.milestones || []),
    computeCostToComplete(input.costLineItems || []),
    computeDefectLiabilityRemaining(
      input.defectLiability || { startDate: new Date().toISOString(), endDate: new Date().toISOString(), totalDays: 0 },
    ),
    computeRetentionReleaseReadiness(input.retentionAmount || 0, input.retentionConditions || []),
    computeComplianceGapCount(input.complianceItems || []),
  ];

  return {
    projectId: input.projectId,
    computedAt: new Date().toISOString(),
    kpis,
    version: KPI_VERSION,
  };
}

// ── Helper: convert KPI result to immutable KPIMetric record ────────────────────

export { KPI_VERSION };
