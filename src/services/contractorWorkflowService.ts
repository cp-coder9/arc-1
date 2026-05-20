import type { GanttTask, RFI, SiteInspection, SiteLog } from '../types';
import { evaluatePackageReadiness, type PackageReadinessInput, type PackageReadinessResult } from './packageReadinessService';

export type WorkflowGateStatus = 'pass' | 'warning' | 'blocked';

export interface WorkflowGate {
  id: string;
  label: string;
  status: WorkflowGateStatus;
  detail: string;
  humanConfirmationRequired?: boolean;
}

export interface ContractorWorkflowReadiness {
  readiness: PackageReadinessResult;
  gates: WorkflowGate[];
  nextActions: string[];
  deliveryReadinessProjection: DeliveryReadinessProjection;
  canRequestProcurementApproval: boolean;
  canRequestCloseoutReview: boolean;
}

export type ContractorActionOwner = 'contractor' | 'bep' | 'client' | 'administrator';

export interface RoleNextAction {
  owner: ContractorActionOwner;
  action: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
}

export interface DeliveryReadinessProjection {
  packageId: string;
  projectId: string;
  projectedStatus: PackageReadinessResult['status'];
  score: number;
  siteLogCoverage: {
    expectedWorkingDays: number;
    loggedDays: number;
    missingDays: string[];
    coveragePercent: number;
    issueCount: number;
  };
  rfiSummary: {
    open: number;
    overdue: number;
    respondedAwaitingClosure: number;
    urgentOpen: number;
  };
  inspectionSummary: {
    passed: number;
    conditional: number;
    failed: number;
    latestInspectionDate?: string;
  };
  programmeEvidence: {
    completedTasks: number;
    incompleteTasks: number;
    delayedCriticalTasks: number;
    unapprovedBaselineChanges: number;
    approvedEvidenceCount: number;
    missingEvidence: string[];
  };
  roleNextActions: RoleNextAction[];
  audit: {
    generatedAt: string;
    asOf: string;
    sources: string[];
    counts: {
      programmeTasks: number;
      siteLogs: number;
      rfis: number;
      inspections: number;
      evidenceItems: number;
    };
  };
}

export function assessContractorWorkflow(input: PackageReadinessInput): ContractorWorkflowReadiness {
  const readiness = evaluatePackageReadiness(input);
  const deliveryReadinessProjection = projectDeliveryReadiness(input, readiness);
  const gates: WorkflowGate[] = [
    programmeDependencyGate(input.programmeTasks ?? [], readiness.dependencyIssues),
    rfiGate(input.rfis ?? []),
    procurementApprovalGate(readiness),
    closeoutGate(readiness),
  ];

  const nextActions = gates
    .filter((gate) => gate.status !== 'pass')
    .map((gate) => gate.detail);

  return {
    readiness,
    gates,
    nextActions,
    deliveryReadinessProjection,
    canRequestProcurementApproval: gates.every((gate) => gate.id !== 'programme_dependencies' || gate.status === 'pass')
      && !readiness.blockers.some((blocker) => blocker.includes('requires recorded human approval')),
    canRequestCloseoutReview: readiness.status === 'ready_for_review' || readiness.status === 'ready_for_closeout',
  };
}

export function projectDeliveryReadiness(input: PackageReadinessInput, readiness = evaluatePackageReadiness(input)): DeliveryReadinessProjection {
  const asOf = input.asOf ?? new Date().toISOString();
  const programmeTasks = input.programmeTasks ?? [];
  const siteLogs = input.siteLogs ?? [];
  const rfis = input.rfis ?? [];
  const inspections = input.inspections ?? [];
  const evidence = input.evidence ?? [];
  const siteLogCoverage = buildSiteLogCoverage(programmeTasks, siteLogs, asOf);
  const rfiSummary = buildRfiSummary(rfis, asOf);
  const inspectionSummary = buildInspectionSummary(inspections);
  const delayedCriticalTasks = programmeTasks.filter((task) => task.isCritical && (task.status === 'delayed' || new Date(task.forecastEndDate ?? task.endDate).getTime() > new Date(task.endDate).getTime())).length;
  const unapprovedBaselineChanges = programmeTasks.filter((task) => task.humanApprovalRequired && task.baselineChangeStatus !== 'approved').length;
  const approvedEvidenceCount = evidence.filter((item) => item.status === 'approved' || item.status === 'closed').length;
  const roleNextActions = buildRoleNextActions(readiness, siteLogCoverage, rfiSummary, inspectionSummary, delayedCriticalTasks, unapprovedBaselineChanges, rfis, asOf);

  return {
    packageId: input.tender.id,
    projectId: input.tender.projectId,
    projectedStatus: readiness.status,
    score: readiness.score,
    siteLogCoverage,
    rfiSummary,
    inspectionSummary,
    programmeEvidence: {
      completedTasks: programmeTasks.filter((task) => task.status === 'completed' && task.progress >= 100).length,
      incompleteTasks: programmeTasks.filter((task) => task.status !== 'completed' || task.progress < 100).length,
      delayedCriticalTasks,
      unapprovedBaselineChanges,
      approvedEvidenceCount,
      missingEvidence: readiness.missingEvidence,
    },
    roleNextActions,
    audit: {
      generatedAt: asOf,
      asOf,
      sources: ['programme_tasks', 'site_logs', 'rfis', 'inspections', 'delivery_evidence'],
      counts: {
        programmeTasks: programmeTasks.length,
        siteLogs: siteLogs.length,
        rfis: rfis.length,
        inspections: inspections.length,
        evidenceItems: evidence.length,
      },
    },
  };
}

