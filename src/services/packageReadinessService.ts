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
  | 'shop_drawing'
  | 'sample_approval'
  | 'warranty'
  | 'manual'
  | 'certificate'
  | 'payment_claim_evidence'
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
  packageId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcurementCommitment {
  id: string;
  packageId: string;
  type: 'supplier_quote' | 'purchase_order' | 'delivery_note' | 'subcontract_order' | 'payment_claim';
  title: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'issued' | 'delivered' | 'cancelled';
  amount?: number;
  humanApprovedBy?: string;
  humanApprovedAt?: string;
  dueDate?: string;
}

export interface SnagItem {
  id: string;
  packageId: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'ready_for_inspection' | 'closed' | 'rejected';
  assignedTo?: string;
  dueDate?: string;
}

export interface PackageReadinessInput {
  tender: TenderPackage;
  awardedBid?: Bid;
  programmeTasks?: GanttTask[];
  rfis?: RFI[];
  siteLogs?: SiteLog[];
  inspections?: SiteInspection[];
  evidence?: DeliveryEvidenceItem[];
  procurementCommitments?: ProcurementCommitment[];
  snags?: SnagItem[];
  asOf?: string;
}

export interface PackageReadinessResult {
  status: PackageReadinessStatus;
  score: number;
  blockers: string[];
  warnings: string[];
  requiredEvidence: DeliveryEvidenceType[];
  missingEvidence: DeliveryEvidenceType[];
  dependencyIssues: string[];
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

  const dependencyIssues = evaluateProgrammeDependencies(input.programmeTasks ?? []);
  dependencyIssues.forEach((issue) => blockers.push(issue));

  const procurementIssues = evaluateProcurementCommitments(input.procurementCommitments ?? [], asOf);
  procurementIssues.blockers.forEach((issue) => blockers.push(issue));
  procurementIssues.warnings.forEach((issue) => warnings.push(issue));

  const snagIssues = evaluateSnags(input.snags ?? [], asOf);
  snagIssues.blockers.forEach((issue) => blockers.push(issue));
  snagIssues.warnings.forEach((issue) => warnings.push(issue));

  const score = calculateScore(blockers.length, warnings.length, missingEvidence.length, incompleteTasks.length);
  const status = resolveStatus(score, blockers.length, warnings.length);

  return {
    status,
    score,
    blockers,
    warnings,
    requiredEvidence,
    missingEvidence,
    dependencyIssues,
    summary: buildSummary(input.tender.title, status, score, blockers.length, warnings.length),
  };
}

export function evaluateProgrammeDependencies(tasks: GanttTask[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const issues: string[] = [];

  tasks.forEach((task) => {
    (task.dependsOn ?? []).forEach((predecessorId) => {
      const predecessor = byId.get(predecessorId);
      if (!predecessor) {
        issues.push(`Programme task "${task.title}" depends on missing task ${predecessorId}.`);
      } else if ((task.status === 'completed' || task.progress === 100) && (predecessor.status !== 'completed' || predecessor.progress < 100)) {
        issues.push(`Programme task "${task.title}" is complete before predecessor "${predecessor.title}" is complete.`);
      }
    });
  });

  findDependencyCycles(tasks).forEach((cycle) => {
    issues.push(`Programme dependency cycle detected: ${cycle.join(' -> ')}.`);
  });

  return [...new Set(issues)];
}

function evaluateProcurementCommitments(commitments: ProcurementCommitment[], asOf: Date): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];

  commitments.forEach((commitment) => {
    const requiresHumanApproval = commitment.type === 'purchase_order' || commitment.type === 'subcontract_order' || commitment.type === 'payment_claim';
    const hasHumanApproval = Boolean(commitment.humanApprovedBy && commitment.humanApprovedAt);
    if (requiresHumanApproval && ['approved', 'issued', 'delivered'].includes(commitment.status) && !hasHumanApproval) {
      blockers.push(`${commitment.title} requires recorded human approval before procurement, subcontract, or payment effects are treated as valid.`);
    }
    if (commitment.status === 'pending_approval') {
      warnings.push(`${commitment.title} is waiting for human approval.`);
    }
    if (commitment.dueDate && new Date(commitment.dueDate).getTime() < asOf.getTime() && !['delivered', 'cancelled'].includes(commitment.status)) {
      warnings.push(`${commitment.title} is past its due date.`);
    }
  });

  return { blockers, warnings };
}

function evaluateSnags(snags: SnagItem[], asOf: Date): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const openSnags = snags.filter((snag) => snag.status !== 'closed' && snag.status !== 'rejected');
  const criticalOpen = openSnags.filter((snag) => snag.severity === 'critical' || snag.severity === 'high');
  const overdueOpen = openSnags.filter((snag) => snag.dueDate && new Date(snag.dueDate).getTime() < asOf.getTime());

  if (criticalOpen.length > 0) blockers.push(`${criticalOpen.length} high/critical snag${criticalOpen.length === 1 ? '' : 's'} remain open.`);
  if (overdueOpen.length > 0) warnings.push(`${overdueOpen.length} snag${overdueOpen.length === 1 ? '' : 's'} overdue.`);
  if (openSnags.length > criticalOpen.length) warnings.push(`${openSnags.length - criticalOpen.length} low/medium snag${openSnags.length - criticalOpen.length === 1 ? '' : 's'} remain open.`);

  return { blockers, warnings };
}

function findDependencyCycles(tasks: GanttTask[]): string[][] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(taskId: string, path: string[]): void {
    if (visiting.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      cycles.push([...path.slice(cycleStart), taskId]);
      return;
    }
    if (visited.has(taskId) || !byId.has(taskId)) return;

    visiting.add(taskId);
    const task = byId.get(taskId);
    (task?.dependsOn ?? []).forEach((predecessorId) => visit(predecessorId, [...path, predecessorId]));
    visiting.delete(taskId);
    visited.add(taskId);
  }

  tasks.forEach((task) => visit(task.id, [task.id]));
  return cycles;
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
