import type { GanttTask, RFI } from '../types';
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
  canRequestProcurementApproval: boolean;
  canRequestCloseoutReview: boolean;
}

export function assessContractorWorkflow(input: PackageReadinessInput): ContractorWorkflowReadiness {
  const readiness = evaluatePackageReadiness(input);
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
    canRequestProcurementApproval: gates.every((gate) => gate.id !== 'programme_dependencies' || gate.status === 'pass')
      && !readiness.blockers.some((blocker) => blocker.includes('requires recorded human approval')),
    canRequestCloseoutReview: readiness.status === 'ready_for_review' || readiness.status === 'ready_for_closeout',
  };
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
