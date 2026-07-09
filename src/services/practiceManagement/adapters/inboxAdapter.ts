/**
 * Practice Management — Inbox / Action Centre Event Adapter
 *
 * Surfaces practice management actions as WorkflowEvents for the platform-wide
 * Action Centre. Covers:
 *  - Timesheet approvals (Requirement 1.3)
 *  - Expense approvals (Requirement 2.2)
 *  - Fee threshold warnings (Requirement 4.3)
 *  - Margin alerts (Requirements 6.3, 6.4)
 *  - Overdue invoices (Requirement 7.5)
 *  - Write-off warnings (Requirement 10.4)
 *
 * Integrates with notificationService for in-app/email/push delivery and
 * creates WorkflowEvent objects for the Action Centre spine (Requirement 15.4).
 *
 * @module practiceManagement/adapters/inboxAdapter
 */

import { createWorkflowEvent } from '@/services/inboxEventAdapter';
import { notificationService } from '@/services/notificationService';
import type { WorkflowEvent, Priority, ArchitexRole } from '@/services/lifecycleTypes';
import type {
  TimesheetSubmission,
  ExpenseClaim,
  FeeHealthMetrics,
  ProfitabilityResult,
  PracticeInvoice,
  WriteOffWarning,
  SacapWorkStage,
} from '@/services/practiceManagement/types';
import { SACAP_STAGE_LABELS } from '@/services/practiceManagement/types';

// ─── Event ID Helpers ────────────────────────────────────────────────────────

let pmSeq = 1;

function nextId(prefix: string): string {
  return `pm-inbox-${prefix}-${pmSeq++}`;
}

// ─── Timesheet Approval Actions (Req 1.3) ───────────────────────────────────

/**
 * Creates an Action Centre event when a timesheet is submitted for approval.
 * Notifies the designated approver that a weekly timesheet needs review.
 */
export function createTimesheetApprovalEvent(
  submission: TimesheetSubmission,
  submitterName: string,
  approverId?: string,
): WorkflowEvent {
  const event = createWorkflowEvent({
    id: nextId('ts-approve'),
    type: 'approval_required',
    projectId: submission.firmId,
    title: `Timesheet approval required — ${submitterName}`,
    detail: `Weekly timesheet for ${submission.weekStartDate} to ${submission.weekEndDate} (${submission.totalHours}h, R${(submission.totalValueCents / 100).toFixed(2)}) submitted for approval.`,
    priority: 'medium',
    assignedRoles: ['architect'] as ArchitexRole[],
    sourceModule: 'projects',
    createdAt: submission.submittedAt ?? new Date().toISOString(),
  });

  // Fire notification to specific approver if known
  if (approverId) {
    notificationService.sendNotification(
      approverId,
      'timesheet_due',
      `${submitterName} submitted a weekly timesheet (${submission.totalHours}h) for your approval.`,
      { submissionId: submission.id, firmId: submission.firmId },
    );
  }

  return event;
}

// ─── Expense Approval Actions (Req 2.2) ─────────────────────────────────────

/**
 * Creates an Action Centre event when an expense claim is submitted for approval.
 * Notifies firm_admin or designated approver.
 */
export function createExpenseApprovalEvent(
  claim: ExpenseClaim,
  submitterName: string,
  approverId?: string,
): WorkflowEvent {
  const amountRands = (claim.amountCents / 100).toFixed(2);

  const event = createWorkflowEvent({
    id: nextId('exp-approve'),
    type: 'approval_required',
    projectId: claim.projectId,
    title: `Expense approval required — R${amountRands}`,
    detail: `${submitterName} submitted a ${claim.category} expense claim (R${amountRands}) for project. ${claim.description}`,
    priority: 'medium',
    assignedRoles: ['admin'] as ArchitexRole[],
    sourceModule: 'finance',
    createdAt: claim.submittedAt ?? new Date().toISOString(),
  });

  if (approverId) {
    notificationService.sendNotification(
      approverId,
      'invoice_ready_for_review',
      `${submitterName} submitted a ${claim.category} expense claim of R${amountRands} requiring your approval.`,
      { expenseClaimId: claim.id, projectId: claim.projectId },
    );
  }

  return event;
}

// ─── Fee Threshold Warnings (Req 4.3) ───────────────────────────────────────

/**
 * Creates an Action Centre event when time costs for a stage exceed 80% of
 * the agreed stage fee.
 */
