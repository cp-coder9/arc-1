/**
 * ITP Passport Adapter — Contributes quality data to the Project Passport.
 *
 * Responsibilities:
 * - Calculate project compliance score from inspections + material tests
 * - Build quality summary for Project Passport assembly
 * - Emit risk signals when compliance drops below threshold
 * - Map ITP records to ProjectRecord format for lifecycle engine
 * - Generate compliance reports for individual ITPs
 */

import { getDocs, query, where } from 'firebase/firestore';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import { getITPs, getAllItems } from '@/services/itpService';
import { getNcrs } from '@/services/ncrService';
import type {
  ITP,
  ITPStatus,
  ITPInspectionItem,
  MaterialTest,
  QualitySummary,
  ITPComplianceScore,
} from '@/types';
import type {
  ProjectRecord,
  ProjectRiskSignal,
  RecordStatus,
} from '@/services/lifecycleTypes';

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const MATERIAL_TESTS_COL = 'material_tests';
const INSPECTION_REQUESTS_COL = 'inspection_requests';
const COMPLIANCE_THRESHOLD = 80;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComplianceReport {
  projectId: string;
  itpId: string;
  itpTitle: string;
  itpStatus: ITPStatus;
  revisionNumber: number;
  generatedAt: string;
  items: ComplianceReportItem[];
  passCount: number;
  failCount: number;
  pendingCount: number;
  linkedNCRs: ComplianceReportNCR[];
  linkedTestResults: ComplianceReportTestResult[];
}

export interface ComplianceReportItem {
  id: string;
  sequenceNumber: number;
  title: string;
  inspectionType: string;
  status: string;
  signOffRecord?: ITPInspectionItem['signOffRecord'];
  selfInspectionRecord?: ITPInspectionItem['selfInspectionRecord'];
  ncrId?: string;
}

export interface ComplianceReportNCR {
  ncrId: string;
  title: string;
  severity: string;
  status: string;
  sourceItemId?: string;
}

export interface ComplianceReportTestResult {
  testId: string;
  materialType: string;
  testCategory: string;
  status: string;
  linkedInspectionItemIds: string[];
}

// ── Firestore Helpers ────────────────────────────────────────────────────────

function materialTestsCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, MATERIAL_TESTS_COL);
}

function inspectionRequestsCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, INSPECTION_REQUESTS_COL);
}

// ── Compliance Score Calculation ─────────────────────────────────────────────

/**
 * Calculates the project compliance score.
 *
 * Formula: (passed inspections + passed tests) / (total required inspections + total required tests) × 100
 * - Rounded to 1 decimal place
 * - If denominator is 0, returns 100%
 */
export async function calculateComplianceScore(projectId: string): Promise<ITPComplianceScore> {
  // Get all non-deleted, non-superseded ITPs
  const itps = await getITPs(projectId);
  const activeItps = itps.filter(
    (itp) => itp.status !== 'superseded' && itp.status !== 'deleted' && !itp.isDeleted,
  );

  // Count passed and total inspections across all active ITPs
  let passedInspections = 0;
  let totalRequiredInspections = 0;

  for (const itp of activeItps) {
    if (itp.status === 'draft') continue; // Draft ITPs don't count toward compliance
    const items = await getAllItems(projectId, itp.id);
    totalRequiredInspections += items.length;
    passedInspections += items.filter(
      (item) => item.status === 'passed' || item.status === 'conditional_accepted' || item.status === 'ncr_resolved',
    ).length;
  }

  // Count passed and total material tests
  let passedMaterialTests = 0;
  let totalRequiredMaterialTests = 0;

  try {
    const testsSnap = await getDocs(materialTestsCollection(projectId));
    const tests = testsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MaterialTest));
    totalRequiredMaterialTests = tests.length;
    passedMaterialTests = tests.filter((t) => t.status === 'passed').length;
  } catch {
    // If material tests are unavailable, continue with inspections only
  }

  // Calculate score
  const denominator = totalRequiredInspections + totalRequiredMaterialTests;
  const score = denominator === 0
    ? 100
    : Math.round(((passedInspections + passedMaterialTests) / denominator) * 1000) / 10;

  return {
    score,
    passedInspections,
    passedMaterialTests,
    totalRequiredInspections,
    totalRequiredMaterialTests,
  };
}

// ── Quality Summary ──────────────────────────────────────────────────────────

/**
 * Builds the quality summary for the Project Passport.
 *
 * Contains: total ITPs, ITPs by status, compliance score, open hold point breaches,
 * pending material tests, and open NCRs linked to ITPs.
 *
 * If data is unavailable, returns complianceScore: null with complianceScoreUnavailable: true.
 */
