import type { Bid, GanttTask, RFI, SiteInspection, SiteLog, TenderPackage } from '../types';

export type DeliveryEvidenceType =
  | 'site_log'
  | 'inspection'
  | 'rfi'
  | 'delivery_note'
  | 'supplier_quote'
  | 'purchase_order'
  | 'wage_record'
  | 'plant_record'
  | 'snag'
  | 'closeout_document';

export type PackageReadinessStatus = 'blocked' | 'at_risk' | 'ready_for_review' | 'ready_for_closeout';

export interface DeliveryEvidenceItem {
  id: string;
  type: DeliveryEvidenceType;
  title: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed';
  createdAt: string;
  requiredForCloseout?: boolean;
  dueDate?: string;
  metadata?: Record<string, unknown>;
}

export interface PackageReadinessInput {
  tender: TenderPackage;
  awardedBid?: Bid;
  programmeTasks?: GanttTask[];
  rfis?: RFI[];
  siteLogs?: SiteLog[];
  inspections?: SiteInspection[];
  evidence?: DeliveryEvidenceItem[];
  asOf?: string;
}

export interface PackageReadinessResult {
  status: PackageReadinessStatus;
  score: number;
  blockers: string[];
  warnings: string[];
  requiredEvidence: DeliveryEvidenceType[];
  missingEvidence: DeliveryEvidenceType[];
  summary: string;
}

const DEFAULT_REQUIRED_EVIDENCE: DeliveryEvidenceType[] = [
  'site_log',
  'inspection',
  'closeout_document',
];

export function evaluatePackageReadiness(input: PackageReadinessInput): PackageReadinessResult {
  const asOf = new Date(input.asOf ?? new Date().toISOString());
  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredEvidence = resolveRequiredEvidence(input);
  const approvedEvidenceTypes = new Set((input.evidence ?? [])
    .filter((item) => item.status === 'approved' || item.status === 'closed')
    .map((item) => item.type));

  if (!input.awardedBid && input.tender.status !== 'awarded') {
    blockers.push('Package has not been awarded to a contractor or package assignee.');
  }

  const openRFIs = (input.rfis ?? []).filter((rfi) => rfi.status === 'open' || rfi.status === 'overdue');
  const overdueRFIs = openRFIs.filter((rfi) => rfi.status === 'overdue' || new Date(rfi.dueDate).getTime() < asOf.getTime());
  if (openRFIs.length > 0) warnings.push(`${openRFIs.length} RFI${openRFIs.length === 1 ? '' : 's'} still open.`);
  if (overdueRFIs.length > 0) blockers.push(`${overdueRFIs.length} RFI${overdueRFIs.length === 1 ? '' : 's'} overdue.`);

  const incompleteTasks = (input.programmeTasks ?? []).filter((task) => task.status !== 'completed' || task.progress < 100);
  if (incompleteTasks.length > 0) warnings.push(`${incompleteTasks.length} programme task${incompleteTasks.length === 1 ? '' : 's'} not complete.`);

  const failedInspections = (input.inspections ?? []).filter((inspection) => inspection.overallResult === 'fail');
  const conditionalInspections = (input.inspections ?? []).filter((inspection) => inspection.overallResult === 'conditional');
  if (failedInspections.length > 0) blockers.push(`${failedInspections.length} failed inspection${failedInspections.length === 1 ? '' : 's'} must be resolved.`);
  if (conditionalInspections.length > 0) warnings.push(`${conditionalInspections.length} conditional inspection${conditionalInspections.length === 1 ? '' : 's'} need professional sign-off evidence.`);

  const missingEvidence = requiredEvidence.filter((type) => !approvedEvidenceTypes.has(type));
  if (missingEvidence.length > 0) blockers.push(`Missing approved close-out evidence: ${missingEvidence.join(', ')}.`);

  if ((input.siteLogs ?? []).length === 0 && requiredEvidence.includes('site_log')) {
    warnings.push('No site logs are linked to this package.');
  }

  const score = calculateScore(blockers.length, warnings.length, missingEvidence.length, incompleteTasks.length);
  const status = resolveStatus(score, blockers.length, warnings.length);

  return {
    status,
    score,
    blockers,
    warnings,
    requiredEvidence,
    missingEvidence,
    summary: buildSummary(input.tender.title, status, score, blockers.length, warnings.length),
  };
}

function resolveRequiredEvidence(input: PackageReadinessInput): DeliveryEvidenceType[] {
  const explicit = (input.evidence ?? [])
    .filter((item) => item.requiredForCloseout)
    .map((item) => item.type);
  return [...new Set([...DEFAULT_REQUIRED_EVIDENCE, ...explicit])];
}

function calculateScore(blockerCount: number, warningCount: number, missingEvidenceCount: number, incompleteTaskCount: number): number {
  const score = 100 - blockerCount * 25 - warningCount * 10 - missingEvidenceCount * 10 - Math.min(incompleteTaskCount, 5) * 4;
  return Math.max(0, Math.min(100, score));
}

function resolveStatus(score: number, blockerCount: number, warningCount: number): PackageReadinessStatus {
  if (blockerCount > 0) return 'blocked';
  if (score < 85 || warningCount > 0) return 'at_risk';
  if (score < 100) return 'ready_for_review';
  return 'ready_for_closeout';
}

function buildSummary(title: string, status: PackageReadinessStatus, score: number, blockerCount: number, warningCount: number): string {
  return `${title} is ${status.replaceAll('_', ' ')} with readiness score ${score}/100 (${blockerCount} blocker${blockerCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}).`;
}