function buildSiteLogCoverage(tasks: GanttTask[], siteLogs: SiteLog[], asOf: string): DeliveryReadinessProjection['siteLogCoverage'] {
  const workingDays = expectedWorkingDays(tasks, asOf);
  const loggedDaySet = new Set(siteLogs.map((log) => log.date));
  const missingDays = workingDays.filter((day) => !loggedDaySet.has(day));
  const issueCount = siteLogs.reduce((total, log) => total + (log.issues?.length ?? 0), 0);

  return {
    expectedWorkingDays: workingDays.length,
    loggedDays: workingDays.filter((day) => loggedDaySet.has(day)).length,
    missingDays,
    coveragePercent: workingDays.length === 0 ? 100 : Math.round(((workingDays.length - missingDays.length) / workingDays.length) * 100),
    issueCount,
  };
}

function expectedWorkingDays(tasks: GanttTask[], asOf: string): string[] {
  const days = new Set<string>();
  const asOfDate = startOfDay(new Date(asOf));
  tasks.forEach((task) => {
    const start = startOfDay(new Date(task.startDate));
    const end = startOfDay(new Date(Math.min(new Date(task.endDate).getTime(), asOfDate.getTime())));
    for (let current = new Date(start); current.getTime() <= end.getTime(); current.setUTCDate(current.getUTCDate() + 1)) {
      const day = current.getUTCDay();
      if (day !== 0 && day !== 6) days.add(current.toISOString().slice(0, 10));
    }
  });
  return [...days].sort();
}

function buildRfiSummary(rfis: RFI[], asOf: string): DeliveryReadinessProjection['rfiSummary'] {
  const asOfTime = new Date(asOf).getTime();
  const active = rfis.filter((rfi) => rfi.status === 'open' || rfi.status === 'overdue');
  return {
    open: active.length,
    overdue: active.filter((rfi) => rfi.status === 'overdue' || new Date(rfi.dueDate).getTime() < asOfTime).length,
    respondedAwaitingClosure: rfis.filter((rfi) => rfi.status === 'responded').length,
    urgentOpen: active.filter((rfi) => rfi.priority === 'urgent').length,
  };
}

function buildInspectionSummary(inspections: SiteInspection[]): DeliveryReadinessProjection['inspectionSummary'] {
  const latestInspectionDate = inspections.map((inspection) => inspection.date).sort().at(-1);
  return {
    passed: inspections.filter((inspection) => inspection.overallResult === 'pass').length,
    conditional: inspections.filter((inspection) => inspection.overallResult === 'conditional').length,
    failed: inspections.filter((inspection) => inspection.overallResult === 'fail').length,
    latestInspectionDate,
  };
}