export function createFeeThresholdWarningEvent(
  projectId: string,
  projectName: string,
  stage: SacapWorkStage,
  percentUsed: number,
  projectLeadId?: string,
): WorkflowEvent {
  const stageLabel = SACAP_STAGE_LABELS[stage];
  const isOverrun = percentUsed >= 100;
  const priority: Priority = isOverrun ? 'high' : 'medium';
  const title = isOverrun
    ? `Fee over-run — ${projectName} (${stageLabel})`
    : `Fee threshold warning — ${projectName} (${stageLabel})`;
  const detail = isOverrun
    ? `Time costs have exceeded 100% (${percentUsed.toFixed(0)}%) of the agreed fee for ${stageLabel}. Stage flagged as over-run.`
    : `Time costs have reached ${percentUsed.toFixed(0)}% of the agreed fee for ${stageLabel}. Review resource allocation.`;

  const event = createWorkflowEvent({
    id: nextId('fee-warn'),
    type: 'risk_detected',
    projectId,
    title,
    detail,
    priority,
    assignedRoles: ['architect'] as ArchitexRole[],
    sourceModule: 'finance',
  });

  if (projectLeadId) {
    notificationService.sendNotification(
      projectLeadId,
      'milestone_due',
      detail,
      { projectId, stage },
    );
  }

  return event;
}

/**
 * Creates Action Centre events from FeeHealthMetrics — batch helper for
 * warning and over-run stages.
 */
export function createFeeHealthEvents(
  metrics: FeeHealthMetrics,
  projectName: string,
  projectLeadId?: string,
): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];

  for (const stage of metrics.warningStages) {
    events.push(
      createFeeThresholdWarningEvent(metrics.projectId, projectName, stage, 80, projectLeadId),
    );
  }

  for (const stage of metrics.overRunStages) {
    events.push(
      createFeeThresholdWarningEvent(metrics.projectId, projectName, stage, 100, projectLeadId),
    );
  }

  return events;
}

// ─── Margin Alerts (Req 6.3, 6.4) ───────────────────────────────────────────

/**
 * Creates an Action Centre event when project margin drops below threshold.
 *  - Below 20%: at-risk → notify project lead (Req 6.3)
 *  - Below 0%: loss-making → notify firm directors (Req 6.4)
 */
export function createMarginAlertEvent(
  result: ProfitabilityResult,
  projectName: string,
  notifyUserIds?: string[],
): WorkflowEvent {
  const isLoss = result.status === 'loss_making';
  const priority: Priority = isLoss ? 'critical' : 'high';
  const assignedRoles: ArchitexRole[] = isLoss
    ? ['admin', 'architect']
    : ['architect'];

  const title = isLoss
    ? `Loss-making project — ${projectName}`
    : `Margin at risk — ${projectName}`;

  const detail = isLoss
    ? `Project margin has dropped to ${result.marginPercent.toFixed(1)}% (below 0%). Project is loss-making. Immediate review required.`
    : `Project margin has dropped to ${result.marginPercent.toFixed(1)}% (below 20%). Project is at risk of margin erosion.`;

  const event = createWorkflowEvent({
    id: nextId('margin-alert'),
    type: 'risk_detected',
    projectId: result.projectId,
    title,
    detail,
    priority,
    assignedRoles,
    sourceModule: 'finance',
  });

  // Notify specific users (project lead / directors)
  if (notifyUserIds?.length) {
    for (const userId of notifyUserIds) {
      notificationService.sendNotification(
        userId,
        'milestone_due',
        detail,
        { projectId: result.projectId, marginPercent: result.marginPercent },
      );
    }
  }

  return event;
}

// ─── Overdue Invoice Actions (Req 7.5) ──────────────────────────────────────

/**
 * Creates an Action Centre event when a practice invoice is overdue (>30 days
 * past due date). Notifies firm_admin.
 */
export function createOverdueInvoiceEvent(
  invoice: PracticeInvoice,
  projectName: string,
  firmAdminId?: string,
): WorkflowEvent {
  const amountRands = (invoice.totalCents / 100).toFixed(2);
  const dueDate = invoice.dueDate;

  const event = createWorkflowEvent({
    id: nextId('inv-overdue'),
    type: 'payment_due',
    projectId: invoice.projectId,
    title: `Overdue invoice — ${invoice.invoiceNumber} (R${amountRands})`,
    detail: `Invoice ${invoice.invoiceNumber} for ${projectName} (R${amountRands}) is overdue. Due date was ${dueDate}. Follow up with client required.`,
    priority: 'high',
    assignedRoles: ['admin'] as ArchitexRole[],
    sourceModule: 'finance',
  });

  if (firmAdminId) {
    notificationService.sendNotification(
      firmAdminId,
      'invoice_ready_for_review',
      `Invoice ${invoice.invoiceNumber} (R${amountRands}) for ${projectName} is overdue since ${dueDate}. Action required.`,
      { invoiceId: invoice.id, projectId: invoice.projectId },
    );
  }

  return event;
}

/**
 * Batch helper: creates overdue invoice events for multiple invoices.
 */
