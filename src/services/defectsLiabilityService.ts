import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
export type LiabilityPeriodStatus = 'pending' | 'active' | 'expiring_soon' | 'expired' | 'extended';
export type DefectReportStatus = 'reported' | 'under_review' | 'accepted_by_contractor' | 'rectification_in_progress' | 'rectified' | 'verified' | 'disputed';
export type ContractorRecallStatus = 'notified' | 'acknowledged' | 'on_site' | 'completed' | 'no_response' | 'escalated';

export interface DefectsLiabilityPeriod {
  id: string;
  projectId: string;
  jobId?: string;
  startDate: string;
  endDate: string;
  extendedEndDate?: string;
  durationMonths: number;
  status: LiabilityPeriodStatus;
  retentionReleaseTriggered: boolean;
  retentionReleaseDate?: string;
  contractorId?: string;
  contractorName?: string;
  conditions?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LiabilityDefectReport {
  id: string;
  liabilityPeriodId: string;
  projectId: string;
  title: string;
  description: string;
  category: 'patent' | 'latent' | 'newly_discovered';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: DefectReportStatus;
  reportedBy: string;
  reportedAt: string;
  dueDate?: string;
  rectifiedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  evidenceUrls: string[];
  originDefectId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorRecall {
  id: string;
  liabilityPeriodId: string;
  projectId: string;
  defectReportIds: string[];
  contractorId: string;
  contractorName?: string;
  status: ContractorRecallStatus;
  notifiedAt: string;
  acknowledgedAt?: string;
  requiredOnSiteBy?: string;
  onSiteAt?: string;
  completedAt?: string;
  notes?: string;
  escalationLevel?: 'reminder' | 'formal_notice' | 'legal';
  createdAt: string;
  updatedAt: string;
}

export interface DefectsLiabilitySummary {
  period: DefectsLiabilityPeriod;
  defects: LiabilityDefectReport[];
  recalls: ContractorRecall[];
  openDefectCount: number;
  overdueDefectCount: number;
  daysRemaining: number;
  retentionReleaseEligible: boolean;
  requiresAttention: boolean;
}

const OPEN_DEFECT_STATUSES: DefectReportStatus[] = ['reported', 'under_review', 'accepted_by_contractor', 'rectification_in_progress', 'disputed'];
const CLOSED_DEFECT_STATUSES: DefectReportStatus[] = ['rectified', 'verified'];

export function createLiabilityPeriod(input: {
  projectId: string;
  jobId?: string;
  startDate: string;
  durationMonths?: number;
  contractorId?: string;
  contractorName?: string;
  conditions?: string[];
}): DefectsLiabilityPeriod {
  const startDate = new Date(input.startDate);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + (input.durationMonths ?? 12));

  const now = new Date();
  let status: LiabilityPeriodStatus = 'pending';
  if (startDate <= now) {
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 0) status = 'expired';
    else if (daysRemaining <= 90) status = 'expiring_soon';
    else status = 'active';
  }