function buildRoleNextActions(
  readiness: PackageReadinessResult,
  siteLogCoverage: DeliveryReadinessProjection['siteLogCoverage'],
  rfiSummary: DeliveryReadinessProjection['rfiSummary'],
  inspectionSummary: DeliveryReadinessProjection['inspectionSummary'],
  delayedCriticalTasks: number,
  unapprovedBaselineChanges: number,
  rfis: RFI[],
  asOf: string
): RoleNextAction[] {
  const actions: RoleNextAction[] = [];
  const asOfTime = new Date(asOf).getTime();
  const nextOverdueRfi = rfis.filter((rfi) => rfi.status === 'overdue' || (rfi.status === 'open' && new Date(rfi.dueDate).getTime() < asOfTime)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  if (siteLogCoverage.missingDays.length > 0) actions.push({ owner: 'contractor', priority: 'high', action: `Backfill ${siteLogCoverage.missingDays.length} missing site log day${siteLogCoverage.missingDays.length === 1 ? '' : 's'}.` });
  if (rfiSummary.overdue > 0) actions.push({ owner: 'bep', priority: 'high', action: `Respond to ${rfiSummary.overdue} overdue RFI${rfiSummary.overdue === 1 ? '' : 's'}.`, dueDate: nextOverdueRfi?.dueDate });
  if (rfiSummary.respondedAwaitingClosure > 0) actions.push({ owner: 'contractor', priority: 'medium', action: `Close ${rfiSummary.respondedAwaitingClosure} responded RFI${rfiSummary.respondedAwaitingClosure === 1 ? '' : 's'} after confirming the instruction is buildable.` });
  if (inspectionSummary.failed > 0 || inspectionSummary.conditional > 0) actions.push({ owner: 'contractor', priority: 'high', action: 'Upload rectification evidence for failed or conditional inspections.' });
  if (delayedCriticalTasks > 0) actions.push({ owner: 'contractor', priority: 'high', action: `Submit recovery plan for ${delayedCriticalTasks} delayed critical programme task${delayedCriticalTasks === 1 ? '' : 's'}.` });
  if (unapprovedBaselineChanges > 0) actions.push({ owner: 'client', priority: 'medium', action: `Review ${unapprovedBaselineChanges} programme baseline change${unapprovedBaselineChanges === 1 ? '' : 's'} requiring human approval.` });
  if (readiness.missingEvidence.length > 0) actions.push({ owner: 'contractor', priority: 'high', action: `Upload approved evidence: ${readiness.missingEvidence.join(', ')}.` });
  if (readiness.blockers.some((blocker) => blocker.includes('requires recorded human approval'))) actions.push({ owner: 'administrator', priority: 'high', action: 'Audit procurement/payment approval metadata before allowing downstream effects.' });

  return actions;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function programmeDependencyGate(tasks: GanttTask[], dependencyIssues: string[]): WorkflowGate {
  const incompleteTasks = tasks.filter((task) => task.status !== 'completed' || task.progress < 100);
  if (dependencyIssues.length > 0) {
    return {
      id: 'programme_dependencies',
      label: 'Programme dependencies',
      status: 'blocked',
      detail: dependencyIssues[0],
    };
  }
  if (incompleteTasks.length > 0) {
    return {
      id: 'programme_dependencies',
      label: 'Programme dependencies',
      status: 'warning',
      detail: `${incompleteTasks.length} programme task${incompleteTasks.length === 1 ? '' : 's'} must be completed or rebaselined.`,
    };
  }
  return {
    id: 'programme_dependencies',
    label: 'Programme dependencies',
    status: 'pass',
    detail: 'Programme dependencies are satisfied.',
  };
}

function rfiGate(rfis: RFI[]): WorkflowGate {
  const open = rfis.filter((rfi) => rfi.status === 'open' || rfi.status === 'overdue');
  const overdue = open.filter((rfi) => rfi.status === 'overdue');
  if (overdue.length > 0) {
    return {
      id: 'rfi_status',
      label: 'RFI status',
      status: 'blocked',
      detail: `${overdue.length} overdue RFI${overdue.length === 1 ? '' : 's'} require response before approval readiness.`,
    };
  }
  if (open.length > 0) {
    return {
      id: 'rfi_status',
      label: 'RFI status',
      status: 'warning',
      detail: `${open.length} open RFI${open.length === 1 ? '' : 's'} should be answered before closeout.`,
    };
  }
  return {
    id: 'rfi_status',
    label: 'RFI status',
    status: 'pass',
    detail: 'RFIs are closed or responded.',
  };
}

function procurementApprovalGate(readiness: PackageReadinessResult): WorkflowGate {
  const approvalBlocker = readiness.blockers.find((blocker) => blocker.includes('requires recorded human approval'));
  const pendingApproval = readiness.warnings.find((warning) => warning.includes('waiting for human approval'));
  if (approvalBlocker) {
    return {
      id: 'procurement_approval',
      label: 'Procurement approval',
      status: 'blocked',
      detail: approvalBlocker,
      humanConfirmationRequired: true,
    };
  }
  if (pendingApproval) {
    return {
      id: 'procurement_approval',
      label: 'Procurement approval',
      status: 'warning',
      detail: pendingApproval,
      humanConfirmationRequired: true,
    };
  }
  return {
    id: 'procurement_approval',
    label: 'Procurement approval',
    status: 'pass',
    detail: 'Procurement and payment approval gates are recorded.',
  };
}

function closeoutGate(readiness: PackageReadinessResult): WorkflowGate {
  if (readiness.missingEvidence.length > 0) {
    return {
      id: 'closeout_evidence',
      label: 'Snag and closeout evidence',
      status: 'blocked',
      detail: `Missing approved evidence: ${readiness.missingEvidence.join(', ')}.`,
    };
  }
  const snagBlocker = readiness.blockers.find((blocker) => blocker.includes('snag'));
  if (snagBlocker) {
    return {
      id: 'closeout_evidence',
      label: 'Snag and closeout evidence',
      status: 'blocked',
      detail: snagBlocker,
    };
  }
  if (readiness.warnings.some((warning) => warning.includes('snag'))) {
    return {
      id: 'closeout_evidence',
      label: 'Snag and closeout evidence',
      status: 'warning',
      detail: 'Non-critical snag items remain and should be closed or accepted by the reviewer.',
    };
  }
  return {
    id: 'closeout_evidence',
    label: 'Snag and closeout evidence',
    status: 'pass',
    detail: 'Closeout evidence and snags are ready for review.',
  };
}