export function createOverdueInvoiceEvents(
  invoices: PracticeInvoice[],
  projectNames: Record<string, string>,
  firmAdminId?: string,
): WorkflowEvent[] {
  return invoices.map((invoice) =>
    createOverdueInvoiceEvent(
      invoice,
      projectNames[invoice.projectId] ?? 'Unknown Project',
      firmAdminId,
    ),
  );
}

// ─── Write-Off Warnings (Req 10.4) ──────────────────────────────────────────

/**
 * Creates an Action Centre event when cumulative write-offs exceed 10% of
 * the agreed fee. Notifies firm directors.
 */
export function createWriteOffWarningEvent(
  warning: WriteOffWarning,
  projectName: string,
  directorUserIds?: string[],
): WorkflowEvent {
  const event = createWorkflowEvent({
    id: nextId('wo-warn'),
    type: 'risk_detected',
    projectId: warning.projectId,
    title: `Write-off threshold exceeded — ${projectName}`,
    detail: warning.message || `Cumulative write-offs have reached ${warning.writeOffPercentage.toFixed(1)}% of the agreed fee (threshold: ${warning.thresholdPercent}%). Review project scope and pricing.`,
    priority: 'high',
    assignedRoles: ['admin', 'architect'] as ArchitexRole[],
    sourceModule: 'finance',
  });

  if (directorUserIds?.length) {
    for (const userId of directorUserIds) {
      notificationService.sendNotification(
        userId,
        'milestone_due',
        `Write-offs for ${projectName} have reached ${warning.writeOffPercentage.toFixed(1)}% of agreed fee (threshold: ${warning.thresholdPercent}%).`,
        { projectId: warning.projectId },
      );
    }
  }

  return event;
}

/**
 * Batch helper: creates write-off warning events from a list of warnings.
 */
export function createWriteOffWarningEvents(
  warnings: WriteOffWarning[],
  projectNames: Record<string, string>,
  directorUserIds?: string[],
): WorkflowEvent[] {
  return warnings.map((warning) =>
    createWriteOffWarningEvent(
      warning,
      projectNames[warning.projectId] ?? 'Unknown Project',
      directorUserIds,
    ),
  );
}

// ─── Aggregate Helper ────────────────────────────────────────────────────────

/**
 * Generates all practice management Action Centre events from current state.
 * Useful for periodic sweeps or dashboard rendering.
 */
export function generatePracticeManagementInboxEvents(params: {
  pendingTimesheets?: { submission: TimesheetSubmission; submitterName: string; approverId?: string }[];
  pendingExpenses?: { claim: ExpenseClaim; submitterName: string; approverId?: string }[];
  feeHealth?: { metrics: FeeHealthMetrics; projectName: string; projectLeadId?: string }[];
  marginAlerts?: { result: ProfitabilityResult; projectName: string; notifyUserIds?: string[] }[];
  overdueInvoices?: { invoices: PracticeInvoice[]; projectNames: Record<string, string>; firmAdminId?: string };
  writeOffWarnings?: { warnings: WriteOffWarning[]; projectNames: Record<string, string>; directorUserIds?: string[] };
}): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];

  // Timesheet approvals
  if (params.pendingTimesheets) {
    for (const { submission, submitterName, approverId } of params.pendingTimesheets) {
      events.push(createTimesheetApprovalEvent(submission, submitterName, approverId));
    }
  }

  // Expense approvals
  if (params.pendingExpenses) {
    for (const { claim, submitterName, approverId } of params.pendingExpenses) {
      events.push(createExpenseApprovalEvent(claim, submitterName, approverId));
    }
  }

  // Fee threshold warnings
  if (params.feeHealth) {
    for (const { metrics, projectName, projectLeadId } of params.feeHealth) {
      events.push(...createFeeHealthEvents(metrics, projectName, projectLeadId));
    }
  }

  // Margin alerts
  if (params.marginAlerts) {
    for (const { result, projectName, notifyUserIds } of params.marginAlerts) {
      events.push(createMarginAlertEvent(result, projectName, notifyUserIds));
    }
  }

  // Overdue invoices
  if (params.overdueInvoices) {
    const { invoices, projectNames, firmAdminId } = params.overdueInvoices;
    events.push(...createOverdueInvoiceEvents(invoices, projectNames, firmAdminId));
  }

  // Write-off warnings
  if (params.writeOffWarnings) {
    const { warnings, projectNames, directorUserIds } = params.writeOffWarnings;
    events.push(...createWriteOffWarningEvents(warnings, projectNames, directorUserIds));
  }

  return events;
}

// ─── Reset (for testing) ─────────────────────────────────────────────────────

export function resetPracticeInboxState(): void {
  pmSeq = 1;
}