export async function getQualitySummary(projectId: string): Promise<QualitySummary> {
  try {
    const itps = await getITPs(projectId);

    // Build ITP status counts
    const itpsByStatus: Record<ITPStatus, number> = {
      draft: 0,
      approved: 0,
      in_progress: 0,
      completed: 0,
      superseded: 0,
      deleted: 0,
    };

    for (const itp of itps) {
      if (itp.isDeleted) {
        itpsByStatus.deleted++;
      } else {
        itpsByStatus[itp.status]++;
      }
    }

    // Calculate compliance score
    let complianceScore: number | null = null;
    let complianceScoreUnavailable = false;

    try {
      const scoreResult = await calculateComplianceScore(projectId);
      complianceScore = scoreResult.score;
    } catch {
      complianceScoreUnavailable = true;
    }

    // Count open hold point breaches
    let openHoldPointBreaches = 0;
    try {
      const requestsSnap = await getDocs(
        query(inspectionRequestsCollection(projectId), where('status', '==', 'breached')),
      );
      openHoldPointBreaches = requestsSnap.size;
    } catch {
      // If inspection requests unavailable, default to 0
    }

    // Count pending material tests
    let pendingMaterialTests = 0;
    try {
      const testsSnap = await getDocs(materialTestsCollection(projectId));
      const tests = testsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MaterialTest));
      const pendingStatuses = ['scheduled', 'sampled', 'submitted_to_lab'];
      pendingMaterialTests = tests.filter((t) => pendingStatuses.includes(t.status)).length;
    } catch {
      // If material tests unavailable, default to 0
    }

    // Count open NCRs linked to ITPs
    let openNCRsLinkedToITPs = 0;
    try {
      const ncrs = await getNcrs(projectId);
      const openStatuses = ['open', 'corrective_action_submitted'];
      openNCRsLinkedToITPs = ncrs.filter(
        (ncr) => openStatuses.includes(ncr.status) && ncr.createdBy === 'system:itp_service',
      ).length;
    } catch {
      // If NCRs unavailable, default to 0
    }

    return {
      totalITPs: itps.filter((itp) => !itp.isDeleted).length,
      itpsByStatus,
      complianceScore,
      complianceScoreUnavailable,
      openHoldPointBreaches,
      pendingMaterialTests,
      openNCRsLinkedToITPs,
    };
  } catch {
    // If we can't retrieve data at all, return unavailable state
    return {
      totalITPs: 0,
      itpsByStatus: {
        draft: 0,
        approved: 0,
        in_progress: 0,
        completed: 0,
        superseded: 0,
        deleted: 0,
      },
      complianceScore: null,
      complianceScoreUnavailable: true,
      openHoldPointBreaches: 0,
      pendingMaterialTests: 0,
      openNCRsLinkedToITPs: 0,
    };
  }
}

// ── Risk Signal Emission ─────────────────────────────────────────────────────

/**
 * Emits a ProjectRiskSignal when compliance score crosses below 80%.
 *
 * Condition: previousScore >= 80 AND score < 80
 * Returns null if no signal needed.
 */
export function emitComplianceRiskSignal(
  projectId: string,
  score: number,
  previousScore: number,
): ProjectRiskSignal | null {
  if (previousScore >= COMPLIANCE_THRESHOLD && score < COMPLIANCE_THRESHOLD) {
    const timestamp = new Date().toISOString();
    return {
      id: `itp-risk-${projectId}-${timestamp}`,
      sourceModule: 'site',
      category: 'delay',
      severity: 'high',
      title: 'Quality Compliance Score Below 80%',
      detail: `Current compliance score: ${score}%`,
      linkedRecordIds: [],
      recommendedIntervention: 'Review open inspections and failed tests',
      humanGate: 'review',
    };
  }

  return null;
}

// ── ITP to ProjectRecord Mapping ─────────────────────────────────────────────

/**
 * Maps an ITP to a ProjectRecord for the lifecycle engine.
 *
 * Status mapping:
 * - draft → 'draft'
 * - approved → 'approved'
 * - in_progress → 'issued'
 * - completed → 'approved'
 */