  return {
    id: `liability-${input.projectId}`,
    projectId: input.projectId,
    jobId: input.jobId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    durationMonths: input.durationMonths ?? 12,
    status,
    retentionReleaseTriggered: false,
    contractorId: input.contractorId,
    contractorName: input.contractorName,
    conditions: input.conditions ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function evaluateLiabilityPeriodExpiry(period: DefectsLiabilityPeriod, referenceDate?: string): { daysRemaining: number; expired: boolean; expiringSoon: boolean } {
  const endDate = new Date(period.extendedEndDate ?? period.endDate);
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    daysRemaining,
    expired: daysRemaining <= 0,
    expiringSoon: daysRemaining > 0 && daysRemaining <= 90,
  };
}

export function evaluateRetentionReleaseEligibility(input: {
  period: DefectsLiabilityPeriod;
  defects: LiabilityDefectReport[];
  allDefectsResolved: boolean;
}): { eligible: boolean; blockers: string[] } {
  const blockers: string[] = [];

  if (input.period.status === 'expired' && !input.allDefectsResolved) {
    blockers.push('Defects liability period has expired but unresolved defects remain.');
  }

  if (input.period.status !== 'expired' && input.period.status !== 'expiring_soon') {
    blockers.push(`Defects liability period is still active (status: ${input.period.status}). Retention release typically occurs after expiry.`);
  }

  if (!input.allDefectsResolved) {
    const openCount = input.defects.filter((d) => OPEN_DEFECT_STATUSES.includes(d.status)).length;
    blockers.push(`${openCount} defect(s) still unresolved during liability period.`);
  }

  return { eligible: blockers.length === 0, blockers };
}

export function shouldRecallContractor(defects: LiabilityDefectReport[] = []): { shouldRecall: boolean; reason: string; defectIds: string[] } {
  const actionable = defects.filter((d) =>
    OPEN_DEFECT_STATUSES.includes(d.status) && (d.severity === 'critical' || d.severity === 'high')
  );

  if (actionable.length === 0) {
    return { shouldRecall: false, reason: 'No critical or high-severity defects requiring contractor recall.', defectIds: [] };
  }

  const unresolvedLong = actionable.filter((d) => {
    const reportedDate = new Date(d.reportedAt);
    const daysSinceReport = Math.ceil((Date.now() - reportedDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceReport > 30;
  });

  if (unresolvedLong.length > 0) {
    return {
      shouldRecall: true,
      reason: `${unresolvedLong.length} critical/high-severity defect(s) unresolved for more than 30 days.`,
      defectIds: unresolvedLong.map((d) => d.id),
    };
  }

  if (actionable.length >= 3) {
    return {
      shouldRecall: true,
      reason: `${actionable.length} critical/high-severity defects require contractor attention.`,
      defectIds: actionable.map((d) => d.id),
    };
  }

  return { shouldRecall: false, reason: 'Defects are being addressed within expected timeframes.', defectIds: [] };
}

export function buildDefectsLiabilitySummary(period: DefectsLiabilityPeriod, defects: LiabilityDefectReport[] = [], recalls: ContractorRecall[] = []): DefectsLiabilitySummary {
  const now = new Date();
  const openDefects = defects.filter((d) => OPEN_DEFECT_STATUSES.includes(d.status));
  const overdueDefects = openDefects.filter((d) => d.dueDate && d.dueDate < now.toISOString().slice(0, 10));
  const { daysRemaining } = evaluateLiabilityPeriodExpiry(period);

  const allDefectsResolved = openDefects.length === 0;
  const { eligible: retentionReleaseEligible } = evaluateRetentionReleaseEligibility({
    period,
    defects,
    allDefectsResolved,
  });

  const requiresAttention = openDefects.length > 0 || period.status === 'expiring_soon' || recalls.some((r) => r.status === 'no_response' || r.status === 'escalated');

  return {
    period,
    defects,
    recalls,
    openDefectCount: openDefects.length,
    overdueDefectCount: overdueDefects.length,
    daysRemaining,
    retentionReleaseEligible,
    requiresAttention,
  };
}

export async function persistLiabilityPeriod(period: DefectsLiabilityPeriod): Promise<void> {
  await setDoc(getDemoDoc( 'defects_liability', period.id), period);
}

export async function getLiabilityPeriod(projectId: string): Promise<DefectsLiabilityPeriod | null> {
  const snap = await getDoc(getDemoDoc( 'defects_liability', `liability-${projectId}`));
  if (!snap.exists()) return null;
  return snap.data() as DefectsLiabilityPeriod;
}

export async function startLiabilityPeriod(input: {
  projectId: string;
  jobId?: string;
  startDate: string;
  durationMonths?: number;
  contractorId?: string;
  contractorName?: string;
  conditions?: string[];
}): Promise<DefectsLiabilityPeriod> {
  const period = createLiabilityPeriod({
    projectId: input.projectId,
    jobId: input.jobId,
    startDate: input.startDate,
    durationMonths: input.durationMonths ?? 12,
    contractorId: input.contractorId,
    contractorName: input.contractorName,
    conditions: input.conditions,
  });

  await persistLiabilityPeriod(period);

  await updateDoc(getDemoDoc( 'projects', input.projectId), {
    defectsLiability: {
      periodId: period.id,
      status: period.status,
      startDate: period.startDate,
      endDate: period.endDate,
      durationMonths: period.durationMonths,
    },
    updatedAt: new Date().toISOString(),
  });

  return period;
}

export async function reportLiabilityDefect(input: {
  liabilityPeriodId: string;
  projectId: string;
  title: string;
  description: string;
  category: LiabilityDefectReport['category'];
  severity: LiabilityDefectReport['severity'];
  reportedBy: string;
  dueDate?: string;
  originDefectId?: string;
}): Promise<LiabilityDefectReport> {
  const now = new Date().toISOString();
  const report: LiabilityDefectReport = {
    id: `liability-defect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    liabilityPeriodId: input.liabilityPeriodId,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    category: input.category,
    severity: input.severity,
    status: 'reported',
    reportedBy: input.reportedBy,
    reportedAt: now,
    dueDate: input.dueDate,
    evidenceUrls: [],
    originDefectId: input.originDefectId,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(getDemoDoc( 'liability_defects', report.id), report);
  return report;
}

export async function createContractorRecall(input: {
  liabilityPeriodId: string;
  projectId: string;
  defectReportIds: string[];
  contractorId: string;
  contractorName?: string;
  requiredOnSiteBy?: string;
}): Promise<ContractorRecall> {
  const now = new Date().toISOString();
  const recall: ContractorRecall = {
    id: `recall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    liabilityPeriodId: input.liabilityPeriodId,
    projectId: input.projectId,
    defectReportIds: input.defectReportIds,
    contractorId: input.contractorId,
    contractorName: input.contractorName,
    status: 'notified',
    notifiedAt: now,
    requiredOnSiteBy: input.requiredOnSiteBy,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(getDemoDoc( 'contractor_recalls', recall.id), recall);
  return recall;
}

export async function triggerRetentionRelease(periodId: string, releasedBy: string): Promise<void> {
  const snap = await getDoc(getDemoDoc( 'defects_liability', periodId));
  if (!snap.exists()) throw new Error(`Liability period ${periodId} not found`);

  const period = snap.data() as DefectsLiabilityPeriod;
  const now = new Date().toISOString();

  await updateDoc(getDemoDoc( 'defects_liability', periodId), {
    retentionReleaseTriggered: true,
    retentionReleaseDate: now,
    updatedAt: now,
  });

  await updateDoc(getDemoDoc( 'projects', period.projectId), {
    'defectsLiability.retentionReleaseTriggered': true,
    'defectsLiability.retentionReleaseDate': now,
    'defectsLiability.retentionReleasedBy': releasedBy,
    updatedAt: now,
  });
}

export async function extendLiabilityPeriod(projectId: string, extensionMonths: number, reason: string): Promise<DefectsLiabilityPeriod> {
  const period = await getLiabilityPeriod(projectId);
  if (!period) throw new Error(`No liability period found for project ${projectId}`);

  const currentEnd = new Date(period.extendedEndDate ?? period.endDate);
  currentEnd.setMonth(currentEnd.getMonth() + extensionMonths);

  const updates = {
    extendedEndDate: currentEnd.toISOString(),
    status: 'extended' as LiabilityPeriodStatus,
    updatedAt: new Date().toISOString(),
  };

  await updateDoc(getDemoDoc( 'defects_liability', period.id), updates);
  return { ...period, ...updates };
}

export async function getLiabilityDefectsForProject(projectId: string): Promise<LiabilityDefectReport[]> {
  const q = query(getDemoCol( 'liability_defects'), where('projectId', '==', projectId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LiabilityDefectReport);
}

export async function getContractorRecallsForProject(projectId: string): Promise<ContractorRecall[]> {
  const q = query(getDemoCol( 'contractor_recalls'), where('projectId', '==', projectId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ContractorRecall);
}

export async function getDefectsLiabilitySummaryForProject(projectId: string): Promise<DefectsLiabilitySummary | null> {
  const period = await getLiabilityPeriod(projectId);
  if (!period) return null;

  const [defects, recalls] = await Promise.all([
    getLiabilityDefectsForProject(projectId),
    getContractorRecallsForProject(projectId),
  ]);

  return buildDefectsLiabilitySummary(period, defects, recalls);
}

export const defectsLiabilityService = {
  createLiabilityPeriod,
  evaluateLiabilityPeriodExpiry,
  evaluateRetentionReleaseEligibility,
  shouldRecallContractor,
  buildDefectsLiabilitySummary,
  persistLiabilityPeriod,
  getLiabilityPeriod,
  startLiabilityPeriod,
  reportLiabilityDefect,
  createContractorRecall,
  triggerRetentionRelease,
  extendLiabilityPeriod,
  getLiabilityDefectsForProject,
  getContractorRecallsForProject,
  getDefectsLiabilitySummaryForProject,
};

export default defectsLiabilityService;