export function mapITPToProjectRecord(itp: ITP): ProjectRecord {
  const statusMap: Record<ITPStatus, RecordStatus> = {
    draft: 'draft',
    approved: 'approved',
    in_progress: 'issued',
    completed: 'approved',
    superseded: 'superseded',
    deleted: 'draft',
  };

  return {
    id: itp.id,
    tenantId: itp.projectId,
    projectId: itp.projectId,
    phase: 'construction_execution',
    moduleKey: 'site',
    recordType: 'inspection_test_plan',
    title: itp.title,
    status: statusMap[itp.status] ?? 'draft',
    payload: {
      constructionStage: itp.constructionStage,
      revisionNumber: itp.revisionNumber,
      itpStatus: itp.status,
    },
    approvals: {
      required: true,
      approvedBy: itp.approvedBy ? [itp.approvedBy] : undefined,
      pendingRoles: itp.status === 'draft' ? ['engineer', 'architect'] : undefined,
    },
    audit: {
      createdBy: itp.createdBy,
      createdAt: itp.createdAt,
      updatedAt: itp.updatedAt,
      supersedesRecordId: itp.previousRevisionId,
    },
    linkedRecordIds: [
      ...(itp.previousRevisionId ? [itp.previousRevisionId] : []),
      ...(itp.nextRevisionId ? [itp.nextRevisionId] : []),
    ],
  };
}

// ── Compliance Report Generation ─────────────────────────────────────────────

/**
 * Generates a compliance report for a specific ITP.
 *
 * Assembles all items with outcomes, sign-off records, linked test results,
 * NCRs, and pass/fail/pending counts.
 */
export async function generateComplianceReport(
  projectId: string,
  itpId: string,
): Promise<ComplianceReport> {
  const itps = await getITPs(projectId);
  const itp = itps.find((i) => i.id === itpId);

  if (!itp) {
    throw new Error(`ITP ${itpId} not found in project ${projectId}`);
  }

  // Get all inspection items
  const items = await getAllItems(projectId, itpId);

  // Build item reports
  const reportItems: ComplianceReportItem[] = items.map((item) => ({
    id: item.id,
    sequenceNumber: item.sequenceNumber,
    title: item.title,
    inspectionType: item.inspectionType,
    status: item.status,
    signOffRecord: item.signOffRecord,
    selfInspectionRecord: item.selfInspectionRecord,
    ncrId: item.ncrId,
  }));

  // Count pass/fail/pending
  const passStatuses = ['passed', 'conditional_accepted', 'ncr_resolved'];
  const failStatuses = ['failed'];
  const passCount = items.filter((i) => passStatuses.includes(i.status)).length;
  const failCount = items.filter((i) => failStatuses.includes(i.status)).length;
  const pendingCount = items.length - passCount - failCount;

  // Get linked NCRs
  const linkedNCRs: ComplianceReportNCR[] = [];
  try {
    const ncrs = await getNcrs(projectId);
    const itemNcrIds = items.map((i) => i.ncrId).filter((id): id is string => !!id);
    const relevantNcrs = ncrs.filter((ncr) => itemNcrIds.includes(ncr.id));
    for (const ncr of relevantNcrs) {
      const sourceItem = items.find((i) => i.ncrId === ncr.id);
      linkedNCRs.push({
        ncrId: ncr.id,
        title: ncr.title,
        severity: ncr.severity,
        status: ncr.status,
        sourceItemId: sourceItem?.id,
      });
    }
  } catch {
    // NCRs unavailable — continue without them
  }

  // Get linked test results
  const linkedTestResults: ComplianceReportTestResult[] = [];
  try {
    const allLinkedTestIds = items.flatMap((i) => i.linkedMaterialTestIds);
    const uniqueTestIds = [...new Set(allLinkedTestIds)];

    if (uniqueTestIds.length > 0) {
      const testsSnap = await getDocs(materialTestsCollection(projectId));
      const tests = testsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MaterialTest));
      const linkedTests = tests.filter((t) => uniqueTestIds.includes(t.id));

      for (const test of linkedTests) {
        linkedTestResults.push({
          testId: test.id,
          materialType: test.materialType,
          testCategory: test.testCategory,
          status: test.status,
          linkedInspectionItemIds: test.linkedInspectionItemIds,
        });
      }
    }
  } catch {
    // Material tests unavailable — continue without them
  }

  return {
    projectId,
    itpId,
    itpTitle: itp.title,
    itpStatus: itp.status,
    revisionNumber: itp.revisionNumber,
    generatedAt: new Date().toISOString(),
    items: reportItems,
    passCount,
    failCount,
    pendingCount,
    linkedNCRs,
    linkedTestResults,
  };
}

// ── Convenience Wrapper ──────────────────────────────────────────────────────

/**
 * Builds the full ITP passport data contribution.
 * Wrapper used by projectPassportService for integration.
 */
export async function buildITPPassportData(projectId: string): Promise<QualitySummary> {
  return getQualitySummary(projectId);
}

// ── Service Export ───────────────────────────────────────────────────────────

export const itpPassportAdapter = {
  calculateComplianceScore,
  getQualitySummary,
  emitComplianceRiskSignal,
  mapITPToProjectRecord,
  generateComplianceReport,
  buildITPPassportData,
};

export default itpPassportAdapter;
